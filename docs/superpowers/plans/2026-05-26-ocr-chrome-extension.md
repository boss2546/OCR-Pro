# OCR Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (Manifest V3) that performs client-side OCR using Tesseract.js, with AI post-processing to fix garbled text, supporting multiple capture methods (area select, right-click image, upload, URL, full page).

**Architecture:** Full client-side — Tesseract.js runs in a Web Worker for non-blocking OCR, results display in a Side Panel with history stored in IndexedDB, AI correction via user-configured OpenAI-compatible API. Popup provides quick actions, Content Script handles on-page area selection and floating result widget.

**Tech Stack:** Manifest V3, Vanilla JS (ES modules), Tesseract.js v5, IndexedDB, Web Workers, Chrome APIs (sidePanel, contextMenus, commands, storage)

---

## File Map

| File | Responsibility |
|------|---------------|
| `manifest.json` | Extension config, permissions, entry points |
| `icons/icon{16,48,128}.png` | Extension icons |
| `styles/shared.css` | CSS custom properties, theming, shared components |
| `lib/messaging.js` | Message passing between extension components |
| `lib/history-db.js` | IndexedDB wrapper for OCR history CRUD |
| `lib/image-preprocessor.js` | Canvas-based image enhancement before OCR |
| `lib/ocr-engine.js` | Tesseract.js manager, delegates to Web Worker |
| `lib/ai-processor.js` | OpenAI-compatible API client for text correction |
| `lib/export-manager.js` | Generate TXT/MD downloads |
| `worker/ocr-worker.js` | Web Worker running Tesseract.js |
| `background/service-worker.js` | Central coordinator, context menus, commands |
| `popup/popup.{html,css,js}` | Quick-action popup UI |
| `sidepanel/sidepanel.{html,css,js}` | Results, editing, history, export UI |
| `options/options.{html,css,js}` | Settings: languages, AI config, shortcuts, theme |
| `content/content.{js,css}` | Content script entry, coordinates area-selector & widget |
| `content/area-selector.js` | Drag-to-select overlay on web pages |
| `content/floating-widget.js` | Small result overlay after OCR |

---

### Task 1: Project Scaffold & Manifest

