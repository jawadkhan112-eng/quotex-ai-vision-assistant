import { describe, it, expect } from 'vitest';
import { maskKey, getActiveAiConfig } from '../server/apiKeyManager';

describe('API Key Manager & Security Tests', () => {
  it('masks API keys safely', () => {
    expect(maskKey('AIzaSyD1234567890QWERTY')).toBe('AIza...ERTY');
    expect(maskKey('')).toBe('NOT_SET');
  });

  it('resolves active AI config without crashing', () => {
    const config = getActiveAiConfig();
    expect(config.provider).toBeDefined();
    expect(config.model).toBeDefined();
    expect(config.maskedKey).toBeDefined();
  });
});
