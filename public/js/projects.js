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
        if (!Array.isArray(allUsers)) allUsers = [];
        
        // Populate project creation list (for admin)
        const userList = document.getElementById('userSelectionList');
        if (userList) {
            userList.innerHTML = allUsers
                .filter(u => u._id !== currentUser.id)
                .map(u => `
                    <label class="flex items-center gap-3 p-3 glass rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                        <input type="checkbox" value="${u._id}" class="project-member-cb w-4 h-4 rounded border-white/10 bg-white/5 text-tech-blue">
                        <div class="flex flex-col">
                            <span class="text-xs font-bold">${u.username}</span>
                            <span class="text-[10px] text-slate-500">${u.email}</span>
                        </div>
                    </label>
                `).join('');
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function loadProjects() {
    try {
        const res = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load projects');
        allProjects = await res.json();
        if (!Array.isArray(allProjects)) allProjects = [];
        
        const select = document.getElementById('projectSelect');
        select.innerHTML = '<option value="" disabled selected>Select a Project</option>' + 
            allProjects.map(p => `<option value="${p._id}">${p.name}</option>`).join('');

        if (allProjects.length > 0) {
            // Auto-select first project for now
            select.value = allProjects[0]._id;
            select.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        showToast('Error', 'Failed to load projects', 'error');
    }
}

async function loadTasks(projectId) {
    try {
        const res = await fetch(`/api/projects/${projectId}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load tasks');
        const tasks = await res.json();
        if (!Array.isArray(tasks)) {
            console.error('Expected tasks array, got:', tasks);
            renderBoard([]);
            return;
        }
        renderBoard(tasks);
    } catch (err) {
        showToast('Error', 'Failed to load tasks', 'error');
    }
}

function renderBoard(tasks) {
    const cols = ['todo', 'pending', 'working', 'review', 'done'];
    cols.forEach(col => {
        const container = document.getElementById(`col-${col}`);
        container.innerHTML = '';
        
        const colTasks = tasks.filter(t => t.status === col);
        colTasks.forEach(task => {
            const card = createTaskCard(task);
            container.appendChild(card);
        });
    });
}

function createTaskCard(task) {
    const div = document.createElement('div');
    div.className = 'task-card glass p-4 rounded-xl space-y-3 border border-white/5 hover:border-tech-blue/30 transition-all shadow-sm';
    div.setAttribute('draggable', 'true');
    div.setAttribute('id', `task-${task._id}`);
    div.setAttribute('data-id', task._id);
    div.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', task._id);
        div.classList.add('opacity-40', 'scale-95');
        document.querySelectorAll('.kanban-column').forEach(c => c.classList.add('bg-white/[0.02]'));
    };
    div.ondragend = () => {
        div.classList.remove('opacity-40', 'scale-95');
        document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('bg-white/[0.02]'));
    };
    div.onclick = () => openTaskDetail(task._id);

    const assignees = task.assignedTo && task.assignedTo.length > 0 ? task.assignedTo : [];
    const assigneeNames = assignees.length > 0 ? assignees.map(u => u.username).join(', ') : 'Unassigned';
    
    // Generate avatars (show up to 3)
    const avatarsHtml = assignees.slice(0, 3).map(u => `
        <div class="w-5 h-5 rounded-lg bg-tech-blue/10 flex items-center justify-center text-[8px] text-tech-blue font-black shrink-0 border border-tech-blue/20 -ml-1.5 first:ml-0 bg-[#0F172A]">
            ${u.username[0].toUpperCase()}
        </div>
    `).join('');
    
    const moreCount = assignees.length > 3 ? `<div class="w-5 h-5 rounded-lg bg-white/5 flex items-center justify-center text-[7px] text-slate-500 font-black shrink-0 border border-white/10 -ml-1.5">+${assignees.length - 3}</div>` : '';

    const statusColors = {
        'todo': 'bg-slate-500',
        'pending': 'bg-amber-500',
        'working': 'bg-blue-500',
        'review': 'bg-indigo-500',
        'done': 'bg-emerald-500'
    };
    const statusColor = statusColors[task.status] || 'bg-slate-500';

    div.innerHTML = `
        <div class="flex justify-between items-start gap-3">
            <div class="flex items-start gap-2">
                <div class="w-1.5 h-1.5 rounded-full ${statusColor} mt-1.5 shrink-0 shadow-[0_0_8px_rgba(var(--color-rgb),0.5)]" style="--color-rgb: ${task.status === 'working' ? '59, 130, 246' : task.status === 'done' ? '16, 185, 129' : '100, 116, 139'}"></div>
                <h4 class="font-bold text-xs text-white leading-tight">${task.title}</h4>
            </div>
            <div class="flex flex-col items-end gap-1.5">
                <div class="flex items-center">
                    ${avatarsHtml}
                    ${moreCount}
                </div>
                ${assignees.length > 1 ? `<span class="text-[7px] font-black text-tech-blue uppercase tracking-tighter bg-tech-blue/5 px-1.5 py-0.5 rounded-md border border-tech-blue/10">${assignees.length} Ops</span>` : ''}
            </div>
        </div>
        <p class="text-[10px] text-slate-500 line-clamp-2 leading-relaxed font-medium">${task.description || 'No unit specification provided.'}</p>
        <div class="flex items-center justify-between pt-3 border-t border-white/5">
            <div class="flex items-center gap-1.5 grayscale hover:grayscale-0 transition-all max-w-[120px]">
                <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider truncate">${assigneeNames}</span>
            </div>
            <div class="flex items-center gap-1.5 text-slate-600 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                <i class="far fa-comment text-[9px]"></i>
                <span class="text-[9px] font-black">${task.comments.length}</span>
            </div>
        </div>
    `;
    return div;
}

function setupEventListeners() {
    document.getElementById('projectSelect').addEventListener('change', (e) => {
        currentProject = e.target.value;
        loadTasks(currentProject);
        
        const project = allProjects.find(p => p._id === currentProject);
        if (!project) return;
        
        const assignContainer = document.getElementById('taskAssignToContainer');
        const members = [project.admin, ...project.members];
        const uniqueMembers = Array.from(new Set(members.map(m => m._id)))
            .map(id => members.find(m => m._id === id));

        assignContainer.innerHTML = uniqueMembers.map(m => `
            <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-all group">
                <input type="checkbox" value="${m._id}" class="task-assign-cb w-4 h-4 rounded border-white/10 bg-white/5 text-tech-blue focus:ring-0">
                <span class="text-xs text-slate-300 group-hover:text-white transition-colors">${m.username}</span>
            </label>
        `).join('');
    });

    const createBtn = document.getElementById('createProjectBtn');
    if (createBtn) createBtn.onclick = () => openModal('projectModal');
    
    document.querySelectorAll('.add-task-btn').forEach(btn => {
        btn.onclick = (e) => {
            if (!currentProject) return showToast('Info', 'Select a project first', 'brand');
            document.getElementById('taskStatus').value = btn.getAttribute('data-status');
            openModal('taskModal');
        };
    });

    document.getElementById('saveProjectBtn').onclick = saveProject;
    document.getElementById('saveTaskBtn').onclick = saveTask;
    document.getElementById('sendCommentBtn').onclick = saveComment;
}

async function saveProject() {
    const name = document.getElementById('projectName').value;
    const description = document.getElementById('projectDesc').value;
    const memberCbs = document.querySelectorAll('.project-member-cb:checked');
    const members = Array.from(memberCbs).map(cb => cb.value);

    if (!name) return showToast('Error', 'Name is required', 'error');

    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, description, members })
        });
        
        if (res.ok) {
            showToast('Success', 'Project created', 'success');
            closeModal('projectModal');
            loadProjects();
        }
    } catch (err) {
        showToast('Error', 'Failed to create project', 'error');
    }
}

async function saveTask() {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDesc').value;
    const assignedTo = Array.from(document.querySelectorAll('.task-assign-cb:checked'))
        .map(cb => cb.value);
    const status = document.getElementById('taskStatus').value;

    if (!title) return showToast('Error', 'Title is required', 'error');

    try {
        const res = await fetch('/api/projects/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ projectId: currentProject, title, description, assignedTo, status })
        });

        if (res.ok) {
            showToast('Success', 'Task added', 'success');
            closeModal('taskModal');
            loadTasks(currentProject);
        }
    } catch (err) {
        showToast('Error', 'Failed to add task', 'error');
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        const res = await fetch(`/api/projects/tasks/${taskId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            loadTasks(currentProject);
        }
    } catch (err) {
        showToast('Error', 'Failed to update status', 'error');
    }
}

async function openTaskDetail(taskId) {
    try {
        const res = await fetch(`/api/projects/${currentProject}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasks = await res.json();
        const task = tasks.find(t => t._id === taskId);
        
        // Show status badge separately
        const statusBadge = document.getElementById('detail-task-status-badge');
        statusBadge.innerHTML = `<span class="bg-tech-blue/10 text-tech-blue px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-tech-blue/20 shadow-sm">${task.status}</span>`;

        const content = document.getElementById('taskDetailContent');
        
        // Prepare assignment options
        const project = allProjects.find(p => p._id === currentProject);
        const members = [project.admin, ...project.members];
        const uniqueMembers = Array.from(new Set(members.map(m => m._id)))
            .map(id => members.find(m => m._id === id));
        
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const assigneeIds = task.assignedTo ? task.assignedTo.map(u => u._id) : [];
        const isAssignedToMe = assigneeIds.includes(currentUser.id);

        content.innerHTML = `
            <div data-id="${task._id}" id="detail-task-id" class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div class="space-y-4">
                    <h2 class="text-3xl md:text-4xl font-extrabold text-white leading-tight tracking-tight">${task.title}</h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="glass p-5 rounded-2xl border-white/5 space-y-3">
                            <div class="flex justify-between items-center">
                                <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Task Assigned Operators</h3>
                                <span class="text-[9px] font-black text-tech-blue bg-tech-blue/10 px-2 py-0.5 rounded-lg border border-tech-blue/20">${assigneeIds.length} Operators</span>
                            </div>
                            <div id="detailAssignContainer" class="max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                ${uniqueMembers.map(m => `
                                    <label class="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5 hover:border-tech-blue/20 cursor-pointer transition-all group">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-lg bg-tech-blue/10 flex items-center justify-center text-[10px] text-tech-blue font-black border border-tech-blue/20">
                                                ${m.username[0].toUpperCase()}
                                            </div>
                                            <span class="text-xs font-bold text-slate-300 group-hover:text-white">${m.username}</span>
                                        </div>
                                        <input type="checkbox" value="${m._id}" ${assigneeIds.includes(m._id) ? 'checked' : ''} onchange="updateTaskAssignees('${task._id}')" class="detail-assign-cb w-5 h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-0">
                                    </label>
                                `).join('')}
                            </div>
                            ${!isAssignedToMe ? `
                                <button onclick="toggleSelfAssign('${task._id}', true)" class="w-full mt-2 py-3 rounded-xl bg-tech-blue/10 text-tech-blue hover:bg-tech-blue hover:text-white text-[10px] font-bold flex items-center justify-center gap-2 transition-all">
                                    <i class="fas fa-user-plus"></i> Self-Assign to Mission
                                </button>
                            ` : `
                                <button onclick="toggleSelfAssign('${task._id}', false)" class="w-full mt-2 py-3 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white text-[10px] font-bold flex items-center justify-center gap-2 transition-all">
                                    <i class="fas fa-user-minus"></i> Abort My Assignment
                                </button>
                            `}
                        </div>
                        
                        <div class="glass p-5 rounded-2xl border-white/5 space-y-3">
                            <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Temporal Data</h3>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                                    <i class="far fa-calendar-alt text-lg"></i>
                                </div>
                                <div>
                                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Created</p>
                                    <p class="text-xs text-slate-200 font-medium">${new Date(task.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="space-y-4">
                    <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Unit Specifications</h3>
                    <div class="bg-white/[0.02] border border-white/5 p-6 rounded-2xl leading-relaxed text-slate-300 text-sm shadow-inner markdown-content">
                        ${task.description ? marked.parse(task.description) : '<p class="text-slate-500 italic">No additional specifications provided for this unit.</p>'}
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="flex items-center justify-between border-b border-white/5 pb-4">
                        <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Operation Log (Discussion)</h3>
                        <span class="text-[10px] font-black text-tech-blue bg-tech-blue/10 px-2 py-0.5 rounded-lg border border-tech-blue/20">${task.comments.length} Entries</span>
                    </div>
                    
                    <div id="commentsList" class="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        ${task.comments.length === 0 ? `
                            <div class="flex flex-col items-center justify-center py-12 px-6 bg-white/[0.01] rounded-2xl border border-dashed border-white/10 opacity-60">
                                <i class="fas fa-comments text-4xl text-slate-700 mb-4"></i>
                                <p class="text-xs text-slate-500 font-medium italic">No logs detected in this communication channel.</p>
                            </div>
                        ` : 
                            task.comments.map(c => {
                                const author = c.user || {};
                                const username = author.username || 'Operative';
                                return `
                                    <div class="flex gap-4 group">
                                        <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 shrink-0 flex items-center justify-center font-bold text-slate-500 text-xs shadow-inner">
                                            ${username[0].toUpperCase()}
                                        </div>
                                        <div class="flex-1 space-y-1.5 min-w-0">
                                            <div class="flex justify-between items-center gap-4">
                                                <span class="text-[11px] font-black text-white hover:text-tech-blue transition-colors cursor-default">${username}</span>
                                                <span class="text-[9px] text-slate-600 font-bold tracking-wider shrink-0">${new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <div class="bg-white/[0.03] border border-white/5 p-4 rounded-2xl rounded-tl-none group-hover:border-white/10 transition-all shadow-sm markdown-content text-slate-300">
                                                ${marked.parse(c.text)}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        `;
        
        openModal('taskDetailModal');
        // Apply highlighting to newly rendered content
        document.querySelectorAll('pre code').forEach((el) => {
            hljs.highlightElement(el);
        });
    } catch (err) {
        console.error(err);
    }
}

async function updateTaskAssignees(taskId) {
    const assignedTo = Array.from(document.querySelectorAll('.detail-assign-cb:checked'))
        .map(cb => cb.value);
    
    try {
        const res = await fetch(`/api/projects/tasks/${taskId}/assignment`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ assignedTo })
        });
        if (res.ok) {
            loadTasks(currentProject);
            // Re-open to refresh the self-assign button state
            openTaskDetail(taskId);
        }
    } catch (err) {
        showToast('Error', 'Failed to update assignees', 'error');
    }
}

async function toggleSelfAssign(taskId, add) {
    try {
        // Fetch current task to get existing assignees
        const resTasks = await fetch(`/api/projects/${currentProject}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasks = await resTasks.json();
        const task = tasks.find(t => t._id === taskId);
        
        let assignedTo = task.assignedTo ? task.assignedTo.map(u => u._id) : [];
        const myId = JSON.parse(localStorage.getItem('user')).id;
        
        if (add) {
            if (!assignedTo.includes(myId)) assignedTo.push(myId);
        } else {
            assignedTo = assignedTo.filter(id => id !== myId);
        }

        const res = await fetch(`/api/projects/tasks/${taskId}/assignment`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ assignedTo })
        });

        if (res.ok) {
            showToast('Success', add ? 'Task assigned to you' : 'Task removed from you', 'success');
            loadTasks(currentProject);
            openTaskDetail(taskId);
        }
    } catch (err) {
        showToast('Error', 'Toggle failed', 'error');
    }
}
async function saveComment() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    const taskId = document.getElementById('detail-task-id')?.getAttribute('data-id');

    if (!text || !taskId) return;

    try {
        const res = await fetch(`/api/projects/tasks/${taskId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text })
        });

        if (res.ok) {
            input.value = '';
            openTaskDetail(taskId); // Refresh details
        }
    } catch (err) {
        showToast('Error', 'Communication failed', 'error');
    }
}

// Global UI functions
function openModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('flex');
    m.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drop(ev) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text");
    const targetStatus = ev.currentTarget.id.replace('col-', '');
    updateTaskStatus(taskId, targetStatus);
}

function showToast(title, message, type = 'brand') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const head = document.getElementById('toastTitle');
    const msg = document.getElementById('toastMessage');

    const themes = {
        brand: { bg: 'bg-tech-blue/20', text: 'text-tech-blue', icon: 'fa-info-circle' },
        success: { bg: 'bg-emerald-500/20', text: 'text-emerald-500', icon: 'fa-check-circle' },
        error: { bg: 'bg-rose-500/20', text: 'text-rose-500', icon: 'fa-exclamation-triangle' }
    };

    const theme = themes[type] || themes.brand;

    icon.className = `w-10 h-10 rounded-xl flex items-center justify-center ${theme.text} ${theme.bg} border border-white/5`;
    icon.innerHTML = `<i class="fas ${theme.icon} text-lg"></i>`;
    head.textContent = title;
    msg.textContent = message;

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
