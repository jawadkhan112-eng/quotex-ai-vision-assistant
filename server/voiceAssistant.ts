import { GoogleGenAI } from '@google/genai';
import { getActiveAiConfig } from './apiKeyManager.js';
import { normalizeAiModel, getProviderModelCandidates, isFailoverEligibleError } from './aiRouter.js';

export async function askVoiceAssistant(
  userQuery: string,
  contextData?: any,
  providerOverride?: string,
  apiKeyOverride?: string,
  modelOverride?: string
): Promise<string> {
  const aiConfig = getActiveAiConfig(providerOverride);
  const rawProvider = providerOverride || aiConfig.provider || 'gemini';
  const rawModel = modelOverride || aiConfig.model || 'gemini-2.5-flash';

  const normalized = normalizeAiModel(rawModel, rawProvider);
  const provider = normalized.provider;
  const model = normalized.model;
  const apiKey = apiKeyOverride || (aiConfig.provider === provider ? aiConfig.apiKey : getActiveAiConfig(provider).apiKey);

  if (!apiKey) {
    return 'Voice assistant is ready. However, no AI API key is configured. Please add your key in Settings -> AI/API Configuration.';
  }

  const systemInstruction = `You are Quotex AI Vision Voice Assistant, an expert quantitative analyst and risk management advisor for binary options.
Your voice responses must be:
1. Concise, direct, and professional (max 3-4 sentences for voice output).
2. Grounded strictly in technical analysis, price action, indicators, and risk management.
3. NEVER promise guaranteed win rates or profit. Emphasize that market conditions change.
4. Explain clearly why a signal is CALL, PUT, or WAIT.

Current Analysis Context:
${JSON.stringify(contextData || {}, null, 2)}`;

  try {
    if (provider === 'gemini') {
      const candidateModels = getProviderModelCandidates('gemini', model);

      // Attempt REST endpoints first to avoid 404 SDK version mismatch (standard v1 preferred)
      for (const m of candidateModels) {
        const endpoints = [
          `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${apiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
        ];
        for (const url of endpoints) {
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: userQuery }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const data = await res.json() as any;
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) return text;
            }
          } catch {
            // continue fallback
          }
        }
      }

      // SDK fallback
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'quotex-ai-vision-assistant/1.0',
          },
        },
      });

      const response = await ai.models.generateContent({
        model,
        contents: userQuery,
        config: {
          systemInstruction,
        },
      });

      return response.text || 'I analyzed the chart context. Please ask any specific questions about signals or indicators.';
    } else if (provider === 'groq' || provider === 'openrouter' || provider === 'openai') {
      const endpoint = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userQuery },
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`${provider.toUpperCase()} chat error (${res.status}): ${errorText.slice(0, 150)}`);
      }

      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content || 'Analysis complete.';
    } else {
      return 'Voice assistant: active provider text generation complete.';
    }
  } catch (err: any) {
    console.error('Voice Assistant Error:', err);
    if (err.message?.includes('429')) {
      return 'API quota limit reached (429). Please wait a moment before asking another question.';
    }
    if (err.message?.includes('401') || err.message?.includes('API_KEY_INVALID')) {
      return 'Your saved API key is invalid or expired. Please update your key in Settings -> AI/API Configuration.';
    }
    return `Assistant Notice: Unable to complete request (${err.message || 'connection issue'}). Please check API key status.`;
  }
}
