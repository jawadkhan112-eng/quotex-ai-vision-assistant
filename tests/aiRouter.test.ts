import { describe, it, expect } from 'vitest';
import { normalizeAiModel, getProviderModelCandidates, isFailoverEligibleError } from '../server/aiRouter';

describe('Universal AI Router & Dynamic Model Mapping Tests', () => {
  it('maps legacy and unsupported Gemini models to active flash endpoints', () => {
    // gemini-1.5-pro should automatically map to gemini-2.5-flash
    const proMapping = normalizeAiModel('gemini-1.5-pro', 'gemini');
    expect(proMapping.model).toBe('gemini-2.5-flash');
    expect(proMapping.isVisionSupported).toBe(true);

    // gemini-2.0-flash should be safely mapped to gemini-2.5-flash
    const flash20 = normalizeAiModel('gemini-2.0-flash', 'gemini');
    expect(flash20.model).toBe('gemini-2.5-flash');
    expect(flash20.isVisionSupported).toBe(true);

    // gemini-3.8-flash should be recognized and preserved
    const flash38 = normalizeAiModel('gemini-3.8-flash', 'gemini');
    expect(flash38.model).toBe('gemini-3.8-flash');
    expect(flash38.isVisionSupported).toBe(true);

    // default gemini fallback
    const defaultGemini = normalizeAiModel('', 'gemini');
    expect(defaultGemini.model).toBe('gemini-2.5-flash');
    expect(defaultGemini.isVisionSupported).toBe(true);
  });

  it('maps deprecated OpenRouter Claude slugs to free/active vision models', () => {
    const claudeDeprecated = normalizeAiModel('anthropic/claude-3.5-sonnet', 'openrouter');
    expect(claudeDeprecated.model).toBe('google/gemini-2.0-flash-exp:free');
    expect(claudeDeprecated.isVisionSupported).toBe(true);

    const openRouterLlama = normalizeAiModel('llama-3.2-vision', 'openrouter');
    expect(openRouterLlama.model).toBe('meta-llama/llama-3.2-11b-vision-instruct:free');
    expect(openRouterLlama.isVisionSupported).toBe(true);
  });

  it('correctly flags text-only models and reroutes vision models on Groq', () => {
    const groqText = normalizeAiModel('llama-3.3-70b-versatile', 'groq');
    expect(groqText.isVisionSupported).toBe(false);

    const groqVision = normalizeAiModel('llama-3.2-11b-vision-preview', 'groq');
    expect(groqVision.isVisionSupported).toBe(true);
    expect(groqVision.model).toBe('llama-3.2-11b-vision-preview');
  });

  it('generates prioritized candidate lists excluding defunct models', () => {
    const candidates = getProviderModelCandidates('gemini', 'gemini-1.5-pro');
    expect(candidates).not.toContain('gemini-1.5-pro');
    expect(candidates).not.toContain('gemini-2.0-flash');
    expect(candidates).toContain('gemini-2.5-flash');
    expect(candidates).toContain('gemini-3.8-flash');

    const openRouterCandidates = getProviderModelCandidates('openrouter');
    expect(openRouterCandidates).not.toContain('anthropic/claude-3.5-sonnet');
    expect(openRouterCandidates).toContain('google/gemini-2.0-flash-exp:free');
  });

  it('accurately identifies failover-eligible errors (404, 503, 429)', () => {
    expect(isFailoverEligibleError({ status: 404 })).toBe(true);
    expect(isFailoverEligibleError({ status: 503 })).toBe(true);
    expect(isFailoverEligibleError({ status: 429 })).toBe(true);
    expect(isFailoverEligibleError(new Error('models/gemini-1.5-pro is not found for API version v1beta'))).toBe(true);
    expect(isFailoverEligibleError(new Error('The model anthropic/claude-3.5-sonnet is no longer available'))).toBe(true);
    expect(isFailoverEligibleError(new Error('SyntaxError: unexpected token'))).toBe(false);
  });
});
