(function () {
  if (window.__ocrProWidget) return;
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

    var text = record.rawText || '';
    var preview = text.slice(0, 100);
    widget.innerHTML =
      '<div id="ocr-pro-widget-header">' +
        '<span>OCR Pro</span>' +
        '<button id="ocr-pro-widget-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div id="ocr-pro-widget-text">' + escapeHtml(preview) + (text.length > 100 ? '...' : '') + '</div>' +
      '<div id="ocr-pro-widget-actions">' +
        '<button id="ocr-pro-widget-copy">Copy</button>' +
        '<button id="ocr-pro-widget-translate" title="Translate text">Translate</button>' +
        '<button id="ocr-pro-widget-hd" title="Re-OCR with AI Vision">HD</button>' +
        '<button id="ocr-pro-widget-panel">Panel</button>' +
      '</div>';

    document.body.appendChild(widget);

    widget.querySelector('#ocr-pro-widget-close').addEventListener('click', removeWidget);

    var copyBtn = widget.querySelector('#ocr-pro-widget-copy');
    copyBtn.addEventListener('click', function () {
      var currentWidget = widget;
      var onCopied = function () {
        if (currentWidget && currentWidget.isConnected) {
          var btn = currentWidget.querySelector('#ocr-pro-widget-copy');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(function () { if (btn.isConnected) btn.textContent = 'Copy'; }, 1500); }
        }
      };
      try {
        navigator.clipboard.writeText(text).then(onCopied).catch(function () {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          onCopied();
        });
      } catch (_) {}
    });

    var translateBtn = widget.querySelector('#ocr-pro-widget-translate');
    translateBtn.addEventListener('click', function () {
      translateBtn.textContent = '...';
      translateBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'ocr:translate', text: text, recordId: record.id }).then(function (res) {
        if (res && res.translated) {
          var textDiv = widget.querySelector('#ocr-pro-widget-text');
          if (textDiv) textDiv.textContent = res.translated.slice(0, 200) + (res.translated.length > 200 ? '...' : '');
          text = res.translated;
          translateBtn.textContent = 'Translate';
          translateBtn.disabled = false;
          navigator.clipboard.writeText(res.translated).catch(function () {});
        } else {
          translateBtn.textContent = 'Error';
          setTimeout(function () { translateBtn.textContent = 'Translate'; translateBtn.disabled = false; }, 2000);
        }
      }).catch(function () {
        translateBtn.textContent = 'Translate';
        translateBtn.disabled = false;
      });
    });

    var hdBtn = widget.querySelector('#ocr-pro-widget-hd');
    hdBtn.addEventListener('click', function () {
      hdBtn.textContent = '...';
      hdBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'ocr:rerunHD', recordId: record.id }).catch(function () {
        hdBtn.textContent = 'HD';
        hdBtn.disabled = false;
      });
    });

    widget.querySelector('#ocr-pro-widget-panel').addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'ui:open-sidepanel' }).catch(function () {});
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
      clearTimeout(dismissTimer);
    });

    onMouseMove = function (e) {
      if (!isDragging) return;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      widget.style.left = (e.clientX - offsetX) + 'px';
      widget.style.top = (e.clientY - offsetY) + 'px';
    };

    onMouseUp = function () {
      isDragging = false;
      if (widget) widget.style.transition = '';
      dismissTimer = setTimeout(removeWidget, 10000);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    widget.addEventListener('mouseenter', function () { clearTimeout(dismissTimer); });
    widget.addEventListener('mouseleave', function () { dismissTimer = setTimeout(removeWidget, 5000); });

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
