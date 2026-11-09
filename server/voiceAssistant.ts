import { GoogleGenAI } from '@google/genai';
import { getActiveAiConfig } from './apiKeyManager.js';

export async function askVoiceAssistant(
  userQuery: string,
  contextData?: any
): Promise<string> {
  const aiConfig = getActiveAiConfig();
  const apiKey = aiConfig.apiKey;

  if (!apiKey) {
    return 'Voice assistant is ready. However, no AI API key is configured. Please add your key in Settings -> AI/API Configuration.';
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = `You are Quotex AI Vision Voice Assistant, an expert quantitative analyst and risk management advisor for binary options.
Your voice responses must be:
1. Concise, direct, and professional (max 3-4 sentences for voice output).
2. Grounded strictly in technical analysis, price action, indicators, and risk management.
3. NEVER promise guaranteed win rates or profit. Emphasize that market conditions change.
4. Explain clearly why a signal is CALL, PUT, or WAIT.

Current Analysis Context:
${JSON.stringify(contextData || {}, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model: aiConfig.model || 'gemini-3.8-flash',
      contents: userQuery,
      config: {
        systemInstruction,
      },
    });

    return response.text || 'I analyzed the chart context. Please ask any specific questions about signals or indicators.';
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
