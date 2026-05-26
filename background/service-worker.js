import { MSG, onMessage, sendToTab } from '../lib/messaging.js';
import historyDB from '../lib/history-db.js';
import ocrEngine from '../lib/ocr-engine.js';
import aiProcessor from '../lib/ai-processor.js';
import imagePreprocessor from '../lib/image-preprocessor.js';

let lastCapturedImageUrl = null;

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

// --- Context menus + first-run setup ---
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({ id: 'ocr-image', title: 'OCR this image', contexts: ['image'] });
  chrome.contextMenus.create({ id: 'ocr-open-panel', title: 'Open OCR Pro Panel', contexts: ['action'] });
  chrome.contextMenus.create({ id: 'ocr-full-page', title: 'OCR Full Page', contexts: ['action'] });

  if (details.reason === 'install') {
    await chrome.storage.local.set({ ocrEngine: 'tesseract' });
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ocr-image' && info.srcUrl && tab) {
    await processImageUrl(info.srcUrl, tab.id, 'image');
  }
  if (info.menuItemId === 'ocr-open-panel' && tab) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  if (info.menuItemId === 'ocr-full-page' && tab) {
    await captureFullPage(tab.id, tab.windowId, tab.url);
  }
});

// --- Single click icon = instant area select ---
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    return;
  }
  try {
    await ensureContentScript(tab.id);
    sendToTab(tab.id, MSG.CAPTURE_AREA).catch(() => {});
  } catch {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// --- Ensure content scripts are injected ---
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    return;
  } catch { /* not injected yet */ }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/area-selector.js', 'content/floating-widget.js', 'content/content.js'],
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content/content.css'],
  });
  for (let i = 0; i < 10; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'ping' });
      return;
    } catch { await new Promise(r => setTimeout(r, 50)); }
  }
}

// --- Keyboard shortcuts ---
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab) return;
  if (command === 'ocr-area-select') {
    try {
      await ensureContentScript(tab.id);
      sendToTab(tab.id, MSG.CAPTURE_AREA).catch(() => {});
    } catch { /* restricted page */ }
  }
  if (command === 'ocr-full-page') {
    await captureFullPage(tab.id, tab.windowId, tab.url);
  }
});

// --- Core OCR pipeline ---
async function captureFullPage(tabId, windowId, pageUrl) {
  try {
    broadcastProgress('Extracting page text...', 0);

    let htmlText = '';
    try {
      await ensureContentScript(tabId);
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'extract:pageText' });
      htmlText = (resp?.text || '').trim();
    } catch (_) {}

    if (htmlText.length >= 20) {
      let thumbnailData = null;
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        if (dataUrl) thumbnailData = await imagePreprocessor.thumbnail(dataUrl);
      } catch (_) {}

      const record = {
        sourceType: 'fullpage-html',
        sourceUrl: pageUrl || '',
        thumbnail: thumbnailData,
        rawText: htmlText,
        enhancedText: null,
        language: 'html',
        confidence: 100,
        timestamp: Date.now(),
      };
      let saved = record;
      try { saved = await historyDB.add(record); } catch (_) {}
      broadcastResult(saved, tabId);
      return;
    }

    broadcastProgress('Capturing page...', 0);
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    if (!dataUrl || dataUrl.indexOf(',') === -1 || dataUrl.indexOf(',') === dataUrl.length - 1) {
      throw new Error('Page capture returned empty image. The page may not allow screenshots.');
    }
    lastCapturedImageUrl = dataUrl;
    await runOcr(dataUrl, pageUrl, 'fullpage', tabId);
  } catch (err) {
    broadcastError(err.message, tabId);
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
    broadcastError(err.message, tabId);
  }
}

