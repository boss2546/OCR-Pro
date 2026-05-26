const MSG = {
  OCR_PROGRESS: 'ocr:progress',
  OCR_RESULT: 'ocr:result',
  OCR_ERROR: 'ocr:error',
  CAPTURE_AREA: 'capture:area',
  CAPTURE_FULLPAGE: 'capture:fullpage',
  CAPTURE_IMAGE: 'capture:image',
  CAPTURE_UPLOAD: 'capture:upload',
  CAPTURE_URL: 'capture:url',
  AI_ENHANCE: 'ai:enhance',
  AI_RESULT: 'ai:result',
  AI_ERROR: 'ai:error',
  OPEN_SIDEPANEL: 'ui:open-sidepanel',
};

function send(type, data = {}) {
  return chrome.runtime.sendMessage({ ...data, type });
}

function sendToTab(tabId, type, data = {}) {
  return chrome.tabs.sendMessage(tabId, { ...data, type });
}

function onMessage(handlers) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (!handler) return false;
    try {
      const result = handler(message, sender);
      if (result instanceof Promise) {
        result.then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
      }
      if (result !== undefined) {
        sendResponse(result);
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return false;
  });
}

export { MSG, send, sendToTab, onMessage };
