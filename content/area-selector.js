(function () {
  var overlay = null;
  var canvas = null;
  var ctx = null;
  var sizeLabel = null;
  var startX, startY, curX, curY;
  var isSelecting = false;
  var savedOverflow = '';

  function createOverlay() {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.id = 'ocr-pro-overlay';

    // Full-screen canvas for snipping tool effect
    canvas = document.createElement('canvas');
    canvas.id = 'ocr-pro-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    overlay.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // Instructions
    var inst = document.createElement('div');
    inst.id = 'ocr-pro-instructions';
    inst.textContent = 'Drag to select area for OCR. Press Esc to cancel.';
    overlay.appendChild(inst);

    // Size label
    sizeLabel = document.createElement('div');
    sizeLabel.id = 'ocr-pro-size';
    sizeLabel.style.display = 'none';
    overlay.appendChild(sizeLabel);

    document.body.appendChild(overlay);

    drawDim();

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function drawDim(x, y, w, h) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (w && h && w > 0 && h > 0) {
      // Cut out the selection area (show original content)
      ctx.clearRect(x, y, w, h);
      // Draw selection border
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      // Corner handles
      var hs = 6;
      ctx.fillStyle = '#1a73e8';
      // top-left
      ctx.fillRect(x - hs/2, y - hs/2, hs, hs);
      // top-right
      ctx.fillRect(x + w - hs/2, y - hs/2, hs, hs);
      // bottom-left
      ctx.fillRect(x - hs/2, y + h - hs/2, hs, hs);
      // bottom-right
      ctx.fillRect(x + w - hs/2, y + h - hs/2, hs, hs);
    }
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      canvas = null;
      ctx = null;
      sizeLabel = null;
      isSelecting = false;
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = savedOverflow;
    }
  }

  function onMouseDown(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    curX = startX;
    curY = startY;
    var inst = overlay.querySelector('#ocr-pro-instructions');
    if (inst) inst.style.display = 'none';
    sizeLabel.style.display = 'block';
  }

  function onMouseMove(e) {
    if (!isSelecting) return;
    curX = e.clientX;
    curY = e.clientY;

    var x = Math.min(curX, startX);
    var y = Math.min(curY, startY);
    var w = Math.abs(curX - startX);
    var h = Math.abs(curY - startY);

    drawDim(x, y, w, h);

    // Show size label near cursor
    sizeLabel.textContent = w + ' × ' + h;
    sizeLabel.style.left = (x + w + 8) + 'px';
    sizeLabel.style.top = (y + h + 8) + 'px';
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
