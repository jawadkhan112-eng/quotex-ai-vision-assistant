import { describe, it, expect } from 'vitest';
import { normalizeAiModel, getProviderModelCandidates, isFailoverEligibleError, isVisionModel } from '../server/aiRouter';

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
    expect(claudeDeprecated.model).toBe('meta-llama/llama-3.2-11b-vision-instruct:free');
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

  it('returns only the user-selected model (strict model lock, no intra-provider cascade)', () => {
    // Strict lock: gemini returns only the exact selected model
    const geminiCandidates = getProviderModelCandidates('gemini', 'gemini-3.8-flash');
    expect(geminiCandidates).toEqual(['gemini-3.8-flash']);
    expect(geminiCandidates).not.toContain('gemini-1.5-pro');
    expect(geminiCandidates).not.toContain('gemini-2.0-flash');
    expect(geminiCandidates).not.toContain('gemini-2.5-flash');

    // Strict lock: groq returns only the exact selected model
    const groqCandidates = getProviderModelCandidates('groq', 'llama-3.2-11b-vision-preview');
    expect(groqCandidates).toEqual(['llama-3.2-11b-vision-preview']);

    // Strict lock: openrouter returns only the exact selected model
    const openRouterCandidates = getProviderModelCandidates(
      'openrouter',
      'meta-llama/llama-3.2-11b-vision-instruct:free'
    );
    expect(openRouterCandidates).toEqual(['meta-llama/llama-3.2-11b-vision-instruct:free']);
    expect(openRouterCandidates).not.toContain('anthropic/claude-3.5-sonnet');
    expect(openRouterCandidates).not.toContain('google/gemini-2.5-flash');
    expect(openRouterCandidates).not.toContain('openai/gpt-4o');

    // No primary model → empty list (no implicit fallback)
    expect(getProviderModelCandidates('gemini')).toEqual([]);
    expect(getProviderModelCandidates('openrouter')).toEqual([]);
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

describe('Strict User-Selected Model Lock & Vision Validation Tests', () => {
  it('preserves the user-selected model for unrecognized providers (no hardcoded fallback)', () => {
    // DeepSeek must be preserved exactly as selected, NOT silently mapped to gemini-2.5-flash
    const deepseek = normalizeAiModel('deepseek-chat', 'deepseek');
    expect(deepseek.model).toBe('deepseek-chat');
    expect(deepseek.provider).toBe('deepseek');
    expect(deepseek.isVisionSupported).toBe(false);

    const deepseekReasoner = normalizeAiModel('deepseek-reasoner', 'deepseek');
    expect(deepseekReasoner.model).toBe('deepseek-reasoner');
    expect(deepseekReasoner.isVisionSupported).toBe(false);

    // Ollama
    const ollamaVision = normalizeAiModel('llama3.2-vision', 'ollama');
    expect(ollamaVision.model).toBe('llama3.2-vision');
    expect(ollamaVision.isVisionSupported).toBe(true);
  });

  it('returns the user-selected model for OpenRouter and Groq without hardcoded defaults', () => {
    const openRouterDeepSeek = normalizeAiModel('deepseek/deepseek-chat', 'openrouter');
    expect(openRouterDeepSeek.model).toBe('deepseek/deepseek-chat');
    expect(openRouterDeepSeek.isVisionSupported).toBe(false);

    const groqMixtral = normalizeAiModel('mixtral-8x7b', 'groq');
    expect(groqMixtral.model).toBe('mixtral-8x7b');
    expect(groqMixtral.isVisionSupported).toBe(false);
  });

  it('preserves user-selected Gemini models exactly (no silent rewrite to gemini-2.5-flash)', () => {
    // If a user explicitly selects gemini-3.8-flash, it must NOT be rewritten to gemini-2.5-flash
    const gemini38 = normalizeAiModel('gemini-3.8-flash', 'gemini');
    expect(gemini38.model).toBe('gemini-3.8-flash');

    const gemini25 = normalizeAiModel('gemini-2.5-flash', 'gemini');
    expect(gemini25.model).toBe('gemini-2.5-flash');
  });

  it('isVisionModel returns true only for vision-capable models', () => {
    expect(isVisionModel(normalizeAiModel('gemini-3.8-flash', 'gemini'))).toBe(true);
    expect(isVisionModel(normalizeAiModel('gemini-2.5-flash', 'gemini'))).toBe(true);
    expect(isVisionModel(normalizeAiModel('deepseek-chat', 'deepseek'))).toBe(false);
    expect(isVisionModel(normalizeAiModel('deepseek-reasoner', 'deepseek'))).toBe(false);
    expect(isVisionModel(normalizeAiModel('llama3.2-vision', 'ollama'))).toBe(true);
    expect(isVisionModel(normalizeAiModel('llama3.1', 'ollama'))).toBe(false);
    expect(isVisionModel(normalizeAiModel('gpt-4o', 'openai'))).toBe(true);
  });

  it('returns a clear error when a text-only model is used for image analysis', () => {
    const textOnly = normalizeAiModel('deepseek-chat', 'deepseek');
    const result = isVisionModel(textOnly);
    expect(result).toBe(false);
  });
});
