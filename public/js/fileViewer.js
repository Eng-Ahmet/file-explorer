class FileViewer {
  constructor() {
    this.container = document.getElementById('fileViewerContent');
    this.title = document.getElementById('fileViewerTitle');
    this.currentFile = null;
    
    document.getElementById('printBtn').addEventListener('click', () => this.print());
    
    this.editBtn = document.getElementById('editBtn');
    this.saveBtn = document.getElementById('saveBtn');
    this.cancelBtn = document.getElementById('cancelEditBtn');
    this.isEditing = false;
    this.originalContent = '';

    this.editBtn.addEventListener('click', () => this.toggleEdit(true));
    this.cancelBtn.addEventListener('click', () => this.toggleEdit(false));
    this.saveBtn.addEventListener('click', () => this.save());
  }
  
  toggleEdit(editing) {
    this.isEditing = editing;
    if (editing) {
      this.originalContent = this.container.querySelector('textarea')?.value || '';
      this.renderEditor(this.originalContent);
      this.editBtn.classList.add('hidden');
      this.saveBtn.classList.remove('hidden');
      this.cancelBtn.classList.remove('hidden');
    } else {
      this.renderMarkdown(this.originalContent);
      this.editBtn.classList.remove('hidden');
      this.saveBtn.classList.add('hidden');
      this.cancelBtn.classList.add('hidden');
    }
  }

  async save() {
    const newContent = this.container.querySelector('textarea').value;
    try {
      this.saveBtn.disabled = true;
      this.saveBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> <span>Saving...</span>';
      
      await fileManager.updateFileContent(this.currentFile._id, newContent);
      
      this.originalContent = newContent;
      this.toggleEdit(false);
      
      if (app) app.showToast("Saved", "File updated successfully", "success");
    } catch (error) {
      if (app) app.showToast("Save Failed", error.message, "error");
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>Save</span>';
    }
  }

  renderEditor(text) {
    this.container.innerHTML = `
      <div class="h-full flex flex-col p-6 animate-fade-in">
        <textarea class="flex-1 w-full bg-slate-950/50 border border-white/10 rounded-xl p-6 text-slate-300 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-tech-blue/50 custom-scrollbar resize-none" spellcheck="false">${text}</textarea>
      </div>
    `;
  }
  
  print() {
    if (!this.currentFile) return;
    
    if (this.currentFile.type === 'md') {
      const content = this.container.innerHTML;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Print - ${this.currentFile.displayName}</title>
            <link href="https://cdn.tailwindcss.com" rel="stylesheet">
            <style>
              body { background: white; color: black; padding: 40px; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body class="prose max-w-none">
            ${content}
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    } else if (this.currentFile.type === 'pdf') {
      const iframe = this.container.querySelector('iframe');
      if (iframe) {
        iframe.contentWindow.print();
      }
    }
  }
  
  async showFile(file) {
    if (!this.container || !this.title) return;
    this.currentFile = file;
    
    this.title.innerHTML = `
        <i class="fas ${file.type === 'pdf' ? 'fa-file-pdf text-rose-400' : 'fa-file-lines text-brand-400'}"></i>
        <span>${file.displayName}</span>
    `;
    this.container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-12 w-12 border-4 border-brand-500 border-t-transparent"></div></div>';

    try {
      const isEditable = !['pdf', 'rar', 'zip', '7z', 'png', 'jpg', 'jpeg', 'gif'].includes(file.type.toLowerCase());
      
      if (isEditable) {
        const response = await fetch(`/api/files/view/${file._id}?token=${localStorage.getItem('token')}`);
        const text = await response.text();
        this.originalContent = text;
        this.renderMarkdown(text);
        this.editBtn.classList.remove('hidden');
      } else {
        this.editBtn.classList.add('hidden');
        if (file.type === 'pdf') {
          this.renderPdf(file._id);
        } else {
          this.container.innerHTML = `<div class="p-8 text-slate-400 text-center">Preview not available for .${file.type} files. Please download to view.</div>`;
        }
      }
    } catch (error) {
      this.container.innerHTML = `<div class="p-8 text-rose-400 font-bold text-center">Failed to load content: ${error.message}</div>`;
    }
  }

  renderMarkdown(text) {
    const isMd = this.currentFile?.type === 'md';
    this.container.innerHTML = `
      <div class="prose prose-invert max-w-none p-8 animate-fade-in">
        ${isMd ? marked.parse(text) : `<pre class="whitespace-pre-wrap font-mono text-sm text-slate-300 bg-slate-950/20 p-6 rounded-xl border border-white/5">${this.escapeHtml(text)}</pre>`}
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderPdf(fileId) {
    this.container.innerHTML = `
      <iframe src="/api/files/view/${fileId}?token=${localStorage.getItem('token')}" 
              class="w-full h-full border-none" 
              style="min-height: 80vh;">
      </iframe>
    `;
  }
}

const fileViewer = new FileViewer();
