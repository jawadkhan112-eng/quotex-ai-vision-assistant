import { describe, expect, it } from 'vitest';
import { PROVIDERS, maskProviderKey } from '../server/aiProviders';

describe('AI provider capability disclosure', () => {
  it('only advertises vision where the integration supports it', () => {
    expect(PROVIDERS.gemini.vision).toBe(true);
    expect(PROVIDERS.groq.vision).toBe(false);
    expect(PROVIDERS.openrouter.vision).toBe(false);
    expect(PROVIDERS.cerebras.vision).toBe(false);
    expect(PROVIDERS.huggingface.vision).toBe(false);
  });
  it('masks provider credentials', () => {
    expect(maskProviderKey('secret-provider-key')).toBe('secr…-key');
    expect(maskProviderKey('tiny')).toBe('SET');
  });
});
