// Global state
const token = localStorage.getItem('token');
window.allUsers = window.allUsers || [];
let currentEditingUser = null;
let selectedPermittedUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.href = '/login';
        return;
    }

    loadStats();
    loadDiagnostics();
    loadUsers();

    // Event Listeners
    document.getElementById('refreshStatsBtn')?.addEventListener('click', () => {
        loadStats();
        loadDiagnostics();
        loadUsers();
    });

    document.getElementById('syncStorageBtn')?.addEventListener('click', syncStorage);
    document.getElementById('userSearchInput')?.addEventListener('input', filterUsers);
    document.getElementById('roleFilter')?.addEventListener('change', filterUsers);
    document.getElementById('statusFilter')?.addEventListener('change', filterUsers);
});

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load stats');
        const stats = await res.json();

        document.getElementById('totalUsersCard').textContent = stats.topUsers.length; // Use actual count if provided
        document.getElementById('totalStorageCard').textContent = formatSize(stats.totalBytes);
        
        // Find current user's percentage or total (mocking global percentage if not in API)
        const totalQuota = stats.topUsers.reduce((acc, u) => acc + (u.storageQuota || 0), 0);
        const percent = totalQuota > 0 ? Math.round((stats.totalBytes / totalQuota) * 100) : 0;
        document.getElementById('storagePercentLabel').textContent = `${percent}% Capacity`;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function loadDiagnostics() {
    try {
        const res = await fetch('/api/admin/diagnostics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load diagnostics');
        const diag = await res.json();

        document.getElementById('cpuLoadCard').textContent = `${Math.round(diag.cpu.load[0] * 100)}%`;
        document.getElementById('ramUsageCard').textContent = `${Math.round(diag.memory.usage)}%`;
        document.getElementById('ramDetailLabel').textContent = `${formatSize(diag.memory.total - diag.memory.free)} / ${formatSize(diag.memory.total)}`;
    } catch (err) {
        console.error('Diagnostics error:', err);
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load users');
        window.allUsers = await res.json();
        
        // Update stats count accurately
        const totalUsersEl = document.getElementById('totalUsersCard');
        if (totalUsersEl) totalUsersEl.textContent = window.allUsers.length;

        renderUsers(window.allUsers);
    } catch (err) {
        console.error('Users error:', err);
        showToast('Error', 'Failed to load user intelligence data', 'error');
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = users.map(user => {
        const used = user.totalStorageUsed || 0;
        const quota = user.storageQuota || (100 * 1024 * 1024);
        const percent = Math.min(100, Math.round((used / quota) * 100));
        
        return `
            <tr class="hover:bg-white/[0.02] transition-colors group">
                <td class="px-8 py-6">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-tech-blue/10 flex items-center justify-center text-tech-blue font-black border border-tech-blue/20">
                            ${user.username[0].toUpperCase()}
                        </div>
                        <div>
                            <div class="text-sm font-bold text-white">${user.username}</div>
                            <div class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <div class="space-y-2 max-w-[160px]">
                        <div class="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                            <span class="text-slate-400">${formatSize(used)}</span>
                            <span class="text-slate-600">${formatSize(quota)}</span>
                        </div>
                        <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full ${percent > 90 ? 'bg-rose-500' : percent > 70 ? 'bg-amber-500' : 'bg-tech-blue'} transition-all duration-1000" style="width: ${percent}%"></div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <span class="px-3 py-1 rounded-lg border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'text-tech-blue' : 'text-slate-400'}">${user.role}</span>
                        <span class="px-3 py-1 rounded-lg border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest ${user.isActive ? 'text-emerald-500' : 'text-rose-500'}">${user.isActive ? 'Active' : 'Disabled'}</span>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <span class="text-xs text-slate-500 font-medium">${new Date(user.createdAt).toLocaleDateString()}</span>
                </td>
                <td class="px-8 py-6 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="openEditUserModal('${user._id}')" class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition-all border border-white/5" title="Modify Node">
                            <i class="fas fa-sliders-h text-xs"></i>
                        </button>
                        <button onclick="confirmDeleteUser('${user._id}')" class="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-all border border-white/5" title="Terminate Access">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterUsers() {
    const searchTerm = document.getElementById('userSearchInput').value.toLowerCase();
    const role = document.getElementById('roleFilter').value;
    const status = document.getElementById('statusFilter').value;

    const filtered = window.allUsers.filter(u => {
        const matchesSearch = u.username.toLowerCase().includes(searchTerm) || u.email.toLowerCase().includes(searchTerm);
        const matchesRole = role === 'all' || u.role === role;
        const matchesStatus = status === 'all' || (status === 'active' ? u.isActive : !u.isActive);
        return matchesSearch && matchesRole && matchesStatus;
    });

    renderUsers(filtered);
}

async function syncStorage() {
    const btn = document.getElementById('syncStorageBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync-alt animate-spin mr-2"></i> Syncing...';
    }

    try {
        const res = await fetch('/api/admin/sync-storage', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        showToast('Storage Sync', data.message, 'brand');
        loadUsers();
        loadStats();
    } catch (err) {
        console.error(err);
        showToast('Sync Failed', 'Could not complete deep storage audit', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-arrows-rotate mr-2"></i> <span>Sync Storage</span>';
        }
    }
}

// Global scope for onclick handlers
window.openEditUserModal = function(id) {
    const user = window.allUsers.find(u => u._id === id);
    if (!user) return;
    
    currentEditingUser = user;
    selectedPermittedUsers = [...(user.permissions?.permittedUsers || [])];

    document.getElementById('editUserId').value = user._id;
    document.getElementById('editUserSubtitle').textContent = `Modifying identity: ${user.username}`;
    document.getElementById('editUserRole').value = user.role;
    document.getElementById('editUserActive').checked = user.isActive;
    document.getElementById('editUserQuota').value = Math.round((user.storageQuota || 0) / (1024 * 1024));
    
    // Permissions checkboxes
    document.getElementById('permView').checked = user.permissions?.canView ?? true;
    document.getElementById('permUpload').checked = user.permissions?.canUpload ?? true;
    document.getElementById('permDelete').checked = user.permissions?.canDelete ?? true;
    document.getElementById('permSeeOthers').checked = user.permissions?.canSeeOthersFiles ?? false;
    
    updateStatusLabel();
    updatePermittedUsersCount();

    const modal = document.getElementById('editUserModal');
    modal.classList.remove('hidden');
}

window.closeEditUserModal = function() {
    document.getElementById('editUserModal').classList.add('hidden');
    currentEditingUser = null;
}

window.updateStatusLabel = function() {
    const isChecked = document.getElementById('editUserActive').checked;
    const label = document.getElementById('statusToggleLabel');
    if (label) {
        label.textContent = isChecked ? 'Active' : 'Disabled';
        label.className = `text-sm font-bold ${isChecked ? 'text-emerald-500' : 'text-rose-500'}`;
    }
}

function updatePermittedUsersCount() {
    const countEl = document.getElementById('permittedUsersCount');
    if (countEl) {
        countEl.textContent = `${selectedPermittedUsers.length} users authorized for monitoring`;
    }
}

// Access Management Logic
window.openAccessManagement = function() {
    if (!currentEditingUser) return;
    
    const subtitle = document.getElementById('accessModalSubtitle');
    if (subtitle) subtitle.textContent = `Authorizing data access for: ${currentEditingUser.username}`;
    
    const list = document.getElementById('accessUserList');
    if (!list) return;

    // Filter out the current user themselves
    const candidates = window.allUsers.filter(u => u._id !== currentEditingUser._id);
    
    list.innerHTML = candidates.map(user => {
        const isSelected = selectedPermittedUsers.includes(user._id);
        return `
            <div class="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all cursor-pointer group" onclick="togglePermittedUser('${user._id}')">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xs font-black border border-white/5 group-hover:border-tech-blue/30 transition-all">
                        ${user.username[0].toUpperCase()}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white">${user.username}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest">${user.email}</div>
                    </div>
                </div>
                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-tech-blue bg-tech-blue' : 'border-white/10'}">
                    ${isSelected ? '<i class="fas fa-check text-[10px] text-white"></i>' : ''}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('accessModal').classList.remove('hidden');
}

window.togglePermittedUser = function(userId) {
    const idx = selectedPermittedUsers.indexOf(userId);
    if (idx > -1) {
        selectedPermittedUsers.splice(idx, 1);
    } else {
        selectedPermittedUsers.push(userId);
    }
    openAccessManagement(); // Re-render list
    updatePermittedUsersCount();
}

window.closeAccessModal = function() {
    document.getElementById('accessModal').classList.add('hidden');
}

document.getElementById('saveAccessBtn')?.addEventListener('click', () => {
    closeAccessModal();
});

document.getElementById('saveUserBtn')?.addEventListener('click', async () => {
    if (!currentEditingUser) return;
    
    const id = currentEditingUser._id;
    const role = document.getElementById('editUserRole').value;
    const isActive = document.getElementById('editUserActive').checked;
    const quotaMB = parseInt(document.getElementById('editUserQuota').value);
    
    const permissions = {
        canView: document.getElementById('permView').checked,
        canUpload: document.getElementById('permUpload').checked,
        canDelete: document.getElementById('permDelete').checked,
        canSeeOthersFiles: document.getElementById('permSeeOthers').checked,
        permittedUsers: selectedPermittedUsers
    };

    try {
        // 1. Update Permissions (includes permittedUsers)
        await fetch(`/api/admin/users/${id}/permissions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ permissions })
        });

        // 2. Update Role if changed
        if (role !== currentEditingUser.role) {
            await fetch(`/api/admin/users/${id}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ role })
            });
        }

        // 3. Update Status if changed
        if (isActive !== currentEditingUser.isActive) {
            await fetch(`/api/admin/users/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ isActive })
            });
        }

        // 4. Update Quota
        await updateQuota(id, quotaMB);

        showToast('Success', 'Node reconfigured successfully', 'brand');
        closeEditUserModal();
        loadUsers();
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to update user intelligence', 'error');
    }
});

async function updateQuota(id, mb) {
    try {
        const res = await fetch(`/api/admin/users/${id}/quota`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ storageQuota: mb })
        });
        if (res.ok) {
            showToast('Success', 'Quota updated', 'success');
            loadUsers();
        }
    } catch (err) { console.error(err); }
}

window.confirmDeleteUser = async function(id) {
    if (!confirm('Are you sure you want to PERMANENTLY delete this user?')) return;
    
    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Success', 'Node terminated', 'success');
            loadUsers();
        }
    } catch (err) { console.error(err); }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(title, message, type = 'brand') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    // Simplistic toast update
    const head = document.getElementById('toastTitle');
    const msg = document.getElementById('toastMessage');
    if (head) head.textContent = title;
    if (msg) msg.textContent = message;

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}


