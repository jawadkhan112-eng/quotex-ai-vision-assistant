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

/** Resolve configuration. User-saved values override administrator environment defaults. */
export function getActiveAiConfig(): ActiveAiConfig {
  let customKey = '';
  let savedProvider = '';
  let savedModel = '';
  let savedThreshold: number | undefined;
  try {
    const rows = db.prepare('SELECT key, value FROM user_settings').all() as { key: string; value: string }[];
    for (const row of rows) {
      if (row.key === 'custom_gemini_key' && row.value) customKey = row.value;
      if (row.key === 'ai_provider' && row.value) savedProvider = row.value;
      if (row.key === 'model_name' && row.value) savedModel = row.value;
      if (row.key === 'evidence_threshold' && row.value) {
        const threshold = Number(row.value);
        if (Number.isFinite(threshold) && threshold >= 50 && threshold <= 90) savedThreshold = threshold;
      }
    }
  } catch (error) {
    console.warn('AI settings could not be read; using environment defaults:', error instanceof Error ? error.message : 'database error');
  }
  const envKey = process.env.GEMINI_API_KEY?.trim() || '';
  const apiKey = customKey.trim() || envKey;
  return {
    provider: savedProvider || process.env.AI_PROVIDER || 'gemini',
    model: savedModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    apiKey,
    isCustomKey: Boolean(customKey.trim()),
    maskedKey: maskKey(apiKey),
    evidenceThreshold: savedThreshold ?? 65,
  };
}

export function saveCustomAiConfig(data: {
  apiKey?: string;
  provider?: string;
  model?: string;
  evidenceThreshold?: number;
}): ActiveAiConfig {
  const stmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    if (data.apiKey !== undefined) stmt.run('custom_gemini_key', data.apiKey.trim());
    if (data.provider !== undefined) stmt.run('ai_provider', data.provider);
    if (data.model !== undefined) stmt.run('model_name', data.model);
    if (data.evidenceThreshold !== undefined) stmt.run('evidence_threshold', String(data.evidenceThreshold));
  })();
  return getActiveAiConfig();
}

export function deleteCustomApiKey(): ActiveAiConfig {
  db.prepare("DELETE FROM user_settings WHERE key = 'custom_gemini_key'").run();
  return getActiveAiConfig();
}
