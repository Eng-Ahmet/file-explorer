/**
 * File Viewer - View files
 * Supports viewing MD and PDF files
 */

class FileViewer {
  constructor() {
    this.currentFile = null;
  }

  /**
   * Display file content in Modal
   * @param {Object} file - File data
   */
  async showFile(file) {
    try {
      this.currentFile = file;

      // Update modal title - معالجة صحيحة للأسماء العربية
      const titleElement = document.getElementById("fileViewerTitle");
      const icon = file.type === "md" ? "fab fa-markdown" : "fas fa-file-pdf";

      // استخدام textContent بدلاً من innerHTML لتجنب مشاكل الترميز
      const titleSpan = document.createElement("span");
      titleSpan.innerHTML = `<i class="${icon} me-2"></i>`;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = file.displayName || file.originalName;

      titleElement.innerHTML = "";
      titleElement.appendChild(titleSpan.firstChild);
      titleElement.appendChild(nameSpan);

      // Clear previous content
      const contentElement = document.getElementById("fileViewerContent");
      contentElement.innerHTML = "";

      if (file.type === "md") {
        await this.renderMarkdown(file.id, contentElement);
      } else if (file.type === "pdf") {
        await this.renderPdf(file.id, contentElement);
      }

      // Display modal
      const modal = new bootstrap.Modal(
        document.getElementById("fileViewerModal")
      );
      modal.show();
    } catch (error) {
      console.error("Error displaying file:", error);
      this.showError("Failed to load file");
    }
  }

  /**
   * Display Markdown file
   * @param {string} fileId - File ID
   * @param {HTMLElement} container - Container element
   */
  async renderMarkdown(fileId, container) {
    try {
      const fileData = await fileManager.loadFileContent(fileId);

      if (!fileData.content) {
        throw new Error("No content");
      }

      // Convert Markdown to HTML using Marked.js
      const htmlContent = marked.parse(fileData.content);

      // Create content container
      const contentDiv = document.createElement("div");
      contentDiv.className = "markdown-content";
      contentDiv.innerHTML = htmlContent;

      // Enhance markdown content
      this.enhanceMarkdownContent(contentDiv);

      container.appendChild(contentDiv);
    } catch (error) {
      console.error("Error displaying Markdown:", error);
      container.innerHTML =
        '<p class="text-danger">Failed to load file content</p>';
    }
  }

  /**
   * Enhance Markdown content
   * @param {HTMLElement} container - Container element
   */
  enhanceMarkdownContent(container) {
    // Open links in new window
    container.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });

    // Add styles for tables
    container.querySelectorAll("table").forEach((table) => {
      table.classList.add("table", "table-striped", "table-hover");
    });

    // Add styles for code
    container.querySelectorAll("code").forEach((code) => {
      if (!code.parentElement.tagName.toLowerCase() === "pre") {
        code.classList.add("language-code");
      }
    });
  }

  /**
   * Display PDF file
   * @param {string} fileId - File ID
   * @param {HTMLElement} container - Container element
   */
  async renderPdf(fileId, container) {
    try {
      // Load PDF.js worker
      if (typeof pdfjsLib !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }

      // Fetch PDF file - use direct download path
      const pdfUrl = `/api/download/${fileId}`;

      // Create canvas for PDF display
      const canvas = document.createElement("canvas");
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      canvas.style.border = "1px solid #ddd";
      canvas.style.borderRadius = "8px";

      try {
        // Load PDF with error handling
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const page = await pdf.getPage(1);

        // Calculate size
        const viewport = page.getViewport({ scale: 2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render first page
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;

        // Add PDF info
        const info = document.createElement("div");
        info.className = "alert alert-info mt-3";
        info.innerHTML = `
          <i class="fas fa-info-circle me-2"></i>&nbsp;
          <strong>PDF Info:</strong> Total Pages: <strong>${pdf.numPages}</strong>
        `;

        container.appendChild(canvas);
        container.appendChild(info);
      } catch (pdfError) {
        console.error("PDF rendering error:", pdfError);

        // Fallback: Show download link
        const fallbackDiv = document.createElement("div");
        fallbackDiv.className = "alert alert-warning";
        fallbackDiv.innerHTML = `
          <i class="fas fa-exclamation-triangle me-2"></i>&nbsp;
          <strong>Cannot preview PDF</strong><br>
          <a href="/api/download/${fileId}" class="btn btn-sm btn-primary mt-2">
            <i class="fas fa-download me-1"></i>&nbsp;Download PDF
          </a>
        `;
        container.appendChild(fallbackDiv);
      }
    } catch (error) {
      console.error("Error displaying PDF:", error);
      container.innerHTML = `<div class="alert alert-danger">
        <i class="fas fa-exclamation-circle me-2"></i>&nbsp;
        Failed to load PDF file
      </div>`;
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

  /**
   * Download file
   * @param {Object} file - File data
   */
  downloadFile(file) {
    fileManager.downloadFile(file.id, file.originalName);
    this.showSuccess(`Downloading ${file.displayName}`);
  }

  /**
   * Copy file link
   * @param {Object} file - File data
   */
  copyFileLink(file) {
    const link = `${window.location.origin}/api/download/${file.id}`;
    navigator.clipboard.writeText(link).then(() => {
      this.showSuccess("Link copied");
    });
  }

  /**
   * Print file
   */
  printFile() {
    window.print();
  }

  /**
   * Close modal
   */
  closeViewer() {
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("fileViewerModal")
    );
    if (modal) {
      modal.hide();
    }
  }
}

// Create global instance of FileViewer
const fileViewer = new FileViewer();