**Files:**
- Create: `manifest.json`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "OCR Pro",
  "version": "1.0.0",
  "description": "Powerful client-side OCR with AI text correction",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "activeTab",
    "contextMenus",
    "storage",
    "sidePanel",
    "clipboardWrite",
    "offscreen"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "options_page": "options/options.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "css": ["content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "ocr-area-select": {
      "suggested_key": {
        "default": "Ctrl+Shift+O",
        "mac": "Command+Shift+O"
      },
      "description": "Select area to OCR"
    },
    "ocr-full-page": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "Command+Shift+F"
      },
      "description": "OCR full page"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["worker/ocr-worker.js", "lib/*.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

- [ ] **Step 2: Generate placeholder SVG icons**

Create a simple OCR icon as an SVG, then convert to PNG. For now, create placeholder PNGs using a canvas-based generator script:

Create file `generate-icons.html` (temporary, delete after generating):

```html
<!DOCTYPE html>
<html>
<body>
<canvas id="c"></canvas>
<script>
[16, 48, 128].forEach(size => {
  const c = document.getElementById('c');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  // Background
  ctx.fillStyle = '#4285f4';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();
  // "T" letter representing text/OCR
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.6}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', size / 2, size / 2);
  // Scan line
  ctx.strokeStyle = '#34a853';
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.75);
  ctx.lineTo(size * 0.85, size * 0.75);
  ctx.stroke();

  const link = document.createElement('a');
  link.download = `icon${size}.png`;
  link.href = c.toDataURL();
  link.click();
});
</script>
</body>
</html>
```

Open this file in Chrome, it auto-downloads 3 icons. Move them to `icons/` directory. Then delete `generate-icons.html`.

- [ ] **Step 3: Create empty placeholder files for all modules**

Create every file from the file map with a minimal placeholder so the extension can load without errors:

`styles/shared.css` — empty file
`lib/messaging.js` — `export default {};`
`lib/history-db.js` — `export default {};`
`lib/image-preprocessor.js` — `export default {};`
`lib/ocr-engine.js` — `export default {};`
`lib/ai-processor.js` — `export default {};`
`lib/export-manager.js` — `export default {};`
`worker/ocr-worker.js` — empty file
`background/service-worker.js` — `console.log('OCR Pro service worker loaded');`
`popup/popup.html` — `<!DOCTYPE html><html><head><title>OCR Pro</title></head><body><p>Loading...</p></body></html>`
`popup/popup.css` — empty file
`popup/popup.js` — empty file
`sidepanel/sidepanel.html` — `<!DOCTYPE html><html><head><title>OCR Pro</title></head><body><p>Loading...</p></body></html>`
`sidepanel/sidepanel.css` — empty file
`sidepanel/sidepanel.js` — empty file
`options/options.html` — `<!DOCTYPE html><html><head><title>OCR Pro Settings</title></head><body><p>Loading...</p></body></html>`
`options/options.css` — empty file
`options/options.js` — empty file
`content/content.js` — empty file
`content/content.css` — empty file
`content/area-selector.js` — empty file
`content/floating-widget.js` — empty file

- [ ] **Step 4: Verify extension loads in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `OCR/` directory
4. Verify: extension appears with icon, no errors in the console
5. Click the extension icon → popup shows "Loading..."

- [ ] **Step 5: Commit**

```bash
cd /Users/meuu/Desktop/OCR
git init
git add -A
git commit -m "feat: project scaffold with manifest v3 and placeholder files"
```

---

### Task 2: Shared Styles & Theming

**Files:**
- Create: `styles/shared.css`

- [ ] **Step 1: Write shared.css with CSS custom properties for theming**

```css
:root {
  --color-primary: #4285f4;
  --color-primary-hover: #3367d6;
  --color-success: #34a853;
  --color-warning: #fbbc05;
  --color-error: #ea4335;

  --color-bg: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-bg-tertiary: #e8eaed;
  --color-text: #202124;
  --color-text-secondary: #5f6368;
  --color-border: #dadce0;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.2);

  --font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;

  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #202124;
    --color-bg-secondary: #292a2d;
    --color-bg-tertiary: #35363a;
    --color-text: #e8eaed;
    --color-text-secondary: #9aa0a6;
    --color-border: #5f6368;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}

[data-theme="dark"] {
  --color-bg: #202124;
  --color-bg-secondary: #292a2d;
  --color-bg-tertiary: #35363a;
  --color-text: #e8eaed;
  --color-text-secondary: #9aa0a6;
  --color-border: #5f6368;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-text-secondary);
}

.btn:active {
  transform: scale(0.97);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn-primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn-success {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--radius-sm);
}

.input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-family: var(--font-family);
  transition: border-color var(--transition-fast);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
}

.textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-family: var(--font-family);
  resize: vertical;
  min-height: 100px;
  transition: border-color var(--transition-fast);
}

.textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--spacing-sm);
  border-radius: 999px;
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.badge-success {
  background: rgba(52, 168, 83, 0.15);
  color: var(--color-success);
}

.badge-warning {
  background: rgba(251, 188, 5, 0.15);
  color: var(--color-warning);
}

.badge-error {
  background: rgba(234, 67, 53, 0.15);
  color: var(--color-error);
}

.toast {
  position: fixed;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-text);
  color: var(--color-bg);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-lg);
  opacity: 0;
  transition: all var(--transition-normal);
  z-index: 10000;
  pointer-events: none;
}

.toast.show {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width var(--transition-normal);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin-bottom: var(--spacing-md);
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--spacing-lg) 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/shared.css
git commit -m "feat: shared CSS with theming support (dark/light/system)"
```

---

### Task 3: Messaging Layer

**Files:**
- Create: `lib/messaging.js`

This module standardizes message passing between popup, side panel, service worker, content script, and options page.

- [ ] **Step 1: Write lib/messaging.js**

```js
const MSG = {
  OCR_START: 'ocr:start',
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
  COPY_TEXT: 'ui:copy-text',
  SETTINGS_CHANGED: 'settings:changed',
};

function send(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

function sendToTab(tabId, type, data = {}) {
  return chrome.tabs.sendMessage(tabId, { type, ...data });
}

function onMessage(handlers) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (!handler) return false;
    const result = handler(message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (result !== undefined) {
      sendResponse(result);
    }
    return false;
  });
}

export { MSG, send, sendToTab, onMessage };
```

- [ ] **Step 2: Commit**

```bash
git add lib/messaging.js
git commit -m "feat: message passing layer for inter-component communication"
```

---

### Task 4: History Database (IndexedDB)

**Files:**
- Create: `lib/history-db.js`

- [ ] **Step 1: Write lib/history-db.js**

```js
const DB_NAME = 'ocr-pro-history';
const DB_VERSION = 1;
const STORE_NAME = 'records';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('sourceType', 'sourceType', { unique: false });
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function tx(mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = fn(store);
      transaction.oncomplete = () => resolve(result._value);
      transaction.onerror = (e) => reject(e.target.error);
    });
  });
}

const historyDB = {
  add(record) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const entry = {
          ...record,
          timestamp: Date.now(),
        };
        const request = store.add(entry);
        request.onsuccess = () => {
          entry.id = request.result;
          resolve(entry);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  get(id) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  update(id, updates) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const record = { ...getReq.result, ...updates };
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(record);
          putReq.onerror = (e) => reject(e.target.error);
        };
        getReq.onerror = (e) => reject(e.target.error);
      });
    });
  },

  delete(id) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  getAll({ limit = 50, offset = 0 } = {}) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const results = [];
        let skipped = 0;
        const request = index.openCursor(null, 'prev');
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  search(query) {
    const q = query.toLowerCase();
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const results = [];
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          const record = cursor.value;
          const text = `${record.rawText || ''} ${record.enhancedText || ''}`.toLowerCase();
          if (text.includes(q)) {
            results.push(record);
          }
          cursor.continue();
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  clearAll() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  exportAll() {
    return this.getAll({ limit: Infinity });
  },
};

export default historyDB;
```

- [ ] **Step 2: Commit**

```bash
git add lib/history-db.js
git commit -m "feat: IndexedDB wrapper for OCR history CRUD and search"
```

---

### Task 5: Image Preprocessor

**Files:**
- Create: `lib/image-preprocessor.js`

Uses OffscreenCanvas (or regular Canvas) to enhance images before OCR.

- [ ] **Step 1: Write lib/image-preprocessor.js**

```js
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

async function loadImage(source) {
  if (source instanceof ImageBitmap) return source;
  if (source instanceof Blob) return createImageBitmap(source);
  if (typeof source === 'string') {
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error('Unsupported image source');
}

function grayscale(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = avg;
  }
  return imageData;
}

function adjustContrast(imageData, factor = 1.5) {
  const data = imageData.data;
  const intercept = 128 * (1 - factor);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept));
  }
  return imageData;
}

function threshold(imageData, level = 128) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] >= level ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = val;
  }
  return imageData;
}

function sharpen(imageData, width) {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const height = dst.length / 4 / width;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            val += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, val));
      }
    }
  }
  return imageData;
}

async function generateThumbnail(bitmap, maxWidth = 200) {
  const ratio = maxWidth / bitmap.width;
  const w = maxWidth;
  const h = Math.round(bitmap.height * ratio);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
  return canvas.toDataURL('image/jpeg', 0.6);
}

const imagePreprocessor = {
  async preprocess(source, options = {}) {
    const {
      doGrayscale = true,
      doContrast = true,
      contrastFactor = 1.5,
      doSharpen = true,
      doThreshold = false,
      thresholdLevel = 128,
    } = options;

    const bitmap = await loadImage(source);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    let imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    if (doGrayscale) imageData = grayscale(imageData);
    if (doContrast) imageData = adjustContrast(imageData, contrastFactor);
    if (doSharpen) imageData = sharpen(imageData, bitmap.width);
    if (doThreshold) imageData = threshold(imageData, thresholdLevel);

    ctx.putImageData(imageData, 0, 0);

    if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type: 'image/png' });
    }
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  },

  async thumbnail(source) {
    const bitmap = await loadImage(source);
    return generateThumbnail(bitmap);
  },
};

export default imagePreprocessor;
```

- [ ] **Step 2: Commit**

```bash
git add lib/image-preprocessor.js
git commit -m "feat: image preprocessor with grayscale, contrast, sharpen, threshold"
```

---

### Task 6: OCR Worker & Engine

**Files:**
- Create: `worker/ocr-worker.js`
- Create: `lib/ocr-engine.js`

- [ ] **Step 1: Write worker/ocr-worker.js**

This Web Worker loads Tesseract.js from CDN and performs OCR.

```js
importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;

async function initWorker(langs) {
  if (worker) {
    await worker.terminate();
  }
  worker = await Tesseract.createWorker(langs, 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
    logger: (info) => {
      if (info.status === 'recognizing text') {
        self.postMessage({ type: 'progress', progress: info.progress });
      }
    },
  });
  return worker;
}

self.onmessage = async (e) => {
  const { type, imageData, langs } = e.data;

  if (type === 'recognize') {
    try {
      const w = await initWorker(langs || 'eng');
      const result = await w.recognize(imageData);
      self.postMessage({
        type: 'result',
        text: result.data.text,
        confidence: result.data.confidence,
        blocks: result.data.blocks,
      });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    self.postMessage({ type: 'terminated' });
  }
};
```

- [ ] **Step 2: Write lib/ocr-engine.js**

```js
const ocrEngine = {
  _worker: null,
  _listeners: new Map(),

  _getWorker() {
    if (!this._worker) {
      this._worker = new Worker(chrome.runtime.getURL('worker/ocr-worker.js'));
      this._worker.onmessage = (e) => {
        const { type } = e.data;
        const cbs = this._listeners.get(type);
        if (cbs) cbs.forEach(cb => cb(e.data));
      };
    }
    return this._worker;
  },

  on(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
  },

  off(type, callback) {
    const cbs = this._listeners.get(type);
    if (cbs) cbs.delete(callback);
  },

  recognize(imageData, langs = 'eng') {
    return new Promise((resolve, reject) => {
      const worker = this._getWorker();

      const onResult = (data) => {
        cleanup();
        resolve({
          text: data.text,
          confidence: data.confidence,
          blocks: data.blocks,
        });
      };

      const onError = (data) => {
        cleanup();
        reject(new Error(data.error));
      };

      const cleanup = () => {
        this.off('result', onResult);
        this.off('error', onError);
      };

      this.on('result', onResult);
      this.on('error', onError);

      worker.postMessage({ type: 'recognize', imageData, langs });
    });
  },

  onProgress(callback) {
    this.on('progress', callback);
    return () => this.off('progress', callback);
  },

  terminate() {
    if (this._worker) {
      this._worker.postMessage({ type: 'terminate' });
      this._worker = null;
      this._listeners.clear();
    }
  },
};

export default ocrEngine;
```

- [ ] **Step 3: Commit**

```bash
git add worker/ocr-worker.js lib/ocr-engine.js
git commit -m "feat: Tesseract.js OCR engine with Web Worker"
```

---

### Task 7: AI Processor

**Files:**
- Create: `lib/ai-processor.js`

- [ ] **Step 1: Write lib/ai-processor.js**

```js
const DEFAULT_SYSTEM_PROMPT = `You are an OCR text correction assistant. Fix OCR errors in the provided text:
- Correct misspellings and broken characters
- Restore proper formatting (paragraphs, lists, headings)
- Fix garbled Thai, English, and other language text
- Do not change the meaning of the text
- Return only the corrected text, no explanations`;

async function getConfig() {
  const result = await chrome.storage.local.get({
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  });
  return result;
}

const aiProcessor = {
  async isConfigured() {
    const config = await getConfig();
    return !!(config.aiApiUrl && config.aiApiKey && config.aiModel);
  },

  async testConnection() {
    const config = await getConfig();
    if (!config.aiApiUrl || !config.aiApiKey || !config.aiModel) {
      return { success: false, error: 'API URL, Key, and Model are required' };
    }
    try {
      const response = await fetch(config.aiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.aiApiKey}`,
        },
        body: JSON.stringify({
          model: config.aiModel,
          messages: [
            { role: 'system', content: 'Reply with OK' },
            { role: 'user', content: 'Test' },
          ],
          max_tokens: 10,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
      }
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      return { success: true, reply };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async enhance(rawText) {
    const config = await getConfig();
    if (!config.aiApiUrl || !config.aiApiKey || !config.aiModel) {
      throw new Error('AI not configured. Go to Options to set up API.');
    }

    const response = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          { role: 'system', content: config.aiSystemPrompt },
          { role: 'user', content: rawText },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI API error: HTTP ${response.status} — ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content;
    if (!enhanced) {
      throw new Error('AI returned empty response');
    }
    return enhanced.trim();
  },
};

