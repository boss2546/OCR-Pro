let _creating = null;

async function ensureOffscreen() {
  if (_creating) return _creating;
  _creating = (async () => {
    try {
      const exists = await chrome.offscreen.hasDocument();
      if (!exists) {
        await chrome.offscreen.createDocument({
          url: 'offscreen/offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run Tesseract.js OCR in a Web Worker',
        });
      }
    } finally {
      _creating = null;
    }
  })();
  return _creating;
}

let _progressCallback = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ocr:workerProgress' && _progressCallback) {
    _progressCallback(msg.progress);
  }
});

const OCR_TIMEOUT = 120000;

const ocrEngine = {
  async recognize(imageData, langs = 'eng', onProgress = null) {
    await ensureOffscreen();
    _progressCallback = onProgress;

    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'ocr:recognize',
          imageData,
          langs,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR timeout (120s)')), OCR_TIMEOUT)
        ),
      ]);

      if (!result || result.error) throw new Error(result?.error || 'OCR failed');
      return { text: result.text, confidence: result.confidence };
    } finally {
      _progressCallback = null;
    }
  },
};

export default ocrEngine;
