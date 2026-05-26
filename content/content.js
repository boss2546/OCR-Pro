(function () {
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'capture:area') {
      if (window.__ocrProAreaSelect) {
        window.__ocrProAreaSelect();
      }
    }
    if (msg.type === 'ocr:result' && msg.record) {
      if (window.__ocrProWidget) {
        window.__ocrProWidget.showWidget(msg.record);
      }
    }
  });
})();
