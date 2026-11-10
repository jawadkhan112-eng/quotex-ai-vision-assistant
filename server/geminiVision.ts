import { GoogleGenAI, Type } from '@google/genai';
import { getActiveAiConfig, PROVIDER_CATALOG } from './apiKeyManager.js';
import { normalizeAiModel, getProviderModelCandidates, isFailoverEligibleError } from './aiRouter.js';

export interface VisionAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  chartReadable: boolean;
  evidenceQuality: number; // 0-100 (Objective visual clarity & confluence score)
  detectedAsset?: string;
  detectedTimeframe?: string;
  // Candle Close & Pre-Close Timing (Sure-Shot Edge)
  candleCompletionStatus?: 'FORMING' | 'APPROACHING_CLOSE' | 'JUST_CLOSED' | 'UNKNOWN';
  candleCloseSecondsRemaining?: number;
  nextCandleDirection?: 'CALL' | 'PUT' | 'WAIT';
  preCloseSignal?: boolean;
  expiry?: string; // exact expiry for the next-candle entry (e.g. '1 Minute' / '5 Minutes')
  volatilityAssessment?: 'LOW' | 'NORMAL' | 'HIGH';
  rejectionAnalysis?: string; // rejection pressure / absorption detail
  breakoutBounceDynamics?: string; // breakout / bounce dynamics observed
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

/**
 * Applies safe defaults to optional candle-close / pre-close fields so the
 * downstream signal engine always has predictable values even when the
 * vision model omits them.
 */
function ensureVisionDefaults(parsed: VisionAnalysisResult): void {
  if (!parsed.candleCompletionStatus) parsed.candleCompletionStatus = 'UNKNOWN';
  if (!parsed.nextCandleDirection) parsed.nextCandleDirection = 'WAIT';
  if (parsed.preCloseSignal == null) parsed.preCloseSignal = false;
  if (!parsed.volatilityAssessment) parsed.volatilityAssessment = 'NORMAL';
  if (!parsed.expiry) {
    parsed.expiry =
      parsed.expiryEstimate ||
      (parsed.detectedTimeframe === '5M' ? '5 Minutes' : '1 Minute');
  }
}

