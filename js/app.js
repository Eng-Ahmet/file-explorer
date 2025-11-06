/**
 * App - Main File Manager Application
 * Manages user interaction and interface
 */

class App {
  constructor() {
    this.fileManager = fileManager;
    this.fileViewer = fileViewer;
    this.currentFilter = "all";
    this.currentSort = "date";
    this.currentSortOrder = "desc";
    this.init();
  }

  /**
   * Initialize application
   */
  async init() {
    try {
      // Load files
      await this.loadFiles();

      // Attach event listeners
      this.attachEventListeners();

      // Render files
      this.renderFiles();
    } catch (error) {
      console.error("Error initializing app:", error);
      this.showError("Failed to load application");
    }
  }

  /**
   * Attach event listeners to elements
   */
  attachEventListeners() {
    // Upload button
    const uploadBtn = document.getElementById("uploadBtn");
    const fileInput = document.getElementById("fileInput");

    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => this.handleFileSelect(e));

    // Download button in Modal
    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (this.fileViewer.currentFile) {
          this.fileViewer.downloadFile(this.fileViewer.currentFile);
        }
      });
    }

    // Search and Filter
    const searchInput = document.querySelector("#search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => this.handleSearch(e));
    }

    // Filter buttons
    const filterBtns = document.querySelectorAll("[data-filter]");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleFilter(e));
    });

    // Sort buttons
    const sortBtns = document.querySelectorAll("[data-sort]");
    sortBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleSort(e));
    });

    // Drag and Drop
    this.setupDragAndDrop();
  }

  /**
   * Setup Drag and Drop
   */
  setupDragAndDrop() {
    const fileInput = document.getElementById("fileInput");
    const container = document.getElementById("filesContainer");

    if (!container) return;

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      container.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      container.addEventListener(eventName, () => {
        container.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      container.addEventListener(eventName, () => {
        container.classList.remove("drag-over");
      });
    });

    container.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      fileInput.files = files;
      this.handleFileSelect({ target: fileInput });
    });
  }

  /**
   * Handle file selection
   * @param {Event} event - Change event
   */
  async handleFileSelect(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    // Validate file types
    const validFiles = files.filter((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      return ext === "md" || ext === "pdf";
    });

    if (validFiles.length === 0) {
      this.showError("Please select only MD or PDF files");
      return;
    }

    // Show progress bar
    this.showProgress(true);

    try {
      for (const file of validFiles) {
        await this.uploadFile(file);
      }

      await this.loadFiles();
      this.renderFiles();
      this.showSuccess(`Successfully uploaded ${validFiles.length} file(s)`);
    } catch (error) {
      console.error("Error uploading files:", error);
      this.showError("Failed to upload some files");
    } finally {
      this.showProgress(false);
      event.target.value = "";
    }
  }

  /**
   * Upload single file
   * @param {File} file - File to upload
   */
  async uploadFile(file) {
    try {
      await this.fileManager.uploadFile(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  /**
   * Load files from database
   */
  async loadFiles() {
    try {
      await this.fileManager.loadFiles();
      this.updateStats();
    } catch (error) {
      console.error("Error loading files:", error);
      throw error;
    }
  }

  /**
   * Handle search
   * @param {Event} event - Input event
   */
  handleSearch(event) {
    const query = event.target.value;

    if (query.trim() === "") {
      this.renderFiles();
    } else {
      const results = this.fileManager.searchFiles(query);
      this.renderFiles(results);
    }
  }

  /**
   * Handle filter
   * @param {Event} event - Click event
   */
  handleFilter(event) {
    const filter = event.target.getAttribute("data-filter");
    this.currentFilter = filter;

    // Update active button
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.classList.remove("active");
    });
    event.target.classList.add("active");

    this.renderFiles();
  }

  /**
   * Handle sort
   * @param {Event} event - Click event
   */
  handleSort(event) {
    const sort = event.target.getAttribute("data-sort");

    if (this.currentSort === sort) {
      this.currentSortOrder = this.currentSortOrder === "asc" ? "desc" : "asc";
    } else {
      this.currentSort = sort;
      this.currentSortOrder = "asc";
    }

    // Update sort icon
    document.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.classList.remove("active");
    });
    event.target.classList.add("active");

    this.renderFiles();
  }

  /**
   * Render files
   * @param {Array} files - List of files (optional)
   */
  renderFiles(files = null) {
    const container = document.getElementById("filesContainer");
    const emptyState = document.getElementById("emptyState");

    if (!container) return;

    let filesToRender = files || this.fileManager.files;

    // Apply filter
    if (this.currentFilter !== "all") {
      filesToRender = filesToRender.filter(
        (f) => f.type === this.currentFilter
      );
    }

    // Apply sort
    filesToRender = [...filesToRender].sort((a, b) => {
      let aValue, bValue;

      switch (this.currentSort) {
        case "name":
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
          break;
        case "size":
          aValue = a.size;
          bValue = b.size;
          break;
        case "date":
        default:
          aValue = new Date(a.uploadDate);
          bValue = new Date(b.uploadDate);
      }

      if (aValue < bValue) return this.currentSortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return this.currentSortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Show empty state
    if (filesToRender.length === 0) {
      container.innerHTML = "";
      if (emptyState) {
        emptyState.style.display = "block";
      }
      return;
    }

    if (emptyState) {
      emptyState.style.display = "none";
    }

    // Render files
    container.innerHTML = filesToRender
      .map((file) => this.createFileItem(file))
      .join("");

    // Attach file event listeners
    this.attachFileEventListeners();
  }

  /**
   * Create file item element
   * @param {Object} file - File data
   * @returns {string} HTML element
   */
  createFileItem(file) {
    const ext = file.type;
    const icon = ext === "md" ? "📄" : "📕";
    const fileSize = FileManager.formatFileSize(file.size);
    const fileDate = FileManager.formatDate(file.uploadDate);

    // معالجة الأسماء العربية بشكل صحيح
    const displayName = file.displayName || file.originalName;
    const escapeHtml = (str) => {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    };
    const safeName = escapeHtml(displayName);

    const nbsp = "&nbsp;";

    return `
      <div class="file-item fade-in" data-file-id="${file.id}">
        <div class="file-icon ${ext}">${icon}</div>
        <div class="file-info">
          <h5 class="mx-1" title="${displayName}">${safeName}</h5>
          <p class="file-meta">
            <span class="m-1 badge bg-info">${ext.toUpperCase()}</span>
            ${nbsp}
            <span>${fileSize}</span>
            ${nbsp}
            <span>${fileDate}</span>
          </p>
        </div>
        <div class="file-actions">
          <button class="btn btn-sm btn-primary view-btn" title="View">
            <i class="fas fa-eye"></i>&nbsp;View
          </button>
          <button class="btn btn-sm btn-success download-btn" title="Download">
            <i class="fas fa-download"></i>&nbsp;Download
          </button>
          <button class="btn btn-sm btn-danger delete-btn" title="Delete">
            <i class="fas fa-trash"></i>&nbsp;Delete
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach file event listeners
   */
  attachFileEventListeners() {
    const container = document.getElementById("filesContainer");

    // View events
    container.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const fileItem = btn.closest(".file-item");
        const fileId = fileItem.getAttribute("data-file-id");
        const file = this.fileManager.files.find((f) => f.id === fileId);
        if (file) {
          this.fileViewer.showFile(file);
        }
      });
    });

    // Download events
    container.querySelectorAll(".download-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const fileItem = btn.closest(".file-item");
        const fileId = fileItem.getAttribute("data-file-id");
        const file = this.fileManager.files.find((f) => f.id === fileId);
        if (file) {
          this.fileViewer.downloadFile(file);
        }
      });
    });

    // Delete events
    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const fileItem = btn.closest(".file-item");
        const fileId = fileItem.getAttribute("data-file-id");
        const file = this.fileManager.files.find((f) => f.id === fileId);
        if (file) {
          this.showDeleteConfirm(file);
        }
      });
    });
  }

  /**
   * Show delete confirmation
   * @param {Object} file - File data
   */
  showDeleteConfirm(file) {
    const deleteModal = new bootstrap.Modal(
      document.getElementById("deleteModal")
    );
    const deleteFileName = document.getElementById("deleteFileName");
    const confirmDeleteBtn = document.getElementById("confirmDelete");

    deleteFileName.textContent = file.displayName;

    // Remove previous listeners
    const newConfirmBtn = confirmDeleteBtn.cloneNode(true);
    confirmDeleteBtn.parentNode.replaceChild(newConfirmBtn, confirmDeleteBtn);

    // Add new listener
    newConfirmBtn.addEventListener("click", async () => {
      try {
        await this.fileManager.deleteFile(file.id);
        deleteModal.hide();
        this.renderFiles();
        this.updateStats();
        this.showSuccess(`${file.displayName} deleted successfully`);
      } catch (error) {
        console.error("Error deleting file:", error);
        this.showError("Failed to delete file");
      }
    });

    deleteModal.show();
  }

  /**
   * Update statistics
   */
  updateStats() {
    const stats = this.fileManager.getStats();

    const totalFilesEl = document.querySelector('[data-stat="total"]');
    const mdFilesEl = document.querySelector('[data-stat="md"]');
    const pdfFilesEl = document.querySelector('[data-stat="pdf"]');
    const totalSizeEl = document.querySelector('[data-stat="size"]');

    if (totalFilesEl) totalFilesEl.textContent = stats.totalFiles;
    if (mdFilesEl) mdFilesEl.textContent = stats.mdFiles;
    if (pdfFilesEl) pdfFilesEl.textContent = stats.pdfFiles;
    if (totalSizeEl)
      totalSizeEl.textContent = FileManager.formatFileSize(stats.totalSize);
  }

  /**
   * Show/Hide progress bar
   * @param {boolean} show - Show or hide
   */
  showProgress(show) {
    const progressContainer = document.getElementById("progressContainer");
    if (progressContainer) {
      progressContainer.style.display = show ? "block" : "none";
    }
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    const errorToast = document.getElementById("errorToast");
    const errorBody = errorToast.querySelector(".toast-body");
    errorBody.textContent = message;

    const toast = new bootstrap.Toast(errorToast);
    toast.show();
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    const successToast = document.getElementById("successToast");
    const successBody = successToast.querySelector(".toast-body");
    successBody.textContent = message;

    const toast = new bootstrap.Toast(successToast);
    toast.show();
  }
}

// Create global app instance when page loads
let app;
document.addEventListener("DOMContentLoaded", () => {
  app = new App();
});


function clear_all_files() {
  if (confirm('Delete all files?')) {
    app.fileManager.clearAllFiles().then(() => app.loadFiles().then(() => app.renderFiles()));
  }
}