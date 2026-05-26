function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const exportManager = {
  downloadTxt(text, filename) {
    const name = filename || `ocr-${timestamp()}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, name);
  },

  downloadMd(text, filename) {
    const name = filename || `ocr-${timestamp()}.md`;
    const content = `# OCR Result\n\n${text}\n`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, name);
  },

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  },
};

export default exportManager;
