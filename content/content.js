(function () {
  if (window.__ocrProContentLoaded) return;
  window.__ocrProContentLoaded = true;

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'ping') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'capture:area') {
      if (window.__ocrProAreaSelect) {
        window.__ocrProAreaSelect();
      }
    }
    if (msg.type === 'extract:pageText') {
      try {
        sendResponse({ text: (document.body && document.body.innerText) || '' });
      } catch (_) {
        sendResponse({ text: '' });
      }
      return;
    }
    if (msg.type === 'ocr:result' && msg.record) {
      if (window.__ocrProWidget) {
        window.__ocrProWidget.showWidget(msg.record);
      }
    }
    if (msg.type === 'ocr:autoCopy' && msg.text) {
      navigator.clipboard.writeText(msg.text).then(function () {
        showCopyNotification();
      }).catch(function () {});
    }
  });

  function showCopyNotification() {
    var n = document.getElementById('ocr-pro-copy-toast');
    if (n) n.remove();
    n = document.createElement('div');
    n.id = 'ocr-pro-copy-toast';
    n.textContent = 'OCR text copied to clipboard';
    n.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1a73e8;color:#fff;padding:8px 20px;border-radius:8px;font:13px system-ui,sans-serif;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(n);
    setTimeout(function () { n.style.opacity = '0'; }, 2000);
    setTimeout(function () { n.remove(); }, 2500);
  }
})();
