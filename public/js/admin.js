const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || user.role !== 'admin') {
    window.location.href = '/login';
}

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadLogs();
    loadUsers(); // This was missing to load users in users.ejs
    setupEventListeners();
});

async function loadUsers() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await res.json();
        window.allUsers = users;
        renderUsers(users);
    } catch (err) {
        console.error('Users error:', err);
    }
}

function renderUsers(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    if (!users || users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-8 py-12 text-center text-slate-500">No personnel records found</td></tr>';
        return;
    }

    tableBody.innerHTML = users.map(user => {
        const date = new Date(user.createdAt).toLocaleDateString();
        const storageUsage = ((user.totalStorageUsed || 0) / (user.storageQuota || 1073741824) * 100).toFixed(1);
        const usedMB = ((user.totalStorageUsed || 0) / (1024 * 1024)).toFixed(1);

        return `
            <tr class="hover:bg-white/[0.02] transition-colors group">
                <td class="px-8 py-6">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-tech-blue/10 flex items-center justify-center text-tech-blue border border-tech-blue/20">
                            <i class="fas fa-user-shield text-xs"></i>
                        </div>
                        <div>
                            <div class="text-sm font-bold text-white mb-0.5">${user.username}</div>
                            <div class="text-[10px] text-slate-500 font-medium">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <div class="w-full max-w-[120px]">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[10px] font-bold text-slate-400 capitalize">${usedMB} MB</span>
                            <span class="text-[10px] font-black text-tech-blue">${storageUsage}%</span>
                        </div>
                        <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div class="h-full bg-tech-blue rounded-full transition-all duration-1000" style="width: ${storageUsage}%"></div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6 text-center">
                    <span class="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border border-white/5'}">
                        ${user.role}
                    </span>
                </td>
                <td class="px-8 py-6 text-[10px] font-bold text-slate-500">${date}</td>
                <td class="px-8 py-6 text-right">
                    <button onclick="editUser('${user._id}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition-all border border-white/5 inline-flex">
                        <i class="fas fa-cog text-[10px]"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data) {
            const usersEl = document.getElementById('totalUsersCard');
            const projectsEl = document.getElementById('totalProjectsCard');
            const filesEl = document.getElementById('totalFilesCard');
            const storageEl = document.getElementById('totalStorageCard');

            // Set text if they exist
            if (usersEl) usersEl.textContent = data.totalUsers || 0;
            // Note: Projects/Files cards might be missing in some layouts
            if (projectsEl) projectsEl.textContent = data.totalProjects || 0;
            if (filesEl) filesEl.textContent = data.totalFiles || 0;

            if (storageEl) {
                const usedMB = (data.storageUsed / (1024 * 1024)).toFixed(1);
                storageEl.textContent = `${usedMB} MB`;
            }

            // Real-time server stats (CPU/RAM)
            if (data.cpuUsage !== undefined && document.getElementById('cpuLoadCard')) {
                document.getElementById('cpuLoadCard').textContent = `${data.cpuUsage}%`;
            }
            if (data.ramUsage !== undefined && document.getElementById('ramUsageCard')) {
                document.getElementById('ramUsageCard').textContent = `${data.ramUsage}%`;
            }
            if (data.ramDetail && document.getElementById('ramDetailLabel')) {
                document.getElementById('ramDetailLabel').textContent = data.ramDetail;
            }

            updateStorageGauge(data.storageUsed || 0, data.storageLimit || 1073741824);
        }
    } catch (err) { console.error('Stats error:', err); }
}

async function loadLogs() {
    try {
        const res = await fetch('/api/admin/logs?todayOnly=true', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const logs = await res.json();
        const container = document.getElementById('activityList');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-48 text-slate-500 opacity-50">
                    <i class="fas fa-terminal text-2xl mb-3"></i>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em]">No Activity Logs Today</p>
                </div>`;
            return;
        }

        container.innerHTML = logs.map(log => {
            const date = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="flex items-start gap-4 p-4 rounded-xl hover:bg-white/5 transition-all animate-fade-in group border border-transparent hover:border-white/5 mb-2">
                    <div class="w-10 h-10 rounded-lg bg-tech-blue/10 flex items-center justify-center text-tech-blue border border-tech-blue/20 group-hover:scale-110 transition-transform shadow-lg shadow-tech-blue/5">
                        <i class="fas fa-code-branch text-xs"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-[10px] font-black text-slate-100 uppercase tracking-wider truncate">${log.userId?.email || 'System'}</span>
                            <span class="text-[9px] font-medium text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded-md uppercase tracking-tighter">${date}</span>
                        </div>
                        <p class="text-[11px] text-slate-400 font-medium leading-relaxed">${log.action}: <span class="text-tech-blue/90 italic font-mono">${log.details}</span></p>
                    </div>
                </div>`;
        }).join('');
    } catch (err) { console.error('Logs error:', err); }
}

async function purgeLogs() {
    if (!confirm('Are you sure you want to purge all activity logs?')) return;
    try {
        const res = await fetch('/api/admin/logs/clear', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadLogs();
            showToast('System', 'Activity logs purged successfully', 'success');
        } else {
            showToast('Error', 'Failed to purge logs', 'error');
        }
    } catch (err) { console.error(err); }
}

function updateStorageGauge(used, limit) {
    const percent = Math.min((used / limit) * 100, 100).toFixed(1);
    const bar = document.getElementById('storageBar');
    const label = document.getElementById('storagePercentLabel');
    if (label) label.textContent = `${percent}% Capacity`;
    if (bar) bar.style.width = `${percent}%`;
}

function setupEventListeners() {
    const purgeBtn = document.querySelector('[title="Purge System Logs"]');
    if (purgeBtn) purgeBtn.onclick = purgeLogs;

    document.getElementById('saveUserBtn')?.addEventListener('click', () => window.saveUserChanges());
    document.getElementById('saveAccessBtn')?.addEventListener('click', () => {
        const userId = document.getElementById('editUserId').value;
        const selectedUsers = Array.from(document.querySelectorAll('input[name="accessUser"]:checked')).map(el => el.value);

        fetch(`/api/admin/users/${userId}/shared-with`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sharedWith: selectedUsers })
        }).then(res => {
            if (res.ok) {
                showToast('Success', 'Access matrix updated', 'success');
                closeAccessModal();
                loadUsers();
            }
        }).catch(err => console.error(err));
    });
}

function showToast(title, message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 4000);
}

// Edit User & Modal Logic
window.editUser = function (userId) {
    const user = window.allUsers.find(u => u._id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user._id;
    const subEl = document.getElementById('editUserSubtitle');
    if (subEl) subEl.textContent = `Modifying: ${user.username}`;

    const roleEl = document.getElementById('editUserRole');
    if (roleEl) roleEl.value = user.role;

    const activeEl = document.getElementById('editUserActive');
    if (activeEl) activeEl.checked = user.status !== 'disabled';

    const quotaEl = document.getElementById('editUserQuota');
    if (quotaEl) quotaEl.value = Math.round((user.storageQuota || 1073741824) / (1024 * 1024));

    // Permissions
    const perms = user.permissions || {};
    const pView = document.getElementById('permView');
    const pUpload = document.getElementById('permUpload');
    const pDelete = document.getElementById('permDelete');
    const pSeeOthers = document.getElementById('permSeeOthers');

    if (pView) pView.checked = perms.canView !== false;
    if (pUpload) pUpload.checked = perms.canUpload !== false;
    if (pDelete) pDelete.checked = perms.canDelete !== false;
    if (pSeeOthers) pSeeOthers.checked = perms.canSeeOthers === true;

    updateStatusLabel();
    const modal = document.getElementById('editUserModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeEditUserModal = function () {
    document.getElementById('editUserModal').classList.add('hidden');
};

window.updateStatusLabel = function () {
    const checkbox = document.getElementById('editUserActive');
    const label = document.getElementById('statusToggleLabel');
    if (checkbox && label) {
        label.textContent = checkbox.checked ? 'Active' : 'Disabled';
        label.className = checkbox.checked ? 'text-sm font-bold text-emerald-500' : 'text-sm font-bold text-rose-500';
    }
};

window.saveUserChanges = async function () {
    const userId = document.getElementById('editUserId').value;
    const role = document.getElementById('editUserRole').value;
    const status = document.getElementById('editUserActive').checked ? 'active' : 'disabled';
    const quotaMB = parseInt(document.getElementById('editUserQuota').value) || 1024;

    const permissions = {
        canView: document.getElementById('permView').checked,
        canUpload: document.getElementById('permUpload').checked,
        canDelete: document.getElementById('permDelete').checked,
        canSeeOthers: document.getElementById('permSeeOthers').checked
    };

    try {
        // Update Role
        await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role })
        });

        // Update Status
        await fetch(`/api/admin/users/${userId}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        // Update Quota
        await fetch(`/api/admin/users/${userId}/quota`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ quota: quotaMB * 1024 * 1024 })
        });

        // Update Permissions
        const res = await fetch(`/api/admin/users/${userId}/permissions`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ permissions })
        });

        if (res.ok) {
            showToast('Success', 'User profile updated successfully', 'success');
            closeEditUserModal();
            loadUsers();
        } else {
            showToast('Error', 'Failed to update permissions', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error', 'System communication failure', 'error');
    }
};

