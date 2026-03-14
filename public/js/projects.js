let currentUser = JSON.parse(localStorage.getItem('user'));
let token = localStorage.getItem('token');
let currentProject = null;
let allUsers = [];
let allProjects = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Configure Markdown & Highlighting
    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });

    initHeader();
    loadUsers();
    loadProjects();
    setupEventListeners();
});

function initHeader() {
    const userSection = document.getElementById('userSection');
    if (userSection && currentUser) {
        userSection.innerHTML = `
            <div class="flex items-center gap-4 border-l border-white/5 pl-8 h-8">
                <div class="hidden sm:flex flex-col items-end">
                    <span id="userName" class="text-[11px] font-bold text-slate-100 uppercase tracking-wide">${currentUser.username}</span>
                    <span id="userRole" class="text-[9px] font-black text-tech-blue uppercase tracking-[0.2em] mt-1.5 opacity-80">${currentUser.role}</span>
                </div>
                
                <button onclick="logout()" class="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all cursor-pointer hover:bg-rose-500/5 rounded-lg" title="Terminate Session">
                    <i class="fas fa-power-off text-sm"></i>
                </button>
            </div>
        `;
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load users');
        allUsers = await res.json();
    } catch (err) { console.error(err); }
}

async function loadProjects() {
    try {
        const res = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load projects');
        allProjects = await res.json();
        
        const select = document.getElementById('projectSelect');
        if (!allProjects || allProjects.length === 0) {
            if (select) select.innerHTML = '<option value="" disabled selected>No Operations Available</option>';
            toggleEmptyState(false);
            return;
        }

        toggleEmptyState(true);
        select.innerHTML = '<option value="" disabled selected>Select a Project</option>' + 
            allProjects.map(p => `<option value="${p._id}">${p.name}</option>`).join('');

        // Auto-select first project
        select.value = allProjects[0]._id;
        updateProjectUI(allProjects[0]);
        loadTasks(allProjects[0]._id);
        currentProject = allProjects[0];
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to load projects', 'error');
    }
}

async function loadTasks(projectId) {
    try {
        const res = await fetch(`/api/projects/${projectId}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasks = await res.json();
        renderBoard(Array.isArray(tasks) ? tasks : []);
    } catch (err) { console.error(err); }
}

function renderBoard(tasks) {
    const cols = ['todo', 'pending', 'working', 'review', 'done'];
    cols.forEach(col => {
        const container = document.getElementById(`col-${col}`);
        if (container) {
            container.innerHTML = '';
            tasks.filter(t => t.status === col).forEach(task => {
                container.appendChild(createTaskCard(task));
            });
        }
    });
}

function createTaskCard(task) {
    const div = document.createElement('div');
    div.className = 'task-card glass p-4 rounded-xl space-y-3 border border-white/5 hover:border-tech-blue/30 transition-all shadow-sm';
    div.setAttribute('draggable', 'true');
    div.onclick = () => openTaskDetail(task._id);
    
    div.innerHTML = `
        <div class="flex justify-between items-start gap-2">
            <h4 class="text-xs font-bold text-slate-100 line-clamp-2">${task.title}</h4>
        </div>
        <div class="flex items-center justify-between mt-4">
            <div class="flex -space-x-2 overflow-hidden">
                ${(task.assignedTo || []).slice(0, 3).map(u => `
                    <div class="w-6 h-6 rounded-lg bg-tech-blue/20 border border-white/10 flex items-center justify-center text-[8px] font-black text-tech-blue uppercase">
                        ${u.username[0]}
                    </div>
                `).join('')}
            </div>
            <div class="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                ${task.comments ? task.comments.length : 0} <i class="far fa-comment ml-1"></i>
            </div>
        </div>
    `;
    return div;
}

function setupEventListeners() {
    const select = document.getElementById('projectSelect');
    if (select) {
        select.addEventListener('change', (e) => {
            const project = allProjects.find(p => p._id === e.target.value);
            if (project) {
                updateProjectUI(project);
                loadTasks(project._id);
                currentProject = project;
            }
        });
    }

    document.querySelectorAll('.add-task-btn').forEach(btn => {
        btn.onclick = () => {
            if (!currentProject) return showToast('Info', 'Select a project first', 'brand');
            document.getElementById('taskStatus').value = btn.getAttribute('data-status');
            openModal('taskModal');
        };
    });

    const btns = ['saveTaskBtn', 'sendCommentBtn'];
    btns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'saveTaskBtn') el.onclick = saveTask;
            if (id === 'sendCommentBtn') el.onclick = saveComment;
        }
    });
}

function updateProjectUI(project) {
    const descEl = document.getElementById('projectDescription');
    const metaEl = document.getElementById('projectMeta');
    const priorityEl = document.getElementById('projectPriority');
    const deadlineEl = document.getElementById('projectDeadline');

    if (!project) return;
    if (descEl) descEl.textContent = project.description || 'Coordinate mission stages.';
    if (metaEl) {
        metaEl.classList.remove('hidden');
        const priorityColors = {
            'low': 'bg-slate-500/10 text-slate-500 border-slate-500/20',
            'medium': 'bg-tech-blue/10 text-tech-blue border-tech-blue/20',
            'high': 'bg-rose-500/10 text-rose-500 border-rose-500/20'
        };
        if (priorityEl) {
            priorityEl.className = `text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${priorityColors[project.priority] || priorityColors['medium']}`;
            priorityEl.innerHTML = `<i class="fas fa-flag mr-1"></i>${project.priority}`;
        }
        if (deadlineEl) {
            const date = project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No Target';
            deadlineEl.innerHTML = `<i class="fas fa-calendar mr-1"></i>${date}`;
        }
    }
}

function toggleEmptyState(hasProjects) {
    const placeholder = document.getElementById('noProjectsPlaceholder');
    const columns = document.querySelectorAll('.kanban-col-element');
    const boardContainer = document.getElementById('boardContainer');
    if (!hasProjects) {
        if (placeholder) placeholder.classList.remove('hidden');
        columns.forEach(col => col.classList.add('hidden'));
    } else {
        if (placeholder) placeholder.classList.add('hidden');
        columns.forEach(col => col.classList.remove('hidden'));
    }
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showToast(title, message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 4000);
}

function logout() {
    localStorage.clear();
    window.location.href = '/login';
}

async function saveTask() {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDesc').value;
    const status = document.getElementById('taskStatus').value;
    if (!title) return showToast('Error', 'Title is required', 'error');

    try {
        const res = await fetch(`/api/projects/${currentProject._id}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title, description, status })
        });
        if (res.ok) {
            closeModal('taskModal');
            loadTasks(currentProject._id);
            showToast('Success', 'Task deployed', 'success');
        }
    } catch (err) { console.error(err); }
}

async function saveComment() {
    // Logic for saving comments...
}
