/**
 * File Manager - Manages file operations
 * Handles interactions with SQLite database
 */

class FileManager {
  constructor() {
    this.files = [];
  }

  /**
   * Load all files from database
   * @returns {Promise<Array>} List of files
   */
  async loadFiles() {
    try {
      const response = await fetch("/api/files");
      if (!response.ok) throw new Error("Failed to load files");
      this.files = await response.json();

      // معالجة الأسماء العربية - تأكد من أن جميع الأسماء بصيغة UTF-8 صحيحة
      this.files = this.files.map((file) => ({
        ...file,
        displayName: file.displayName || file.originalName,
        originalName: file.originalName,
      }));

      return this.files;
    } catch (error) {
      console.error("Error loading files:", error);
      throw error;
    }
  }

  /**
   * Upload a new file
   * @param {File} file - File to upload
   * @returns {Promise<Object>} Uploaded file data
   */
  async uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload file");
      }

      const uploadedFile = await response.json();
      this.files.push(uploadedFile);
      return uploadedFile;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  /**
   * Get a single file from database
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File data
   */
  async getFile(fileId) {
    try {
      const response = await fetch(`/api/files/${fileId}`);
      if (!response.ok) throw new Error("Failed to fetch file");
      return await response.json();
    } catch (error) {
      console.error("Error fetching file:", error);
      throw error;
    }
  }

  /**
   * Delete file from database and storage
   * @param {string} fileId - File ID
   * @returns {Promise<void>}
   */
  async deleteFile(fileId) {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete file");

      this.files = this.files.filter((f) => f.id !== fileId);
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  }

  /**
   * Delete all files
   * @returns {Promise<void>}
   */
  async clearAllFiles() {
    try {
      const response = await fetch("/api/clear", {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to clear files");

      this.files = [];
    } catch (error) {
      console.error("Error clearing files:", error);
      throw error;
    }
  }

  /**
   * Load file for display
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File content and data
   */
  async loadFileContent(fileId) {
    try {
      const response = await fetch(`/api/files/${fileId}`);
      if (!response.ok) throw new Error("Failed to load file content");
      return await response.json();
    } catch (error) {
      console.error("Error loading file content:", error);
      throw error;
    }
  }

  /**
   * Load PDF file
   * @param {string} fileId - File ID
   * @returns {Promise<ArrayBuffer>} PDF content
   */
  async loadPdfFile(fileId) {
    try {
      const response = await fetch(`/api/files/${fileId}`);
      if (!response.ok) throw new Error("Failed to load PDF file");
      return await response.arrayBuffer();
    } catch (error) {
      console.error("Error loading PDF file:", error);
      throw error;
    }
  }

  /**
   * Download file
   * @param {string} fileId - File ID
   * @param {string} fileName - File name
   * @returns {void}
   */
  downloadFile(fileId, fileName) {
    const link = document.createElement("a");
    link.href = `/api/download/${fileId}`;
    link.download = fileName;
    link.click();
  }

  /**
   * Rename file
   * @param {string} fileId - File ID
   * @param {string} newName - New name
   * @returns {Promise<void>}
   */
  async renameFile(fileId, newName) {
    try {
      const response = await fetch(`/api/files/${fileId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName }),
      });

      if (!response.ok) throw new Error("Failed to rename file");

      const fileIndex = this.files.findIndex((f) => f.id === fileId);
      if (fileIndex !== -1) {
        this.files[fileIndex].displayName = newName;
      }
    } catch (error) {
      console.error("Error renaming file:", error);
      throw error;
    }
  }

  /**
   * Search for files
   * @param {string} query - Search query
   * @returns {Array} Matching files
   */
  searchFiles(query) {
    const lowerQuery = query.toLowerCase();
    return this.files.filter(
      (file) =>
        file.displayName.toLowerCase().includes(lowerQuery) ||
        file.originalName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Filter files by type
   * @param {string} type - File type (md or pdf)
   * @returns {Array} Filtered files
   */
  filterByType(type) {
    if (type === "all") return this.files;
    return this.files.filter((file) => file.type === type);
  }

  /**
   * Sort files
   * @param {string} sortBy - Sort criteria (name, date, size)
   * @param {string} order - Sort order (asc or desc)
   * @returns {Array} Sorted files
   */
  sortFiles(sortBy = "date", order = "desc") {
    const sorted = [...this.files];

    sorted.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
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

      if (aValue < bValue) return order === "asc" ? -1 : 1;
      if (aValue > bValue) return order === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  /**
   * Get file statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      totalFiles: this.files.length,
      mdFiles: this.files.filter((f) => f.type === "md").length,
      pdfFiles: this.files.filter((f) => f.type === "pdf").length,
      totalSize: this.files.reduce((sum, f) => sum + f.size, 0),
    };
    return stats;
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Format date
   * @param {string} dateString - Date string
   * @returns {string} Formatted date in English
   */
  static formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString("en-US", options);
  }
}

// Create global instance of FileManager
const fileManager = new FileManager();
