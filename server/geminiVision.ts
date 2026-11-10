import { GoogleGenAI, Type } from '@google/genai';
import { getActiveAiConfig, PROVIDER_CATALOG } from './apiKeyManager.js';

export interface VisionAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  chartReadable: boolean;
  evidenceQuality: number; // 0-100 (Objective visual clarity & confluence score)
  detectedAsset?: string;
  detectedTimeframe?: string;
  trend: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL_SIDEWAYS' | 'BEARISH' | 'STRONG_BEARISH' | 'UNKNOWN';
  momentum: 'ACCELERATING_UP' | 'ACCELERATING_DOWN' | 'DECELERATING' | 'CONSOLIDATING' | 'NEUTRAL';
  candleObservation: string;
  candlestickPattern?: string;
  supportResistance: string;
  visibleIndicators: string[];
  reasons: string[];
  opposingEvidence: string[];
  conflicts: string[];
  missingData: string[];
  invalidation: string;
  entryTiming?: string;
  expiryEstimate?: string;
  riskNotes: string;
  checklist?: {
    trendConfirmed: boolean;
    candleStructureConfirmed: boolean;
    momentumConfirmed: boolean;
    supportResistanceConfirmed: boolean;
    patternConfirmed: boolean;
    visibleIndicatorConfirmed: boolean;
    multiCandleConfirmed: boolean;
  };
  providerUsed?: string;
  modelUsed?: string;
  latencyMs?: number;
}

const VISION_SYSTEM_PROMPT = `You are a world-class senior quantitative AI chart vision analyst specializing in binary options and live price-action charts (Quotex, IQ, TradingView).
You analyze ONLY the visual screenshot or screen capture provided. DO NOT rely on or assume any external market data feeds.

Perform a rigorous, objective visual inspection of this trading chart screenshot:
1. Candlestick Anatomy: Body ratio, upper wick rejection, lower wick rejection, forming candle close proximity.
2. Market Trend & Momentum: Higher highs/higher lows vs lower highs/lower lows, trend slopes, market structure breaks.
3. Visible Support & Resistance: Key swing highs/lows, rejection levels, recent test/retest zones.
4. Visible Indicators: Moving averages crossover, RSI level, MACD histogram, Bollinger Band touches (ONLY if actually visible on chart).
5. Chart Legibility: Check if candlesticks, prices, and timeframe are clear or blurry/obstructed.
6. Next-Candle Direction: Determine optimal next-candle outcome ('CALL', 'PUT', or 'WAIT') for 1-minute or 5-minute expiry.

STRICT SIGNAL GENERATION RULE:
- Output 'CALL' ONLY if evidence is strongly bullish with clear rejection off support or momentum breakout with no major opposing resistance.
- Output 'PUT' ONLY if evidence is strongly bearish with clear rejection off resistance or momentum breakdown with no major opposing support.
- Output 'WAIT' if chart readability is poor, evidence quality is insufficient (< 60/100), or contradictory evidence exists.
- 'WAIT' MUST be the default state when in doubt. NEVER guess or fabricate unreadable indicators.

Return ONLY a valid JSON object matching this schema:
{
  "signal": "CALL" | "PUT" | "WAIT",
  "chartReadable": boolean,
  "evidenceQuality": number (0-100),
  "trend": "STRONG_BULLISH" | "BULLISH" | "NEUTRAL_SIDEWAYS" | "BEARISH" | "STRONG_BEARISH" | "UNKNOWN",
  "momentum": "ACCELERATING_UP" | "ACCELERATING_DOWN" | "DECELEATRING" | "CONSOLIDATING" | "NEUTRAL",
  "candleObservation": string,
  "visibleIndicators": string[],
  "supportResistance": string,
  "reasons": string[],
  "opposingEvidence": string[],
  "conflicts": string[],
  "missingData": string[],
  "invalidation": string,
  "riskNotes": string
}`;

/**
 * Universal Multimodal Vision Analyzer
 * Dispatches to Google Gemini, Groq Vision, OpenRouter Vision, or OpenAI based on active provider configuration.
 */
export async function analyzeChartImage(
  base64Image: string,
  mimeType = 'image/png',
  symbol = 'EUR/USD (OTC)',
  timeframe = '1M',
  userModel?: string,
  userProvider?: string
): Promise<VisionAnalysisResult> {
  const start = Date.now();
  const aiConfig = getActiveAiConfig(userProvider);
  const provider = userProvider || aiConfig.provider || 'gemini';
  const apiKey = aiConfig.apiKey;
  const modelToUse = userModel || aiConfig.model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'llama-3.2-11b-vision-preview');

  if (!apiKey) {
    throw new Error(`No API key configured for provider '${provider}'. Please check AI Settings or set the environment variable.`);
  }

  // Ensure model has vision capability
  const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === provider);
  const modelDef = catalogEntry?.supportedModels.find((m) => m.id === modelToUse);
  if (modelDef && !modelDef.vision) {
    throw new Error(`Selected model '${modelToUse}' is text-only and does not support image/vision analysis. Please select a vision model such as 'gemini-1.5-flash', 'gemini-1.5-pro', or 'claude-3.5-sonnet'.`);
  }

  // Strip base64 prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

  try {
    if (provider === 'gemini') {
      return await analyzeWithGemini(cleanBase64, mimeType, symbol, timeframe, modelToUse, apiKey, start);
    } else if (provider === 'groq' || provider === 'openrouter' || provider === 'openai') {
      return await analyzeWithOpenAICompatible(cleanBase64, mimeType, symbol, timeframe, modelToUse, apiKey, provider, start);
    } else {
      // Default to Gemini
      return await analyzeWithGemini(cleanBase64, mimeType, symbol, timeframe, 'gemini-1.5-flash', apiKey, start);
    }
  } catch (err: any) {
    // If primary provider failed and backup provider is configured, attempt fallback
    if (aiConfig.backupProvider && aiConfig.backupProvider !== provider) {
      console.warn(`[VisionAnalysis] Primary provider ${provider} failed (${err.message}), attempting backup provider ${aiConfig.backupProvider}...`);
      try {
        const backupConfig = getActiveAiConfig(aiConfig.backupProvider);
        if (backupConfig.apiKey) {
          return await analyzeChartImage(base64Image, mimeType, symbol, timeframe, aiConfig.backupModel, aiConfig.backupProvider);
        }
      } catch (backupErr: any) {
        console.warn('[VisionAnalysis] Backup provider also failed:', backupErr.message);
      }
    }
    throw err;
  }
}