window.openAccessManagement = function () {
    const userId = document.getElementById('editUserId').value;
    const user = window.allUsers.find(u => u._id === userId);
    if (!user) return;

    const container = document.getElementById('accessUserList');
    document.getElementById('accessModalSubtitle').textContent = `Target: ${user.username}`;

    const sharedWithIds = (user.sharedWith || []).map(u => (u._id || u).toString());

    container.innerHTML = window.allUsers
        .filter(u => u._id !== userId)
        .map(u => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-tech-blue/10 flex items-center justify-center text-tech-blue">
                        <i class="fas fa-user text-[10px]"></i>
                    </div>
                    <span class="text-xs font-bold text-white">${u.username}</span>
                </div>
                <input type="checkbox" name="accessUser" value="${u._id}" ${sharedWithIds.includes(u._id) ? 'checked' : ''} class="w-5 h-5 rounded-lg bg-white/5 border-white/10 text-tech-blue focus:ring-tech-blue">
            </div>
        `).join('');

    document.getElementById('accessModal').classList.remove('hidden');
};

window.closeAccessModal = function () {
    document.getElementById('accessModal').classList.add('hidden');
};

document.getElementById('saveAccessBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('editUserId').value;
    const selectedUsers = Array.from(document.querySelectorAll('input[name="accessUser"]:checked')).map(el => el.value);

    try {
        const res = await fetch(`/api/admin/users/${userId}/shared-with`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sharedWith: selectedUsers })
        });

        if (res.ok) {
            showToast('Success', 'Access matrix updated', 'success');
            closeAccessModal();
            loadUsers();
        }
    } catch (err) { console.error(err); }
});
