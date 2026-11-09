import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { db } from './db.js';

export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'cerebras' | 'huggingface';
export interface ProviderModel { id: string; name: string; text: boolean; vision: boolean; streaming: boolean; context?: number }
export interface ProviderInfo { id: ProviderId; name: string; endpoint: string; auth: string; protocol: string; text: boolean; vision: boolean; streaming: boolean; modelDiscovery: string; }

/** Endpoints use each provider's documented model-list/chat API. Non-Gemini vision is disabled unless verified in provider metadata. */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', auth: 'API key query parameter (server-side)', protocol: 'Google Generative Language API', text: true, vision: true, streaming: true, modelDiscovery: '/models' },
  groq: { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1', auth: 'Bearer API key', protocol: 'OpenAI-compatible chat completions', text: true, vision: false, streaming: true, modelDiscovery: '/models' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', auth: 'Bearer API key', protocol: 'OpenAI-compatible chat completions', text: true, vision: false, streaming: true, modelDiscovery: '/models' },
  cerebras: { id: 'cerebras', name: 'Cerebras', endpoint: 'https://api.cerebras.ai/v1', auth: 'Bearer API key', protocol: 'OpenAI-compatible chat completions', text: true, vision: false, streaming: true, modelDiscovery: '/models' },
  huggingface: { id: 'huggingface', name: 'Hugging Face Inference Providers', endpoint: 'https://router.huggingface.co/v1', auth: 'Bearer access token', protocol: 'OpenAI-compatible router API', text: true, vision: false, streaming: true, modelDiscovery: '/models' },
};

function encryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) throw new Error('Credential storage is disabled: set CREDENTIAL_ENCRYPTION_KEY on the server.');
  // Accept a 32-byte base64 key or derive a fixed-size key from a long random secret.
  const decoded = Buffer.from(secret, 'base64');
  if (decoded.length === 32) return decoded;
  if (secret.length < 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (base64) or at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decrypt(payload: string): string {
  const [iv, tag, body] = payload.split('.');
  if (!iv || !tag || !body) throw new Error('Encrypted credential record is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
export function maskProviderKey(key: string): string { return key.length < 8 ? 'SET' : `${key.slice(0, 4)}…${key.slice(-4)}`; }
export function saveProviderKey(provider: ProviderId, key: string): void {
  if (!PROVIDERS[provider]) throw new Error('Unsupported provider.');
  if (!key.trim()) throw new Error('API key cannot be empty.');
  db.prepare('INSERT OR REPLACE INTO provider_credentials (provider, encrypted_key, updated_at) VALUES (?, ?, ?)')
    .run(provider, encrypt(key.trim()), new Date().toISOString());
}
export function readProviderKey(provider: ProviderId): string | null {
  const row = db.prepare('SELECT encrypted_key FROM provider_credentials WHERE provider = ?').get(provider) as { encrypted_key: string } | undefined;
  if (row) return decrypt(row.encrypted_key);
  if (provider === 'gemini') return process.env.GEMINI_API_KEY?.trim() || null;
  return null;
}
export function deleteProviderKey(provider: ProviderId): void { db.prepare('DELETE FROM provider_credentials WHERE provider = ?').run(provider); }
export function getProviderConfig(provider: ProviderId) {
  const row = db.prepare('SELECT model FROM provider_settings WHERE provider = ?').get(provider) as { model: string } | undefined;
  const model = row?.model || (provider === 'gemini' ? process.env.GEMINI_MODEL || '' : '');
  const key = readProviderKey(provider);
  return { provider, model, key, hasKey: Boolean(key), maskedKey: key ? maskProviderKey(key) : 'NOT_SET', source: key ? (provider === 'gemini' && !row ? 'environment-or-encrypted' : 'encrypted-store') : 'none' };
}
export function saveProviderModel(provider: ProviderId, model: string): void {
  if (!PROVIDERS[provider] || !model.trim() || model.length > 200) throw new Error('Invalid provider/model selection.');
  db.prepare('INSERT OR REPLACE INTO provider_settings (provider, model) VALUES (?, ?)').run(provider, model.trim());
}
export function getDefaults() {
  const rows = db.prepare('SELECT key, value FROM user_settings WHERE key IN (?, ?)').all('default_ai_provider', 'fallback_ai_provider') as { key: string; value: string }[];
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { primary: (config.default_ai_provider || 'gemini') as ProviderId, fallback: (config.fallback_ai_provider || '') as ProviderId | '' };
}
export function saveDefaults(primary: ProviderId, fallback: ProviderId | '') {
  if (!PROVIDERS[primary] || (fallback && !PROVIDERS[fallback])) throw new Error('Unsupported primary or fallback provider.');
  const stmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
  db.transaction(() => { stmt.run('default_ai_provider', primary); stmt.run('fallback_ai_provider', fallback); })();
}

async function providerFetch(url: string, key: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}
export async function listProviderModels(provider: ProviderId, key: string): Promise<ProviderModel[]> {
  const info = PROVIDERS[provider];
  if (provider === 'gemini') {
    const response = await fetch(`${info.endpoint}/models?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw providerError(response.status, await response.text());
    const data = await response.json() as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }> };
    return (data.models || []).filter(m => m.name && m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => ({ id: m.name!.replace(/^models\//, ''), name: m.displayName || m.name!, text: true, vision: true, streaming: true, context: m.inputTokenLimit }));
  }
  const response = await providerFetch(`${info.endpoint}${info.modelDiscovery}`, key);
  if (!response.ok) throw providerError(response.status, await response.text());
  const data = await response.json() as { data?: Array<{ id?: string; name?: string; context_length?: number }> };
  // OpenAI-compatible /models endpoints identify model names but generally do not prove image input.
  return (data.data || []).filter(m => m.id).map(m => ({ id: m.id!, name: m.name || m.id!, text: true, vision: false, streaming: true, context: m.context_length }));
}
export function providerError(status: number, body: string): Error & { status?: number; retryAfter?: string } {
  const err = new Error(status === 429 ? 'Provider quota or rate limit exceeded.' : status === 401 || status === 403 ? 'Invalid or unauthorized provider key.' : status >= 500 ? 'AI provider is temporarily unavailable.' : `Provider request failed (${status}).`) as Error & { status?: number; retryAfter?: string };
  err.status = status;
  if (status === 429) err.retryAfter = undefined;
  // Do not include raw provider bodies: they may echo credentials or contain sensitive request details.
  return err;
}

export async function testProvider(provider: ProviderId, key: string, model: string) {
  const models = await listProviderModels(provider, key);
  if (!models.some(m => m.id === model)) throw new Error('Selected model is not returned by the provider for this key. Refresh the model list.');
  if (provider === 'gemini') {
    const response = await fetch(`${PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw providerError(response.status, await response.text());
    return { success: true, latencyMs: 0 };
  }
  const started = Date.now();
  const response = await fetch(`${PROVIDERS[provider].endpoint}/chat/completions`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 4 }),
    signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw providerError(response.status, await response.text());
  return { success: true, latencyMs: Date.now() - started };
}

export async function generateProviderText(provider: ProviderId, model: string, key: string, prompt: string, systemInstruction?: string): Promise<string> {
  if (provider === 'gemini') {
    const response = await fetch(`${PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}), contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw providerError(response.status, await response.text());
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!text) throw new Error('Provider returned an empty response.');
    return text;
  }
  const response = await fetch(`${PROVIDERS[provider].endpoint}/chat/completions`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw providerError(response.status, await response.text());
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Provider returned an empty response.');
  return text;
}

export async function generateProviderVision(provider: ProviderId, model: string, key: string, imageBase64: string, mimeType: string, prompt: string): Promise<string> {
  if (provider !== 'gemini') throw new Error(`${PROVIDERS[provider].name} vision is disabled: a model's image capability is not verified by its model-list API.`);
  const response = await fetch(`${PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64.replace(/^data:image\/[\w.+-]+;base64,/, '') } }, { text: prompt }] }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw providerError(response.status, await response.text());
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
  if (!text) throw new Error('Vision provider returned an empty response.');
  return text;
}
