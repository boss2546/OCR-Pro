const DEFAULT_SYSTEM_PROMPT = `You are an OCR text correction assistant. Fix OCR errors in the provided text:
- Correct misspellings and broken characters
- Restore proper formatting (paragraphs, lists, headings)
- Fix garbled Thai, English, and other language text
- Do not change the meaning of the text
- Return only the corrected text, no explanations`;

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
    if (!enhanced) throw new Error('AI returned empty response');
    return enhanced.trim();
  },
};

export default aiProcessor;
export { DEFAULT_SYSTEM_PROMPT };