async function runOcr(imageSource, sourceUrl, sourceType, sourceTabId) {
  try {
    broadcastProgress('Preprocessing...', 0.05);

    const settings = await chrome.storage.local.get({ ocrLanguages: 'eng+tha', ocrEngine: 'tesseract' });
    const langs = settings.ocrLanguages;
    const engine = settings.ocrEngine;

    let thumbnailData = null;
    try {
      thumbnailData = await imagePreprocessor.thumbnail(imageSource);
    } catch (_) { /* thumbnail is optional */ }

    let result;

    if (engine === 'ai-vision') {
      try {
        broadcastProgress('AI Vision reading...', 0.1);
        const imageDataUrl = await imagePreprocessor.toDataUrl(imageSource);
        const text = await aiProcessor.ocrVision(imageDataUrl);
        result = { text, confidence: 99 };
      } catch (aiErr) {
        broadcastProgress('AI failed, using Tesseract...', 0.1);
        result = await runTesseract(imageSource, langs);
      }
    } else {
      result = await runTesseract(imageSource, langs);
    }

    let cleanedText = result.text;
    if (engine !== 'ai-vision') {
      if (langs.includes('tha')) {
        cleanedText = cleanThaiOcrText(cleanedText);
      }
      cleanedText = filterNoise(cleanedText);
    }
    cleanedText = cleanedText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    const recordData = {
      sourceType,
      sourceUrl: sourceUrl || '',
      thumbnail: thumbnailData,
      rawText: cleanedText,
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
    broadcastError(err.message, sourceTabId);
  }
}

async function runTesseract(imageSource, langs) {
  const gentle = langs.includes('tha') || langs.includes('jpn') || langs.includes('chi_sim') || langs.includes('chi_tra') || langs.includes('kor') || langs.includes('ara') || langs.includes('hin');
  const preprocessed = await imagePreprocessor.preprocess(imageSource, { gentle });
  broadcastProgress('Running OCR...', 0.1);
  const onProgress = (progress) => { broadcastProgress('Running OCR...', 0.1 + progress * 0.85); };
  return ocrEngine.recognize(preprocessed, langs, onProgress);
}

function cleanThaiOcrText(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const chars = lines[i].split('');
    const out = [];
    for (let j = 0; j < chars.length; j++) {
      const c = chars[j];
      if (c === ' ') {
        const prev = chars[j - 1];
        const next = chars[j + 1];
        const isThai = ch => ch && ch.charCodeAt(0) >= 0x0E00 && ch.charCodeAt(0) <= 0x0E7F;
        if (isThai(prev) && isThai(next)) continue;
      }
      if (/[ัิ-ฺ็-๎]/.test(c)) {
        while (out.length && out[out.length - 1] === ' ') out.pop();
      }
      out.push(c);
    }
    lines[i] = out.join('');
  }
  return lines.join('\n');
}

function filterNoise(text) {
  return text.split('\n').filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.length <= 2) return false;
    const readable = trimmed.replace(/[\s\p{P}\p{S}\d]/gu, '');
    if (readable.length === 0 && trimmed.length > 0) return false;
    const ratio = readable.length / trimmed.replace(/\s/g, '').length;
    if (ratio < 0.3 && trimmed.length < 20) return false;
    if (/^[\W\d\s]{1,10}$/.test(trimmed)) return false;
    return true;
  }).join('\n');
}

// --- Broadcast to all open UI ---
function broadcastProgress(status, progress) {
  chrome.runtime.sendMessage({ type: MSG.OCR_PROGRESS, status, progress }).catch(() => {});
}

function broadcastResult(record, sourceTabId) {
  chrome.runtime.sendMessage({ type: MSG.OCR_RESULT, record }).catch(() => {});
  if (sourceTabId) {
    chrome.tabs.sendMessage(sourceTabId, { type: MSG.OCR_RESULT, record }).catch(() => {});
    chrome.tabs.sendMessage(sourceTabId, { type: 'ocr:autoCopy', text: record.rawText }).catch(() => {});
  }
}