export default aiProcessor;
export { DEFAULT_SYSTEM_PROMPT };
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai-processor.js
git commit -m "feat: AI processor for OCR text correction via OpenAI-compatible API"
```

---

### Task 8: Export Manager

**Files:**
- Create: `lib/export-manager.js`

- [ ] **Step 1: Write lib/export-manager.js**

```js
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const exportManager = {
  downloadTxt(text, filename) {
    const name = filename || `ocr-${timestamp()}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, name);
  },

  downloadMd(text, filename) {
    const name = filename || `ocr-${timestamp()}.md`;
    const content = `# OCR Result\n\n${text}\n`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, name);
  },

  async copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
  },
};

export default exportManager;
```

- [ ] **Step 2: Commit**

```bash
git add lib/export-manager.js
git commit -m "feat: export manager for TXT, MD downloads and clipboard"
```

---

### Task 9: Service Worker (Background)

**Files:**
- Create: `background/service-worker.js`

The service worker is the central coordinator. It handles context menus, keyboard commands, tab capture, and routes messages between components.

- [ ] **Step 1: Write background/service-worker.js**

```js
import { MSG, onMessage, sendToTab } from '../lib/messaging.js';
import historyDB from '../lib/history-db.js';
import ocrEngine from '../lib/ocr-engine.js';
import aiProcessor from '../lib/ai-processor.js';
import imagePreprocessor from '../lib/image-preprocessor.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ocr-image',
    title: 'OCR this image',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: 'ocr-selection',
    title: 'OCR selected area',
    contexts: ['page', 'frame'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ocr-image' && info.srcUrl) {
    await processImageUrl(info.srcUrl, tab, 'image');
  }
  if (info.menuItemId === 'ocr-selection') {
    sendToTab(tab.id, MSG.CAPTURE_AREA);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'ocr-area-select') {
    sendToTab(tab.id, MSG.CAPTURE_AREA);
  }
  if (command === 'ocr-full-page') {
    await captureFullPage(tab);
  }
});

chrome.action.onClicked.addListener(() => {});

async function captureFullPage(tab) {
  try {
    broadcastProgress('Capturing page...', 0);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await runOcr(dataUrl, tab.url, 'fullpage');
  } catch (err) {
    broadcastError(err.message);
  }
}

async function processImageUrl(url, tab, sourceType) {
  try {
    broadcastProgress('Fetching image...', 0);
    const response = await fetch(url);
    const blob = await response.blob();
    await runOcr(blob, tab?.url || url, sourceType);
  } catch (err) {
    broadcastError(err.message);
  }
}

async function runOcr(imageSource, sourceUrl, sourceType) {
  try {
    broadcastProgress('Preprocessing...', 0.05);

    const settings = await chrome.storage.local.get({ ocrLanguages: 'eng+tha' });
    const langs = settings.ocrLanguages;

    const preprocessed = await imagePreprocessor.preprocess(imageSource);
    const thumbnailData = await imagePreprocessor.thumbnail(imageSource);

    broadcastProgress('Running OCR...', 0.1);

    const unsubProgress = ocrEngine.onProgress((data) => {
      broadcastProgress('Running OCR...', 0.1 + data.progress * 0.85);
    });

    const result = await ocrEngine.recognize(preprocessed, langs);
    unsubProgress();

    const record = await historyDB.add({
      sourceType,
      sourceUrl: sourceUrl || '',
      thumbnail: thumbnailData,
      rawText: result.text,
      enhancedText: null,
      language: langs,
      confidence: result.confidence,
    });

    broadcastResult(record);
  } catch (err) {
    broadcastError(err.message);
  }
}

function broadcastProgress(status, progress) {
  chrome.runtime.sendMessage({ type: MSG.OCR_PROGRESS, status, progress }).catch(() => {});
}

function broadcastResult(record) {
  chrome.runtime.sendMessage({ type: MSG.OCR_RESULT, record }).catch(() => {});
}

function broadcastError(error) {
  chrome.runtime.sendMessage({ type: MSG.OCR_ERROR, error }).catch(() => {});
}

