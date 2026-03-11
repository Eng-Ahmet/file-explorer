class FileManager {
  constructor() {
    this.token = localStorage.getItem('token');
    this.user = JSON.parse(localStorage.getItem('user'));
    this.files = [];
    this.folders = [];
  }

  setToken(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.clear();
  }

  async fetchApi(url, options = {}) {
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    return fetch(url, { ...options, headers });
  }

  async loadFiles() {
    const res = await this.fetchApi('/api/files');
    if (res.ok) {
      this.files = await res.json();
    }
  }

  async loadUser() {
    const res = await this.fetchApi('/api/auth/me');
    if (res.ok) {
      this.user = await res.json();
      localStorage.setItem('user', JSON.stringify(this.user));
    }
  }

  async uploadFile(file, folderId) {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folderId', folderId);

    const res = await fetch('/api/files/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Upload failed');
    }
    return res.json();
  }

  getStats() {
    return {
      totalFiles: this.files.length,
      mdFiles: this.files.filter(f => f.type === 'md').length,
      pdfFiles: this.files.filter(f => f.type === 'pdf').length
    };
  }

  async bulkDelete(ids) {
    const res = await this.fetchApi('/api/files/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    if (!res.ok) throw new Error('Bulk delete failed');
    return res.json();
  }

  async moveFiles(ids, targetFolderId) {
    const res = await this.fetchApi('/api/files/move', {
      method: 'POST',
      body: JSON.stringify({ ids, targetFolderId })
    });
    if (!res.ok) throw new Error('Move failed');
    return res.json();
  }

  async copyFiles(ids, targetFolderId) {
    const res = await this.fetchApi('/api/files/copy', {
      method: 'POST',
      body: JSON.stringify({ ids, targetFolderId })
    });
    if (!res.ok) throw new Error('Copy failed');
    return res.json();
  }

  async createFile(name, folderId) {
    const res = await this.fetchApi('/api/files/create', {
      method: 'POST',
      body: JSON.stringify({ name, folderId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'File creation failed');
    }
    return res.json();
  }

  async updateFileContent(id, content) {
    const res = await this.fetchApi(`/api/files/${id}/content`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Update failed');
    }
    return res.json();
  }
}

const fileManager = new FileManager();
