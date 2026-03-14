const token = localStorage.getItem('token');
let allAdminProjects = [];
let currentProjectFolderId = null;
let currentProjectContextId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.href = '/login';
        return;
    }
    loadAdminStats();
    loadAdminProjects();
    loadUsers();

    // Configure Markdown & Highlighting
    marked.setOptions({
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });
});

let allUsers = [];

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load users');
        allUsers = await res.json();
        if (!Array.isArray(allUsers)) allUsers = [];

        const userList = document.getElementById('userSelectionList');
        if (userList) {
            const currentUser = JSON.parse(localStorage.getItem('user'));
            userList.innerHTML = allUsers
                .filter(u => u._id !== currentUser.id)
                .map(u => `
                    <label class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all">
                        <input type="checkbox" value="${u._id}" class="project-member-cb w-4 h-4 rounded border-white/10 bg-slate-900 text-tech-blue">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-white">${u.username}</span>
                            <span class="text-[8px] text-slate-500">${u.email}</span>
                        </div>
                    </label>
                `).join('');
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function loadAdminStats() {
    try {
        const res = await fetch('/api/projects/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load admin stats');
        const stats = await res.json();

        document.getElementById('activeProjectsCount').textContent = stats.activeProjects;
        document.getElementById('totalRevenue').textContent = `$${stats.totalPayments.toLocaleString()}`;
        document.getElementById('totalExpenses').textContent = `$${stats.totalExpenses.toLocaleString()}`;
        document.getElementById('netBalance').textContent = `$${stats.balance.toLocaleString()}`;

        const balanceCard = document.getElementById('balanceCard');
        if (stats.balance < 0) {
            balanceCard.classList.replace('border-indigo-500', 'border-rose-500');
            document.getElementById('netBalance').classList.add('text-rose-400');
        } else {
            balanceCard.classList.replace('border-indigo-500', 'border-emerald-500');
            document.getElementById('netBalance').classList.add('text-emerald-400');
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

async function loadAdminProjects() {
    try {
        const res = await fetch('/api/projects/admin/list', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load projects');
        allAdminProjects = await res.json();
        if (!Array.isArray(allAdminProjects)) allAdminProjects = [];
        renderProjectsGrid(allAdminProjects);
    } catch (err) {
        console.error('Error loading projects:', err);
    }
}

function renderProjectsGrid(projects) {
    const grid = document.getElementById('projectsGrid');
    if (projects.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-20 text-center glass rounded-3xl border-dashed border-2 border-white/10">
                <i class="fas fa-project-diagram text-4xl text-slate-700 mb-4"></i>
                <p class="text-slate-500">No projects registered in the system intelligence.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = projects.map(p => {
        const payments = p.payments || [];
        const notes = p.notes || [];
        const totalPaid = payments.filter(pay => pay.type === 'payment').reduce((acc, pay) => acc + pay.amount, 0);
        const totalExp = payments.filter(pay => pay.type === 'expense').reduce((acc, pay) => acc + pay.amount, 0);

        return `
            <div class="tech-card p-8 rounded-[2.5rem] group hover:border-tech-blue/30 transition-all duration-500 cursor-pointer" onclick="openAdminProjectDetail('${p._id}')">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <div class="flex items-center gap-3">
                            <h3 class="text-xl font-bold text-white group-hover:text-tech-blue transition-colors">${p.name}</h3>
                            <span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}">${p.status}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-2 line-clamp-2">${p.description || 'No objectives defined.'}</p>
                    </div>
                    <div class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:scale-110 group-hover:bg-tech-blue/10 group-hover:text-tech-blue transition-all">
                        <i class="fas fa-folder-tree"></i>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4 py-4 border-y border-white/5 mb-6">
                    <div>
                        <span class="text-[8px] font-black uppercase text-slate-600 tracking-tighter">Finance</span>
                        <div class="text-sm font-bold text-emerald-400">+$${totalPaid}</div>
                    </div>
                    <div>
                        <span class="text-[8px] font-black uppercase text-slate-600 tracking-tighter">Overhead</span>
                        <div class="text-sm font-bold text-rose-400">-$${totalExp}</div>
                    </div>
                    <div>
                        <span class="text-[8px] font-black uppercase text-slate-600 tracking-tighter">Notes</span>
                        <div class="text-sm font-bold text-slate-300">${notes.length}</div>
                    </div>
                </div>

                <div class="flex justify-between items-center text-[10px] font-bold">
                    <div class="flex gap-2">
                        <span class="text-slate-500 uppercase tracking-widest">Admin:</span>
                        <span class="text-white">${p.admin.username}</span>
                    </div>
                    <div class="text-slate-600">${new Date(p.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function openAdminProjectDetail(projectId) {
    try {
        const res = await fetch(`/api/projects/admin/${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { project, tasks } = await res.json();

        currentProjectContextId = projectId;
        currentProjectFolderId = project.filesFolderId;

        const content = document.getElementById('detailContent');
        content.innerHTML = `
            <div class="space-y-8 max-w-5xl mx-auto">
                <!-- Header Section -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/5 pb-8 relative">
                    <div class="flex-1">
                        <div class="flex items-center gap-4 mb-3">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-tech-blue/20 to-tech-blue/5 border border-tech-blue/20 flex items-center justify-center text-tech-blue text-2xl shadow-lg shadow-tech-blue/10 shrink-0">
                                <i class="fas fa-project-diagram"></i>
                            </div>
                            <div>
                                <h2 class="text-2xl md:text-4xl font-extrabold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">${project.name}</h2>
                                <div class="flex items-center gap-3 mt-2">
                                    <div id="detail-project-status-badge">
                                        <span class="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${project.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}">${project.status}</span>
                                    </div>
                                    <span class="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center"><i class="far fa-clock mr-1.5"></i> ${new Date(project.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        <p class="text-slate-400 text-xs md:text-sm max-w-3xl leading-relaxed mt-4 md:pl-[72px]">${project.description || 'No detailed scope analysis provided.'}</p>
                    </div>

                    <div class="flex items-center gap-3 self-end md:self-start md:pl-0 mt-4 md:mt-0">
                        <button onclick="confirmDeleteProject('${project._id}')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all font-bold text-xs uppercase tracking-widest border border-rose-500/20 hover:border-transparent shadow-lg shadow-rose-500/5 group" title="Delete Project">
                            <i class="fas fa-trash-alt group-hover:scale-110 transition-transform"></i>
                            <span class="hidden sm:block">Terminate</span>
                        </button>
                        <button onclick="closeAdminProjectModal()" class="w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-white/5 shadow-lg group">
                            <i class="fas fa-times text-lg group-hover:rotate-90 transition-transform duration-300"></i>
                        </button>
                    </div>
                </div>

                <!-- Grid Layout for Content -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Left Column: Operatives & Folders -->
                    <div class="space-y-8">
                        <!-- Mission Operatives -->
                        <div class="tech-card p-6 md:p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
                            <div class="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <h3 class="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
                                <i class="fas fa-users text-tech-blue"></i> Operatives
                            </h3>
                            <div id="detail-members-list" class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                                ${allUsers.filter(u => u._id !== project.admin._id).map(u => {
            const isMember = project.members.some(m => m._id === u._id);
            return `
                                        <label class="flex items-center justify-between p-3 rounded-2xl group/member hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xs text-slate-300 font-black border border-white/5 group-hover/member:border-tech-blue/30 group-hover/member:text-tech-blue transition-all">
                                                    ${u.username[0].toUpperCase()}
                                                </div>
                                                <div class="flex flex-col">
                                                    <span class="text-xs font-bold text-white group-hover/member:text-tech-blue transition-colors">${u.username}</span>
                                                    <span class="text-[9px] text-slate-500 uppercase tracking-widest">${u.email.split('@')[0]}</span>
                                                </div>
                                            </div>
                                            <div class="relative flex items-center justify-center w-5 h-5">
                                                <input type="checkbox" value="${u._id}" onchange="updateProjectMembers('${project._id}')" class="detail-member-cb peer appearance-none w-5 h-5 rounded border border-white/20 bg-slate-900 checked:bg-tech-blue checked:border-tech-blue transition-all cursor-pointer" ${isMember ? 'checked' : ''}>
                                                <i class="fas fa-check absolute text-[10px] text-white opacity-0 peer-checked:opacity-100 pointer-events-none"></i>
                                            </div>
                                        </label>
                                    `;
        }).join('')}
                            </div>
                        </div>

                        <!-- Operational Folders -->
                        <div class="tech-card p-6 md:p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
                            <div class="absolute inset-0 bg-gradient-to-br from-tech-blue/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <h3 class="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
                                <i class="fas fa-folder-tree text-tech-blue"></i> Resources
                            </h3>
                            <a href="/?folderId=${project.filesFolderId}" target="_blank" class="flex items-center gap-4 p-4 bg-slate-900/50 rounded-2xl hover:bg-tech-blue/10 transition-all border border-white/5 hover:border-tech-blue/30 group/link relative z-10 w-full block">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-xl bg-tech-blue/20 flex items-center justify-center text-tech-blue group-hover/link:scale-110 transition-transform">
                                        <i class="fas fa-folder-open text-lg"></i>
                                    </div>
                                    <div class="flex-1">
                                        <div class="text-sm font-bold text-white group-hover/link:text-tech-blue transition-colors">Storage Vault</div>
                                        <div class="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Open Archive <i class="fas fa-external-link-alt ml-1"></i></div>
                                    </div>
                                </div>
                            </a>
                        </div>
                    </div>

                    <!-- Right Column: Ledger, Notes, Tasks (spans 2 cols on lg) -->
                    <div class="lg:col-span-2 space-y-8">
                        <!-- Top Row: Financial & Tasks -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <!-- Financial Ledger -->
                            <div class="tech-card p-6 md:p-8 rounded-[2rem] border-white/5 flex flex-col relative overflow-hidden group">
                                <div class="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <div class="flex justify-between items-center mb-6 relative z-10">
                                    <h3 class="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400">
                                        <i class="fas fa-file-invoice-dollar text-emerald-500"></i> Financials
                                    </h3>
                                    <button onclick="showPaymentForm('${project._id}')" class="w-8 h-8 rounded-lg bg-tech-blue/10 text-tech-blue hover:bg-tech-blue hover:text-white flex items-center justify-center transition-all shadow-lg shadow-tech-blue/10" title="Add Ledger Entry">
                                        <i class="fas fa-plus text-xs"></i>
                                    </button>
                                </div>
                                <div id="paymentsList" class="space-y-3 flex-1 max-h-60 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                                    ${(project.payments || []).length === 0 ? '<div class="h-full min-h-[150px] flex flex-col items-center justify-center text-slate-600 space-y-3 opacity-50"><i class="fas fa-receipt text-3xl"></i><p class="text-[10px] font-black uppercase tracking-widest">No Transactions</p></div>' :
                (project.payments || []).slice().reverse().map(pay => `
                                            <div class="flex items-center justify-between p-3.5 bg-slate-900/50 rounded-2xl border border-white/5 hover:bg-white/5 transition-colors">
                                                <div class="flex items-center gap-4">
                                                    <div class="w-10 h-10 rounded-xl ${pay.type === 'payment' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'} border flex items-center justify-center shadow-inner">
                                                        <i class="fas ${pay.type === 'payment' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
                                                    </div>
                                                    <div>
                                                        <div class="text-xs font-bold text-white mb-0.5">${pay.description}</div>
                                                        <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest">${new Date(pay.date).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                                <div class="text-sm font-black ${pay.type === 'payment' ? 'text-emerald-400' : 'text-rose-400'} bg-slate-950 px-3 py-1.5 rounded-lg border border-white/5">
                                                    ${pay.type === 'payment' ? '+' : '-'}$${pay.amount}
                                                </div>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>

                            <!-- Operation Overview (Tasks) -->
                            <div class="tech-card p-6 md:p-8 rounded-[2rem] border-white/5 flex flex-col relative overflow-hidden group">
                                <div class="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <div class="flex justify-between items-center mb-6 relative z-10">
                                    <h3 class="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400">
                                        <i class="fas fa-tasks text-indigo-400"></i> Objectives
                                    </h3>
                                </div>
                                <div class="space-y-3 flex-1 max-h-60 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                                    ${tasks.length === 0 ? '<div class="h-full min-h-[150px] flex flex-col items-center justify-center text-slate-600 space-y-3 opacity-50"><i class="fas fa-clipboard-list text-3xl"></i><p class="text-[10px] font-black uppercase tracking-widest">No Objectives Set</p></div>' :
                        tasks.map(t => {
                            const statusColors = {
                                'done': 'bg-emerald-500 border-emerald-500/30 text-emerald-500',
                                'todo': 'bg-slate-600 border-slate-600/30 text-slate-400',
                                'in-progress': 'bg-tech-blue border-tech-blue/30 text-tech-blue'
                            };
                            const colorClass = statusColors[t.status] || statusColors['todo'];
                            return `
                                            <div class="p-3.5 bg-slate-900/50 rounded-2xl border border-white/5 flex justify-between items-center hover:bg-white/5 transition-colors">
                                                <div class="flex items-center gap-4">
                                                    <div class="w-3 h-3 rounded-full ${colorClass.split(' ')[0]} shadow-[0_0_8px_currentColor] opacity-80 ${t.status === 'in-progress' ? 'animate-pulse' : ''}"></div>
                                                    <div class="text-xs font-bold text-slate-200">${t.title}</div>
                                                </div>
                                                <div class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-950 border border-white/5 ${colorClass.split(' ')[2]}">${t.status}</div>
                                            </div>
                                        `;
                        }).join('')
                    }
                                </div>
                            </div>
                        </div>

                        <!-- Bottom Row: Internal Intel Notes -->
                        <div class="tech-card p-6 md:p-8 rounded-[2rem] border-white/5 relative overflow-hidden group">
                            <div class="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div class="flex justify-between items-center mb-6 relative z-10">
                                <h3 class="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400">
                                    <i class="fas fa-user-secret text-slate-300"></i> Intel Logs
                                </h3>
                                <button onclick="showNoteForm('${project._id}')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/5 font-bold text-[10px] uppercase tracking-widest text-slate-300 hover:text-white group/btn">
                                    <i class="fas fa-plus text-tech-blue group-hover/btn:scale-110 transition-transform"></i> Add Log
                                </button>
                            </div>
                            <div id="notesList" class="space-y-4 max-h-60 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                                ${(project.notes || []).length === 0 ? '<div class="p-8 flex flex-col items-center justify-center text-slate-600 space-y-3 opacity-50 border border-dashed border-white/10 rounded-2xl"><i class="fas fa-comment-slash text-3xl"></i><p class="text-[10px] font-black uppercase tracking-widest">No Intelligence Logs</p></div>' :
                        (project.notes || []).slice().reverse().map(note => `
                                        <div class="p-5 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition-colors">
                                            <p class="text-sm text-slate-300 leading-relaxed mb-4 whitespace-pre-wrap font-medium">${note.text}</p>
                                            <div class="flex justify-between items-center pt-3 border-t border-white/5">
                                                <div class="flex items-center gap-2">
                                                    <div class="w-5 h-5 rounded bg-tech-blue/20 flex items-center justify-center text-[8px] text-tech-blue font-black border border-tech-blue/20">
                                                        ${(note.user?.username || 'U')[0].toUpperCase()}
                                                    </div>
                                                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">${note.user?.username || "Agent"}</span>
                                                </div>
                                                <span class="text-[9px] font-bold text-slate-600 uppercase tracking-widest">${new Date(note.createdAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    `).join('')
                    }
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        document.getElementById('adminProjectModal').classList.remove('hidden');
        loadProjectFiles(project.filesFolderId);
    } catch (err) {
        console.error('Error fetching details:', err);
    }
}

async function archiveProject(projectId) {
    if (!confirm('Are you sure you want to archive this project? It will be hidden from members but preserved in admin archives.')) return;

    try {
        const res = await fetch(`/api/projects/${projectId}/archive`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            closeAdminProjectModal();
            loadAdminProjects();
            loadAdminStats();
        }
    } catch (err) {
        console.error('Error archiving project:', err);
    }
}

async function confirmDeleteProject(projectId) {
    if (!confirm('CRITICAL: Are you sure you want to PERMANENTLY DELETE this project and all its tasks? This action cannot be undone.')) return;

    try {
        const res = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            closeAdminProjectModal();
            loadAdminProjects();
            loadAdminStats();
        } else {
            const data = await res.json();
            alert('Deletion failed: ' + data.message);
        }
    } catch (err) {
        console.error('Error deleting project:', err);
        alert('An error occurred during deletion.');
    }
}

async function updateProjectMembers(projectId) {
    const memberCbs = document.querySelectorAll('.detail-member-cb:checked');
    const members = Array.from(memberCbs).map(cb => cb.value);

    try {
        const res = await fetch(`/api/projects/admin/${projectId}/members`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ members })
        });

        if (res.ok) {
            // Success - toast or just let it be
            console.log('Members updated');
        } else {
            alert('Failed to update members');
        }
    } catch (err) {
        console.error('Error updating members:', err);
    }
}

function closeAdminProjectModal() {
    document.getElementById('adminProjectModal').classList.add('hidden');
}

function openNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}
async function initiateProject() {
    const name = document.getElementById('newProjectName').value;
    const description = document.getElementById('newProjectDesc').value;
    const members = Array.from(document.querySelectorAll('.project-member-cb:checked')).map(cb => cb.value);

    if (!name) return alert('Intelligence: Project name required.');

    try {
        const btn = document.getElementById('createProjectBtn');
        btn.disabled = true;
        btn.textContent = 'Initiating...';

        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, description, members })
        });

        if (res.ok) {
            closeModal('newProjectModal');
            loadAdminProjects();
            loadAdminStats();
        } else {
            alert('Initiation failed.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        const btn = document.getElementById('createProjectBtn');
        btn.disabled = false;
        btn.textContent = 'Create Project';
    }
}

