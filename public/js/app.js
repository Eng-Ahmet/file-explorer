class App {
  constructor() {
    this.fileManager = fileManager;
    this.fileViewer = fileViewer;
    this.currentFolderId = null;
    this.currentFilter = 'all';
    this.expandedFolders = new Set();
    this.init();
  }

  async init() {
    this.attachEventListeners();
    this.updateUserUI();

    if (this.fileManager.token) {
      await this.loadData();
    }
  }

  updateUserUI() {
    const userSection = document.getElementById('userSection');
    const uploadBtn = document.getElementById('uploadBtn');
    const adminBtn = document.getElementById('adminBtn');

    if (this.fileManager.token && this.fileManager.user) {
      userSection.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="flex flex-col items-end">
            <span class="text-xs font-bold text-white leading-none">${this.fileManager.user.username}</span>
            <span class="text-[10px] text-brand-400 uppercase tracking-wider font-bold">${this.fileManager.user.role}</span>
          </div>
          <button id="logoutBtn" class="w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded-xl transition-all flex items-center justify-center">
            <i class="fas fa-power-off"></i>
          </button>
        </div>
      `;
      document.getElementById('logoutBtn').addEventListener('click', () => {
        this.fileManager.logout();
        window.location.reload();
      });

      if (uploadBtn) uploadBtn.style.display = 'flex';
      if (adminBtn && this.fileManager.user.role === 'admin') {
        adminBtn.style.display = 'flex';
      }
    } else {
      userSection.innerHTML = `
        <a href="/login" class="text-sm font-medium hover:text-brand-400 transition-colors">Sign In</a>
        <a href="/register" class="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-brand-600/20">Get Started</a>
      `;
      if (uploadBtn) uploadBtn.style.display = 'none';
      if (adminBtn) adminBtn.style.display = 'none';
    }
  }

  async loadData() {
    try {
      await Promise.all([
        this.fileManager.loadFiles(),
        this.fileManager.loadUser(),
        this.loadFolders()
      ]);

      // If user is not admin and we are at the very root, move them to their root folder
      if (this.fileManager.user.role !== 'admin' && this.currentFolderId === null) {
        const rootFolder = this.fileManager.folders.find(f => f.parentId === null);
        if (rootFolder) {
          this.currentFolderId = rootFolder._id;
        }
      }

      this.renderFiles();
      this.renderFolderTree();
      this.updateStats();
      this.updateUserUI(); // Update UI with fresh user data
    } catch (error) {
      this.showToast("Sync Error", "Could not refresh your files", "error");
    }
  }

  async loadFolders() {
    const res = await this.fileManager.fetchApi('/api/folders');
    this.fileManager.folders = await res.json();
  }

  attachEventListeners() {
    // Upload Trigger
    const uploadBtn = document.getElementById("uploadBtn");
    const fileInput = document.getElementById("fileInput");
    if (uploadBtn) uploadBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", (e) => this.handleFileSelect(e));

    // New Folder
    const newFolderBtn = document.getElementById('newFolderBtn');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', async () => {
        const name = prompt('Folder name?');
        if (name) {
          const res = await this.fileManager.fetchApi('/api/folders', {
            method: 'POST',
            body: JSON.stringify({ name, parentId: this.currentFolderId })
          });

          if (res.ok) {
            this.loadData();
            this.showToast("Folder Created", `"${name}" is ready`, "success");
          } else {
            const err = await res.json().catch(() => ({}));
            this.showToast("Creation Failed", err.message || "Could not create folder", "error");
          }
        }
      });
    }

    // Filter Listeners
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-filter]').forEach(b => {
          b.classList.remove('bg-white/10', 'text-white');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('bg-white/10', 'text-white');
        btn.classList.remove('text-slate-400');
        this.currentFilter = btn.dataset.filter;
        this.renderFiles();
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.renderFiles();
      });
    }
  }

  async handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    try {
      this.showToast("Starting Upload", `Processing ${files.length} file(s)...`, "brand");
      for (const file of files) {
        await this.fileManager.uploadFile(file, this.currentFolderId);
      }
      this.loadData();
      this.showToast("Upload Success", `Synced ${files.length} items`, "success");
    } catch (error) {
      this.showToast("Upload Failed", error.message || "Something went wrong", "error");
    } finally {
      event.target.value = "";
    }
  }

  renderFiles() {
    const container = document.getElementById("filesContainer");
    const emptyState = document.getElementById("emptyState");
    const breadcrumbContainer = document.getElementById('breadcrumbContainer');
    if (!container) return;

    this.renderBreadcrumbs(breadcrumbContainer);

    let files = this.fileManager.files;
    let folders = this.fileManager.folders;

    // Admin Root Isolation: Show ONLY user folders at the top level
    if (this.fileManager.user.role === 'admin' && !this.currentFolderId) {
      files = [];
    }

    // Application Filter
    if (this.currentFilter && this.currentFilter !== 'all') {
      files = files.filter(f => f.type === this.currentFilter);
      folders = []; // Hide folders when filtering by type
    }

    // Search
    if (this.searchTerm) {
      files = files.filter(f => f.displayName.toLowerCase().includes(this.searchTerm));
      folders = folders.filter(f => f.name.toLowerCase().includes(this.searchTerm));
    }

    // Folder Context Filtering
    const currentIdStr = this.currentFolderId ? this.currentFolderId.toString() : null;
    files = files.filter(f => {
      const fId = f.folderId ? f.folderId.toString() : null;
      return fId === currentIdStr;
    });

    folders = folders.filter(f => {
      const fParentId = f.parentId ? f.parentId.toString() : null;
      return fParentId === currentIdStr;
    });

    if (files.length === 0 && folders.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = [
      ...folders.map(folder => this.createFolderGridItem(folder)),
      ...files.map(file => this.createFileItem(file))
    ].join("");

    this.attachFileEventListeners();
  }

  renderBreadcrumbs(container) {
    if (!container) return;

    const crumbs = [];
    let currentId = this.currentFolderId;

    while (currentId) {
      const folder = this.fileManager.folders.find(f => f._id === currentId);
      if (folder) {
        crumbs.unshift(folder);
        currentId = folder.parentId;
      } else {
        break;
      }
    }

    container.innerHTML = `
      <button class="hover:text-white transition-colors crumb-item" data-id="null">
        <i class="fas ${this.fileManager.user.role === 'admin' ? 'fa-users-gear' : 'fa-house'}"></i>
        <span class="ml-1 text-[10px] uppercase tracking-widest font-bold">${this.fileManager.user.role === 'admin' ? 'System' : 'Home'}</span>
      </button>
      ${crumbs.map(c => `
        <i class="fas fa-chevron-right text-[10px] opacity-30"></i>
        <button class="hover:text-white transition-colors crumb-item" data-id="${c._id}">${(this.fileManager.user.role === 'admin' && !c.parentId && c.createdBy?.email) ? c.createdBy.email : c.name}</button>
      `).join('')}
    `;

    container.querySelectorAll('.crumb-item').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        this.currentFolderId = id === 'null' ? null : id;
        this.renderFiles();
        this.renderFolderTree();
      };
    });
  }

  createFolderGridItem(folder) {
    return `
      <div class="glass glass-hover p-4 rounded-2xl transition-all animate-fade-in group relative shadow-lg cursor-pointer folder-grid-item" data-id="${folder._id}">
        <div class="flex items-start justify-between mb-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-500">
                <i class="fas fa-folder text-2xl"></i>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-folder-btn" data-id="${folder._id}" title="Delete">
                    <i class="fas fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>
        <h3 class="font-bold text-slate-200 truncate pr-2">${(this.fileManager.user.role === 'admin' && !folder.parentId && folder.createdBy?.email) ? folder.createdBy.email : folder.name}</h3>
        <p class="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Folder</p>
      </div>
    `;
  }

  renderFolderTree() {
    const container = document.getElementById('folderTree');
    if (!container) return;

    const folders = this.fileManager.folders;

    const buildTree = (parentId = null, level = 0) => {
      const branchFolders = folders.filter(f => f.parentId === parentId);
      const branchFiles = this.fileManager.files.filter(f => {
        const fId = f.folderId ? f.folderId.toString() : null;
        const pId = parentId ? parentId.toString() : null;
        return fId === pId;
      });

      if (branchFolders.length === 0 && branchFiles.length === 0) return '';

      return `
        <div class="space-y-1 ${level > 0 ? 'ml-6' : ''}">
          ${branchFolders.map(f => {
        const isExpanded = this.expandedFolders.has(f._id);
        const subfolders = folders.filter(sub => (sub.parentId && sub.parentId.toString() === f._id.toString()));
        const subfiles = this.fileManager.files.filter(sub => (sub.folderId && sub.folderId.toString() === f._id.toString()));
        const hasChildren = subfolders.length > 0 || subfiles.length > 0;

        return `
            <div class="relative">
                <button class="folder-item w-full flex items-center py-2 px-2 rounded-lg transition-all text-sm ${this.currentFolderId === f._id ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-sm' : 'text-slate-400 hover:bg-white/5'}" data-id="${f._id}">
                    <div class="w-5 flex items-center justify-center mr-1">
                        ${hasChildren ? `
                            <div class="toggle-btn cursor-pointer w-full h-full flex items-center justify-center text-slate-500 hover:text-white" data-id="${f._id}">
                                <i class="fas fa-chevron-right text-[10px] transition-transform duration-200 ${isExpanded ? 'rotate-90 text-brand-400' : ''}"></i>
                            </div>
                        ` : ''}
                    </div>
                    <i class="fas ${this.currentFolderId === f._id ? 'fa-folder-open text-brand-400' : 'fa-folder text-slate-500'} mr-2"></i> 
                    <span class="truncate flex-1 text-left">${(this.fileManager.user.role === 'admin' && !f.parentId && f.createdBy?.email) ? f.createdBy.email : f.name}</span>
                </button>
                ${isExpanded ? buildTree(f._id, level + 1) : ''}
            </div>
          `}).join('')}
          ${branchFiles.map(file => `
            <div class="relative">
                <button class="sidebar-file-item w-full flex items-center py-2 px-2 rounded-lg transition-all text-sm text-slate-400 hover:bg-white/5" data-id="${file._id}">
                    <div class="w-5 mr-1"></div>
                    <i class="fas ${file.type === 'pdf' ? 'fa-file-pdf text-rose-400/70' : 'fa-file-lines text-brand-400/70'} text-xs mr-2"></i>
                    <span class="truncate flex-1 text-left">${file.displayName}</span>
                </button>
            </div>
          `).join('')}
        </div>
      `;
    };

    container.innerHTML = `
      <div class="relative mb-2">
          <button class="folder-item w-full flex items-center py-2 px-2 rounded-lg transition-all text-sm ${!this.currentFolderId ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-sm' : 'text-slate-400 hover:bg-white/5'}" data-id="null">
            <div class="w-5 mr-1"></div>
            <i class="fas ${this.fileManager.user.role === 'admin' ? 'fa-users-gear' : 'fa-house'} text-slate-500 mr-2"></i> 
            <span class="truncate flex-1 text-left">${this.fileManager.user.role === 'admin' ? 'User Directories' : 'Root'}</span>
          </button>
      </div>
      ${buildTree(null, 0)}
    `;

    container.querySelectorAll('.folder-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.getAttribute('data-id');
        this.currentFolderId = id === 'null' ? null : id;

        // Auto-expand when clicking the folder itself if it has subfolders
        if (id !== 'null' && !this.expandedFolders.has(id)) {
          this.expandedFolders.add(id);
        }

        this.renderFiles();
        this.renderFolderTree();
      });
    });

    container.querySelectorAll('.toggle-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-id');
        if (this.expandedFolders.has(id)) {
          this.expandedFolders.delete(id);
        } else {
          this.expandedFolders.add(id);
        }
        this.renderFolderTree();
      });
    });

    container.querySelectorAll('.sidebar-file-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.getAttribute('data-id');
        const file = this.fileManager.files.find(f => f._id === id);
        if (file) {
          const modal = document.getElementById('fileViewerModal');
          if (modal) modal.classList.remove('hidden');
          this.fileViewer.showFile(file);
        }
      });
    });
  }

  createFileItem(file) {
    const isPdf = file.type === 'pdf';
    return `
      <div class="glass glass-hover p-4 rounded-2xl transition-all animate-fade-in group relative shadow-lg">
        <div class="flex items-start justify-between mb-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-brand-500/10 text-brand-400'}">
                <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-2xl"></i>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="w-8 h-8 rounded-lg bg-white/5 hover:bg-tech-blue/20 text-tech-blue flex items-center justify-center view-btn" data-id="${file._id}" title="View">
                    <i class="fas fa-eye text-xs"></i>
                </button>
                <button class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center download-btn" data-id="${file._id}" title="Download">
                    <i class="fas fa-download text-xs"></i>
                </button>
                <button class="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-btn" data-id="${file._id}" title="Delete">
                    <i class="fas fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>
        <h3 class="font-bold text-slate-200 truncate pr-2 cursor-pointer view-btn" data-id="${file._id}">${file.displayName}</h3>
        <p class="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">${file.type} • ${this.formatSize(file.size)}</p>
      </div>
    `;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  attachFileEventListeners() {
    // Folders in grid
    document.querySelectorAll('.folder-grid-item').forEach(item => {
      item.ondblclick = () => {
        this.currentFolderId = item.getAttribute('data-id');
        this.renderFiles();
        this.renderFolderTree();
      };
    });

    document.querySelectorAll('.delete-folder-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Delete folder and all contents?')) {
          const res = await this.fileManager.fetchApi(`/api/folders/${id}`, { method: 'DELETE' });
          if (res.ok) {
            this.loadData();
            this.showToast("Folder Deleted", "Folder and contents removed", "rose");
          } else {
            const err = await res.json().catch(() => ({}));
            this.showToast("Deletion Denied", err.message || "Access denied", "error");
          }
        }
      };
    });
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const file = this.fileManager.files.find(f => f._id === id);
        if (file) {
          const modal = document.getElementById('fileViewerModal');
          if (modal) modal.classList.remove('hidden');
          this.fileViewer.showFile(file);
        }
      };
    });

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        window.open(`/api/files/download/${id}?token=${this.fileManager.token}`);
      };
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Delete permanently?')) {
          const res = await this.fileManager.fetchApi(`/api/files/${id}`, { method: 'DELETE' });
          if (res.ok) {
            this.loadData();
            this.showToast("Deleted", "File removed successfully", "rose");
          } else {
            const err = await res.json().catch(() => ({}));
            this.showToast("Deletion Denied", err.message || "Access denied", "error");
          }
        }
      };
    });
  }

  updateStats() {
    const stats = this.fileManager.getStats();
    document.querySelectorAll('[data-stat="total"]').forEach(el => el.textContent = stats.totalFiles);
    document.querySelectorAll('[data-stat="md"]').forEach(el => el.textContent = stats.mdFiles);
    document.querySelectorAll('[data-stat="pdf"]').forEach(el => el.textContent = stats.pdfFiles);

    // Update Storage Bar
    const user = this.fileManager.user;
    if (user) {
      const usedVal = user.totalStorageUsed || 0;
      const quotaVal = user.storageQuota || (100 * 1024 * 1024);
      const percent = Math.min(100, Math.round((usedVal / quotaVal) * 100));

      const usageLabel = document.getElementById('usageLabel');
      const usageBar = document.getElementById('usageBar');

      if (usageLabel) usageLabel.textContent = `${this.formatSize(usedVal)} / ${this.formatSize(quotaVal)}`;
      if (usageBar) {
        usageBar.style.width = `${percent}%`;
        if (percent > 90) usageBar.className = 'h-full bg-rose-500 transition-all duration-1000';
        else if (percent > 70) usageBar.className = 'h-full bg-amber-500 transition-all duration-1000';
        else usageBar.className = 'h-full bg-tech-blue transition-all duration-1000';
      }
    }
  }

  showToast(title, message, type = 'brand') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const icon = document.getElementById('toastIcon');
    const head = document.getElementById('toastTitle');
    const msg = document.getElementById('toastMessage');

    const colors = {
      brand: 'bg-brand-500',
      success: 'bg-emerald-500',
      error: 'bg-rose-500',
      rose: 'bg-rose-600'
    };

    const icons = {
      brand: 'fa-info-circle',
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      rose: 'fa-trash-can'
    };

    if (icon) {
      icon.className = `w-12 h-12 ${colors[type] || colors.brand} rounded-2xl flex items-center justify-center text-white text-xl shadow-lg`;
      icon.innerHTML = `<i class="fas ${icons[type] || icons.brand}"></i>`;
    }
    if (head) head.textContent = title;
    if (msg) msg.textContent = message;

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
      if (toast) toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
  }
}

let app;
document.addEventListener("DOMContentLoaded", () => { app = new App(); });