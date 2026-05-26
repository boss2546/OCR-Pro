import { MSG, onMessage, sendToTab } from '../lib/messaging.js';
import historyDB from '../lib/history-db.js';
import ocrEngine from '../lib/ocr-engine.js';
import aiProcessor from '../lib/ai-processor.js';
import imagePreprocessor from '../lib/image-preprocessor.js';

// --- Context menus ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ocr-image',
    title: 'OCR this image',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ocr-image' && info.srcUrl) {
    await processImageUrl(info.srcUrl, tab, 'image');
  }
});

// --- Keyboard shortcuts ---
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'ocr-area-select') {
    sendToTab(tab.id, MSG.CAPTURE_AREA);
  }
  if (command === 'ocr-full-page') {
    await captureFullPage(tab);
  }
});

// --- Core OCR pipeline ---
async function captureFullPage(tab) {
  try {
    broadcastProgress('Capturing page...', 0);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await runOcr(dataUrl, tab.url, 'fullpage');
  } catch (err) {
    broadcastError(err.message);
  }
}

async function processImageUrl(url, tab, sourceType) {
  try {
    broadcastProgress('Fetching image...', 0);
    const response = await fetch(url);
    const blob = await response.blob();
    await runOcr(blob, tab?.url || url, sourceType);
  } catch (err) {
    broadcastError(err.message);
  }
}

async function runOcr(imageSource, sourceUrl, sourceType) {
  try {
    broadcastProgress('Preprocessing...', 0.05);

    const settings = await chrome.storage.local.get({ ocrLanguages: 'eng+tha' });
    const langs = settings.ocrLanguages;

    let thumbnailData = null;
    try {
      thumbnailData = await imagePreprocessor.thumbnail(imageSource);
    } catch (_) { /* thumbnail is optional */ }

    const preprocessed = await imagePreprocessor.preprocess(imageSource);

    broadcastProgress('Running OCR...', 0.1);

    const unsubProgress = ocrEngine.onProgress((data) => {
      broadcastProgress('Running OCR...', 0.1 + data.progress * 0.85);
    });

    const result = await ocrEngine.recognize(preprocessed, langs);
    unsubProgress();

    const record = await historyDB.add({
      sourceType,
      sourceUrl: sourceUrl || '',
      thumbnail: thumbnailData,
      rawText: result.text,
      enhancedText: null,
      language: langs,
      confidence: result.confidence,
    });

    broadcastResult(record);
  } catch (err) {
    broadcastError(err.message);
  }
}

// --- Broadcast to all open UI ---
function broadcastProgress(status, progress) {
  chrome.runtime.sendMessage({ type: MSG.OCR_PROGRESS, status, progress }).catch(() => {});
}

async function broadcastResult(record) {
  chrome.runtime.sendMessage({ type: MSG.OCR_RESULT, record }).catch(() => {});
  const tab = await getCurrentTab();
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: MSG.OCR_RESULT, record }).catch(() => {});
  }
}

function broadcastError(error) {
  chrome.runtime.sendMessage({ type: MSG.OCR_ERROR, error }).catch(() => {});
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- Message handlers ---
onMessage({
  [MSG.CAPTURE_FULLPAGE]: async (msg, sender) => {
    const tab = sender.tab || (await getCurrentTab());
    if (tab) await captureFullPage(tab);
  },

  [MSG.CAPTURE_IMAGE]: async (msg) => {
    await processImageUrl(msg.url, null, 'image');
  },

  [MSG.CAPTURE_URL]: async (msg) => {
    await processImageUrl(msg.url, null, 'url');
  },

  [MSG.CAPTURE_UPLOAD]: async (msg) => {
    await runOcr(msg.imageData, msg.filename || 'upload', 'upload');
  },

  [MSG.CAPTURE_AREA]: async (msg, sender) => {
    if (msg.imageData) {
      await runOcr(msg.imageData, sender.tab?.url || '', 'area');
    } else {
      const tab = sender.tab || (await getCurrentTab());
      if (tab) sendToTab(tab.id, MSG.CAPTURE_AREA);
    }
  },

  'capture:areaCoords': async (msg, sender) => {
    const tab = sender.tab;
    if (!tab) return;
    try {
      broadcastProgress('Capturing area...', 0);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      const { x, y, w, h } = msg.rect;
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

      await runOcr(croppedBlob, tab.url, 'area');
    } catch (err) {
      broadcastError(err.message);
    }
  },

  [MSG.AI_ENHANCE]: async (msg) => {
    try {
      const enhanced = await aiProcessor.enhance(msg.text);
      if (msg.recordId) {
        await historyDB.update(msg.recordId, { enhancedText: enhanced });
      }
      return { type: MSG.AI_RESULT, enhanced };
    } catch (err) {
      return { type: MSG.AI_ERROR, error: err.message };
    }
  },

  [MSG.OPEN_SIDEPANEL]: async (msg, sender) => {
    const tab = sender.tab || (await getCurrentTab());
    if (tab) chrome.sidePanel.open({ tabId: tab.id });
  },

  'history:getAll': async (msg) => {
    return historyDB.getAll(msg);
  },

  'history:search': async (msg) => {
    return historyDB.search(msg.query);
  },

  'history:get': async (msg) => {
    return historyDB.get(msg.id);
  },

  'history:delete': async (msg) => {
    await historyDB.delete(msg.id);
    return { success: true };
  },

  'history:clearAll': async () => {
    await historyDB.clearAll();
    return { success: true };
  },

  'ai:testConnection': async () => {
    return aiProcessor.testConnection();
  },

  'ai:isConfigured': async () => {
    return { configured: await aiProcessor.isConfigured() };
  },
});
