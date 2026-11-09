import { db } from './db.js';

export interface ActiveAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  isCustomKey: boolean;
  maskedKey: string;
  evidenceThreshold: number;
}

export function maskKey(key: string): string {
  if (!key || key.length < 8) return 'NOT_SET';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Resolves active AI API key and provider configuration.
 * Precedence: User-saved key in user_settings table > process.env.GEMINI_API_KEY
 */
export function getActiveAiConfig(): ActiveAiConfig {
  let customKey = '';
  let provider = 'gemini';
  let model = 'gemini-3.8-flash';
  let evidenceThreshold = 65;

  try {
    const rows = db.prepare('SELECT key, value FROM user_settings').all() as { key: string; value: string }[];
    for (const r of rows) {
      if (r.key === 'custom_gemini_key' && r.value) customKey = r.value;
      if (r.key === 'ai_provider' && r.value) provider = r.value;
      if (r.key === 'model_name' && r.value) model = r.value;
      if (r.key === 'evidence_threshold' && r.value) evidenceThreshold = Number(r.value) || 65;
    }
  } catch (err) {
    console.warn('Could not read user_settings from DB, using fallback:', err);
  }

  const envKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ? process.env.GEMINI_API_KEY
    : '';

  const activeKey = customKey.trim() || envKey.trim();
  const isCustomKey = Boolean(customKey.trim());

  return {
    provider,
    model: model || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    apiKey: activeKey,
    isCustomKey,
    maskedKey: maskKey(activeKey),
    evidenceThreshold,
  };
}

/**
 * Saves user custom API key and provider config securely to database
 */
export function saveCustomAiConfig(data: {
  apiKey?: string;
  provider?: string;
  model?: string;
  evidenceThreshold?: number;
}): ActiveAiConfig {
  const stmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');

  db.transaction(() => {
    if (data.apiKey !== undefined) {
      stmt.run('custom_gemini_key', data.apiKey.trim());
    }
    if (data.provider !== undefined) {
      stmt.run('ai_provider', data.provider);
    }
    if (data.model !== undefined) {
      stmt.run('model_name', data.model);
    }
    if (data.evidenceThreshold !== undefined) {
      stmt.run('evidence_threshold', String(data.evidenceThreshold));
    }
  })();

  return getActiveAiConfig();
}

/**
 * Clears saved user custom API key
 */
export function deleteCustomApiKey(): ActiveAiConfig {
  db.prepare("DELETE FROM user_settings WHERE key = 'custom_gemini_key'").run();
  return getActiveAiConfig();
}
