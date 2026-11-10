import { db } from './db.js';
import { encryptSecret, decryptSecret, maskKey } from './crypto.js';

export interface SupportedModel {
  id: string;
  name: string;
  vision: boolean;
  contextWindow?: number;
  description?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  visionSupported: boolean;
  supportedModels: SupportedModel[];
  envKeyVar: string;
  apiKeyFallback: string;
  endpoint?: string;
}

export interface ActiveAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  isCustomKey: boolean;
  maskedKey: string;
  evidenceThreshold: number;
  visionSupported: boolean;
  backupProvider?: string;
  backupModel?: string;
}

// Built-in API key placeholders for fallback reference; actual production keys are loaded dynamically via environment variables or encrypted DB vault
export const BUILTIN_KEYS: Record<string, string> = {
  gemini: '',
  groq: '',
  openrouter: '',
};

// Supported AI Providers catalog
export const PROVIDER_CATALOG: ProviderDefinition[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (AI Studio)',
    description: 'Premier vision analysis engine with multimodal support for chart reading',
    defaultModel: 'gemini-2.5-flash',
    visionSupported: true,
    envKeyVar: 'GEMINI_API_KEY',
    apiKeyFallback: BUILTIN_KEYS.gemini,
    supportedModels: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Latest High-Speed Vision · Default)', vision: true },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Ultra Fast · Active)', vision: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Next-Gen Preview)', vision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep Technical Reasoner)', vision: true },
    ],
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    description: 'Ultra-low-latency LPU inference for fast technical commentary and reasoning',
    defaultModel: 'llama-3.3-70b-versatile',
    visionSupported: true,
    envKeyVar: 'GROQ_API_KEY',
    apiKeyFallback: BUILTIN_KEYS.groq,
    endpoint: 'https://api.groq.com/openai/v1',
    supportedModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Fast Reasoning)', vision: false },
      { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision (Groq Vision)', vision: true },
      { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision (Deep Vision)', vision: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (High Context)', vision: false },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified multi-provider gateway with Claude 3.5 Sonnet, GPT-4o, and DeepSeek',
    defaultModel: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    visionSupported: true,
    envKeyVar: 'OPENROUTER_API_KEY',
    apiKeyFallback: BUILTIN_KEYS.openrouter,
    endpoint: 'https://openrouter.ai/api/v1',
    supportedModels: [
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (Stable Vision · Active)', vision: true },
      { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 11B Vision (Free Vision · Active)', vision: true },
      { id: 'anthropic/claude-3.5-sonnet:beta', name: 'Claude 3.5 Sonnet (Vision Multi-Modal)', vision: true },
      { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o (Multimodal Leader)', vision: true },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (Deep Math/Logic)', vision: false },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Direct GPT-4o and GPT-4o-mini vision models',
    defaultModel: 'gpt-4o',
    visionSupported: true,
    envKeyVar: 'OPENAI_API_KEY',
    apiKeyFallback: '',
    endpoint: 'https://api.openai.com/v1',
    supportedModels: [
      { id: 'gpt-4o', name: 'GPT-4o (Vision Multimodal)', vision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast Vision)', vision: true },
      { id: 'o1-preview', name: 'o1 Preview (Reasoning)', vision: false },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Direct Claude 3.5 Sonnet and Haiku with vision',
    defaultModel: 'claude-3-5-sonnet-20241022',
    visionSupported: true,
    envKeyVar: 'ANTHROPIC_API_KEY',
    apiKeyFallback: '',
    supportedModels: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Superior Vision)', vision: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast)', vision: true },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 and DeepSeek R1 reasoning models',
    defaultModel: 'deepseek-chat',
    visionSupported: false,
    envKeyVar: 'DEEPSEEK_API_KEY',
    apiKeyFallback: '',
    endpoint: 'https://api.deepseek.com/v1',
    supportedModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', vision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', vision: false },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Self-hosted local models with zero external API calls',
    defaultModel: 'llama3.2-vision',
    visionSupported: true,
    envKeyVar: 'OLLAMA_API_KEY',
    apiKeyFallback: 'ollama-local',
    endpoint: 'http://localhost:11434/v1',
    supportedModels: [
      { id: 'llama3.2-vision', name: 'Llama 3.2 Vision (Local Vision)', vision: true },
      { id: 'llama3.1', name: 'Llama 3.1 8B (Text Only)', vision: false },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B (Local Logic)', vision: false },
    ],
  },
];

/**
 * Resolves active AI API key and provider configuration.
 * Order of precedence:
 * 1. User encrypted custom key in DB (provider_credentials or user_settings)
 * 2. Environment variable (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, etc.)
 * 3. Built-in hardcoded fallback key
 */
