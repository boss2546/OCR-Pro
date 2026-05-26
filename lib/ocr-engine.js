let _creating = null;
let _offscreenReady = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ocr:offscreenReady') _offscreenReady = true;
});

function waitForReady(timeout = 5000) {
  if (_offscreenReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Offscreen document timed out')), timeout);
    const check = setInterval(() => {
      if (_offscreenReady) {
        clearInterval(check);
        clearTimeout(timer);
        resolve();
      }
    }, 50);
  });
}

async function ensureOffscreen() {
  if (_creating) return _creating;
  _creating = (async () => {
    try {
      const exists = await chrome.offscreen.hasDocument();
      if (exists) {
        _offscreenReady = true;
      } else {
        _offscreenReady = false;
        await chrome.offscreen.createDocument({
          url: 'offscreen/offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run Tesseract.js OCR in a Web Worker',
        });
        await waitForReady();
      }
    } finally {
      _creating = null;
    }
  })();
  return _creating;
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const parts = [];
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(parts.join(''))}`;
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

    let serializable = imageData;
    if (imageData instanceof Blob) {
      serializable = await blobToDataUrl(imageData);
    }

    let keepalive;
    try {
      keepalive = setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {});
      }, 20000);

      let timer;
      const result = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'ocr:recognize',
          imageData: serializable,
          langs,
        }).then(r => { clearTimeout(timer); return r; }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OCR timeout (120s)')), OCR_TIMEOUT);
        }),
      ]);

      if (!result || result.error) throw new Error(result?.error || 'OCR failed');
      return { text: result.text, confidence: result.confidence };
    } finally {
      clearInterval(keepalive);
      _progressCallback = null;
    }
  },
};

export default ocrEngine;
