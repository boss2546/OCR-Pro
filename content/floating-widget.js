(function () {
  var widget = null;
  var dismissTimer = null;
  var onMouseMove = null;
  var onMouseUp = null;

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showWidget(record) {
    removeWidget();

    widget = document.createElement('div');
    widget.id = 'ocr-pro-widget';

    var preview = (record.rawText || '').slice(0, 100);
    widget.innerHTML =
      '<div id="ocr-pro-widget-header">' +
        '<span>OCR Pro</span>' +
        '<button id="ocr-pro-widget-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div id="ocr-pro-widget-text">' + escapeHtml(preview) + (record.rawText.length > 100 ? '...' : '') + '</div>' +
      '<div id="ocr-pro-widget-actions">' +
        '<button id="ocr-pro-widget-copy">Copy</button>' +
        '<button id="ocr-pro-widget-panel">Open Panel</button>' +
      '</div>';

    document.body.appendChild(widget);

    widget.querySelector('#ocr-pro-widget-close').addEventListener('click', removeWidget);

    widget.querySelector('#ocr-pro-widget-copy').addEventListener('click', function () {
      navigator.clipboard.writeText(record.rawText).then(function () {
        var btn = document.querySelector('#ocr-pro-widget-copy');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(function () { if (btn) btn.textContent = 'Copy'; }, 1500); }
      });
    });

    widget.querySelector('#ocr-pro-widget-panel').addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'ui:open-sidepanel' });
      removeWidget();
    });

    // Draggable — with cleanup
    var header = widget.querySelector('#ocr-pro-widget-header');
    var isDragging = false, offsetX, offsetY;

    header.addEventListener('mousedown', function (e) {
      isDragging = true;
      offsetX = e.clientX - widget.getBoundingClientRect().left;
      offsetY = e.clientY - widget.getBoundingClientRect().top;
      widget.style.transition = 'none';
    });

    onMouseMove = function (e) {
      if (!isDragging) return;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      widget.style.left = (e.clientX - offsetX) + 'px';
      widget.style.top = (e.clientY - offsetY) + 'px';
    };

    onMouseUp = function () { isDragging = false; };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    dismissTimer = setTimeout(removeWidget, 10000);
  }

  function removeWidget() {
    clearTimeout(dismissTimer);
    if (onMouseMove) { document.removeEventListener('mousemove', onMouseMove); onMouseMove = null; }
    if (onMouseUp) { document.removeEventListener('mouseup', onMouseUp); onMouseUp = null; }
    if (widget) { widget.remove(); widget = null; }
  }

  window.__ocrProWidget = { showWidget: showWidget, removeWidget: removeWidget };
})();
