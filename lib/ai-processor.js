const DEFAULT_SYSTEM_PROMPT = `You are an OCR text correction assistant. Fix OCR errors in the provided text:
- Correct misspellings and broken characters
- Restore proper formatting (paragraphs, lists, headings)
- Fix garbled Thai, English, and other language text
- Do not change the meaning of the text
- Return only the corrected text, no explanations`;

function requireSecureUrl(url) {
  const isLocal = ['http://localhost', 'http://127.0.0.1', 'http://[::1]'].some(p => url.startsWith(p));
  if (!url.startsWith('https://') && !isLocal) {
    throw new Error('API URL must use HTTPS for security.');
  }
}

async function getConfig() {
  return chrome.storage.local.get({
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  });
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
      requireSecureUrl(config.aiApiUrl);
    } catch (e) {
      return { success: false, error: e.message };
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

  async ocrVision(imageDataUrl) {
    const config = await getConfig();
    if (!config.aiApiUrl || !config.aiApiKey || !config.aiModel) {
      throw new Error('AI not configured. Go to Options to set up API.');
    }
    requireSecureUrl(config.aiApiUrl);
    const response = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          {
            role: 'system',
            content: 'You are an OCR engine. Extract ALL text from the image exactly as it appears. Include emojis and icons you can identify (output the actual emoji character). Preserve the original layout and line breaks. Skip UI elements, buttons, avatars, and decorative graphics — only extract readable text and emojis. Output ONLY the extracted text, nothing else.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
              { type: 'text', text: 'Extract all text from this image.' },
            ],
          },
        ],
        max_tokens: 16384,
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI Vision error: HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI Vision returned empty response');
    return text.trim();
  },

  async translate(text, targetLang = 'auto') {
    const config = await getConfig();
    if (!config.aiApiUrl || !config.aiApiKey || !config.aiModel) {
      throw new Error('AI not configured. Go to Options to set up API.');
    }
    requireSecureUrl(config.aiApiUrl);
    const langInstruction = targetLang === 'auto'
      ? 'Detect the language. If Thai, translate to English. If English or other language, translate to Thai.'
      : `Translate to ${targetLang}.`;

    const response = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          { role: 'system', content: `You are a translator. ${langInstruction} Output ONLY the translated text, nothing else. No explanations, no labels, no markdown.` },
          { role: 'user', content: text },
        ],
        max_tokens: 8192,
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Translate error: HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content;
    if (!translated) throw new Error('Translation returned empty');
    return translated.trim();
  },

  async enhance(rawText) {
    const config = await getConfig();
    if (!config.aiApiUrl || !config.aiApiKey || !config.aiModel) {
      throw new Error('AI not configured. Go to Options to set up API.');
    }
    requireSecureUrl(config.aiApiUrl);

    const inputTokenEstimate = Math.ceil(rawText.length / 3);
    const maxTokens = Math.max(4096, inputTokenEstimate + 512);

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
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI API error: HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content;
    if (!enhanced) throw new Error('AI returned empty response');

    const reason = data.choices?.[0]?.finish_reason;
    let result = enhanced.trim();
    if (reason === 'length') {
      result += '\n\n[Warning: AI output was truncated due to length limit]';
    }
    return result;
  },
};

export default aiProcessor;
export { DEFAULT_SYSTEM_PROMPT };
