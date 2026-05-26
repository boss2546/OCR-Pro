const ocrEngine = {
  _worker: null,
  _listeners: new Map(),

  _getWorker() {
    if (!this._worker) {
      this._worker = new Worker(chrome.runtime.getURL('worker/ocr-worker.js'));
      this._worker.onmessage = (e) => {
        const { type } = e.data;
        const cbs = this._listeners.get(type);
        if (cbs) cbs.forEach(cb => cb(e.data));
      };
    }
    return this._worker;
  },

  on(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
  },

  off(type, callback) {
    const cbs = this._listeners.get(type);
    if (cbs) cbs.delete(callback);
  },

  recognize(imageData, langs = 'eng') {
    return new Promise((resolve, reject) => {
      const worker = this._getWorker();

      const onResult = (data) => {
        cleanup();
        resolve({ text: data.text, confidence: data.confidence });
      };

      const onError = (data) => {
        cleanup();
        reject(new Error(data.error));
      };

      const cleanup = () => {
        this.off('result', onResult);
        this.off('error', onError);
      };

      this.on('result', onResult);
      this.on('error', onError);

      worker.postMessage({ type: 'recognize', imageData, langs });
    });
  },

  onProgress(callback) {
    this.on('progress', callback);
    return () => this.off('progress', callback);
  },

  terminate() {
    if (this._worker) {
      this._worker.postMessage({ type: 'terminate' });
      this._worker = null;
      this._listeners.clear();
    }
  },
};

export default ocrEngine;