onMessage({
  [MSG.CAPTURE_FULLPAGE]: async (msg, sender) => {
    const tab = sender.tab || (await getCurrentTab());
    await captureFullPage(tab);
  },

  [MSG.CAPTURE_IMAGE]: async (msg) => {
    await processImageUrl(msg.url, null, 'image');
  },

  [MSG.CAPTURE_URL]: async (msg) => {
    await processImageUrl(msg.url, null, 'url');
  },

  [MSG.CAPTURE_UPLOAD]: async (msg) => {
    await runOcr(msg.imageData, msg.filename || 'upload', 'upload');
  },

  [MSG.CAPTURE_AREA]: async (msg, sender) => {
    if (msg.imageData) {
      await runOcr(msg.imageData, sender.tab?.url || '', 'area');
    } else {
      const tab = sender.tab || (await getCurrentTab());
      sendToTab(tab.id, MSG.CAPTURE_AREA);
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
    if (tab) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
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

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
```

- [ ] **Step 2: Verify extension loads without errors**

1. Reload the extension in `chrome://extensions`
2. Open the service worker console (click "Service Worker" link)
3. Verify no import errors

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: service worker with OCR pipeline, context menus, and message routing"
```

---

### Task 10: Popup UI

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

- [ ] **Step 1: Write popup/popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=400">
  <link rel="stylesheet" href="../styles/shared.css">
  <link rel="stylesheet" href="popup.css">
  <title>OCR Pro</title>
</head>
<body>
  <div class="popup">
    <header class="popup-header">
      <div class="popup-logo">
        <img src="../icons/icon48.png" alt="" width="24" height="24">
        <span class="popup-title">OCR Pro</span>
      </div>
      <button class="btn btn-icon" id="btn-settings" title="Settings" aria-label="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4zm0 1a3 3 0 110-6 3 3 0 010 6z"/>
          <path d="M6.5.5a.5.5 0 01.5.5v1.02a5.5 5.5 0 011.98.37l.72-.72a.5.5 0 01.71.71l-.72.72c.4.38.74.82 1.01 1.32l.99-.27a.5.5 0 01.26.97l-.99.27a5.5 5.5 0 01.04 2.1l.99.27a.5.5 0 01-.26.97l-.99-.27c-.27.5-.61.94-1.01 1.32l.72.72a.5.5 0 01-.71.71l-.72-.72A5.5 5.5 0 017 14.48V15.5a.5.5 0 01-1 0v-1.02a5.5 5.5 0 01-1.98-.37l-.72.72a.5.5 0 01-.71-.71l.72-.72a5.5 5.5 0 01-1.01-1.32l-.99.27a.5.5 0 01-.26-.97l.99-.27a5.5 5.5 0 01-.04-2.1l-.99-.27A.5.5 0 011.27 8l.99.27c.27-.5.61-.94 1.01-1.32l-.72-.72a.5.5 0 01.71-.71l.72.72A5.5 5.5 0 016 4.52V1a.5.5 0 01.5-.5z"/>
        </svg>
      </button>
    </header>

    <div class="popup-actions">
      <button class="btn btn-primary" id="btn-area">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 012.5 1h3a.5.5 0 010 1h-3a.5.5 0 00-.5.5v3a.5.5 0 01-1 0v-3zm12 0a.5.5 0 00-.5-.5h-3a.5.5 0 010-1h3A1.5 1.5 0 0114.5 2.5v3a.5.5 0 01-1 0v-3zM1.5 10a.5.5 0 01.5.5v3a.5.5 0 00.5.5h3a.5.5 0 010 1h-3A1.5 1.5 0 011 13.5v-3a.5.5 0 01.5-.5zm13 0a.5.5 0 01.5.5v3a1.5 1.5 0 01-1.5 1.5h-3a.5.5 0 010-1h3a.5.5 0 00.5-.5v-3a.5.5 0 01.5-.5z"/></svg>
        Select Area
      </button>
      <button class="btn btn-primary" id="btn-fullpage">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V2a2 2 0 00-2-2H4zm0 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"/><path d="M4.5 3h7a.5.5 0 010 1h-7a.5.5 0 010-1zm0 2h7a.5.5 0 010 1h-7a.5.5 0 010-1zm0 2h4a.5.5 0 010 1h-4a.5.5 0 010-1z"/></svg>
        Full Page
      </button>
    </div>

    <div class="popup-upload" id="upload-zone">
      <input type="file" id="file-input" accept="image/*,.pdf" hidden>
      <div class="upload-content">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="var(--color-text-secondary)"><path d="M4.406 1.342A5.53 5.53 0 018 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 010-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 00-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 010 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/><path d="M7.646 4.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 5.707V14.5a.5.5 0 01-1 0V5.707L5.354 7.854a.5.5 0 11-.708-.708l3-3z"/></svg>
        <p>Drop image/PDF here or <a href="#" id="btn-browse">browse</a></p>
      </div>
    </div>

    <div class="popup-url">
      <input type="text" class="input" id="url-input" placeholder="Paste image URL...">
      <button class="btn btn-primary btn-sm" id="btn-url-ocr">OCR</button>
    </div>

    <div class="popup-lang">
      <label for="lang-select">Language:</label>
      <select class="input" id="lang-select" style="width:auto;flex:1">
        <option value="eng">English</option>
        <option value="tha">Thai</option>
        <option value="eng+tha" selected>English + Thai</option>
        <option value="jpn">Japanese</option>
        <option value="chi_sim">Chinese (Simplified)</option>
        <option value="chi_tra">Chinese (Traditional)</option>
        <option value="kor">Korean</option>
      </select>
    </div>

    <div class="popup-status" id="status-area" hidden>
      <div class="progress-bar">
        <div class="progress-bar-fill" id="progress-fill" style="width:0%"></div>
      </div>
      <p class="status-text" id="status-text">Ready</p>
    </div>

    <div class="popup-result" id="result-area" hidden>
      <p class="result-preview" id="result-preview"></p>
      <button class="btn btn-sm" id="btn-open-panel">Open in Side Panel</button>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script src="popup.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Write popup/popup.css**

```css
.popup {
  width: 380px;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popup-logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.popup-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.popup-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.popup-actions .btn {
  flex: 1;
  padding: var(--spacing-md);
}

.popup-upload {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.popup-upload:hover,
.popup-upload.dragover {
  border-color: var(--color-primary);
  background: rgba(66, 133, 244, 0.05);
}

.upload-content p {
  margin-top: var(--spacing-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.upload-content a {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
}

.popup-url {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

.popup-url .input {
  flex: 1;
}

.popup-lang {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.popup-status {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.status-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-align: center;
}

.popup-result {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.result-preview {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  max-height: 80px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 3: Write popup/popup.js**

```js
import { MSG, send } from '../lib/messaging.js';

const $ = (sel) => document.querySelector(sel);

const btnArea = $('#btn-area');
const btnFullpage = $('#btn-fullpage');
const btnSettings = $('#btn-settings');
const btnBrowse = $('#btn-browse');
const btnUrlOcr = $('#btn-url-ocr');
const btnOpenPanel = $('#btn-open-panel');
const fileInput = $('#file-input');
const urlInput = $('#url-input');
const langSelect = $('#lang-select');
const uploadZone = $('#upload-zone');
const statusArea = $('#status-area');
const progressFill = $('#progress-fill');
const statusText = $('#status-text');
const resultArea = $('#result-area');
const resultPreview = $('#result-preview');
const toast = $('#toast');

let lastRecordId = null;

async function init() {
  const settings = await chrome.storage.local.get({ ocrLanguages: 'eng+tha' });
  langSelect.value = settings.ocrLanguages;

  langSelect.addEventListener('change', () => {
    chrome.storage.local.set({ ocrLanguages: langSelect.value });
  });
}

btnArea.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: MSG.CAPTURE_AREA });
  window.close();
});

btnFullpage.addEventListener('click', () => {
  send(MSG.CAPTURE_FULLPAGE);
  showStatus('Capturing page...', 0);
});

btnSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

btnBrowse.addEventListener('click', (e) => {
  e.preventDefault();
  fileInput.click();
});

uploadZone.addEventListener('click', () => {
  fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) processFile(file);
});

async function processFile(file) {
  showStatus('Reading file...', 0);
  const reader = new FileReader();
  reader.onload = () => {
    send(MSG.CAPTURE_UPLOAD, { imageData: reader.result, filename: file.name });
  };
  reader.readAsDataURL(file);
}

btnUrlOcr.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return;
  send(MSG.CAPTURE_URL, { url });
  showStatus('Fetching image...', 0);
});

btnOpenPanel.addEventListener('click', () => {
  send(MSG.OPEN_SIDEPANEL);
  window.close();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.OCR_PROGRESS) {
    showStatus(msg.status, msg.progress);
  }
  if (msg.type === MSG.OCR_RESULT) {
    hideStatus();
    showResult(msg.record);
  }
  if (msg.type === MSG.OCR_ERROR) {
    hideStatus();
    showToast(`Error: ${msg.error}`);
  }
});

function showStatus(text, progress) {
  statusArea.hidden = false;
  statusText.textContent = text;
  progressFill.style.width = `${Math.round(progress * 100)}%`;
}

function hideStatus() {
  statusArea.hidden = true;
}

function showResult(record) {
  lastRecordId = record.id;
  resultArea.hidden = false;
  resultPreview.textContent = record.rawText.slice(0, 300);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

init();
```

- [ ] **Step 4: Verify popup works**

1. Reload extension
2. Click extension icon
3. Verify popup renders with all buttons, upload zone, URL input, language selector

- [ ] **Step 5: Commit**

```bash
git add popup/
git commit -m "feat: popup UI with OCR actions, file upload, URL input"
```

---

### Task 11: Side Panel UI

**Files:**
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`
- Create: `sidepanel/sidepanel.js`

- [ ] **Step 1: Write sidepanel/sidepanel.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="../styles/shared.css">
  <link rel="stylesheet" href="sidepanel.css">
  <title>OCR Pro</title>
</head>
<body>
  <div class="panel">
    <div class="panel-tabs">
      <button class="tab active" data-tab="result">Result</button>
      <button class="tab" data-tab="history">History</button>
    </div>

    <!-- Result Tab -->
    <div class="tab-content active" id="tab-result">
      <div class="result-empty" id="result-empty">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="var(--color-text-secondary)"><path d="M4.406 1.342A5.53 5.53 0 018 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 010-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 00-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 010 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/></svg>
        <p>No OCR result yet. Use the popup or keyboard shortcut to start.</p>
      </div>

      <div class="result-content" id="result-content" hidden>
        <div class="result-meta" id="result-meta">
          <span class="badge" id="confidence-badge"></span>
          <span class="meta-text" id="meta-source"></span>
        </div>

        <div class="result-toolbar">
          <button class="btn btn-sm btn-success" id="btn-ai-enhance">
            <span class="spinner" id="ai-spinner" hidden></span>
            AI Enhance
          </button>
          <button class="btn btn-sm" id="btn-copy">Copy</button>
          <button class="btn btn-sm" id="btn-download-txt">TXT</button>
          <button class="btn btn-sm" id="btn-download-md">MD</button>
          <label class="btn btn-sm" id="btn-diff-toggle">
            <input type="checkbox" id="diff-checkbox"> Diff
          </label>
        </div>

        <div class="result-progress" id="ai-progress" hidden>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:100%;animation:pulse 1.5s ease-in-out infinite"></div>
          </div>
          <p class="status-text">AI is enhancing text...</p>
        </div>

        <div id="text-display">
          <textarea class="textarea" id="result-text" rows="15" placeholder="OCR result will appear here..."></textarea>
        </div>

        <div id="diff-display" hidden>
          <div class="diff-container">
            <div class="diff-col">
              <h4>Original</h4>
              <pre class="diff-text" id="diff-original"></pre>
            </div>
            <div class="diff-col">
              <h4>AI Enhanced</h4>
              <pre class="diff-text" id="diff-enhanced"></pre>
            </div>
          </div>
          <div class="diff-actions">
            <button class="btn btn-sm btn-success" id="btn-accept-ai">Accept AI</button>
            <button class="btn btn-sm" id="btn-reject-ai">Keep Original</button>
          </div>
        </div>
      </div>
    </div>

    <!-- History Tab -->
    <div class="tab-content" id="tab-history">
      <div class="history-search">
        <input type="text" class="input" id="history-search-input" placeholder="Search history...">
      </div>
      <div class="history-list" id="history-list">
        <p class="history-empty">No history yet</p>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script src="sidepanel.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Write sidepanel/sidepanel.css**

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.panel {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--spacing-md);
}

.tab {
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  font-family: var(--font-family);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all var(--transition-fast);
}

.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}

.tab:hover {
  color: var(--color-text);
}

.tab-content {
  display: none;
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

.tab-content.active {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.result-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl) 0;
  color: var(--color-text-secondary);
  text-align: center;
  flex: 1;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xs);
}

.meta-text {
  color: var(--color-text-secondary);
}

.result-toolbar {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.result-toolbar .btn {
  gap: var(--spacing-xs);
}

#diff-checkbox {
  margin-right: 2px;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  flex: 1;
}

.result-content .textarea {
  flex: 1;
  min-height: 200px;
  font-size: var(--font-size-sm);
}

.diff-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

.diff-col h4 {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.diff-text {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-family: var(--font-family);
}

.diff-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.history-search {
  margin-bottom: var(--spacing-sm);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.history-empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--spacing-xl) 0;
}

.history-item {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.history-item:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-primary);
}

.history-thumb {
  width: 60px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--color-bg-tertiary);
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-date {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.history-preview {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-actions {
  display: flex;
  align-items: center;
}
```

- [ ] **Step 3: Write sidepanel/sidepanel.js**

```js
import { MSG, send } from '../lib/messaging.js';
import exportManager from '../lib/export-manager.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const tabs = $$('.tab');
const tabContents = $$('.tab-content');
const resultEmpty = $('#result-empty');
const resultContent = $('#result-content');
const resultText = $('#result-text');
const confidenceBadge = $('#confidence-badge');
const metaSource = $('#meta-source');
const btnAiEnhance = $('#btn-ai-enhance');
const aiSpinner = $('#ai-spinner');
const aiProgress = $('#ai-progress');
const btnCopy = $('#btn-copy');
const btnDownloadTxt = $('#btn-download-txt');
const btnDownloadMd = $('#btn-download-md');
const diffCheckbox = $('#diff-checkbox');
const textDisplay = $('#text-display');
const diffDisplay = $('#diff-display');
const diffOriginal = $('#diff-original');
const diffEnhanced = $('#diff-enhanced');
const btnAcceptAi = $('#btn-accept-ai');
const btnRejectAi = $('#btn-reject-ai');
const historySearchInput = $('#history-search-input');
const historyList = $('#history-list');
const toast = $('#toast');

let currentRecord = null;
let enhancedText = null;

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $(`#tab-${target}`).classList.add('active');
    if (target === 'history') loadHistory();
  });
});

function showResult(record) {
  currentRecord = record;
  enhancedText = record.enhancedText || null;

  resultEmpty.hidden = true;
  resultContent.hidden = false;

  resultText.value = enhancedText || record.rawText;

  const conf = Math.round(record.confidence);
  confidenceBadge.textContent = `${conf}% confidence`;
  confidenceBadge.className = `badge ${conf >= 80 ? 'badge-success' : conf >= 50 ? 'badge-warning' : 'badge-error'}`;

  metaSource.textContent = `${record.sourceType} • ${new Date(record.timestamp).toLocaleString()}`;

  diffCheckbox.checked = false;
  textDisplay.hidden = false;
  diffDisplay.hidden = true;
}

btnAiEnhance.addEventListener('click', async () => {
  if (!currentRecord) return;
  const text = resultText.value || currentRecord.rawText;

  aiSpinner.hidden = false;
  aiProgress.hidden = false;
  btnAiEnhance.disabled = true;

  try {
    const response = await send(MSG.AI_ENHANCE, {
      text,
      recordId: currentRecord.id,
    });

    if (response.error) {
      showToast(`AI Error: ${response.error}`);
      return;
    }

    enhancedText = response.enhanced;
    resultText.value = enhancedText;
    diffOriginal.textContent = currentRecord.rawText;
    diffEnhanced.textContent = enhancedText;

    showToast('AI enhancement complete!');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    aiSpinner.hidden = true;
    aiProgress.hidden = true;
    btnAiEnhance.disabled = false;
  }
});

btnCopy.addEventListener('click', async () => {
  const text = resultText.value;
  if (!text) return;
  await exportManager.copyToClipboard(text);
  showToast('Copied to clipboard!');
});

btnDownloadTxt.addEventListener('click', () => {
  exportManager.downloadTxt(resultText.value);
});

btnDownloadMd.addEventListener('click', () => {
  exportManager.downloadMd(resultText.value);
});

diffCheckbox.addEventListener('change', () => {
  if (diffCheckbox.checked && enhancedText) {
    textDisplay.hidden = true;
    diffDisplay.hidden = false;
    diffOriginal.textContent = currentRecord.rawText;
    diffEnhanced.textContent = enhancedText;
  } else {
    textDisplay.hidden = false;
    diffDisplay.hidden = true;
  }
});

btnAcceptAi.addEventListener('click', () => {
  resultText.value = enhancedText;
  diffCheckbox.checked = false;
  textDisplay.hidden = false;
  diffDisplay.hidden = true;
  showToast('AI text accepted');
});

btnRejectAi.addEventListener('click', () => {
  enhancedText = null;
  resultText.value = currentRecord.rawText;
  diffCheckbox.checked = false;
  textDisplay.hidden = false;
  diffDisplay.hidden = true;
  showToast('Reverted to original');
});

async function loadHistory() {
  try {
    const records = await send('history:getAll', { limit: 50 });
    renderHistory(records || []);
  } catch {
    renderHistory([]);
  }
}

let searchTimeout;
historySearchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const query = historySearchInput.value.trim();
    if (!query) {
      loadHistory();
      return;
    }
    const records = await send('history:search', { query });
    renderHistory(records || []);
  }, 300);
});

function renderHistory(records) {
  if (!records.length) {
    historyList.innerHTML = '<p class="history-empty">No history yet</p>';
    return;
  }

  historyList.innerHTML = records.map(r => `
    <div class="history-item" data-id="${r.id}">
      ${r.thumbnail ? `<img class="history-thumb" src="${r.thumbnail}" alt="">` : '<div class="history-thumb"></div>'}
      <div class="history-info">
        <div class="history-date">${new Date(r.timestamp).toLocaleString()} • ${r.sourceType}</div>
        <div class="history-preview">${escapeHtml((r.enhancedText || r.rawText).slice(0, 100))}</div>
      </div>
      <div class="history-actions">
        <button class="btn btn-sm btn-delete" data-id="${r.id}" title="Delete">✕</button>
      </div>
    </div>
  `).join('');

  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-delete')) return;
      const id = Number(item.dataset.id);
      const record = await send('history:get', { id });
      if (record) {
        showResult(record);
        tabs[0].click();
      }
    });
  });

  historyList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      await send('history:delete', { id });
      loadHistory();
      showToast('Record deleted');
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.OCR_RESULT) {
    showResult(msg.record);
  }
  if (msg.type === MSG.OCR_ERROR) {
    showToast(`OCR Error: ${msg.error}`);
  }
});