async function showNoteForm(projectId) {
    const text = prompt('Enter Internal Intelligence Note:');
    if (!text) return;

    try {
        const res = await fetch(`/api/projects/admin/${projectId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text })
        });
        if (res.ok) openAdminProjectDetail(projectId);
    } catch (err) { console.error(err); }
}

async function showPaymentForm(projectId) {
    const amount = prompt('Amount ($):');
    if (!amount) return;
    const type = prompt('Type (payment/expense):', 'payment');
    const description = prompt('Description:');

    try {
        const res = await fetch(`/api/projects/admin/${projectId}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: parseFloat(amount),
                type: type === 'expense' ? 'expense' : 'payment',
                description: description || 'Ledger Entry'
            })
        });
        if (res.ok) {
            openAdminProjectDetail(projectId);
            loadAdminStats();
        }
    } catch (err) { console.error(err); }
}

async function loadProjectFiles(folderId) {
    const list = document.getElementById('projectFilesList');
    if (!list) return;

    try {
        const [filesRes, foldersRes] = await Promise.all([
            fetch(`/api/files?folderId=${folderId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`/api/folders?parentId=${folderId}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const files = await filesRes.json();
        const folders = await foldersRes.json();

        list.innerHTML = '';

        if (folders.length === 0 && files.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 opacity-30">
                    <i class="fas fa-folder-open text-3xl mb-3"></i>
                    <p class="text-[9px] font-black uppercase">Archive Empty</p>
                </div>
            `;
            return;
        }

        folders.forEach(f => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-tech-blue/30 transition-all cursor-pointer';
            div.onclick = () => window.location.href = `/files?folderId=${f._id}`;
            div.innerHTML = `
                <div class="w-8 h-8 rounded-xl bg-tech-blue/20 flex items-center justify-center text-tech-blue">
                    <i class="fas fa-folder"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-bold text-white truncate">${f.name}</div>
                    <div class="text-[8px] text-slate-500 uppercase font-black">Sub-directory</div>
                </div>
            `;
            list.appendChild(div);
        });

        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-tech-blue/30 transition-all cursor-pointer';
            div.onclick = () => window.open(`/api/files/${f._id}/view`, '_blank');
            div.innerHTML = `
                <div class="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                    <i class="fas fa-file-code"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-bold text-white truncate">${f.originalName}</div>
                    <div class="text-[8px] text-slate-500 uppercase font-black">${Math.round(f.size / 1024)} KB</div>
                </div>
            `;
            list.appendChild(div);
        });

    } catch (err) {
        console.error('Error loading project files:', err);
    }
}

function triggerProjectFileUpload(projectId, folderId) {
    currentProjectContextId = projectId;
    currentProjectFolderId = folderId;
    document.getElementById('projectFileInput').click();
}

async function handleProjectFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', currentProjectFolderId);

    try {
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.ok) {
            loadProjectFiles(currentProjectFolderId);
        } else {
            alert('Upload failed.');
        }
    } catch (err) {
        console.error(err);
    }
}

async function openProjectFolderModal(projectId, folderId) {
    const name = prompt('Sub-folder Name:');
    if (!name) return;

    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, parentId: folderId })
        });

        if (res.ok) {
            loadProjectFiles(folderId);
        }
    } catch (err) {
        console.error(err);
    }
}
