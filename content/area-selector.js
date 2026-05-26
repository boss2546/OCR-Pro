(function () {
  var overlay = null;
  var selection = null;
  var startX, startY;
  var isSelecting = false;
  var savedOverflow = '';

  function createOverlay() {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.id = 'ocr-pro-overlay';
    overlay.innerHTML =
      '<div id="ocr-pro-instructions">Click and drag to select area for OCR. Press Escape to cancel.</div>' +
      '<div id="ocr-pro-selection"></div>';
    document.body.appendChild(overlay);
    selection = overlay.querySelector('#ocr-pro-selection');

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      selection = null;
      isSelecting = false;
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = savedOverflow;
    }
  }

  function onMouseDown(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
    var inst = overlay.querySelector('#ocr-pro-instructions');
    if (inst) inst.style.display = 'none';
  }

  function onMouseMove(e) {
    if (!isSelecting) return;
    var x = Math.min(e.clientX, startX);
    var y = Math.min(e.clientY, startY);
    var w = Math.abs(e.clientX - startX);
    var h = Math.abs(e.clientY - startY);
    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = w + 'px';
    selection.style.height = h + 'px';
  }

  function onMouseUp(e) {
    if (!isSelecting) return;
    isSelecting = false;

    var x = Math.min(e.clientX, startX);
    var y = Math.min(e.clientY, startY);
    var w = Math.abs(e.clientX - startX);
    var h = Math.abs(e.clientY - startY);

    removeOverlay();

    if (w < 10 || h < 10) return;

    var dpr = window.devicePixelRatio || 1;
    chrome.runtime.sendMessage({
      type: 'capture:areaCoords',
      rect: {
        x: Math.round(x * dpr),
        y: Math.round(y * dpr),
        w: Math.round(w * dpr),
        h: Math.round(h * dpr),
      },
    }).catch(function () {});
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') removeOverlay();
  }

  window.__ocrProAreaSelect = function () {
    if (overlay) removeOverlay();
    createOverlay();
  };
})();
