let worker = null;
let currentLangs = null;

async function initWorker(langs) {
  if (worker && currentLangs === langs) return worker;
  if (worker) await worker.terminate();
  currentLangs = langs;
  worker = await Tesseract.createWorker(langs, 1, {
    workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('vendor/tesseract/'),
    workerBlobURL: false,
    logger: (info) => {
      if (info.status === 'recognizing text') {
        chrome.runtime.sendMessage({
          type: 'ocr:workerProgress',
          progress: info.progress,
        }).catch(() => {});
      }
    },
  });
  return worker;
}

let busy = false;
let busyTimer = null;

function resetBusy() {
  busy = false;
  clearTimeout(busyTimer);
  busyTimer = null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'ocr:recognize') return false;

  if (busy) {
    sendResponse({ error: 'OCR already in progress' });
    return false;
  }
  busy = true;
  busyTimer = setTimeout(resetBusy, 120000);

  (async () => {
    try {
      const w = await initWorker(msg.langs || 'eng');
      const result = await w.recognize(msg.imageData);
      sendResponse({
        text: result.data.text,
        confidence: result.data.confidence,
      });
    } catch (err) {
      sendResponse({ error: err.message });
    } finally {
      resetBusy();
    }
  })();

  return true;
});