async function analyzeWithGemini(
  cleanBase64: string,
  mimeType: string,
  symbol: string,
  timeframe: string,
  modelToUse: string,
  apiKey: string,
  start: number
): Promise<VisionAnalysisResult> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'quotex-ai-vision-assistant/1.0',
      },
    },
  });

  const prompt = `${VISION_SYSTEM_PROMPT}\n\nChart Metadata: Symbol: "${symbol}", Timeframe: "${timeframe}".`;

  const response = await ai.models.generateContent({
    model: modelToUse,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          signal: { type: Type.STRING, description: 'CALL, PUT, or WAIT' },
          chartReadable: { type: Type.BOOLEAN, description: 'Whether the chart candlesticks and prices are clearly visible' },
          evidenceQuality: { type: Type.INTEGER, description: 'Score from 0 to 100 based on clarity and confluence' },
          trend: { type: Type.STRING, description: 'Primary visible trend' },
          momentum: { type: Type.STRING, description: 'Visible candle momentum' },
          candleObservation: { type: Type.STRING, description: 'Detailed observation of recent 1-3 candles' },
          visibleIndicators: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of visible technical indicators on chart',
          },
          supportResistance: { type: Type.STRING, description: 'Key visible support/resistance zones' },
          reasons: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Supporting reasons for the signal decision',
          },
          opposingEvidence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Risks or arguments against the signal',
          },
          conflicts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Conflicting visual clues',
          },
          missingData: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Information not clearly visible on screenshot',
          },
          invalidation: { type: Type.STRING, description: 'Price condition that invalidates this setup' },
          riskNotes: { type: Type.STRING, description: 'Crucial risk management note' },
        },
        required: [
          'signal',
          'chartReadable',
          'evidenceQuality',
          'trend',
          'momentum',
          'candleObservation',
          'visibleIndicators',
          'supportResistance',
          'reasons',
          'opposingEvidence',
          'conflicts',
          'missingData',
          'invalidation',
          'riskNotes',
        ],
      },
    },
  });

  const jsonText = response.text || '{}';
  const parsed = JSON.parse(jsonText) as VisionAnalysisResult;

  if (!['CALL', 'PUT', 'WAIT'].includes(parsed.signal)) {
    parsed.signal = 'WAIT';
  }
  if (!parsed.chartReadable || parsed.evidenceQuality < 60) {
    parsed.signal = 'WAIT';
  }

  parsed.providerUsed = 'gemini';
  parsed.modelUsed = modelToUse;
  parsed.latencyMs = Date.now() - start;

  return parsed;
}

async function analyzeWithOpenAICompatible(
  cleanBase64: string,
  mimeType: string,
  symbol: string,
  timeframe: string,
  modelToUse: string,
  apiKey: string,
  provider: string,
  start: number
): Promise<VisionAnalysisResult> {
  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
  const prompt = `${VISION_SYSTEM_PROMPT}\n\nChart Metadata: Symbol: "${symbol}", Timeframe: "${timeframe}". Please respond ONLY with raw JSON matching the requested structure.`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://quotex-ai-vision-assistant.vercel.app';
    headers['X-Title'] = 'Quotex AI Vision Assistant';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelToUse,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`${provider.toUpperCase()} vision API error (${res.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as VisionAnalysisResult;

  if (!['CALL', 'PUT', 'WAIT'].includes(parsed.signal)) {
    parsed.signal = 'WAIT';
  }
  if (!parsed.chartReadable || (parsed.evidenceQuality || 0) < 60) {
    parsed.signal = 'WAIT';
  }

  if (!parsed.checklist) {
    parsed.checklist = {
      trendConfirmed: parsed.trend?.includes('BULLISH') || parsed.trend?.includes('BEARISH') || false,
      candleStructureConfirmed: Boolean(parsed.candleObservation),
      momentumConfirmed: !parsed.momentum?.includes('CONSOLIDATING'),
      supportResistanceConfirmed: Boolean(parsed.supportResistance),
      patternConfirmed: Boolean(parsed.candlestickPattern),
      visibleIndicatorConfirmed: (parsed.visibleIndicators?.length ?? 0) > 0,
      multiCandleConfirmed: true,
    };
  }

  parsed.providerUsed = provider;
  parsed.modelUsed = modelToUse;
  parsed.latencyMs = Date.now() - start;

  return parsed;
}
