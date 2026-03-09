class FileViewer {
  constructor() {
    this.container = document.getElementById('fileViewerContent');
    this.title = document.getElementById('fileViewerTitle');
    this.currentFile = null;
    
    document.getElementById('printBtn').addEventListener('click', () => this.print());
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
      if (file.type === 'md') {
        const response = await fetch(`/api/files/view/${file._id}?token=${localStorage.getItem('token')}`);
        const text = await response.text();
        this.renderMarkdown(text);
      } else if (file.type === 'pdf') {
        this.renderPdf(file._id);
      }
    } catch (error) {
      this.container.innerHTML = `<div class="p-8 text-rose-400 font-bold text-center">Failed to load content: ${error.message}</div>`;
    }
  }

  renderMarkdown(text) {
    this.container.innerHTML = `
      <div class="prose prose-invert max-w-none p-8 animate-fade-in">
        ${marked.parse(text)}
      </div>
    `;
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