loadHistory();
```

- [ ] **Step 4: Verify side panel renders**

1. Reload extension
2. Right-click extension icon → "Open side panel"
3. Verify: tabs (Result/History), empty state message, history tab works

- [ ] **Step 5: Commit**

```bash
git add sidepanel/
git commit -m "feat: side panel with result display, AI enhance, diff view, and history"
```

---

### Task 12: Options Page

**Files:**
- Create: `options/options.html`
- Create: `options/options.css`
- Create: `options/options.js`

- [ ] **Step 1: Write options/options.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="../styles/shared.css">
  <link rel="stylesheet" href="options.css">
  <title>OCR Pro — Settings</title>
</head>
<body>
  <div class="options">
    <h1>OCR Pro Settings</h1>

    <section class="card">
      <h2 class="section-title">OCR Language</h2>
      <p class="section-desc">Select default languages for OCR recognition.</p>
      <select class="input" id="lang-select">
        <option value="eng">English</option>
        <option value="tha">Thai</option>
        <option value="eng+tha">English + Thai</option>
        <option value="jpn">Japanese</option>
        <option value="chi_sim">Chinese (Simplified)</option>
        <option value="chi_tra">Chinese (Traditional)</option>
        <option value="kor">Korean</option>
        <option value="fra">French</option>
        <option value="deu">German</option>
        <option value="spa">Spanish</option>
        <option value="rus">Russian</option>
        <option value="ara">Arabic</option>
        <option value="hin">Hindi</option>
      </select>
    </section>

    <section class="card">
      <h2 class="section-title">AI Configuration</h2>
      <p class="section-desc">Connect to any OpenAI-compatible API to enhance OCR results.</p>

      <div class="form-group">
        <label for="ai-url">API URL</label>
        <input type="url" class="input" id="ai-url" placeholder="https://api.openai.com/v1/chat/completions">
      </div>

      <div class="form-group">
        <label for="ai-key">API Key</label>
        <div class="input-with-toggle">
          <input type="password" class="input" id="ai-key" placeholder="sk-...">
          <button class="btn btn-sm" id="btn-toggle-key" type="button">Show</button>
        </div>
      </div>

      <div class="form-group">
        <label for="ai-model">Model</label>
        <input type="text" class="input" id="ai-model" placeholder="gpt-4o, claude-sonnet-4-6, etc.">
      </div>

      <div class="form-group">
        <label for="ai-prompt">System Prompt</label>
        <textarea class="textarea" id="ai-prompt" rows="5"></textarea>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="btn-test-api">Test Connection</button>
        <span class="test-status" id="test-status"></span>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Appearance</h2>
      <div class="theme-options">
        <label class="theme-option">
          <input type="radio" name="theme" value="system" checked>
          <span>System</span>
        </label>
        <label class="theme-option">
          <input type="radio" name="theme" value="light">
          <span>Light</span>
        </label>
        <label class="theme-option">
          <input type="radio" name="theme" value="dark">
          <span>Dark</span>
        </label>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Keyboard Shortcuts</h2>
      <p class="section-desc">
        Manage shortcuts in <a href="chrome://extensions/shortcuts" id="shortcuts-link">Chrome Extension Shortcuts</a>.
      </p>
      <div class="shortcut-list">
        <div class="shortcut-item">
          <span>Select Area OCR</span>
          <kbd>Ctrl+Shift+O</kbd>
        </div>
        <div class="shortcut-item">
          <span>Full Page OCR</span>
          <kbd>Ctrl+Shift+F</kbd>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Data Management</h2>
      <div class="form-actions">
        <button class="btn" id="btn-export-history">Export All History</button>
        <button class="btn" id="btn-clear-history" style="color:var(--color-error)">Clear All History</button>
      </div>
    </section>
  </div>

  <div class="toast" id="toast"></div>
  <script src="options.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Write options/options.css**

```css
.options {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.options h1 {
  font-size: 24px;
  font-weight: 700;
}

.section-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-group label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  margin-bottom: var(--spacing-xs);
}

