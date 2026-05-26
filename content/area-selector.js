(function () {
  if (window.__ocrProAreaSelect) return;
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
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    overlay.appendChild(canvas);
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

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
    var cw = canvas.width / (window.devicePixelRatio || 1);
    var ch = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, cw, ch);
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, cw, ch);

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

    var htmlText = '';
    try { htmlText = extractTextFromRect(x, y, w, h); } catch (_) {}

    var dpr = window.devicePixelRatio || 1;
    var rect = {
      x: Math.round(x * dpr),
      y: Math.round(y * dpr),
      w: Math.round(w * dpr),
      h: Math.round(h * dpr),
    };
    requestAnimationFrame(function () {
      setTimeout(function () {
        chrome.runtime.sendMessage({
          type: 'capture:areaCoords',
          rect: rect,
          htmlText: htmlText || '',
        }).catch(function () {});
      }, 50);
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') removeOverlay();
  }

  function isInRect(elRect, rx, ry, rw, rh) {
    return elRect.right >= rx && elRect.left <= rx + rw &&
           elRect.bottom >= ry && elRect.top <= ry + rh &&
           elRect.width > 0 && elRect.height > 0;
  }

  function hasEmoji(str) {
    return /[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u.test(str);
  }

  function extractTextFromRect(rx, ry, rw, rh) {
    if (!document.body) return '';
    var items = [];
    var limit = 5000;
    var count = 0;

    // 1) Text nodes
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (++count > limit) break;
      var node = walker.currentNode;
      var text = node.textContent.trim();
      if (!text) continue;
      var el = node.parentElement;
      if (el && (el.offsetWidth === 0 || el.offsetHeight === 0)) continue;
      var range = document.createRange();
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) {
        if (isInRect(rects[i], rx, ry, rw, rh)) {
          items.push({ text: text, top: Math.round(rects[i].top), left: Math.round(rects[i].left) });
          break;
        }
      }
    }

    // 2) Emoji from <img alt="😊">, <span aria-label="👍">, etc.
    var emojiEls = document.body.querySelectorAll('img[alt], [aria-label], [data-emoji], [title]');
    for (var k = 0; k < emojiEls.length && k < 2000; k++) {
      var eel = emojiEls[k];
      var etext = eel.getAttribute('alt') || eel.getAttribute('aria-label') || eel.getAttribute('data-emoji') || '';
      if (!etext || !hasEmoji(etext)) {
        var titleAttr = eel.getAttribute('title') || '';
        if (titleAttr && hasEmoji(titleAttr)) etext = titleAttr;
        else continue;
      }
      var er = eel.getBoundingClientRect();
      if (isInRect(er, rx, ry, rw, rh)) {
        items.push({ text: etext, top: Math.round(er.top), left: Math.round(er.left) });
      }
    }

    // Sort by position and merge into lines
    items.sort(function (a, b) { return a.top - b.top || a.left - b.left; });
    var lines = [];
    var lastTop = -999;
    for (var j = 0; j < items.length; j++) {
      if (Math.abs(items[j].top - lastTop) < 5) {
        lines[lines.length - 1] += ' ' + items[j].text;
      } else {
        lines.push(items[j].text);
      }
      lastTop = items[j].top;
    }
    return lines.join('\n');
  }

  window.__ocrProAreaSelect = function () {
    if (overlay) removeOverlay();
    createOverlay();
  };
})();
