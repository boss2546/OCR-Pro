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
const shortcutsLink = $('#shortcuts-link');
const btnExport = $('#btn-export');
const btnClear = $('#btn-clear');
const toast = $('#toast');

// --- Load settings ---
async function load() {
  const s = await chrome.storage.local.get({
    ocrLanguages: 'eng+tha',
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    theme: 'system',
  });
  langSelect.value = s.ocrLanguages;
  aiUrl.value = s.aiApiUrl;
  aiKey.value = s.aiApiKey;
  aiModel.value = s.aiModel;
  aiPrompt.value = s.aiSystemPrompt;

  const radio = document.querySelector(`input[name="theme"][value="${s.theme}"]`);
  if (radio) radio.checked = true;
  applyTheme(s.theme);
}

function save(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// --- Auto-save inputs ---
langSelect.addEventListener('change', () => save('ocrLanguages', langSelect.value));

let timer;
function autoSave(key, el) {
  el.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => save(key, el.value), 500);
  });
}
autoSave('aiApiUrl', aiUrl);
autoSave('aiApiKey', aiKey);
autoSave('aiModel', aiModel);
autoSave('aiSystemPrompt', aiPrompt);

// --- Toggle API key visibility ---
btnToggleKey.addEventListener('click', () => {
  const show = aiKey.type === 'password';
  aiKey.type = show ? 'text' : 'password';
  btnToggleKey.textContent = show ? 'Hide' : 'Show';
});

// --- Test API ---
btnTestApi.addEventListener('click', async () => {
  testStatus.textContent = 'Testing...';
  testStatus.className = 'test-status';
  btnTestApi.disabled = true;
  try {
    const result = await send('ai:testConnection');
    if (result.success) {
      testStatus.textContent = 'Connected!';
      testStatus.className = 'test-status success';
    } else {
      testStatus.textContent = 'Failed: ' + result.error;
      testStatus.className = 'test-status error';
    }
  } catch (err) {
    testStatus.textContent = 'Error: ' + err.message;
    testStatus.className = 'test-status error';
  } finally {
    btnTestApi.disabled = false;
  }
});

// --- Theme ---
document.querySelectorAll('input[name="theme"]').forEach(radio => {
  radio.addEventListener('change', () => {
    save('theme', radio.value);
    applyTheme(radio.value);
  });
});

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

// --- Shortcuts link ---
shortcutsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// --- Export / Clear ---
btnExport.addEventListener('click', async () => {
  try {
    const records = await send('history:getAll', { limit: 999999 });
    const blob = new Blob([JSON.stringify(records || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported!');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

btnClear.addEventListener('click', async () => {
  if (!confirm('Delete all OCR history? This cannot be undone.')) return;
  await send('history:clearAll');
  showToast('History cleared');
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

load();
