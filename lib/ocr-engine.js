let _worker = null;
let _reqCounter = 0;
const _pending = new Map();

function getWorker() {
  if (!_worker) {
    _worker = new Worker(chrome.runtime.getURL('worker/ocr-worker.js'));
    _worker.onmessage = (e) => {
      const { type, requestId } = e.data;

      if (type === 'progress') {
        const entry = _pending.get(requestId);
        if (entry && entry.onProgress) entry.onProgress(e.data.progress);
        return;
      }

      const entry = _pending.get(requestId);
      if (!entry) return;
      _pending.delete(requestId);

      if (type === 'result') {
        entry.resolve({ text: e.data.text, confidence: e.data.confidence });
      } else if (type === 'error') {
        entry.reject(new Error(e.data.error));
      }
    };
  }
  return _worker;
}

const ocrEngine = {
  recognize(imageData, langs = 'eng', onProgress = null) {
    return new Promise((resolve, reject) => {
      const requestId = ++_reqCounter;
      const worker = getWorker();
      _pending.set(requestId, { resolve, reject, onProgress });
      worker.postMessage({ type: 'recognize', imageData, langs, requestId });
    });
  },

  terminate() {
    if (_worker) {
      _worker.postMessage({ type: 'terminate' });
      _worker = null;
    }
    for (const entry of _pending.values()) {
      entry.reject(new Error('OCR engine terminated'));
    }
    _pending.clear();
  },
};

export default ocrEngine;
