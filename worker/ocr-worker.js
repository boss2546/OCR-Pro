importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;

async function initWorker(langs) {
  if (worker) {
    await worker.terminate();
  }
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

self.onmessage = async (e) => {
  const { type, imageData, langs } = e.data;

  if (type === 'recognize') {
    try {
      const w = await initWorker(langs || 'eng');
      const result = await w.recognize(imageData);
      self.postMessage({
        type: 'result',
        text: result.data.text,
        confidence: result.data.confidence,
      });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    self.postMessage({ type: 'terminated' });
  }
};