.input-with-toggle {
  display: flex;
  gap: var(--spacing-xs);
}

.input-with-toggle .input {
  flex: 1;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.test-status {
  font-size: var(--font-size-sm);
}

.test-status.success {
  color: var(--color-success);
}

.test-status.error {
  color: var(--color-error);
}

.theme-options {
  display: flex;
  gap: var(--spacing-lg);
}

.theme-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

kbd {
  padding: 2px var(--spacing-sm);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: monospace;
}
```

- [ ] **Step 3: Write options/options.js**

```js
import { DEFAULT_SYSTEM_PROMPT } from '../lib/ai-processor.js';
import { send } from '../lib/messaging.js';

const $ = (sel) => document.querySelector(sel);

const langSelect = $('#lang-select');
const aiUrl = $('#ai-url');
const aiKey = $('#ai-key');
const aiModel = $('#ai-model');
const aiPrompt = $('#ai-prompt');
const btnToggleKey = $('#btn-toggle-key');
const btnTestApi = $('#btn-test-api');
const testStatus = $('#test-status');
const themeRadios = document.querySelectorAll('input[name="theme"]');
const btnExportHistory = $('#btn-export-history');
const btnClearHistory = $('#btn-clear-history');
const shortcutsLink = $('#shortcuts-link');
const toast = $('#toast');

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    ocrLanguages: 'eng+tha',
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    theme: 'system',
  });

  langSelect.value = settings.ocrLanguages;
  aiUrl.value = settings.aiApiUrl;
  aiKey.value = settings.aiApiKey;
  aiModel.value = settings.aiModel;
  aiPrompt.value = settings.aiSystemPrompt;

  const themeRadio = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
  if (themeRadio) themeRadio.checked = true;
  applyTheme(settings.theme);
}

