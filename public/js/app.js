class App {
  constructor() {
    this.fileManager = fileManager;
    this.fileViewer = fileViewer;
    this.currentFolderId = null;
    this.currentFilter = 'all';
    this.expandedFolders = new Set();
    this.currentViewMode = 'grid'; // 'grid' | 'list'
    this.selectedItems = new Set();
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
        <div class="flex items-center gap-2 md:gap-3">
          <div class="hidden sm:flex flex-col items-end">
            <span class="text-xs font-bold text-white leading-none">${this.fileManager.user.username}</span>
            <span class="text-[10px] text-brand-400 uppercase tracking-wider font-bold">${this.fileManager.user.role}</span>
          </div>
          <button id="logoutBtn" class="w-9 h-9 md:w-10 md:h-10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded-xl transition-all flex items-center justify-center">
            <i class="fas fa-power-off"></i>
          </button>
        </div>
      `;
      document.getElementById('logoutBtn').addEventListener('click', () => {
        this.fileManager.logout();
        window.location.reload();
      });

      if (uploadBtn) uploadBtn.style.display = 'flex';
      if (adminBtn) {
          adminBtn.style.display = (this.fileManager.user.role === 'admin') ? 'flex' : 'none';
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

      // If user is at the system root, automatically enter their personal root folder
      if (this.currentFolderId === null) {
        const myRoot = this.fileManager.folders.find(f => f.parentId === null && (this.fileManager.user.role === 'admin' ? true : true));
        // Actually, for normal users, they only see their own folders, so parentId null is their root.
        // For admin, we DON'T redirect, they stay at system root to see all user directories.
        if (this.fileManager.user.role !== 'admin') {
            const root = this.fileManager.folders.find(f => f.parentId === null);
            if (root) this.currentFolderId = root._id;
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
    
    // New File
    const newFileBtn = document.getElementById('newFileBtn');
    if (newFileBtn) {
      newFileBtn.addEventListener('click', async () => {
        const name = prompt('File name? (e.g. todo.txt or note.md)');
        if (name) {
          try {
            await this.fileManager.createFile(name, this.currentFolderId);
            this.loadData();
            this.showToast("File Created", `"${name}" is ready`, "success");
          } catch (error) {
            this.showToast("Creation Failed", error.message, "error");
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

    // View Toggle
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    if (gridViewBtn) {
        gridViewBtn.addEventListener('click', () => {
            this.currentViewMode = 'grid';
            gridViewBtn.classList.add('bg-white/10', 'text-white');
            gridViewBtn.classList.remove('text-slate-400');
            listViewBtn.classList.remove('bg-white/10', 'text-white');
            listViewBtn.classList.add('text-slate-400');
            this.renderFiles();
        });
    }
    if (listViewBtn) {
        listViewBtn.addEventListener('click', () => {
            this.currentViewMode = 'list';
            listViewBtn.classList.add('bg-white/10', 'text-white');
            listViewBtn.classList.remove('text-slate-400');
            gridViewBtn.classList.remove('bg-white/10', 'text-white');
            gridViewBtn.classList.add('text-slate-400');
            this.renderFiles();
        });
    }

    // Bulk Actions
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => this.handleBulkDelete());
    
    const bulkMoveBtn = document.getElementById('bulkMoveBtn');
    if (bulkMoveBtn) bulkMoveBtn.addEventListener('click', () => this.handleBulkMove());

    const bulkCopyBtn = document.getElementById('bulkCopyBtn');
    if (bulkCopyBtn) bulkCopyBtn.addEventListener('click', () => this.handleBulkCopy());

    // Mobile Sidebar Toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    const toggleSidebar = (show) => {
        if (show) {
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
            setTimeout(() => sidebarOverlay.classList.remove('opacity-0'), 10);
            document.body.classList.add('overflow-hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('opacity-0');
            setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
            document.body.classList.remove('overflow-hidden');
        }
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleSidebar(false));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

    // Close sidebar on folder navigation if on mobile
    this.sidebarToggle = toggleSidebar;

    // Go Up Button
    const goUpBtn = document.getElementById('goUpBtn');
    if (goUpBtn) {
        goUpBtn.addEventListener('click', () => {
            if (!this.currentFolderId) return;
            const currentFolder = this.fileManager.folders.find(f => f._id === this.currentFolderId);
            if (currentFolder) {
                this.currentFolderId = currentFolder.parentId || null;
                this.renderFiles();
                this.renderFolderTree();
            }
        });
    }

    // Storage Dashboard Modal
    const storageBtn = document.getElementById('storageDashboardBtn');
    const storageModal = document.getElementById('storageModal');
    const closeStorageModal = document.getElementById('closeStorageModal');
    const storageOverlay = document.getElementById('storageModalOverlay');

    const toggleStorageModal = (show) => {
        if (show) {
            storageModal.classList.remove('hidden');
            this.updateStats(); // Refresh stats before showing
        } else {
            storageModal.classList.add('hidden');
        }
    };

    if (storageBtn) storageBtn.addEventListener('click', () => toggleStorageModal(true));
    if (closeStorageModal) closeStorageModal.addEventListener('click', () => toggleStorageModal(false));
    if (storageOverlay) storageOverlay.addEventListener('click', () => toggleStorageModal(false));
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
      this.selectedItems.clear();
      this.updateBulkActionBar();
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    if (this.currentViewMode === 'grid') {
        container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4";
        container.innerHTML = [
            ...folders.map(folder => this.createFolderGridItem(folder)),
            ...files.map(file => this.createFileItem(file))
        ].join("");
    } else {
        container.className = "flex flex-col gap-2";
        container.innerHTML = `
            <div class="flex items-center px-4 py-2 border-b border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <div class="w-10"></div>
                <div class="flex-1">Name</div>
                <div class="w-24 px-4">Size</div>
                <div class="w-24 px-4">Type</div>
                <div class="w-32 text-right">Actions</div>
            </div>
            ${folders.map(folder => this.createFolderListItem(folder)).join("")}
            ${files.map(file => this.createFileItem(file, true)).join("")}
        `;
    }

    this.attachFileEventListeners();
    this.updateBulkActionBar();
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
    const isSelected = this.selectedItems.has(folder._id);
    const displayName = (this.fileManager.user.role === 'admin' && !folder.parentId && folder.createdBy?.email) ? folder.createdBy.email : folder.name;
    
    return `
      <div class="glass glass-hover p-4 md:p-5 rounded-2xl md:rounded-[2.5rem] transition-all duration-300 animate-fade-in group relative shadow-lg cursor-pointer folder-grid-item ${isSelected ? 'ring-2 ring-tech-blue bg-tech-blue/5' : 'hover:bg-white/[0.02]'}" data-id="${folder._id}">
        <div class="flex items-start justify-between mb-4 md:mb-6">
            <div class="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center bg-amber-500/10 text-amber-500 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <i class="fas fa-folder text-xl md:text-3xl"></i>
            </div>
            <div class="flex items-center gap-2">
                <input type="checkbox" class="w-4 h-4 md:w-5 md:h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox cursor-pointer transition-all" data-id="${folder._id}" ${isSelected ? 'checked' : ''}>
                <div class="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-folder-btn border border-white/5 hover:border-rose-500/30 transition-all" data-id="${folder._id}" title="Delete">
                        <i class="fas fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="space-y-0.5 md:space-y-1">
            <h3 class="font-bold text-slate-100 truncate pr-2 text-sm md:text-base group-hover:text-white transition-colors">${displayName}</h3>
            <div class="flex items-center gap-1.5 md:gap-2">
                <span class="text-[8px] md:text-[10px] text-slate-500 uppercase font-extrabold tracking-[0.1em] md:tracking-[0.2em]">Folder</span>
                <span class="w-0.5 h-0.5 md:w-1 md:h-1 rounded-full bg-slate-700"></span>
                <span class="text-[8px] md:text-[10px] text-slate-600 font-bold italic opacity-60 truncate">System</span>
            </div>
        </div>
        
        <!-- Decoration (Desktop only) -->
        <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-20 transition-opacity hidden md:block">
            <i class="fas fa-folder-open text-4xl text-white"></i>
        </div>
      </div>
    `;
  }

  createFolderListItem(folder) {
    const isSelected = this.selectedItems.has(folder._id);
    return `
      <div class="glass glass-hover px-4 py-3 rounded-xl transition-all animate-fade-in group flex items-center gap-4 cursor-pointer folder-grid-item ${isSelected ? 'bg-tech-blue/5 border-tech-blue/30' : ''}" data-id="${folder._id}">
        <input type="checkbox" class="w-5 h-5 rounded border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox" data-id="${folder._id}" ${isSelected ? 'checked' : ''}>
        <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-500">
            <i class="fas fa-folder text-lg"></i>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="font-bold text-slate-200 truncate">${(this.fileManager.user.role === 'admin' && !folder.parentId && folder.createdBy?.email) ? folder.createdBy.email : folder.name}</h3>
        </div>
        <div class="w-24 px-4 text-xs text-slate-500 font-bold uppercase tracking-widest">—</div>
        <div class="w-24 px-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Folder</div>
        <div class="w-32 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-folder-btn" data-id="${folder._id}" title="Delete">
                <i class="fas fa-trash-can text-xs"></i>
            </button>
        </div>
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

  createFileItem(file, isListView = false) {
    const isPdf = file.type === 'pdf';
    const isSelected = this.selectedItems.has(file._id);
    
    if (isListView) {
        return `
          <div class="glass glass-hover px-4 py-3 rounded-xl transition-all animate-fade-in group flex items-center gap-4 cursor-pointer ${isSelected ? 'bg-tech-blue/5 border-tech-blue/30' : ''}">
            <input type="checkbox" class="w-5 h-5 rounded border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox" data-id="${file._id}" ${isSelected ? 'checked' : ''}>
            <div class="w-10 h-10 rounded-lg flex items-center justify-center ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-brand-500/10 text-brand-400'}">
                <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-slate-200 truncate view-btn" data-id="${file._id}">${file.displayName}</h3>
            </div>
            <div class="w-24 px-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">${this.formatSize(file.size)}</div>
            <div class="w-24 px-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">${file.type}</div>
            <div class="w-32 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        `;
    }

    return `
      <div class="glass glass-hover p-4 md:p-5 rounded-2xl md:rounded-[2.5rem] transition-all duration-300 animate-fade-in group relative shadow-lg ${isSelected ? 'ring-2 ring-tech-blue bg-tech-blue/5' : 'hover:bg-white/[0.02]'}">
        <div class="flex items-start justify-between mb-4 md:mb-6">
            <div class="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-brand-500/10 text-brand-400'} shadow-inner group-hover:scale-110 transition-transform duration-500">
                <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-xl md:text-3xl"></i>
            </div>
            <div class="flex items-center gap-2">
                <input type="checkbox" class="w-4 h-4 md:w-5 md:h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox cursor-pointer transition-all" data-id="${file._id}" ${isSelected ? 'checked' : ''}>
                <div class="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-tech-blue/20 text-tech-blue flex items-center justify-center view-btn border border-white/5 hover:border-tech-blue/30 transition-all" data-id="${file._id}" title="View">
                        <i class="fas fa-eye text-xs"></i>
                    </button>
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center download-btn border border-white/5 transition-all" data-id="${file._id}" title="Download">
                        <i class="fas fa-download text-xs"></i>
                    </button>
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-btn border border-white/5 hover:border-rose-500/30 transition-all" data-id="${file._id}" title="Delete">
                        <i class="fas fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="space-y-0.5 md:space-y-1">
            <h3 class="font-bold text-slate-100 truncate pr-2 cursor-pointer view-btn text-sm md:text-base group-hover:text-white transition-colors" data-id="${file._id}">${file.displayName}</h3>
            <div class="flex items-center gap-1.5 md:gap-2">
                <span class="text-[8px] md:text-[10px] text-slate-500 uppercase font-extrabold tracking-[0.1em] md:tracking-[0.2em]">${file.type}</span>
                <span class="w-0.5 h-0.5 md:w-1 md:h-1 rounded-full bg-slate-700"></span>
                <span class="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">${this.formatSize(file.size)}</span>
            </div>
        </div>
        
        <!-- Decoration (Desktop only) -->
        <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-10 transition-opacity hidden md:block">
            <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-code'} text-5xl text-white"></i>
        </div>
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
      let lastTap = 0;
      item.addEventListener('click', (e) => {
        const now = Date.now();
        const IDLE_TIME = 300; // ms
        
        // Check if it's a double tap (useful for mobile) or native double click
        if (now - lastTap < IDLE_TIME || e.detail === 2) {
          this.currentFolderId = item.getAttribute('data-id');
          this.renderFiles();
          this.renderFolderTree();
        }
        lastTap = now;
      });
      
      // Keep ondblclick for desktop consistency just in case, though the click handler above handles it via e.detail
      item.ondblclick = (e) => {
          e.preventDefault(); // Handled by click listener
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

    // Checkboxes
    document.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.onclick = (e) => {
            e.stopPropagation();
            const id = cb.getAttribute('data-id');
            if (cb.checked) {
                this.selectedItems.add(id);
            } else {
                this.selectedItems.delete(id);
            }
            this.updateBulkActionBar();
            // Optional: visually highlight the item immediately
            const item = cb.closest('.glass');
            if (this.currentViewMode === 'grid') {
                if (cb.checked) item.classList.add('ring-2', 'ring-tech-blue');
                else item.classList.remove('ring-2', 'ring-tech-blue');
            } else {
                if (cb.checked) item.classList.add('bg-tech-blue/5', 'border-tech-blue/30');
                else item.classList.remove('bg-tech-blue/5', 'border-tech-blue/30');
            }
        };
    });
  }

  updateBulkActionBar() {
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('selectedCount');
    if (!bar || !countEl) return;

    const count = this.selectedItems.size;
    countEl.textContent = count;

    if (count > 0) {
        bar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
        bar.classList.add('translate-y-0', 'opacity-100');
    } else {
        bar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
        bar.classList.remove('translate-y-0', 'opacity-100');
    }
  }

  async handleBulkDelete() {
    if (this.selectedItems.size === 0) return;
    if (confirm(`Delete ${this.selectedItems.size} items permanently?`)) {
        try {
            await this.fileManager.bulkDelete(Array.from(this.selectedItems));
            this.selectedItems.clear();
            await this.loadData();
            this.showToast("Bulk Delete", "Items removed successfully", "success");
        } catch (error) {
            this.showToast("Bulk Delete Failed", error.message, "error");
        }
    }
  }

  async handleBulkMove() {
    if (this.selectedItems.size === 0) return;
    // For simplicity, we'll ask for target folder ID or use a prompt.
    // In a real app, you'd show a folder picker modal.
    // Here we'll just show folders in a prompt for now.
    const folderList = this.fileManager.folders.map(f => `${f.name} (ID: ${f._id})`).join('\n');
    const targetFolderId = prompt(`Enter Target Folder ID:\n\n${folderList}\n\n(Leave empty for Root)`);
    
    if (targetFolderId !== null) {
        try {
            await this.fileManager.moveFiles(Array.from(this.selectedItems), targetFolderId || null);
            this.selectedItems.clear();
            await this.loadData();
            this.showToast("Bulk Move", "Items relocated", "success");
        } catch (error) {
            this.showToast("Move Failed", error.message, "error");
        }
    }
  }

  async handleBulkCopy() {
    if (this.selectedItems.size === 0) return;
    const folderList = this.fileManager.folders.map(f => `${f.name} (ID: ${f._id})`).join('\n');
    const targetFolderId = prompt(`Enter Target Folder ID for Copy:\n\n${folderList}\n\n(Leave empty for Root)`);
    
    if (targetFolderId !== null) {
        try {
            await this.fileManager.copyFiles(Array.from(this.selectedItems), targetFolderId || null);
            this.selectedItems.clear();
            await this.loadData();
            this.showToast("Bulk Copy", "Items duplicated", "success");
        } catch (error) {
            this.showToast("Copy Failed", error.message, "error");
        }
    }
  }

  updateStats() {
    if (!this.fileManager.user) return;
    
    const stats = this.fileManager.getStats();
    const user = this.fileManager.user;
    const usedVal = user.totalStorageUsed || 0;
    const quotaVal = user.storageQuota || (100 * 1024 * 1024);
    const percent = Math.min(100, Math.round((usedVal / quotaVal) * 100));

    // 1. Update Floating Gauge
    const gaugeProgress = document.getElementById('gaugeProgress');
    const gaugePercent = document.getElementById('gaugePercent');
    
    if (gaugeProgress) {
        // Circumference is 2 * PI * R = 2 * 3.14 * 24 = 150.72
        const circumference = 150.8;
        const offset = circumference - (percent / 100) * circumference;
        gaugeProgress.style.strokeDashoffset = offset;
        
        // Color based on usage
        if (percent > 90) gaugeProgress.classList.replace('text-tech-blue', 'text-rose-500');
        else if (percent > 70) gaugeProgress.classList.replace('text-tech-blue', 'text-amber-500');
        else {
            gaugeProgress.classList.remove('text-rose-500', 'text-amber-500');
            gaugeProgress.classList.add('text-tech-blue');
        }
    }
    if (gaugePercent) gaugePercent.textContent = `${percent}%`;

    // 2. Update Modal Details
    const modalUsageValue = document.getElementById('modalUsageValue');
    const modalLimitValue = document.getElementById('modalLimitValue');
    const modalUsageBar = document.getElementById('modalUsageBar');
    const totalFilesCount = document.getElementById('totalFilesCount');
    const totalFoldersCount = document.getElementById('totalFoldersCount');
    const modalUserRole = document.getElementById('modalUserRole');

    if (modalUsageValue) modalUsageValue.textContent = this.formatSize(usedVal);
    if (modalLimitValue) modalLimitValue.textContent = this.formatSize(quotaVal);
    if (modalUsageBar) {
        modalUsageBar.style.width = `${percent}%`;
        if (percent > 90) modalUsageBar.className = 'h-full bg-rose-500 rounded-full transition-all duration-1000';
        else if (percent > 70) modalUsageBar.className = 'h-full bg-amber-500 rounded-full transition-all duration-1000';
        else modalUsageBar.className = 'h-full bg-tech-blue rounded-full transition-all duration-1000';
    }
    
    if (totalFilesCount) totalFilesCount.textContent = stats.totalFiles;
    if (totalFoldersCount) totalFoldersCount.textContent = this.fileManager.folders.length;
    if (modalUserRole) modalUserRole.textContent = user.role || 'User';

    // Legacy sidebar stats fallback (if still in DOM)
    document.querySelectorAll('[data-stat="total"]').forEach(el => el.textContent = stats.totalFiles);
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