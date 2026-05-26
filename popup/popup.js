import { MSG, send } from '../lib/messaging.js';

const $ = (sel) => document.querySelector(sel);

const btnArea = $('#btn-area');
const btnFullpage = $('#btn-fullpage');
const btnSettings = $('#btn-settings');
const btnBrowse = $('#btn-browse');
const btnUrlOcr = $('#btn-url-ocr');
const btnCopyResult = $('#btn-copy-result');
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
let lastResult = null;
let toastTimer;

chrome.storage.local.get({ ocrLanguages: 'eng+tha', theme: 'system' }, (s) => {
  langSelect.value = s.ocrLanguages;
  if (s.theme !== 'system') document.documentElement.setAttribute('data-theme', s.theme);
});

langSelect.addEventListener('change', () => {
  chrome.storage.local.set({ ocrLanguages: langSelect.value });
});

// --- Actions ---
btnArea.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: MSG.CAPTURE_AREA });
    window.close();
  } catch {
    showToast('Cannot OCR this page');
  }
});

btnFullpage.addEventListener('click', () => {
  send(MSG.CAPTURE_FULLPAGE);
  showStatus('Capturing page...', 0);
});

btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

// --- Upload ---
btnBrowse.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]); });

function processFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    showToast('File too large (max 10MB)');
    return;
  }
  showStatus('Reading file...', 0);
  const reader = new FileReader();
  reader.onload = () => send(MSG.CAPTURE_UPLOAD, { imageData: reader.result, filename: file.name });
  reader.readAsDataURL(file);
}

// --- URL ---
btnUrlOcr.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return;
  try { new URL(url); } catch { showToast('Invalid URL'); return; }
  send(MSG.CAPTURE_URL, { url });
  showStatus('Fetching image...', 0);
});

// --- Result actions ---
btnCopyResult.addEventListener('click', async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(lastResult);
  showToast('Copied!');
});

btnOpenPanel.addEventListener('click', () => {
  send(MSG.OPEN_SIDEPANEL);
  window.close();
});

// --- Listen for progress/results ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.OCR_PROGRESS) showStatus(msg.status, msg.progress);
  if (msg.type === MSG.OCR_RESULT) {
    hideStatus();
    lastResult = msg.record.rawText;
    resultArea.hidden = false;
    resultPreview.textContent = (msg.record.rawText || '').slice(0, 300) || 'No text detected';
  }
  if (msg.type === MSG.OCR_ERROR) {
    hideStatus();
    showToast('Error: ' + msg.error);
  }
});

function showStatus(text, progress) {
  statusArea.hidden = false;
  resultArea.hidden = true;
  statusText.textContent = text;
  progressFill.style.width = Math.round(progress * 100) + '%';
}

function hideStatus() {
  statusArea.hidden = true;
  progressFill.style.width = '0%';
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