function save(key, value) {
  chrome.storage.local.set({ [key]: value });
}

langSelect.addEventListener('change', () => save('ocrLanguages', langSelect.value));

let saveTimer;
function debouncedSave(key, el) {
  el.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(key, el.value), 500);
  });
}

debouncedSave('aiApiUrl', aiUrl);
debouncedSave('aiApiKey', aiKey);
debouncedSave('aiModel', aiModel);
debouncedSave('aiSystemPrompt', aiPrompt);

btnToggleKey.addEventListener('click', () => {
  const isPassword = aiKey.type === 'password';
  aiKey.type = isPassword ? 'text' : 'password';
  btnToggleKey.textContent = isPassword ? 'Hide' : 'Show';
});

btnTestApi.addEventListener('click', async () => {
  testStatus.textContent = 'Testing...';
  testStatus.className = 'test-status';
  btnTestApi.disabled = true;

  try {
    const result = await send('ai:testConnection');
    if (result.success) {
      testStatus.textContent = 'Connected successfully!';
      testStatus.className = 'test-status success';
    } else {
      testStatus.textContent = `Failed: ${result.error}`;
      testStatus.className = 'test-status error';
    }
  } catch (err) {
    testStatus.textContent = `Error: ${err.message}`;
    testStatus.className = 'test-status error';
  } finally {
    btnTestApi.disabled = false;
  }
});

themeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    save('theme', radio.value);
    applyTheme(radio.value);
  });
});

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

shortcutsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

