function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    await navigator.clipboard.writeText(text);
  },
};

export default exportManager;
