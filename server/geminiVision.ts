import { GoogleGenAI, Type } from '@google/genai';
import { getActiveAiConfig } from './apiKeyManager.js';

export interface VisionAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  chartReadable: boolean;
  evidenceQuality: number; // 0-100
  trend: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL_SIDEWAYS' | 'BEARISH' | 'STRONG_BEARISH' | 'UNKNOWN';
  momentum: 'ACCELERATING_UP' | 'ACCELERATING_DOWN' | 'DECELEATRING' | 'CONSOLIDATING' | 'NEUTRAL';
  candleObservation: string;
  visibleIndicators: string[];
  supportResistance: string;
  reasons: string[];
  opposingEvidence: string[];
  conflicts: string[];
  missingData: string[];
  invalidation: string;
  riskNotes: string;
  providerUsed?: string;
  modelUsed?: string;
}

export async function analyzeChartImage(
  base64Image: string,
  mimeType = 'image/png',
  symbol = 'EUR/USD (OTC)',
  timeframe = '1M',
  userModel?: string
): Promise<VisionAnalysisResult> {
  const aiConfig = getActiveAiConfig();
  const apiKey = aiConfig.apiKey;
  const modelToUse = userModel || aiConfig.model || 'gemini-3.8-flash';

  if (!apiKey) {
    throw new Error('No API key configured. Please enter your Gemini API key in Settings -> AI/API Configuration.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Strip base64 prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `You are a world-class senior quantitative analysis engineer and binary options chart specialist.
Analyze this Quotex trading chart screenshot for currency pair "${symbol}" on timeframe "${timeframe}".

Perform a rigorous, objective visual inspection:
1. Candlestick Anatomy: Body ratio, upper wick rejection, lower wick rejection, forming candle close proximity.
2. Market Trend & Momentum: Higher highs/higher lows vs lower highs/lower lows, trend slopes, market structure breaks.
3. Visible Support & Resistance: Key swing highs/lows, rejection levels, recent test/retest zones.
4. Visible Indicators (if drawn on chart): Moving averages crossover, RSI level, MACD histogram, Bollinger Band touches.
5. Risk & Conflict Audit: Identify any opposing forces, indecision wicks, low volume/choppy areas, or ambiguous structures.

STRICT SIGNAL GENERATION RULE:
- Output 'CALL' ONLY if evidence is strongly bullish with clear rejection or momentum confirmation and no major opposing resistance.
- Output 'PUT' ONLY if evidence is strongly bearish with clear rejection or momentum confirmation and no major opposing support.
- Output 'WAIT' if chart readability is poor, evidence quality is insufficient (< 60/100), or contradictory evidence exists.
- 'WAIT' MUST be the default state when in doubt. NEVER guess or fabricate unreadable indicators.

Return ONLY a valid JSON object matching the requested schema.`;

  try {
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
              description: 'Conflicting visual clues (e.g. bullish candle at resistance)',
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

    // Validate signal
    if (!['CALL', 'PUT', 'WAIT'].includes(parsed.signal)) {
      parsed.signal = 'WAIT';
    }

    // Force WAIT if chart is unreadable or quality is poor
    if (!parsed.chartReadable || parsed.evidenceQuality < 60) {
      parsed.signal = 'WAIT';
    }

    parsed.providerUsed = aiConfig.provider;
    parsed.modelUsed = modelToUse;

    return parsed;
  } catch (err: any) {
    console.error('Gemini Vision API Error:', err);

    let userMessage = err.message || 'Vision analysis request failed';
    if (err.status === 429 || err.message?.includes('429')) {
      userMessage = 'API quota or rate-limit exceeded (429). Please wait a moment or check your API key quota in AI Settings.';
    } else if (err.status === 503 || err.message?.includes('503')) {
      userMessage = 'Gemini AI service capacity overloaded (503). Please retry in a few seconds.';
    } else if (err.status === 401 || err.status === 403 || err.message?.includes('API_KEY_INVALID') || err.message?.includes('PERMISSION_DENIED')) {
      userMessage = 'Invalid or unauthorized API key. Please check your key in Settings -> AI/API Configuration.';
    }

    throw new Error(userMessage);
  }
}
