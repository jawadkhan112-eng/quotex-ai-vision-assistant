import { describe, it, expect } from 'vitest';
import { maskKey, getActiveAiConfig, saveCustomAiConfig, deleteCustomApiKey, listAllProvidersStatus } from '../server/apiKeyManager';
import { encryptSecret, decryptSecret } from '../server/crypto';

describe('AES-256-GCM Crypto & Key Vault Tests', () => {
  it('encrypts and decrypts secrets reversibly and securely', () => {
    const rawKey = 'AIzaSyTestPlaceholderKey123';
    const encrypted = encryptSecret(rawKey);

    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toBe(rawKey);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(rawKey);
  });

  it('masks API keys without leaking characters', () => {
    expect(maskKey('AIzaSyTestPlaceholderKey123')).toBe('AIza...y123');
    expect(maskKey('gsk_test_placeholder')).toBe('gsk_...lder');
    expect(maskKey('')).toBe('NOT_SET');
    expect(maskKey('short')).toBe('SET');
  });

  it('resolves active AI config with environment variables or fallback', () => {
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalGroq = process.env.GROQ_API_KEY;
    const originalOpenRouter = process.env.OPENROUTER_API_KEY;

    try {
      process.env.GEMINI_API_KEY = 'AIzaSyTestPlaceholderKey123';
      process.env.GROQ_API_KEY = 'gsk_test_placeholder';
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-placeholder';

      const geminiConfig = getActiveAiConfig('gemini');
      expect(geminiConfig.provider).toBe('gemini');
      expect(geminiConfig.apiKey).toBe('AIzaSyTestPlaceholderKey123');
      expect(geminiConfig.maskedKey).toBe('AIza...y123');

      const groqConfig = getActiveAiConfig('groq');
      expect(groqConfig.provider).toBe('groq');
      expect(groqConfig.apiKey).toBe('gsk_test_placeholder');

      const openRouterConfig = getActiveAiConfig('openrouter');
      expect(openRouterConfig.provider).toBe('openrouter');
      expect(openRouterConfig.apiKey).toBe('sk-or-v1-test-placeholder');
    } finally {
      process.env.GEMINI_API_KEY = originalGemini;
      process.env.GROQ_API_KEY = originalGroq;
      process.env.OPENROUTER_API_KEY = originalOpenRouter;
    }
  });

  it('saves custom encrypted key and deletes it safely', () => {
    const customTestKey = 'test_custom_secret_key_123456789';
    saveCustomAiConfig({ provider: 'gemini', apiKey: customTestKey });

    const saved = getActiveAiConfig('gemini');
    expect(saved.isCustomKey).toBe(true);
    expect(saved.apiKey).toBe(customTestKey);

    deleteCustomApiKey('gemini');
    const reverted = getActiveAiConfig('gemini');
    expect(reverted.isCustomKey).toBe(false);
  });

  it('lists provider status without leaking unmasked secrets', () => {
    const list = listAllProvidersStatus();
    expect(list.length).toBeGreaterThan(3);
    for (const item of list) {
      expect(item.maskedKey).not.toContain('AIzaSyTestPlaceholderKey123');
      expect(item.supportedModels.length).toBeGreaterThan(0);
    }
  });
});
