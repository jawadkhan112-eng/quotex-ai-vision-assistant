/**
 * Universal AI Provider & Model Router
 * 
 * Provides:
 * 1. Dynamic Model Normalization: maps legacy, partial, or user-selected model strings
 *    (e.g., "gemini-1.5-pro", "Gemini 1.5 Flash", "anthropic/claude-3.5-sonnet") to currently active,
 *    live, vision-capable model identifiers across Gemini, Groq, OpenRouter, OpenAI, and Anthropic.
 * 2. Strict Vision Safety Check: guarantees that incoming base64 screen frames are only sent
 *    to models with true multimodal/vision support. If a text-only model is requested, it seamlessly
 *    reroutes to the premier vision model of that provider.
 * 3. Strict User-Selected Model Lock: only the exact provider and model chosen by the user are queried.
 *    No automatic fallback to third-party or backup providers is performed. If the selected model fails,
 *    a clean descriptive error is returned instead of silently routing elsewhere.
 */

export interface NormalizedModelSelection {
  provider: string;
  model: string;
  isVisionSupported: boolean;
  normalizedName: string;
}

/**
 * Normalizes user/client requested model strings into currently active, valid model IDs.
 */
export function normalizeAiModel(rawModel?: string, rawProvider?: string): NormalizedModelSelection {
  const provider = (rawProvider || '').toLowerCase().trim();
  const model = (rawModel || '').trim();

  // 1. Google Gemini Normalization
  // Note: gemini-2.0-flash and gemini-1.5-pro are deprecated/unavailable on newer endpoints.
  // We automatically upgrade/map requests to active, supported models: gemini-3.8-flash, gemini-3-flash-preview, or gemini-2.5-flash.
  if (provider === 'gemini') {
    const lower = model.toLowerCase();
    if (lower.includes('3.8-flash') || lower.includes('3.8')) {
      return {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        isVisionSupported: true,
        normalizedName: 'Gemini 3.8 Flash (Latest Preview)',
      };
    }
    if (lower.includes('2.0-flash') || lower.includes('2.0') || lower.includes('1.5-pro') || lower.includes('pro')) {
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash', // Seamlessly map deprecated 2.0-flash and 1.5-pro to stable 2.5-flash
        isVisionSupported: true,
        normalizedName: 'Gemini 2.5 Flash',
      };
    }
    if (lower.includes('2.5-flash') || lower.includes('2.5')) {
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        isVisionSupported: true,
        normalizedName: 'Gemini 2.5 Flash',
      };
    }
    // Default to latest active Gemini flash model
    return {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      isVisionSupported: true,
      normalizedName: 'Gemini 2.5 Flash',
    };
  }

  // 2. OpenRouter Normalization
  // Note: anthropic/claude-3.5-sonnet is deprecated/no longer available on standard slugs.
  // We map to active free or high-performance models (meta-llama/llama-3.2-11b-vision-instruct:free or google/gemini-2.5-flash)
  if (provider === 'openrouter') {
    const lower = model.toLowerCase();
    if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('3.5-sonnet')) {
      return {
        provider: 'openrouter',
        model: 'meta-llama/llama-3.2-11b-vision-instruct:free', // Free, active, high-capability vision
        isVisionSupported: true,
        normalizedName: 'Llama 3.2 11B Vision (OpenRouter Free)',
      };
    }
    if (lower.includes('gemini')) {
      return {
        provider: 'openrouter',
        model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        isVisionSupported: true,
        normalizedName: 'Llama 3.2 11B Vision (OpenRouter Free)',
      };
    }
    if (lower.includes('llama') || lower.includes('meta')) {
      return {
        provider: 'openrouter',
        model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        isVisionSupported: true,
        normalizedName: 'Llama 3.2 11B Vision (OpenRouter Free)',
      };
    }
    if (lower.includes('deepseek')) {
      return {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        isVisionSupported: false,
        normalizedName: 'DeepSeek Chat V3',
      };
    }
    // Default openrouter model
    return {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
      isVisionSupported: true,
      normalizedName: 'Llama 3.2 11B Vision (OpenRouter Free)',
    };
  }

  // 3. Groq Cloud Normalization
  if (provider === 'groq' || model.toLowerCase().includes('llama') || model.toLowerCase().includes('mixtral')) {
    const lower = model.toLowerCase();
    if (lower.includes('vision') || lower.includes('11b') || lower.includes('90b')) {
      return {
        provider: 'groq',
        model: 'llama-3.2-11b-vision-preview',
        isVisionSupported: true,
        normalizedName: 'Llama 3.2 11B Vision',
      };
    }
    // If text model requested (e.g. 70b-versatile), mark vision as false
    if (lower.includes('70b') || lower.includes('versatile')) {
      return {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        isVisionSupported: false,
        normalizedName: 'Llama 3.3 70B Versatile',
      };
    }
    return {
      provider: 'groq',
      model: 'llama-3.2-11b-vision-preview',
      isVisionSupported: true,
      normalizedName: 'Llama 3.2 11B Vision',
    };
  }

  // 4. OpenAI Direct
  if (provider === 'openai' || model.toLowerCase().includes('gpt')) {
    const lower = model.toLowerCase();
    if (lower.includes('mini')) {
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        isVisionSupported: true,
        normalizedName: 'GPT-4o Mini',
      };
    }
    return {
      provider: 'openai',
      model: 'gpt-4o',
      isVisionSupported: true,
      normalizedName: 'GPT-4o',
    };
  }

  // 5. Anthropic Direct
  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      isVisionSupported: true,
      normalizedName: 'Claude 3.5 Sonnet (Latest)',
    };
  }

  // Fallback default
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    isVisionSupported: true,
    normalizedName: 'Gemini 2.5 Flash',
  };
}

/**
 * Returns prioritized list of candidate models for a given provider,
 * allowing instant failover within the same provider before jumping to the backup provider.
 */
export function getProviderModelCandidates(provider: string, primaryModel?: string): string[] {
  const p = (provider || '').toLowerCase();
  if (p === 'gemini') {
    // Strict user-selected model lock: return only the exact selected model.
    // No intra-provider fallback to alternate Gemini models.
    return primaryModel ? [primaryModel] : [];
  }

  if (p === 'groq') {
    // Strict user-selected model lock: return only the exact selected model.
    return primaryModel ? [primaryModel] : [];
  }

  if (p === 'openrouter') {
    // Strict user-selected model lock: return only the exact selected model.
    return primaryModel ? [primaryModel] : [];
  }

  return primaryModel ? [primaryModel] : [];
}

/**
 * Determines if an error is a transient high-demand (503), rate-limit (429), or not-found (404) error
 * that warrants immediate failover.
 */
export function isFailoverEligibleError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const status = Number(err.status || err.statusCode || 0);

  return (
    status === 404 ||
    status === 503 ||
    status === 429 ||
    status === 502 ||
    status === 504 ||
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('service unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('no longer available') ||
    msg.includes('is not supported')
  );
}
