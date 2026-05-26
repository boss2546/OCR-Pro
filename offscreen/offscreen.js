let worker = null;
let currentLangs = null;

const LOCAL_LANG_PATH = chrome.runtime.getURL('vendor/tesseract/');
const CDN_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/';

async function allLangsLocal(langs) {
  const parts = langs.split('+');
  for (const lang of parts) {
    try {
      const resp = await fetch(LOCAL_LANG_PATH + lang + '.traineddata.gz', { method: 'HEAD' });
      if (!resp.ok) return false;
    } catch { return false; }
  }
  return true;
}

async function initWorker(langs) {
  if (worker && currentLangs === langs) return worker;
  if (worker) await worker.terminate();
  currentLangs = langs;

  let useLocal = false;
  try { useLocal = await allLangsLocal(langs); } catch (_) {}

  worker = await Tesseract.createWorker(langs, 1, {
    workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('vendor/tesseract/'),
    langPath: useLocal ? LOCAL_LANG_PATH : CDN_LANG_PATH,
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
  await worker.setParameters({
    preserve_interword_spaces: '0',
  });
  return worker;
}

chrome.runtime.sendMessage({ type: 'ocr:offscreenReady' }).catch(() => {});

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