btnExportHistory.addEventListener('click', async () => {
  try {
    const records = await send('history:getAll', { limit: 999999 });
    const json = JSON.stringify(records || [], null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-pro-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('History exported');
  } catch (err) {
    showToast(`Export failed: ${err.message}`);
  }
});

btnClearHistory.addEventListener('click', async () => {
  if (!confirm('Delete all OCR history? This cannot be undone.')) return;
  await send('history:clearAll');
  showToast('History cleared');
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

loadSettings();
```

- [ ] **Step 4: Verify options page loads**

1. Reload extension
2. Right-click icon → Options, or go to `chrome://extensions` → Details → Extension options
3. Verify: all sections render, theme toggle works, fields are editable

- [ ] **Step 5: Commit**

```bash
git add options/
git commit -m "feat: options page with AI config, language, theme, data management"
```

---

### Task 13: Content Script — Area Selector

**Files:**
- Create: `content/area-selector.js`

- [ ] **Step 1: Write content/area-selector.js**

```js
let overlay = null;
let selection = null;
let startX, startY;
let isSelecting = false;

function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'ocr-pro-overlay';
  overlay.innerHTML = `
    <div id="ocr-pro-instructions">Click and drag to select area for OCR. Press Escape to cancel.</div>
    <div id="ocr-pro-selection"></div>
  `;
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
  const instructions = overlay.querySelector('#ocr-pro-instructions');
  if (instructions) instructions.style.display = 'none';
}

function onMouseMove(e) {
  if (!isSelecting) return;
  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  selection.style.left = x + 'px';
  selection.style.top = y + 'px';
  selection.style.width = w + 'px';
  selection.style.height = h + 'px';
}

async function onMouseUp(e) {
  if (!isSelecting) return;
  isSelecting = false;

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  removeOverlay();

  if (w < 10 || h < 10) return;

  const dpr = window.devicePixelRatio || 1;

  chrome.runtime.sendMessage({
    type: 'capture:areaCoords',
    rect: {
      x: Math.round(x * dpr),
      y: Math.round(y * dpr),
      w: Math.round(w * dpr),
      h: Math.round(h * dpr),
      dpr,
    },
  });
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    removeOverlay();
  }
}

function startAreaSelect() {
  if (overlay) removeOverlay();
  createOverlay();
}

export { startAreaSelect };
```

- [ ] **Step 2: Commit**

```bash
git add content/area-selector.js
git commit -m "feat: area selector overlay for drag-to-select OCR region"
```

---

### Task 14: Content Script — Floating Widget

**Files:**
- Create: `content/floating-widget.js`

- [ ] **Step 1: Write content/floating-widget.js**

```js
let widget = null;
let dismissTimer = null;

function showWidget(record) {
  removeWidget();

  widget = document.createElement('div');
  widget.id = 'ocr-pro-widget';

  const preview = (record.rawText || '').slice(0, 100);
  widget.innerHTML = `
    <div id="ocr-pro-widget-header">
      <span class="ocr-pro-widget-title">OCR Pro</span>
      <button id="ocr-pro-widget-close" aria-label="Close">✕</button>
    </div>
    <div id="ocr-pro-widget-text">${escapeHtml(preview)}${record.rawText.length > 100 ? '...' : ''}</div>
    <div id="ocr-pro-widget-actions">
      <button id="ocr-pro-widget-copy">Copy</button>
      <button id="ocr-pro-widget-panel">Open Panel</button>
    </div>
  `;

  document.body.appendChild(widget);

  widget.querySelector('#ocr-pro-widget-close').addEventListener('click', removeWidget);

  widget.querySelector('#ocr-pro-widget-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(record.rawText).then(() => {
      const btn = widget.querySelector('#ocr-pro-widget-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 1500);
    });
  });

  widget.querySelector('#ocr-pro-widget-panel').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ui:open-sidepanel' });
    removeWidget();
  });

  makeDraggable(widget);

  dismissTimer = setTimeout(removeWidget, 10000);
}

function removeWidget() {
  clearTimeout(dismissTimer);
  if (widget) {
    widget.remove();
    widget = null;
  }
}

function makeDraggable(el) {
  const header = el.querySelector('#ocr-pro-widget-header');
  let isDragging = false;
  let offsetX, offsetY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - el.getBoundingClientRect().left;
    offsetY = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = (e.clientX - offsetX) + 'px';
    el.style.top = (e.clientY - offsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export { showWidget, removeWidget };
```

- [ ] **Step 2: Commit**

```bash
git add content/floating-widget.js
git commit -m "feat: floating result widget with copy, open panel, auto-dismiss"
```

---

### Task 15: Content Script — Main + CSS

**Files:**
- Create: `content/content.js`
- Create: `content/content.css`

- [ ] **Step 1: Write content/content.css**

```css
#ocr-pro-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.3);
  cursor: crosshair;
  z-index: 2147483647;
  user-select: none;
}

#ocr-pro-instructions {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-family: system-ui, sans-serif;
  pointer-events: none;
}

#ocr-pro-selection {
  position: absolute;
  display: none;
  border: 2px solid #4285f4;
  background: rgba(66, 133, 244, 0.15);
  border-radius: 2px;
  pointer-events: none;
}

#ocr-pro-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  z-index: 2147483646;
  font-family: system-ui, sans-serif;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  #ocr-pro-widget {
    background: #292a2d;
    color: #e8eaed;
  }
}

#ocr-pro-widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #4285f4;
  color: #fff;
  cursor: move;
}

.ocr-pro-widget-title {
  font-weight: 600;
  font-size: 13px;
}

#ocr-pro-widget-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

#ocr-pro-widget-text {
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

#ocr-pro-widget-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px 12px;
}

#ocr-pro-widget-actions button {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #dadce0;
  border-radius: 6px;
  background: #f8f9fa;
  color: #202124;
  font-size: 12px;
  cursor: pointer;
  font-family: system-ui, sans-serif;
}

#ocr-pro-widget-actions button:hover {
  background: #e8eaed;
}

@media (prefers-color-scheme: dark) {
  #ocr-pro-widget-actions button {
    background: #35363a;
    color: #e8eaed;
    border-color: #5f6368;
  }
  #ocr-pro-widget-actions button:hover {
    background: #404144;
  }
}
```

- [ ] **Step 2: Write content/content.js**

Note: Content scripts in Manifest V3 cannot use ES modules. We must use IIFE-style and inline the area-selector and floating-widget code. However, since the content script in manifest doesn't use `type: module`, we need to restructure.

Update `manifest.json` content_scripts to load all three files:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/area-selector.js", "content/floating-widget.js", "content/content.js"],
    "css": ["content/content.css"],
    "run_at": "document_idle"
  }
]
```

Then rewrite `content/area-selector.js` to use global functions (remove `export`):

At the bottom of `content/area-selector.js`, replace `export { startAreaSelect };` with:
```js
window.__ocrProAreaSelect = startAreaSelect;
```

At the bottom of `content/floating-widget.js`, replace `export { showWidget, removeWidget };` with:
```js
window.__ocrProWidget = { showWidget, removeWidget };
```

Now write `content/content.js`:

```js
(function () {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'capture:area') {
      if (window.__ocrProAreaSelect) {
        window.__ocrProAreaSelect();
      }
    }

    if (msg.type === 'ocr:result') {
      if (window.__ocrProWidget && msg.record) {
        window.__ocrProWidget.showWidget(msg.record);
      }
    }
  });
})();
```

- [ ] **Step 3: Update service worker to handle area capture with coordinates**

Add this handler to `background/service-worker.js` in the `onMessage` handlers:

```js
'capture:areaCoords': async (msg, sender) => {
  const tab = sender.tab;
  if (!tab) return;

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

  const { x, y, w, h } = msg.rect;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  await runOcr(croppedBlob, tab.url, 'area');

  sendToTab(tab.id, MSG.OCR_RESULT, { record: null });
},
```

Also update the `broadcastResult` function to also send to the active tab:

```js
async function broadcastResult(record) {
  chrome.runtime.sendMessage({ type: MSG.OCR_RESULT, record }).catch(() => {});
  const tab = await getCurrentTab();
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: MSG.OCR_RESULT, record }).catch(() => {});
  }
}
```

- [ ] **Step 4: Verify area selection works end-to-end**

1. Reload extension
2. Go to any website with text in images
3. Press Ctrl+Shift+O (or Cmd+Shift+O on Mac)
4. Verify: dark overlay appears with instructions
5. Drag to select an area
6. Verify: selection rectangle appears in blue
7. Release mouse → overlay disappears, OCR processes, floating widget shows result
8. Press Escape during selection → overlay dismisses

- [ ] **Step 5: Commit**

```bash
git add content/ manifest.json background/service-worker.js
git commit -m "feat: content scripts with area selector, floating widget, and page integration"
```

---

### Task 16: Integration, Polish & Final Testing

**Files:**
- Modify: `background/service-worker.js` (apply the area-coords handler and broadcastResult update from Task 15)
- All files: final check and fix any remaining issues

- [ ] **Step 1: Apply theme setting across all pages**

Add this to the top of `popup/popup.js`, `sidepanel/sidepanel.js`:

```js
chrome.storage.local.get({ theme: 'system' }, ({ theme }) => {
  if (theme !== 'system') {
    document.documentElement.setAttribute('data-theme', theme);
  }
});
```

- [ ] **Step 2: End-to-end test — Area Select OCR**

1. Open a webpage with text in images (e.g., a screenshot)
2. Press Ctrl+Shift+O → drag to select → release
3. Verify: floating widget appears with OCR text
4. Click "Copy" → paste somewhere → verify text
5. Click "Open Panel" → side panel opens with result

- [ ] **Step 3: End-to-end test — Full Page OCR**

1. Open popup → click "Full Page"
2. Verify: progress bar shows
3. Verify: result appears in popup preview
4. Open side panel → result is displayed

- [ ] **Step 4: End-to-end test — Upload File**

1. Open popup → drag an image file to upload zone
2. Verify: OCR processes and result appears

- [ ] **Step 5: End-to-end test — URL OCR**

1. Open popup → paste an image URL → click OCR
2. Verify: image is fetched and OCR'd

- [ ] **Step 6: End-to-end test — Right-click Image**

1. Right-click any image on a webpage
2. Click "OCR this image"
3. Verify: OCR processes, floating widget shows

- [ ] **Step 7: End-to-end test — AI Enhancement**

1. Go to Options → configure AI API (URL, Key, Model)
2. Click "Test Connection" → verify success
3. OCR some text → open Side Panel
4. Click "AI Enhance" → verify enhanced text appears
5. Toggle "Diff" → verify before/after comparison
6. Click "Accept AI" or "Keep Original"

- [ ] **Step 8: End-to-end test — History**

1. Perform several OCR operations
2. Open Side Panel → History tab
3. Verify: entries appear with thumbnails, dates, preview
4. Search for text → verify results filter
5. Click entry → loads in Result tab
6. Delete entry → verify removal

- [ ] **Step 9: End-to-end test — Export**

1. With OCR result displayed, click "Copy" → verify clipboard
2. Click "TXT" → verify .txt file downloads
3. Click "MD" → verify .md file downloads with heading

- [ ] **Step 10: End-to-end test — Settings Persistence**

1. Change language, theme, AI settings in Options
2. Close and reopen extension
3. Verify all settings are preserved

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: integration polish, theme support, end-to-end verified"
```

---

## Post-Implementation Notes

- **Tesseract.js language data** is downloaded from CDN on first use per language (~1-15MB depending on language). First OCR may be slower.
- **AI API** supports any OpenAI-compatible endpoint: OpenAI, Anthropic (via proxy), Google Gemini, Ollama, LM Studio, vLLM, etc.
- To add more languages to the selector, add `<option>` entries in popup.html and options.html. See [Tesseract.js language list](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).
- For Chrome Web Store publishing later: replace CDN imports in ocr-worker.js with bundled Tesseract.js files.
