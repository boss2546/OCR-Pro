import { MSG, onMessage, sendToTab } from '../lib/messaging.js';
import historyDB from '../lib/history-db.js';
import ocrEngine from '../lib/ocr-engine.js';
import aiProcessor from '../lib/ai-processor.js';
import imagePreprocessor from '../lib/image-preprocessor.js';

function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid image data');
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeMatch?.[1] || 'image/png' });
}

// --- Context menus ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ocr-image',
    title: 'OCR this image',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ocr-image' && info.srcUrl && tab) {
    await processImageUrl(info.srcUrl, tab.id, 'image');
  }
});

// --- Keyboard shortcuts ---
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab) return;
  if (command === 'ocr-area-select') {
    sendToTab(tab.id, MSG.CAPTURE_AREA).catch(() => {});
  }
  if (command === 'ocr-full-page') {
    await captureFullPage(tab.id, tab.windowId, tab.url);
  }
});

// --- Core OCR pipeline ---
async function captureFullPage(tabId, windowId, pageUrl) {
  try {
    broadcastProgress('Capturing page...', 0);
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    await runOcr(dataUrl, pageUrl, 'fullpage', tabId);
  } catch (err) {
    broadcastError(err.message);
  }
}

async function processImageUrl(url, tabId, sourceType) {
  try {
    broadcastProgress('Fetching image...', 0);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
    const blob = await response.blob();
    await runOcr(blob, url, sourceType, tabId);
  } catch (err) {
    broadcastError(err.message);
  }
}

async function runOcr(imageSource, sourceUrl, sourceType, sourceTabId) {
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

    const onProgress = (progress) => {
      broadcastProgress('Running OCR...', 0.1 + progress * 0.85);
    };

    const result = await ocrEngine.recognize(preprocessed, langs, onProgress);

    const recordData = {
      sourceType,
      sourceUrl: sourceUrl || '',
      thumbnail: thumbnailData,
      rawText: result.text,
      enhancedText: null,
      language: langs,
      confidence: result.confidence,
      timestamp: Date.now(),
    };

    let record = recordData;
    try {
      record = await historyDB.add(recordData);
    } catch (_) { /* history save failure should not lose OCR result */ }

    broadcastResult(record, sourceTabId);
  } catch (err) {
    broadcastError(err.message);
  }
}

// --- Broadcast to all open UI ---
function broadcastProgress(status, progress) {
  chrome.runtime.sendMessage({ type: MSG.OCR_PROGRESS, status, progress }).catch(() => {});
}

function broadcastResult(record, sourceTabId) {
  chrome.runtime.sendMessage({ type: MSG.OCR_RESULT, record }).catch(() => {});
  if (sourceTabId) {
    chrome.tabs.sendMessage(sourceTabId, { type: MSG.OCR_RESULT, record }).catch(() => {});
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
    if (tab) await captureFullPage(tab.id, tab.windowId, tab.url);
  },

  [MSG.CAPTURE_IMAGE]: async (msg) => {
    await processImageUrl(msg.url, null, 'image');
  },

  [MSG.CAPTURE_URL]: async (msg) => {
    await processImageUrl(msg.url, null, 'url');
  },

  [MSG.CAPTURE_UPLOAD]: async (msg) => {
    await runOcr(msg.imageData, msg.filename || 'upload', 'upload', null);
  },

  [MSG.CAPTURE_AREA]: async (msg, sender) => {
    if (msg.imageData) {
      await runOcr(msg.imageData, sender.tab?.url || '', 'area', sender.tab?.id);
    } else {
      const tab = sender.tab || (await getCurrentTab());
      if (tab) sendToTab(tab.id, MSG.CAPTURE_AREA).catch(() => {});
    }
  },

  'capture:areaCoords': async (msg, sender) => {
    const tab = sender.tab;
    if (!tab) return;
    try {
      broadcastProgress('Capturing area...', 0);

      // Small delay to ensure overlay is fully removed before capture
      await new Promise(r => setTimeout(r, 50));

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      const { x, y, w, h } = msg.rect;
      const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      bitmap.close();
      const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

      await runOcr(croppedBlob, tab.url, 'area', tab.id);
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
