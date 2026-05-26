importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;
let currentLangs = null;

async function initWorker(langs) {
  if (worker && currentLangs === langs) return worker;
  if (worker) await worker.terminate();
  currentLangs = langs;
  worker = await Tesseract.createWorker(langs, 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
    logger: (info) => {
      if (info.status === 'recognizing text') {
        self.postMessage({ type: 'progress', progress: info.progress });
      }
    },
  });
  return worker;
}

let busy = false;

self.onmessage = async (e) => {
  const { type, imageData, langs, requestId } = e.data;

  if (type === 'recognize') {
    if (busy) {
      self.postMessage({ type: 'error', requestId, error: 'OCR already in progress' });
      return;
    }
    busy = true;
    try {
      const w = await initWorker(langs || 'eng');
      const result = await w.recognize(imageData);
      self.postMessage({
        type: 'result',
        requestId,
        text: result.data.text,
        confidence: result.data.confidence,
      });
    } catch (err) {
      self.postMessage({ type: 'error', requestId, error: err.message });
    } finally {
      busy = false;
    }
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
      currentLangs = null;
    }
    self.postMessage({ type: 'terminated' });
  }
};
