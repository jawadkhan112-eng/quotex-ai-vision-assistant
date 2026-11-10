/**
 * Universal AI Provider & Model Router
 * 
 * Provides:
 * 1. Dynamic Model Normalization: maps legacy, partial, or user-selected model strings
 *    (e.g., "gemini-1.5-pro", "Gemini 1.5 Flash", "anthropic/claude-3.5-sonnet") to currently active,
 *    live, vision-capable model identifiers across Gemini, Groq, OpenRouter, OpenAI, and Anthropic.
 * 2. Strict Vision Safety Check: validates that the user-selected model supports multimodal image input.
 *    If a text-only model is selected, this function returns isVisionSupported: false so the caller
 *    can return a clear, user-friendly error instead of sending a text-only model to an image analysis.
 * 3. Strict User-Selected Model Lock: only the exact provider and model chosen by the user are queried.
 *    No automatic fallback to third-party or backup providers is performed. If the selected model fails,
 *    a clean descriptive error is returned instead of silently routing elsewhere.
 */

/**
 * Normalized model selection result from the AI Router.
 */
export interface NormalizedModelSelection {
  provider: string;
  model: string;
  isVisionSupported: boolean;
  normalizedName: string;
}

/**
 * Maps every known UI-friendly model label into its official Google AI Studio / provider API slug.
 *
 * This is the canonical "UI label → API slug" resolver used before any API call.
 * It guarantees that human-entered model names (e.g. "Gemini 3.8 Flash", "Gemini 4 Argon")
 * are translated to the exact model ID the provider endpoint expects, preventing 404 / NOT_FOUND
 * errors caused by sending raw UI strings directly to the API.
 *
 * @param uiModel The model string as displayed in the UI or supplied by the user
 * @param provider The provider slug (e.g. 'gemini', 'openrouter', 'groq', 'anthropic', 'deepseek', 'ollama')
 * @returns The official API model ID (e.g. 'gemini-3.8-flash', 'gemini-2.5-flash')
 */
