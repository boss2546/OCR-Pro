let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run Tesseract.js OCR in a Web Worker',
    });
  }
  offscreenReady = true;
}

let _progressCallback = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ocr:workerProgress' && _progressCallback) {
    _progressCallback(msg.progress);
  }
});

const ocrEngine = {
  async recognize(imageData, langs = 'eng', onProgress = null) {
    await ensureOffscreen();
    _progressCallback = onProgress;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ocr:recognize',
        imageData,
        langs,
      });

      if (result.error) throw new Error(result.error);
      return { text: result.text, confidence: result.confidence };
    } finally {
      _progressCallback = null;
    }
  },
};

export default ocrEngine;