function broadcastError(error, sourceTabId) {
  chrome.runtime.sendMessage({ type: MSG.OCR_ERROR, error }).catch(() => {});
  if (sourceTabId) {
    chrome.tabs.sendMessage(sourceTabId, { type: MSG.OCR_ERROR, error }).catch(() => {});
  }
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
      const htmlText = (msg.htmlText || '').trim();
      const cleanHtml = htmlText.replace(/\s+/g, ' ').trim();

      if (cleanHtml.length >= 10) {
        broadcastProgress('Extracting from page...', 0.5);

        let thumbnailData = null;
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          let { x, y, w, h } = msg.rect;
          w = Math.round(Math.abs(w)); h = Math.round(Math.abs(h));
          if (dataUrl && w > 0 && h > 0) {
            const bm = await createImageBitmap(dataUrlToBlob(dataUrl));
            x = Math.max(0, Math.min(x, bm.width - 1));
            y = Math.max(0, Math.min(y, bm.height - 1));
            w = Math.min(w, bm.width - x); h = Math.min(h, bm.height - y);
            const cv = new OffscreenCanvas(w, h);
            cv.getContext('2d').drawImage(bm, x, y, w, h, 0, 0, w, h);
            bm.close();
            thumbnailData = await imagePreprocessor.thumbnail(await cv.convertToBlob({ type: 'image/png' }));
          }
        } catch (_) {}

        const record = {
          sourceType: 'area-html',
          sourceUrl: tab.url || '',
          thumbnail: thumbnailData,
          rawText: htmlText,
          enhancedText: null,
          language: 'html',
          confidence: 100,
          timestamp: Date.now(),
        };
        let saved = record;
        try { saved = await historyDB.add(record); } catch (_) {}
        broadcastResult(saved, tab.id);
        return;
      }

      broadcastProgress('Capturing area...', 0);

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      if (!dataUrl || dataUrl.indexOf(',') === -1 || dataUrl.indexOf(',') === dataUrl.length - 1) {
        throw new Error('Area capture returned empty image. The page may not allow screenshots.');
      }

      let { x, y, w, h } = msg.rect;
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      w = Math.round(w);
      h = Math.round(h);
      if (w < 1 || h < 1) throw new Error('Selected area is too small');

      const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

      x = Math.max(0, Math.min(x, bitmap.width - 1));
      y = Math.max(0, Math.min(y, bitmap.height - 1));
      w = Math.min(w, bitmap.width - x);
      h = Math.min(h, bitmap.height - y);
      if (w < 1 || h < 1) {
        bitmap.close();
        throw new Error('Selected area is outside the captured image');
      }

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      bitmap.close();
      const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

      try {
        lastCapturedImageUrl = await imagePreprocessor.toDataUrl(croppedBlob);
      } catch (_) {}

      await runOcr(croppedBlob, tab.url, 'area', tab.id);
    } catch (err) {
      broadcastError(err.message, tab?.id);
    }
  },

  'ocr:rerunHD': async (msg, sender) => {
    const tab = sender.tab || (await getCurrentTab());
    try {
      if (!tab) throw new Error('No active tab');
      if (!lastCapturedImageUrl) throw new Error('No recent capture. Try OCR again first.');
      broadcastProgress('AI Vision re-reading...', 0.1);
      const imageForAi = lastCapturedImageUrl.length > 500000
        ? await imagePreprocessor.toDataUrl(lastCapturedImageUrl)
        : lastCapturedImageUrl;
      const text = await aiProcessor.ocrVision(imageForAi);

      const hdRecord = {
        sourceType: 'hd-rerun',
        sourceUrl: tab.url || '',
        thumbnail: null,
        rawText: text,
        enhancedText: null,
        language: 'ai-vision',
        confidence: 99,
        timestamp: Date.now(),
      };
      let saved = hdRecord;
      try { saved = await historyDB.add(hdRecord); } catch (_) {}
      broadcastResult(saved, tab.id);
    } catch (err) {
      broadcastError('HD: ' + err.message, tab?.id);
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

  'ocr:translate': async (msg, sender) => {
    try {
      const translated = await aiProcessor.translate(msg.text, msg.targetLang || 'auto');
      if (msg.recordId) {
        await historyDB.update(msg.recordId, { translatedText: translated });
      }
      const tab = sender.tab || (await getCurrentTab());
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'ocr:translated', text: translated }).catch(() => {});
      }
      return { translated };
    } catch (err) {
      return { error: err.message };
    }
  },

  [MSG.OPEN_SIDEPANEL]: async (msg, sender) => {
    const tab = sender.tab || (await getCurrentTab());
    if (tab) await chrome.sidePanel.open({ tabId: tab.id });
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
