import { MSG, send } from '../lib/messaging.js';
import exportManager from '../lib/export-manager.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Theme ---
chrome.storage.local.get({ theme: 'system' }, (s) => {
  if (s.theme !== 'system') document.documentElement.setAttribute('data-theme', s.theme);
});

// --- Elements ---
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
const historySearch = $('#history-search');
const historyList = $('#history-list');
const toast = $('#toast');

let currentRecord = null;
let enhancedText = null;

// --- Tabs ---
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const target = $(`#tab-${tab.dataset.tab}`);
    if (target) target.classList.add('active');
    if (tab.dataset.tab === 'history') loadHistory();
  });
});

// --- Show result ---
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

// --- AI Enhance ---
btnAiEnhance.addEventListener('click', async () => {
  if (!currentRecord) return;
  aiSpinner.hidden = false;
  aiProgress.hidden = false;
  btnAiEnhance.disabled = true;

  try {
    const response = await send(MSG.AI_ENHANCE, {
      text: resultText.value || currentRecord.rawText,
      recordId: currentRecord.id,
    });
    if (response.error) {
      showToast('AI Error: ' + response.error);
      return;
    }
    enhancedText = response.enhanced;
    resultText.value = enhancedText;
    diffOriginal.textContent = currentRecord.rawText;
    diffEnhanced.textContent = enhancedText;
    showToast('AI enhancement complete!');
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    aiSpinner.hidden = true;
    aiProgress.hidden = true;
    btnAiEnhance.disabled = false;
  }
});

// --- Toolbar ---
btnCopy.addEventListener('click', async () => {
  if (!resultText.value) return;
  try {
    await exportManager.copyToClipboard(resultText.value);
    showToast('Copied!');
  } catch { showToast('Copy failed'); }
});

btnDownloadTxt.addEventListener('click', () => {
  if (!resultText.value) { showToast('No text to export'); return; }
  exportManager.downloadTxt(resultText.value);
});
btnDownloadMd.addEventListener('click', () => {
  if (!resultText.value) { showToast('No text to export'); return; }
  exportManager.downloadMd(resultText.value);
});

// --- Diff ---
diffCheckbox.addEventListener('change', () => {
  if (diffCheckbox.checked && !enhancedText) {
    diffCheckbox.checked = false;
    showToast('Run AI Enhance first');
    return;
  }
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

// --- History ---
async function loadHistory() {
  try {
    const records = await send('history:getAll', { limit: 50 });
    renderHistory(records || []);
  } catch { renderHistory([]); }
}

let searchTimer;
historySearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const q = historySearch.value.trim();
      if (!q) { loadHistory(); return; }
      const records = await send('history:search', { query: q });
      renderHistory(records || []);
    } catch { renderHistory([]); }
  }, 300);
});

function isSafeThumb(s) {
  return typeof s === 'string' && s.startsWith('data:image/');
}

function renderHistory(records) {
  if (!records.length) {
    historyList.innerHTML = '<p class="history-empty">No history yet</p>';
    return;
  }
  historyList.innerHTML = '';
  records.forEach(r => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.id = r.id;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    if (r.thumbnail && isSafeThumb(r.thumbnail)) {
      const img = document.createElement('img');
      img.className = 'history-thumb';
      img.src = r.thumbnail;
      img.alt = '';
      item.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'history-thumb';
      item.appendChild(ph);
    }

    const info = document.createElement('div');
    info.className = 'history-info';
    const date = document.createElement('div');
    date.className = 'history-date';
    date.textContent = `${new Date(r.timestamp).toLocaleString()} • ${r.sourceType}`;
    const preview = document.createElement('div');
    preview.className = 'history-preview';
    preview.textContent = (r.enhancedText || r.rawText || '').slice(0, 100);
    info.appendChild(date);
    info.appendChild(preview);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-delete';
    delBtn.dataset.id = r.id;
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    actions.appendChild(delBtn);
    item.appendChild(actions);

    historyList.appendChild(item);
  });

  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-delete')) return;
      try {
        const record = await send('history:get', { id: Number(item.dataset.id) });
        if (record) { showResult(record); tabs[0].click(); }
      } catch { showToast('Failed to load record'); }
    });
  });

  historyList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await send('history:delete', { id: Number(btn.dataset.id) });
        loadHistory();
        showToast('Deleted');
      } catch { showToast('Failed to delete'); }
    });
  });
}

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Listen for progress and results ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.OCR_PROGRESS) {
    resultEmpty.hidden = true;
    resultContent.hidden = true;
    const prog = document.getElementById('ocr-progress');
    if (prog) {
      prog.hidden = false;
      const fill = prog.querySelector('.progress-bar-fill');
      const text = prog.querySelector('.status-text');
      if (fill) fill.style.width = Math.round((msg.progress || 0) * 100) + '%';
      if (text) text.textContent = msg.status || 'Processing...';
    }
  }
  if (msg.type === MSG.OCR_RESULT && msg.record) {
    const prog = document.getElementById('ocr-progress');
    if (prog) prog.hidden = true;
    showResult(msg.record);
    tabs[0].click();
  }
  if (msg.type === MSG.OCR_ERROR) {
    const prog = document.getElementById('ocr-progress');
    if (prog) prog.hidden = true;
    showToast('OCR Error: ' + msg.error);
  }
});

loadHistory();

(async () => {
  try {
    const records = await send('history:getAll', { limit: 1 });
    if (records && records.length > 0) showResult(records[0]);
  } catch {}
  try {
    const res = await send('ai:isConfigured');
    if (!res || !res.configured) {
      btnAiEnhance.disabled = true;
      btnAiEnhance.title = 'Configure AI in Settings first';
    }
  } catch {}
})();