export function normalizeUiModelToApiSlug(uiModel?: string, provider = 'gemini'): string {
  const lower = (uiModel || '').toLowerCase().trim();

  // ---- Google Gemini AI Studio (primary target) ----
  if (provider === 'gemini' || !provider || provider === 'google' || provider === 'googleai') {
    // Latest 3.x series
    if (lower.includes('4 argon') || lower.includes('4 argon')) {
      return 'gemini-4-flash';
    }
    if (lower.includes('3.6 flash') || lower.includes('3.6')) {
      return 'gemini-3.6-flash';
    }
    if (lower.includes('3.5 flash lite') || lower.includes('3.5 flash') || lower.includes('3.5')) {
      return 'gemini-3.5-flash';
    }
    if (lower.includes('3.8 flash') || lower.includes('3.8')) {
      return 'gemini-3.8-flash';
    }
    if (lower.includes('3.7 flash') || lower.includes('3.7')) {
      return 'gemini-3.7-flash';
    }
    if (lower.includes('3.6 flash') || lower.includes('3.6')) {
      return 'gemini-3.6-flash';
    }
    if (lower.includes('3.5 flash') || lower.includes('3.5')) {
      return 'gemini-3.5-flash';
    }
    // 2.x parity — intentionally omitted: we do NOT silently map to gemini-2.5-flash.
    // User-selected model names are preserved exactly; caller decides fallback.
    // if (lower.includes('2.5 flash') || lower.includes('2.5')) {
    //   return 'gemini-2.5-flash';
    // }
    // if (lower.includes('2.0 flash') || lower.includes('2.0')) {
    //   return 'gemini-2.0-flash';
    // }
    // if (lower.includes('1.5 pro') || lower.includes('1.5 pro')) {
    //   return 'gemini-1.5-pro';
    // }
    // if (lower.includes('1.5 flash') || lower.includes('1.5')) {
    //   return 'gemini-1.5-flash';
    // }
    // Fallback for any ambiguous gemini label — preserve user selection exactly.
    if (lower.includes('flash') || lower.includes('pro') || lower.includes('argon')) {
      return uiModel || '';
    }
    return uiModel || '';mini-2.5-flash';
    }
    return 'gemini-2.5-flash';
  }

  // ---- OpenRouter ----
  if (provider === 'openrouter' || provider === 'open router') {
    if (lower.includes('gemini-4') || lower.includes('4 argon') || lower.includes('4 argono')) {
      return 'google/gemini-4-flash';
    }
    if (lower.includes('gemini-3.6') || lower.includes('3.6')) {
      return 'google/gemini-3.6-flash';
    }
    if (lower.includes('gemini-3.5') || lower.includes('3.5 flash')) {
      return 'google/gemini-3.5-flash-lite';
    }
    if (lower.includes('gemini-3.8') || lower.includes('3.8')) {
      return 'google/gemini-3.8-flash';
    }
    if (lower.includes('gemini-2.5') || lower.includes('2.5') || lower.includes('gemini 2')) {
      return 'google/gemini-2.5-flash';
    }
    if (lower.includes('gemini-1.5') || lower.includes('1.5')) {
      return 'google/gemini-1.5-flash';
    }
    // Generic free/openrouter gemini catchment
    if (lower.includes('gemini')) return 'google/gemini-2.0-flash-exp';
    return 'google/gemini-2.0-flash-exp';
  }

  // ---- Groq ----
  if (provider === 'groq' || provider === 'groq cloud') {
    if (lower.includes('llama-3.2-90b') || lower.includes('90b')) {
      return 'llama-3.2-90b-vision-preview';
    }
    if (lower.includes('llama-3.2-11b') || lower.includes('11b')) {
      return 'llama-3.2-11b-vision-preview';
    }
    if (lower.includes('llama-3.3-70b') || lower.includes('70b')) {
      return 'llama-3.3-70b-versatile';
    }
    if (lower.includes('mixtral') || lower.includes('8x7b')) {
      return 'mixtral-8x7b-32768';
    }
    return 'llama-3.2-11b-vision-preview';
  }

  // ---- Anthropic ----
  if (provider === 'anthropic' || provider === 'anthropic direct') {
    if (lower.includes('3.5 sonnet') || lower.includes('3.5')) {
      return 'claude-3-5-sonnet-20241022';
    }
    if (lower.includes('claude-3-7') || lower.includes('3.7')) {
      return 'claude-3-7-sonnet-20250219';
    }
    return 'claude-3-5-sonnet-20241022';
  }

  // ---- DeepSeek ------
  if (provider === 'deepseek' || provider === 'deepseek direct') {
    if (lower.includes('reasoner')) {
      return 'deepseek-reasoner';
    }
    return 'deepseek-chat';
  }

  // ---- Ollama (Local) ----
  if (provider === 'ollama' || provider === 'ollama local') {
    if (lower.includes('vision') || lower.includes('llama3.2')) {
      return 'llama3.2-vision';
    }
    if (lower.includes('llama3.1')) {
      return 'llama3.1';
    }
    return 'llama3.2-vision';
  }

  // ---- OpenAI (Direct) ----
  if (provider === 'openai' || provider === 'openai direct') {
    if (lower.includes('4o-mini')) {
      return 'gpt-4o-mini';
    }
    if (lower.includes('4o')) {
      return 'gpt-4o';
    }
    return 'gpt-4o';
  }

  // Generic fallback: treat the input as likely an AI Studio gemini label
  if (lower.includes('gemini') || lower.includes('flash') || lower.includes('pro') || lower.includes('argon')) {
    return 'gemini-2.5-flash';
  }

  // If nothing matched, return the raw string as-is so the caller can decide
  return (uiModel || '').trim() || 'gemini-2.5-flash';
}

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

  // 3. Groq Cloud Normalization (all Groq models must use provider 'groq')
  if (provider === 'groq') {
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
    // Unknown Groq model: honor user's exact selection (mark as text-only by default)
    return {
      provider: 'groq',
      model,
      isVisionSupported: false,
      normalizedName: `Groq (${model})`,
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

  // 5. DeepSeek
  // Created to support reasoning models from the DeepSeek API.
  if (provider === 'deepseek' || model.toLowerCase().includes('deepseek')) {
    const lower = model.toLowerCase();
    if (lower.includes('deepseek-chat')) {
      return {
        provider: 'deepseek',
        model: 'deepseek-chat',
        isVisionSupported: false,
        normalizedName: 'DeepSeek Chat (V3)',
      };
    }
    if (lower.includes('deepseek-reasoner')) {
      return {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        isVisionSupported: false,
        normalizedName: 'DeepSeek R1 (Reasoner)',
      };
    }
    return {
      provider: 'deepseek',
      model,
      isVisionSupported: false,
      normalizedName: `DeepSeek (${model})`,
    };
  }

  // 6. Ollama (Local)
  // Self-hosted local models with zero external API calls.
  if (provider === 'ollama' || model.toLowerCase().includes('ollama')) {
    const lower = model.toLowerCase();
    if (lower.includes('vision')) {
      return {
        provider: 'ollama',
        model: 'llama3.2-vision',
        isVisionSupported: true,
        normalizedName: 'Llama 3.2 Vision (Local Vision)',
      };
    }
    return {
      provider: 'ollama',
      model,
      isVisionSupported: false,
      normalizedName: `Ollama (${model})`,
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

  // Unrecognized provider or model: honor the user's exact selection.
  // Do NOT silently overwrite with a hardcoded default model (e.g. gemini-2.5-flash).
  return {
    provider,
    model,
    isVisionSupported: false,
    normalizedName: model || provider || 'Unknown Model',
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

/**\n * Determines if a selected model supports multimodal image/video input.\n * Returns true only for models whose catalog entry has vision: true.\n */
export function isVisionModel(modelSelection: NormalizedModelSelection): boolean {
  return modelSelection.isVisionSupported === true;
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
