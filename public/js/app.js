class App {
  constructor() {
    this.fileManager = fileManager;
    this.fileViewer = fileViewer;
    this.currentFolderId = null;
    this.currentFilter = 'all';
    this.expandedFolders = new Set();
    this.currentViewMode = 'grid'; // 'grid' | 'list'
    this.selectedItems = new Set();
    this.clipboard = { items: [], type: null }; // { items: string[], type: 'copy' | 'move' }

    // Expose handlers for global access (sidebar buttons)
    window.appHandlers = {
      uploadTrigger: () => document.getElementById("fileInput")?.click(),
      createFolder: () => this.handleNewFolder(),
      createFile: () => this.handleNewFile(),
      switchUserContext: (email) => this.handleSwitchUserContext(email)
    };

    this.handlers = window.appHandlers;

    this.init();
  }

  async handleSwitchUserContext(email) {
    if (!email) return;
    console.log('Switching context to user:', email);
    try {
      // Logic to change current view to targeted user's root
      // This might involve resetting state and loading user-specific file data
      // For now, let's assume we fetch files/folders specifically for this email
      this.fileManager.targetUserEmail = email; // Store target email in fileManager if supported
      this.currentFolderId = null; // Go to root of that user
      await this.loadData();
      this.showToast("Context Switched", `Viewing ${email}'s directory`, "success");
    } catch (err) {
      console.error('Failed to switch user context:', err);
      this.showToast("Switch Failed", "Could not load user data", "error");
    }
  }

  async handleNewFolder() {
    const name = prompt('Folder name?');
    if (!name) return;
    try {
      const res = await this.fileManager.fetchApi('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: this.currentFolderId })
      });
      if (res.ok) {
        await this.loadData();
        this.showToast("Folder Created", `"${name}" is ready`, "success");
      } else {
        const err = await res.json().catch(() => ({}));
        this.showToast("Creation Failed", err.message || "Could not create folder", "error");
      }
    } catch (err) { console.error(err); }
  }

  async handleNewFile() {
    const name = prompt('File name? (e.g. note.md)');
    if (!name) return;
    try {
      await this.fileManager.createFile(name, this.currentFolderId);
      await this.loadData();
      this.showToast("File Created", `"${name}" is ready`, "success");
    } catch (error) {
      this.showToast("Creation Failed", error.message, "error");
    }
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
        <div class="flex items-center gap-4 border-l border-white/5 pl-8 h-8">
            <div class="hidden sm:flex flex-col items-end">
                <span id="userName" class="text-[11px] font-bold text-slate-100 uppercase tracking-wide">${this.fileManager.user.username}</span>
                <span id="userRole" class="text-[9px] font-black text-tech-blue uppercase tracking-[0.2em] mt-1.5 opacity-80">${this.fileManager.user.role}</span>
            </div>
            
            <button id="logoutBtn" class="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all cursor-pointer hover:bg-rose-500/5 rounded-lg" title="Terminate Session">
                <i class="fas fa-power-off text-sm"></i>
            </button>
        </div>
      `;
      document.getElementById('logoutBtn').addEventListener('click', () => {
        this.fileManager.logout();
        window.location.reload();
      });

      if (uploadBtn) uploadBtn.style.display = 'flex';
      const navDashboard = document.getElementById('navDashboard');
      if (navDashboard) {
        navDashboard.classList.toggle('hidden', this.fileManager.user.role !== 'admin');
        navDashboard.classList.toggle('flex', this.fileManager.user.role === 'admin');
      }

      // Handle active state client-side
      const path = window.location.pathname;
      if (path.includes('/admin')) document.getElementById('navDashboard')?.classList.add('active');
      if (path.includes('/files')) document.getElementById('navExplorer')?.classList.add('active');
      if (path.includes('/projects')) document.getElementById('navProjects')?.classList.add('active');
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
        /* 
        const myRoot = this.fileManager.folders.find(f => f.parentId === null && (this.fileManager.user.role === 'admin' ? true : true));
        // Actually, for normal users, they only see their own folders, so parentId null is their root.
        // For admin, we DON'T redirect, they stay at system root to see all user directories.
        if (this.fileManager.user.role !== 'admin') {
            const root = this.fileManager.folders.find(f => f.parentId === null);
            if (root) this.currentFolderId = root._id;
        }
        */
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
    console.log("Loading folders...");
    const res = await this.fileManager.fetchApi('/api/folders');
    if (res.ok) {
      this.fileManager.folders = await res.json();
      console.log("Folders loaded:", this.fileManager.folders.length);
    } else {
      console.error("Failed to load folders");
    }
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
      newFolderBtn.addEventListener('click', () => this.handleNewFolder());
    }

    // New File
    const newFileBtn = document.getElementById('newFileBtn');
    if (newFileBtn) {
      newFileBtn.addEventListener('click', () => this.handleNewFile());
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
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.handleBulkDelete());
    document.getElementById('bulkDownloadBtn')?.addEventListener('click', () => this.handleBulkDownload());
    document.getElementById('bulkMoveBtn')?.addEventListener('click', () => this.handleBulkMove());

    const bulkCopyBtn = document.getElementById('bulkCopyBtn');
    if (bulkCopyBtn) bulkCopyBtn.addEventListener('click', () => this.handleBulkCopy());

    const bulkPasteBtn = document.getElementById('bulkPasteBtn');
    if (bulkPasteBtn) bulkPasteBtn.addEventListener('click', () => this.handlePaste());

    const bulkShareBtn = document.getElementById('bulkShareBtn');
    if (bulkShareBtn) bulkShareBtn.addEventListener('click', () => this.handleBulkShare());

    // Mobile Sidebar Toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    const toggleSidebar = (show) => {
      if (!sidebar) return;
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

    // Right Sidebar Toggle (File Explorer)
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarOverlay = document.getElementById('rightSidebarOverlay');
    const closeRightMenuBtn = document.getElementById('closeRightMenuBtn');
    const openRightMenuBtn = document.getElementById('openRightMenuBtn');

    const toggleRightSidebar = (show) => {
      console.log('Toggling Right Sidebar:', show, !!rightSidebar);
      if (!rightSidebar) return;
      if (show) {
        rightSidebar.classList.remove('translate-x-full');
        rightSidebarOverlay.classList.remove('hidden');
        setTimeout(() => rightSidebarOverlay.classList.remove('opacity-0'), 10);
        document.body.classList.add('overflow-hidden');
      } else {
        rightSidebar.classList.add('translate-x-full');
        rightSidebarOverlay.classList.add('opacity-0');
        setTimeout(() => rightSidebarOverlay.classList.add('hidden'), 300);
        document.body.classList.remove('overflow-hidden');
      }
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleSidebar(false));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

    if (closeRightMenuBtn) closeRightMenuBtn.addEventListener('click', () => toggleRightSidebar(false));
    if (rightSidebarOverlay) rightSidebarOverlay.addEventListener('click', () => toggleRightSidebar(false));
    if (openRightMenuBtn) openRightMenuBtn.addEventListener('click', () => toggleRightSidebar(true));

    // Close sidebar on folder navigation if on mobile
    this.sidebarToggle = toggleSidebar;
    this.rightSidebarToggle = toggleRightSidebar;

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

    // Clipboard Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            if (this.selectedItems.size > 0) {
              e.preventDefault();
              this.handleClipboardAction('copy');
            }
            break;
          case 'x':
            if (this.selectedItems.size > 0) {
              e.preventDefault();
              this.handleClipboardAction('move');
            }
            break;
          case 'v':
            e.preventDefault();
            this.handlePaste();
            break;
        }
      }
    });
  }

  handleClipboardAction(type) {
    if (this.selectedItems.size === 0) return;
    this.clipboard = {
      items: Array.from(this.selectedItems),
      type: type
    };
    const count = this.clipboard.items.length;
    const msg = type === 'copy' ? `Copied ${count} items` : `Cut ${count} items`;
    this.showToast(msg, "Navigate to destination and press Ctrl+V", "brand");
    this.updateBulkActionBar(); // Trigger UI update for Paste button
  }

  async handlePaste() {
    if (!this.clipboard.items.length) {
      this.showToast("Clipboard Empty", "Copy or cut items first", "info");
      return;
    }

    const { items, type } = this.clipboard;
    const targetFolderId = this.currentFolderId;

    try {
      this.showToast(type === 'copy' ? "Copying..." : "Moving...", `Syncing ${items.length} items to current directory`, "brand");

      if (type === 'copy') {
        await this.fileManager.copyFiles(items, targetFolderId);
      } else {
        await this.fileManager.moveFiles(items, targetFolderId);
        // Clear clipboard after move as items might no longer exist at source
        this.clipboard = { items: [], type: null };
      }

      this.selectedItems.clear();
      await this.loadData();
      this.showToast("Success", `Finished processing ${items.length} items`, "success");
      this.updateBulkActionBar(); // Refresh bar state
    } catch (error) {
      this.showToast("Paste Failed", error.message, "error");
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
    const userId = this.fileManager.user ? (this.fileManager.user._id || this.fileManager.user.id) : null;

    files = files.filter(f => {
      const fId = f.folderId ? f.folderId.toString() : null;
      if (currentIdStr === null) {
        // At root, show if it's explicitly shared with me OR owned by me at root
        const isSharedWithMe = f.sharedWith && f.sharedWith.some(id => (id._id || id || id.toString()) === userId);
        const isOwnedAtRoot = fId === null && (f.uploadedBy?._id || f.uploadedBy || '').toString() === userId;
        return isOwnedAtRoot || isSharedWithMe;
      }
      return fId === currentIdStr;
    });

    folders = folders.filter(f => {
      const fParentId = f.parentId ? f.parentId.toString() : null;
      if (currentIdStr === null) {
        // At root, show if it's explicitly shared with me OR owned by me at root
        const isSharedWithMe = f.sharedWith && f.sharedWith.some(id => (id._id || id || id.toString()) === userId);
        const isOwnedAtRoot = fParentId === null && (f.createdBy?._id || f.createdBy || '').toString() === userId;
        return isOwnedAtRoot || isSharedWithMe;
      }
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
      <div class="tech-card p-5 rounded-3xl transition-all duration-500 animate-fade-in group cursor-pointer folder-grid-item ${isSelected ? 'ring-2 ring-tech-blue bg-tech-blue/5' : 'hover:scale-[1.02] shadow-xl'}" data-id="${folder._id}">
        <div class="flex items-start justify-between mb-6">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center bg-amber-500/10 text-amber-500 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <i class="fas fa-folder text-3xl"></i>
            </div>
            <div class="flex items-center gap-2">
                <input type="checkbox" class="w-5 h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox cursor-pointer transition-all" data-id="${folder._id}" ${isSelected ? 'checked' : ''}>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-folder-btn border border-white/5 hover:border-rose-500/30 transition-all" data-id="${folder._id}" title="Delete">
                        <i class="fas fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="space-y-1">
            <h3 class="font-bold text-slate-100 truncate pr-2 text-base group-hover:text-white transition-colors">${displayName}</h3>
            <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-500 uppercase font-black tracking-widest">Directory</span>
                <span class="w-1 h-1 rounded-full bg-slate-700"></span>
                <span class="text-[10px] text-slate-600 font-bold italic opacity-60">System Node</span>
            </div>
        </div>
        
        <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-20 transition-opacity">
            <i class="fas fa-network-wired text-4xl text-white"></i>
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
    console.log("Rendering Folder Tree...");
    const containers = [
      document.getElementById('folderTree'),
      document.getElementById('sidebarFolderTree')
    ];

    containers.forEach(container => {
      if (!container) {
        console.log("Container not found");
        return;
      }
      console.log("Rendering tree into container:", container.id);

      const folders = this.fileManager.folders;
      console.log("Available folders to build tree:", folders.length);

      const buildTree = (parentId = null, level = 0) => {
        const userId = this.fileManager.user ? (this.fileManager.user._id || this.fileManager.user.id) : null;

        const branchFolders = folders.filter(f => {
          const fParentId = f.parentId ? (f.parentId._id || f.parentId).toString() : null;
          const pId = parentId ? parentId.toString() : null;

          if (parentId === null) {
            if (this.fileManager.user.role === 'admin') return fParentId === null;
            const isSharedWithMe = f.sharedWith && f.sharedWith.some(id => (id._id || id || id.toString()) === userId);
            const isOwnedAtRoot = fParentId === null && (f.createdBy?._id || f.createdBy || '').toString() === userId;
            return isOwnedAtRoot || isSharedWithMe;
          }
          return fParentId === pId;
        });

        const branchFiles = this.fileManager.files.filter(f => {
          const fId = f.folderId ? (f.folderId._id || f.folderId).toString() : null;
          const pId = parentId ? parentId.toString() : null;
          return fId === pId;
        });

        if (branchFolders.length === 0 && branchFiles.length === 0) {
          console.log(`No folders or files for parentId: ${parentId}`);
          return '';
        }

        return `
        <div class="space-y-1 ${level > 0 ? 'ml-6' : ''}">
          ${branchFolders.map(f => {
          const isExpanded = this.expandedFolders.has(f._id);
          const subfolders = folders.filter(sub => {
            const subParentId = sub.parentId ? (sub.parentId._id || sub.parentId).toString() : null;
            return subParentId === f._id.toString();
          });
          const subfiles = this.fileManager.files.filter(sub => {
            const subFolderId = sub.folderId ? (sub.folderId._id || sub.folderId).toString() : null;
            return subFolderId === f._id.toString();
          });
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

      const treeHtml = `
        <div class="relative mb-2 px-1">
            <button class="folder-item w-full flex items-center py-2 px-2 rounded-lg transition-all text-sm ${!this.currentFolderId ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-sm' : 'text-slate-400 hover:bg-white/5'}" data-id="null">
              <div class="w-5 mr-1"></div>
              <i class="fas ${this.fileManager.user.role === 'admin' ? 'fa-users-gear' : 'fa-house'} text-slate-500 mr-2"></i> 
              <span class="truncate flex-1 text-left">${this.fileManager.user.role === 'admin' ? 'User Directories' : 'Root'}</span>
            </button>
        </div>
        ${buildTree(null, 0)}
      `;

      container.innerHTML = treeHtml;

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
    });
  }

  createFileItem(file, isListView = false) {
    const isPdf = file.type === 'pdf';
    const isSelected = this.selectedItems.has(file._id);

    if (isListView) {
      return `
          <div class="glass glass-hover px-5 py-4 rounded-2xl transition-all animate-fade-in group flex items-center gap-4 cursor-pointer ${isSelected ? 'bg-tech-blue/5 border-tech-blue/30' : ''}">
            <input type="checkbox" class="w-5 h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox" data-id="${file._id}" ${isSelected ? 'checked' : ''}>
            <div class="w-12 h-12 rounded-xl flex items-center justify-center ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-tech-blue/10 text-tech-blue'} border border-white/5 shadow-inner">
                <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-xl"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-slate-100 truncate view-btn text-sm" data-id="${file._id}">${file.displayName}</h3>
                <p class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">${file.type} Document</p>
            </div>
            <div class="w-24 px-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">${this.formatSize(file.size)}</div>
            <div class="w-32 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-tech-blue/20 text-tech-blue flex items-center justify-center view-btn border border-white/5" data-id="${file._id}" title="View">
                    <i class="fas fa-eye text-xs"></i>
                </button>
                <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center download-btn border border-white/5" data-id="${file._id}" title="Download">
                    <i class="fas fa-download text-xs"></i>
                </button>
                <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center delete-btn border border-white/5" data-id="${file._id}" title="Delete">
                    <i class="fas fa-trash-can text-xs"></i>
                </button>
            </div>
          </div>
        `;
    }

    return `
      <div class="tech-card p-5 rounded-3xl transition-all duration-500 animate-fade-in group relative shadow-lg ${isSelected ? 'ring-2 ring-tech-blue bg-tech-blue/5' : 'hover:scale-[1.02]'}">
        <div class="flex items-start justify-between mb-6">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-tech-blue/10 text-tech-blue'} shadow-inner group-hover:scale-110 transition-transform duration-500">
                <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-3xl"></i>
            </div>
            <div class="flex items-center gap-2">
                <input type="checkbox" class="w-5 h-5 rounded-lg border-white/10 bg-white/5 text-tech-blue focus:ring-tech-blue item-checkbox cursor-pointer transition-all" data-id="${file._id}" ${isSelected ? 'checked' : ''}>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <button class="w-9 h-9 rounded-xl bg-white/5 hover:bg-tech-blue/20 text-tech-blue flex items-center justify-center view-btn border border-white/5 hover:border-tech-blue/30 transition-all" data-id="${file._id}" title="View">
                        <i class="fas fa-eye text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="space-y-1">
            <h3 class="font-bold text-slate-100 truncate pr-2 cursor-pointer view-btn text-base group-hover:text-white transition-colors" data-id="${file._id}">${file.displayName}</h3>
            <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-500 uppercase font-black tracking-widest">${file.type}</span>
                <span class="w-1 h-1 rounded-full bg-slate-700"></span>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">${this.formatSize(file.size)}</span>
            </div>
        </div>
        
        <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-10 transition-opacity">
            <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-terminal'} text-5xl text-white"></i>
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
    const pasteBtn = document.getElementById('bulkPasteBtn');
    const moveBtn = document.getElementById('bulkMoveBtn');
    const copyBtn = document.getElementById('bulkCopyBtn');
    const deleteBtn = document.getElementById('bulkDeleteBtn');
    const downloadBtn = document.getElementById('bulkDownloadBtn');
    const countSection = countEl?.parentElement;

    if (!bar || !countEl) return;

    const count = this.selectedItems.size;
    const hasClipboard = this.clipboard.items.length > 0;

    countEl.textContent = count;

    // Show bar if something is selected OR something is in clipboard
    if (count > 0 || hasClipboard) {
      bar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
      bar.classList.add('translate-y-0', 'opacity-100');

      // Contextual buttons
      if (moveBtn) moveBtn.classList.toggle('hidden', count === 0);
      if (copyBtn) copyBtn.classList.toggle('hidden', count === 0);
      if (deleteBtn) deleteBtn.classList.toggle('hidden', count === 0);
      if (downloadBtn) downloadBtn.classList.toggle('hidden', count === 0);
      if (countSection) countSection.classList.toggle('hidden', count === 0);

      if (pasteBtn) {
        pasteBtn.classList.toggle('hidden', !hasClipboard);
        if (hasClipboard) {
          pasteBtn.querySelector('span').textContent = `Paste (${this.clipboard.items.length})`;
        }
      }

      const shareBtn = document.getElementById('bulkShareBtn');
      if (shareBtn) {
        const isAdmin = this.fileManager.user && this.fileManager.user.role === 'admin';
        shareBtn.classList.toggle('hidden', count === 0 || !isAdmin);
        shareBtn.classList.toggle('flex', count > 0 && isAdmin);
      }
    } else {
      bar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
      bar.classList.remove('translate-y-0', 'opacity-100');
    }
  }

  async handleBulkDelete() {
    if (this.selectedItems.size === 0) return;
    if (confirm(`Delete ${this.selectedItems.size} items permanently?`)) {
      try {
        const result = await this.fileManager.bulkDelete(Array.from(this.selectedItems));
        this.selectedItems.clear();
        await this.loadData();
        this.showToast("Bulk Delete", result.message || "Items removed successfully", "success");
      } catch (error) {
        this.showToast("Bulk Delete Failed", error.message, "error");
      }
    }
  }

  async handleBulkMove() {
    if (this.selectedItems.size === 0) return;
    this.handleClipboardAction('move');
    this.showToast("Prepared for Move", "Navigate to target folder and press Ctrl+V", "brand");
  }

  async handleBulkCopy() {
    if (this.selectedItems.size === 0) return;
    this.handleClipboardAction('copy');
    this.showToast("Prepared for Copy", "Navigate to target folder and press Ctrl+V", "brand");
  }

  async handleBulkDownload() {
    if (this.selectedItems.size === 0) return;
    try {
      this.showToast("Packaging", "Generating ZIP archive...", "brand");
      const blob = await this.fileManager.bulkDownload(Array.from(this.selectedItems));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `hwai-bundle-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      this.showToast("Success", "Download started", "success");
    } catch (error) {
      this.showToast("Download Failed", error.message, "error");
    }
  }

  async handleBulkShare() {
    if (this.selectedItems.size === 0) return;

    // Load users if not already loaded
    if (!window.allUsers) {
      try {
        window.allUsers = await this.fileManager.loadAllUsers();
      } catch (error) {
        this.showToast("Permission Error", "Only admins can manage global sharing", "error");
        return;
      }
    }

    this.tempSharedUserIds = [];
    this.currentSharingItems = Array.from(this.selectedItems);

    document.getElementById('shareItemSubtitle').textContent = `Sharing ${this.currentSharingItems.length} selected items`;

    // Determine common collaborators if multiple items
    this.activeCollaborators = [];
    if (this.currentSharingItems.length === 1) {
      const itemId = this.currentSharingItems[0];
      const item = this.fileManager.files.find(f => f._id === itemId) || this.fileManager.folders.find(f => f._id === itemId);
      if (item && item.sharedWith) {
        this.activeCollaborators = item.sharedWith.map(u => (u._id || u)).filter(id => id !== this.fileManager.user._id);
      }
    } else {
      // For bulk, we could show intersection or just empty for simplicity
      this.activeCollaborators = [];
    }

    this.renderShareUserList();
    document.getElementById('shareItemModal').classList.remove('hidden');
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

  // Sharing Modal Helpers
  renderShareUserList() {
    const activeList = document.getElementById('activeCollaboratorsList');
    const suggestList = document.getElementById('shareUserList');
    if (!suggestList || !activeList) return;

    const searchTerm = (document.getElementById('shareSearchInput')?.value || '').toLowerCase();

    // 1. Render Active Collaborators
    const activeCandidates = (window.allUsers || []).filter(u => this.activeCollaborators.includes(u._id));
    activeList.innerHTML = activeCandidates.map(user => `
        <div class="flex items-center justify-between p-3 bg-tech-blue/5 border border-tech-blue/20 rounded-2xl group animate-fade-in">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-tech-blue/10 text-tech-blue flex items-center justify-center text-[10px] font-black border border-tech-blue/10">
                    ${user.username[0].toUpperCase()}
                </div>
                <div>
                    <div class="text-xs font-bold text-white">${user.username}</div>
                    <div class="text-[8px] text-slate-500 uppercase tracking-widest font-black">${user.email}</div>
                </div>
            </div>
            <button onclick="app.handleRevoke('${user._id}')" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center" title="Revoke Access">
                <i class="fas fa-user-minus text-[10px]"></i>
            </button>
        </div>
    `).join('');

    // 2. Render Suggestions
    const suggestedCandidates = (window.allUsers || []).filter(u =>
      !this.activeCollaborators.includes(u._id) &&
      u._id !== this.fileManager.user._id &&
      (u.username.toLowerCase().includes(searchTerm) || u.email.toLowerCase().includes(searchTerm))
    );

    suggestList.innerHTML = suggestedCandidates.map(user => {
      const isSelected = (this.tempSharedUserIds || []).includes(user._id);
      return `
            <div class="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all cursor-pointer group" onclick="app.toggleShareUser('${user._id}')">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xs font-black border border-white/5 group-hover:border-tech-blue/30 transition-all">
                        ${user.username[0].toUpperCase()}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white">${user.username}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">${user.email}</div>
                    </div>
                </div>
                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-tech-blue bg-tech-blue' : 'border-white/10'}">
                    ${isSelected ? '<i class="fas fa-check text-[10px] text-white"></i>' : ''}
                </div>
            </div>
        `;
    }).join('');
  }

  async handleRevoke(userId) {
    if (!this.currentSharingItems || !this.currentSharingItems.length) return;

    if (confirm(`Revoke access for this user on ${this.currentSharingItems.length} items?`)) {
      try {
        this.showToast("Revoking", "Updating permissions...", "brand");
        for (const itemId of this.currentSharingItems) {
          const isFolder = this.fileManager.folders.some(f => f._id === itemId);
          await this.fileManager.revokeAccess(itemId, isFolder ? 'folder' : 'file', userId);
        }
        this.showToast("Success", "Access revoked successfully", "success");

        // Remove from local tracking and re-render
        this.activeCollaborators = this.activeCollaborators.filter(id => id !== userId);
        this.renderShareUserList();
        await this.loadData();
      } catch (err) {
        console.error(err);
        this.showToast("Revoke Failed", err.message, "error");
      }
    }
  }

  toggleShareUser(userId) {
    if (!this.tempSharedUserIds) this.tempSharedUserIds = [];
    const idx = this.tempSharedUserIds.indexOf(userId);
    if (idx > -1) this.tempSharedUserIds.splice(idx, 1);
    else this.tempSharedUserIds.push(userId);
    this.renderShareUserList();
  }
}

// Global helpers for sharing modal (called from HTML)
window.closeShareItemModal = () => document.getElementById('shareItemModal').classList.add('hidden');
window.filterShareUsers = () => app.renderShareUserList();
document.getElementById('confirmShareBtn')?.addEventListener('click', async () => {
  if (!app.currentSharingItems || !app.currentSharingItems.length) return;

  try {
    app.showToast("Synchronizing", "Updating sharing registry...", "brand");
    for (const itemId of app.currentSharingItems) {
      const isFolder = app.fileManager.folders.some(f => f._id === itemId);
      await app.fileManager.shareItem(itemId, isFolder ? 'folder' : 'file', app.tempSharedUserIds);
    }
    app.showToast("Success", "Access permissions synchronized", "success");
    window.closeShareItemModal();
    app.selectedItems.clear();
    app.loadData();
  } catch (err) {
    console.error(err);
    app.showToast("Sync Error", "Failed to update sharing registry", "error");
  }
});

let app;
document.addEventListener("DOMContentLoaded", () => { app = new App(); });