const VISION_SYSTEM_PROMPT = `You are a world-class senior quantitative AI chart vision analyst specializing in high-precision binary options and price-action charts (Quotex, IQ, TradingView).
You analyze ONLY the visual screenshot or screen capture provided. DO NOT rely on or assume any external market data feeds.

Execute a rigorous, institutional-grade binary options inspection of the chart frame:
1. Candlestick Anatomy & Rejection Analysis:
   - Precisely measure recent closed and currently forming candles: body-to-wick ratios, upper/lower rejection wicks (demonstrating buyer absorption vs seller exhaustion).
   - Identify high-probability setups: pin bars, rejection hammers/shooting stars, engulfing patterns, railway tracks, inside bars.
2. Market Trend & Momentum Vectors:
   - Identify higher-high/higher-low vs lower-high/lower-low structure, trend angle/slope, and exhaustion vs expansion momentum.
3. Support & Resistance (S/R) Zones:
   - Pinpoint critical psychological price boundaries, round numbers, recent swing highs/lows, and horizontal consolidation ceilings/floors.
4. Visible Chart Indicators:
   - Detect moving averages (EMA/SMA slopes and crossovers), Bollinger Band squeezes/touches, RSI momentum divergence, or MACD histograms ONLY if genuinely visible in the image.
5. Chart Legibility & Quality:
   - Evaluate whether candlesticks, price scales, and timeframes are sharp or blurry/obstructed.
6. Next-Candle Precision Decision:
   - CALL: Bullish continuation or clean bounce off validated support with seller rejection wick.
   - PUT: Bearish continuation or clean rejection drop off validated resistance ceiling with buyer rejection wick.
   - WAIT: Default state when consolidation is tight, opposing forces/barriers exist, indicators conflict, or chart clarity is low.

7. Asset & Timeframe Auto-Detection (from Chart UI Headers):
   - Read the active trading asset/currency pair directly from the chart UI header (e.g. EUR/USD OTC, GBP/JPY, USD/JPY). Do NOT assume it from metadata.
   - Read the timeframe indicator directly from the chart UI (e.g. 1M, 5M). Do NOT assume it from metadata.
   - If the chart header is legible, populate detectedAsset and detectedTimeframe from what you actually see, even if it differs from the metadata hint.

8. Candle Close & Pre-Close Timing (The "Sure-Shot" Edge):
   - Determine whether the current candle is FORMING, APPROACHING_CLOSE (last ~10-15 seconds), or JUST_CLOSED.
   - Estimate candleCloseSecondsRemaining until the current candle expires.
   - Determine nextCandleDirection (CALL / PUT / WAIT) for the candle that opens immediately after the current one closes.
   - Set preCloseSignal to true when a high-probability setup exists and the signal should fire right before the close so the trader enters on the next candle open.
   - Set expiry to the exact next-candle expiry (e.g. "1 Minute" or "5 Minutes").
   - Assess volatilityAssessment (LOW / NORMAL / HIGH). HIGH volatility means chop/spikes — lean toward WAIT.
   - Describe rejectionAnalysis (buyer absorption / seller exhaustion at support/resistance) and breakoutBounceDynamics (breakout or bounce behavior).

STRICT SIGNAL GENERATION RULES:
- Output 'CALL' ONLY if evidence is strongly bullish with clear rejection off support or momentum breakout with no major opposing resistance.
- Output 'PUT' ONLY if evidence is strongly bearish with clear rejection off resistance or momentum breakdown with no major opposing support.
- Output 'WAIT' if chart readability is poor, evidence quality is insufficient (< 60/100), or contradictory evidence exists.
- 'WAIT' MUST be the default state when in doubt. NEVER guess or fabricate unreadable indicators or win rates.

Return ONLY a valid JSON object matching this schema:
{
  "signal": "CALL" | "PUT" | "WAIT",
  "chartReadable": boolean,
  "evidenceQuality": number (0-100),
  "trend": "STRONG_BULLISH" | "BULLISH" | "NEUTRAL_SIDEWAYS" | "BEARISH" | "STRONG_BEARISH" | "UNKNOWN",
  "momentum": "ACCELERATING_UP" | "ACCELERATING_DOWN" | "DECELERATING" | "CONSOLIDATING" | "NEUTRAL",
  "candleObservation": string,
  "candlestickPattern": string,
  "visibleIndicators": string[],
  "supportResistance": string,
  "reasons": string[],
  "opposingEvidence": string[],
  "conflicts": string[],
  "missingData": string[],
  "invalidation": string,
  "entryTiming": string,
  "expiryEstimate": string,
  "riskNotes": string,
  "detectedAsset": "string (auto-detected from chart header, e.g. EUR/USD OTC)",
  "detectedTimeframe": "string (auto-detected from chart header, e.g. 1M)",
  "candleCompletionStatus": "FORMING | APPROACHING_CLOSE | JUST_CLOSED | UNKNOWN",
  "candleCloseSecondsRemaining": "number (estimated seconds until current candle closes)",
  "nextCandleDirection": "CALL | PUT | WAIT",
  "preCloseSignal": "boolean (true if signal should fire before candle close)",
  "expiry": "string (exact next-candle expiry, e.g. '1 Minute' or '5 Minutes')",
  "volatilityAssessment": "LOW | NORMAL | HIGH",
  "rejectionAnalysis": "string",
  "breakoutBounceDynamics": "string",
  "checklist": {
    "trendConfirmed": boolean,
    "candleStructureConfirmed": boolean,
    "momentumConfirmed": boolean,
    "supportResistanceConfirmed": boolean,
    "patternConfirmed": boolean,
    "visibleIndicatorConfirmed": boolean,
    "multiCandleConfirmed": boolean
  }
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
  const rawProvider = userProvider || aiConfig.provider || 'gemini';
  const rawModel = userModel || aiConfig.model || 'gemini-2.5-flash';

  // 1. Dynamic Model Mapping & Vision Support Check via AI Router
  const normalized = normalizeAiModel(rawModel, rawProvider);
  const primaryProvider = normalized.provider;
  let primaryModel = normalized.model;

  // If selected model is text-only, automatically re-route to standard vision model
  if (!normalized.isVisionSupported) {
    console.warn(`[AI Router] Model '${rawModel}' on '${rawProvider}' is text-only. Seamlessly re-routing to vision model '${primaryModel}'`);
  }

  const primaryApiKey = aiConfig.provider === primaryProvider ? aiConfig.apiKey : getActiveAiConfig(primaryProvider).apiKey;

  // Clean base64 payload
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

  // 2. Strict user-selected provider lock: only the explicitly chosen provider is queried.
  // Cross-provider backup failover is disabled by default. An explicit backupProvider
  // configured in AI Settings is the only allowed fallback.
  const attemptProviders: Array<{ provider: string; model: string; key: string }> = [];

  if (primaryApiKey) {
    attemptProviders.push({ provider: primaryProvider, model: primaryModel, key: primaryApiKey });
  }

  // Optional explicit backup provider (only when user has configured one in AI Settings)
  if (aiConfig.backupProvider && aiConfig.backupProvider !== primaryProvider) {
    const bConfig = getActiveAiConfig(aiConfig.backupProvider);
    if (bConfig.apiKey) {
      const bNorm = normalizeAiModel(bConfig.model || '', aiConfig.backupProvider);
      if (bNorm.isVisionSupported) {
        attemptProviders.push({ provider: aiConfig.backupProvider, model: bNorm.model, key: bConfig.apiKey });
      }
    }
  }

  if (attemptProviders.length === 0) {
    throw new Error(`No AI API key found for '${primaryProvider}'. Please add an API key in AI Settings or environment variables.`);
  }

  let lastError: any = null;

  for (let i = 0; i < attemptProviders.length; i++) {
    const { provider, model, key } = attemptProviders[i];
    try {
      if (provider === 'gemini') {
        return await analyzeWithGemini(cleanBase64, mimeType, symbol, timeframe, model, key, start);
      } else {
        return await analyzeWithOpenAICompatible(cleanBase64, mimeType, symbol, timeframe, model, key, provider, start);
      }
    } catch (err: any) {
      lastError = err;
      const isLastAttempt = i === attemptProviders.length - 1;
      const willFailover = isFailoverEligibleError(err) || !isLastAttempt;

      console.warn(`[AI Router] Vision analysis failed on provider '${provider}' (model: ${model}): ${err.message}. ${willFailover && !isLastAttempt ? 'Failing over to backup provider...' : ''}`);

      if (!willFailover && isLastAttempt) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Vision analysis failed across all active and backup AI providers.');
}

async function analyzeWithGemini(
  cleanBase64: string,
  mimeType: string,
  symbol: string,
  timeframe: string,
  requestedModel: string,
  apiKey: string,
  start: number
): Promise<VisionAnalysisResult> {
  const prompt = `${VISION_SYSTEM_PROMPT}\n\nChart Metadata: Symbol: "${symbol}", Timeframe: "${timeframe}".`;

  // Candidate models cascade to guarantee 404 resilience across active Gemini endpoints
  const candidateModels = getProviderModelCandidates('gemini', requestedModel);

  let lastError: any = null;

  // Attempt 1: Direct modern REST endpoint (prioritizes stable standard v1, then v1beta)
  for (const model of candidateModels) {
    const endpoints = [
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    ];

    for (const url of endpoints) {
      try {
        const restResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'quotex-ai-vision-assistant/1.0',
          },
          body: JSON.stringify({
            contents: [
              {
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
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (restResponse.ok) {
          const data = await restResponse.json() as any;
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(rawText) as VisionAnalysisResult;

          if (!['CALL', 'PUT', 'WAIT'].includes(parsed.signal)) {
            parsed.signal = 'WAIT';
          }
          if (!parsed.chartReadable || (parsed.evidenceQuality || 0) < 60) {
            parsed.signal = 'WAIT';
          }

          ensureVisionDefaults(parsed);

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

          parsed.providerUsed = 'gemini';
          parsed.modelUsed = model;
          parsed.latencyMs = Date.now() - start;
          return parsed;
        } else {
          const errText = await restResponse.text().catch(() => '');
          lastError = new Error(`Gemini HTTP ${restResponse.status} for ${model}: ${errText.slice(0, 200)}`);
          // If not 404, throw or keep going
          if (restResponse.status !== 404) {
            console.warn(`[GeminiVision] REST error for ${model} (${restResponse.status}):`, errText.slice(0, 160));
          }
        }
      } catch (reqErr: any) {
        lastError = reqErr;
      }
    }
  }

  // Attempt 2: SDK fallback (@google/genai)
  for (const model of candidateModels) {
    try {
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
          temperature: 0.1,
        },
      });

      const jsonText = response.text || '{}';
      const parsed = JSON.parse(jsonText) as VisionAnalysisResult;

      if (!['CALL', 'PUT', 'WAIT'].includes(parsed.signal)) {
        parsed.signal = 'WAIT';
      }
      if (!parsed.chartReadable || (parsed.evidenceQuality || 0) < 60) {
        parsed.signal = 'WAIT';
      }

      ensureVisionDefaults(parsed);

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

      parsed.providerUsed = 'gemini';
      parsed.modelUsed = model;
      parsed.latencyMs = Date.now() - start;
      return parsed;
    } catch (sdkErr: any) {
      lastError = sdkErr;
      if (!sdkErr.message?.includes('404') && !sdkErr.message?.includes('not found')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Gemini model endpoints failed (404/unavailable). Please verify API key permissions in Google AI Studio or switch to Groq/OpenRouter.');
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
  const prompt = `${VISION_SYSTEM_PROMPT}\n\nChart Metadata (hints to verify from the image): Symbol: "${symbol}", Timeframe: "${timeframe}". If the chart header shows different values, use what you see in the image. Please respond ONLY with raw JSON matching the requested structure.`;

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

  ensureVisionDefaults(parsed);

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
