import { DEFAULT_SYSTEM_PROMPT } from '../lib/ai-processor.js';
import { send } from '../lib/messaging.js';

const $ = (sel) => document.querySelector(sel);

const PROVIDERS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    keyPage: 'https://aistudio.google.com/apikey',
    placeholder: 'AIzaSy...',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    keyPage: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6',
    keyPage: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.2-90b-vision-preview',
    keyPage: 'https://console.groq.com/keys',
    placeholder: 'gsk_...',
  },
};

const ocrEngineSelect = $('#ocr-engine');
const langSelect = $('#lang-select');
const aiProvider = $('#ai-provider');
const aiUrl = $('#ai-url');
const aiKey = $('#ai-key');
const aiModel = $('#ai-model');
const aiPrompt = $('#ai-prompt');
const btnToggleKey = $('#btn-toggle-key');
const btnTestApi = $('#btn-test-api');
const testStatus = $('#test-status');
const getKeyGroup = $('#get-key-group');
const getKeyLink = $('#get-key-link');
const customFields = $('#custom-fields');
const shortcutsLink = $('#shortcuts-link');
const btnExport = $('#btn-export');
const btnClear = $('#btn-clear');
const toast = $('#toast');
const engineWarning = $('#engine-warning');

// --- Provider logic ---
function detectProvider(url) {
  if (!url) return '';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('api.anthropic.com')) return 'anthropic';
  if (url.includes('api.groq.com')) return 'groq';
  return 'custom';
}

function onProviderChange() {
  const p = aiProvider.value;
  const info = PROVIDERS[p];

  if (info) {
    aiUrl.value = info.url;
    aiModel.value = info.model;
    aiKey.placeholder = info.placeholder;
    getKeyLink.href = info.keyPage;
    getKeyGroup.hidden = false;
    customFields.hidden = true;
    save('aiApiUrl', info.url);
    save('aiModel', info.model);
  } else if (p === 'custom') {
    getKeyGroup.hidden = true;
    customFields.hidden = false;
  } else {
    getKeyGroup.hidden = true;
    customFields.hidden = true;
  }
  save('aiProvider', p);
  checkEngineWarning();
}

aiProvider.addEventListener('change', onProviderChange);

// --- Load settings ---
async function load() {
  const s = await chrome.storage.local.get({
    ocrEngine: 'tesseract',
    ocrLanguages: 'eng+tha',
    aiProvider: '',
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    theme: 'system',
  });
  ocrEngineSelect.value = s.ocrEngine;
  langSelect.value = s.ocrLanguages;
  aiUrl.value = s.aiApiUrl;
  aiKey.value = s.aiApiKey;
  aiModel.value = s.aiModel;
  aiPrompt.value = s.aiSystemPrompt;

  const detected = s.aiProvider || detectProvider(s.aiApiUrl);
  aiProvider.value = detected;
  const info = PROVIDERS[detected];
  if (info) {
    aiKey.placeholder = info.placeholder;
    getKeyLink.href = info.keyPage;
    getKeyGroup.hidden = false;
    customFields.hidden = true;
  } else if (detected === 'custom') {
    customFields.hidden = false;
  }

  const radio = document.querySelector(`input[name="theme"][value="${s.theme}"]`);
  if (radio) radio.checked = true;
  applyTheme(s.theme);
  checkEngineWarning();
}

function save(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// --- Engine warning ---
function checkEngineWarning() {
  if (ocrEngineSelect.value === 'ai-vision' && (!aiUrl.value || !aiKey.value || !aiModel.value)) {
    engineWarning.hidden = false;
  } else {
    engineWarning.hidden = true;
  }
}
ocrEngineSelect.addEventListener('change', () => { save('ocrEngine', ocrEngineSelect.value); checkEngineWarning(); });
langSelect.addEventListener('change', () => save('ocrLanguages', langSelect.value));

// --- Auto-save inputs ---
function autoSave(key, el) {
  let t;
  el.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { save(key, el.value); checkEngineWarning(); }, 500);
  });
}
autoSave('aiApiUrl', aiUrl);
autoSave('aiApiKey', aiKey);
autoSave('aiModel', aiModel);
autoSave('aiSystemPrompt', aiPrompt);

function flushAllFields() {
  return chrome.storage.local.set({
    aiApiUrl: aiUrl.value,
    aiApiKey: aiKey.value,
    aiModel: aiModel.value,
    aiSystemPrompt: aiPrompt.value,
  });
}

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
    await flushAllFields();
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
    const records = await send('history:getAll', { limit: 5000 });
    const stripped = (records || []).map(({ thumbnail, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(stripped, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported!');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

btnClear.addEventListener('click', async () => {
  if (!confirm('Delete all OCR history? This cannot be undone.')) return;
  try {
    await send('history:clearAll');
    showToast('History cleared');
  } catch { showToast('Failed to clear history'); }
});

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

load();