export function getActiveAiConfig(requestedProvider?: string): ActiveAiConfig {
  let provider = requestedProvider || 'gemini';
  let model = '';
  let customKey = '';
  let evidenceThreshold = 65;
  let backupProvider = 'groq';
  let backupModel = 'llama-3.3-70b-versatile';

  try {
    const rows = db.prepare('SELECT key, value FROM user_settings').all() as { key: string; value: string }[];
    for (const r of rows) {
      if (!requestedProvider && r.key === 'ai_provider' && r.value) provider = r.value;
      if (r.key === 'model_name' && r.value) model = r.value;
      if (r.key === 'evidence_threshold' && r.value) evidenceThreshold = Number(r.value) || 65;
      if (r.key === 'backup_provider' && r.value) backupProvider = r.value;
      if (r.key === 'backup_model' && r.value) backupModel = r.value;
    }

    // Check provider_credentials table
    const cred = db.prepare('SELECT encrypted_key, model FROM provider_credentials WHERE provider = ? AND is_active = 1').get(provider) as { encrypted_key?: string; model?: string } | undefined;
    if (cred && cred.encrypted_key) {
      customKey = decryptSecret(cred.encrypted_key);
      if (cred.model) model = cred.model;
    }

    // Legacy fallback in user_settings
    if (!customKey && provider === 'gemini') {
      const legacy = rows.find((r) => r.key === 'custom_gemini_key');
      if (legacy && legacy.value) {
        customKey = decryptSecret(legacy.value);
      }
    }
  } catch (err) {
    console.warn('[ApiKeyManager] DB query warning:', err);
  }

  // Find provider catalog entry
  const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === provider) || PROVIDER_CATALOG[0];

  if (!model) {
    model = catalogEntry.defaultModel;
  }

  // Check env variable
  const envKey = (process.env[catalogEntry.envKeyVar] || '').trim();
  const fallbackKey = catalogEntry.apiKeyFallback || '';

  // Select key: custom > env > fallback
  let activeKey = '';
  let isCustom = false;

  if (customKey && customKey.trim()) {
    activeKey = customKey.trim();
    isCustom = true;
  } else if (envKey && envKey !== 'YOUR_API_KEY' && envKey !== 'MY_GEMINI_API_KEY') {
    activeKey = envKey;
  } else if (fallbackKey) {
    activeKey = fallbackKey;
  }

  // Determine vision support
  const selectedModelDef = catalogEntry.supportedModels.find((m) => m.id === model);
  const visionSupported = selectedModelDef ? selectedModelDef.vision : catalogEntry.visionSupported;

  return {
    provider,
    model,
    apiKey: activeKey,
    isCustomKey: isCustom,
    maskedKey: maskKey(activeKey),
    evidenceThreshold,
    visionSupported,
    backupProvider,
    backupModel,
  };
}

/**
 * Saves provider credentials into secure database with AES-256-GCM encryption.
 */
export function saveCustomAiConfig(data: {
  apiKey?: string;
  provider?: string;
  model?: string;
  evidenceThreshold?: number;
  backupProvider?: string;
  backupModel?: string;
}): ActiveAiConfig {
  const provider = data.provider || 'gemini';
  const model = data.model || '';

  const setStmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');

  db.transaction(() => {
    if (data.provider !== undefined) {
      setStmt.run('ai_provider', data.provider);
    }
    if (data.model !== undefined) {
      setStmt.run('model_name', data.model);
    }
    if (data.evidenceThreshold !== undefined) {
      setStmt.run('evidence_threshold', String(data.evidenceThreshold));
    }
    if (data.backupProvider !== undefined) {
      setStmt.run('backup_provider', data.backupProvider);
    }
    if (data.backupModel !== undefined) {
      setStmt.run('backup_model', data.backupModel);
    }

    if (data.apiKey !== undefined && data.apiKey.trim()) {
      const encrypted = encryptSecret(data.apiKey.trim());
      const credStmt = db.prepare(`
        INSERT OR REPLACE INTO provider_credentials (id, provider, model, encrypted_key, is_active, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `);
      credStmt.run(provider, provider, model, encrypted, new Date().toISOString());

      // If gemini, also maintain backward compatibility
      if (provider === 'gemini') {
        setStmt.run('custom_gemini_key', encrypted);
      }
    }
  })();

  return getActiveAiConfig(data.provider);
}

/**
 * Deletes custom API key for a provider
 */
export function deleteCustomApiKey(provider = 'gemini'): ActiveAiConfig {
  try {
    db.prepare('DELETE FROM provider_credentials WHERE provider = ?').run(provider);
    if (provider === 'gemini') {
      db.prepare("DELETE FROM user_settings WHERE key = 'custom_gemini_key'").run();
    }
  } catch (err) {
    console.warn('[ApiKeyManager] Delete key error:', err);
  }
  return getActiveAiConfig(provider);
}

/**
 * Lists all configured provider statuses (without leaking plaintext secrets)
 */
export function listAllProvidersStatus(): Array<{
  id: string;
  name: string;
  hasKey: boolean;
  maskedKey: string;
  isCustom: boolean;
  visionSupported: boolean;
  defaultModel: string;
  supportedModels: SupportedModel[];
}> {
  return PROVIDER_CATALOG.map((p) => {
    const config = getActiveAiConfig(p.id);
    return {
      id: p.id,
      name: p.name,
      hasKey: Boolean(config.apiKey),
      maskedKey: config.maskedKey,
      isCustom: config.isCustomKey,
      visionSupported: p.visionSupported,
      defaultModel: p.defaultModel,
      supportedModels: p.supportedModels,
    };
  });
}

export { maskKey };
