// Algorithmic technical-analysis engine. It is deterministic and makes no network calls.

export interface AlgoSignal {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number; // 0 - 100
  evidenceQualityScore: number;
  summaryReason: string;
  analysisTimestamp: string;
  detectedAsset?: string;
  detectedTimeframe?: string;
}

export interface AlgoAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number;
  evidenceQualityScore: number;
  summaryReason: string;
  analysisTimestamp: string;
  detectedAsset?: string;
  detectedTimeframe?: string;
  candleObservation: string;
  reasoning?: string;
  rsiValue?: number;
  rsiZone?: 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT';
  bollinger?: { upper: number; middle: number; lower: number; proximity: number; status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS' };
  candle?: { bodyRatio: number; upperWickRatio: number; lowerWickRatio: number; rejection: 'BULLISH' | 'BEARISH' | 'NONE'; momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  pixelDiagnostics?: { greenPixels: number; redPixels: number; contrast: number; sampledPixels: number };
}

export interface Candle { open: number; high: number; low: number; close: number; }
export interface PixelFrame { width: number; height: number; pixels: number[]; }

// Calculate RSI (Relative Strength Index)
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Calculate Bollinger Bands
export function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const middle = slice.reduce((acc, val) => acc + val, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + stdDev * std, middle, lower: middle - stdDev * std };
}

export function measureCandle(candle: Candle) {
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const bodyRatio = Math.abs(candle.close - candle.open) / range;
  const upperWickRatio = (candle.high - Math.max(candle.open, candle.close)) / range;
  const lowerWickRatio = (Math.min(candle.open, candle.close) - candle.low) / range;
  const rejection = lowerWickRatio >= .45 && lowerWickRatio > upperWickRatio * 1.5 ? 'BULLISH' : upperWickRatio >= .45 && upperWickRatio > lowerWickRatio * 1.5 ? 'BEARISH' : 'NONE';
  const momentum = candle.close > candle.open ? 'BULLISH' : candle.close < candle.open ? 'BEARISH' : 'NEUTRAL';
  return { bodyRatio, upperWickRatio, lowerWickRatio, rejection, momentum } as const;
}

export function analyzePixels(frame?: PixelFrame) {
  if (!frame?.pixels?.length) return undefined;
  let greenPixels = 0, redPixels = 0, spread = 0, sampledPixels = 0;
  for (let i = 0; i + 3 < frame.pixels.length; i += 4) { const r = frame.pixels[i], g = frame.pixels[i + 1], b = frame.pixels[i + 2]; if (g > r * 1.18 && g > b * 1.08) greenPixels++; if (r > g * 1.18 && r > b * 1.08) redPixels++; spread += Math.max(r, g, b) - Math.min(r, g, b); sampledPixels++; }
  return { greenPixels, redPixels, contrast: sampledPixels ? spread / sampledPixels : 0, sampledPixels };
}

/** Extracts a relative closing series from colored chart strokes without OCR or network calls. */
export function extractPricesFromFrame(frame?: PixelFrame): number[] {
  if (!frame?.width || !frame.height || frame.pixels.length < frame.width * frame.height * 4) return [];
  const closes: number[] = [];
  for (let x = 0; x < frame.width; x += 2) {
    let totalY = 0; let count = 0;
    for (let y = 0; y < frame.height; y++) {
      const offset = (y * frame.width + x) * 4;
      const r = frame.pixels[offset], g = frame.pixels[offset + 1], b = frame.pixels[offset + 2];
      if ((g > r * 1.12 && g > b * 1.05) || (r > g * 1.12 && r > b * 1.05)) { totalY += y; count++; }
    }
    if (count) closes.push(frame.height - totalY / count);
  }
  return closes.length >= 20 ? closes : [];
}

// Analyze price data for technical signals
export function analyzePriceData(
  prices: number[],
  timeframe: string = '1M'
): AlgoAnalysisResult {
  const result: AlgoAnalysisResult = {
    signal: 'WAIT',
    confidenceScore: 0,
    evidenceQualityScore: 0,
    summaryReason: 'Insufficient price data for analysis.',
    analysisTimestamp: new Date().toISOString(),
    candleObservation: 'Price data analysis pending.',
  };

  if (prices.length < 20) return result;

  const rsi = calculateRSI(prices, 14);
  const bollinger = calculateBollingerBands(prices, 20, 2);

  if (!bollinger) return result;

  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2] || currentPrice;
  const priceChange = currentPrice - prevPrice;

  const rsiZone = rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL';
  const priceVsBollinger =
    currentPrice < bollinger.lower ? 'BELOW_LOWER' :
    currentPrice > bollinger.upper ? 'ABOVE_UPPER' :
    'WITHIN_BANDS';

  const observation = `RSI: ${rsi.toFixed(1)} (${rsiZone}), Price: $${currentPrice.toFixed(2)}, BB: $${bollinger.lower.toFixed(2)}/$${bollinger.upper.toFixed(2)}`;

  let signal: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let confidence = 0;
  let reason = '';

  const callConfluence =
    priceVsBollinger === 'BELOW_LOWER' && rsiZone === 'OVERSOLD' && priceChange > 0;

  const putConfluence =
    priceVsBollinger === 'ABOVE_UPPER' && rsiZone === 'OVERBOUGHT' && priceChange < 0;

  const waitConfluence =
    rsiZone === 'NEUTRAL' ||
    (priceVsBollinger === 'WITHIN_BANDS' && Math.abs(priceChange) / prevPrice < 0.02);

  if (callConfluence) {
    signal = 'CALL';
    confidence = Math.min(95, 70 + Math.abs(rsi - 30) * 1.5);
    reason = `CALL: Price below Lower BB + RSI oversold (${rsi.toFixed(1)}), bullish momentum.`;
  } else if (putConfluence) {
    signal = 'PUT';
    confidence = Math.min(95, 70 + Math.abs(rsi - 70) * 1.5);
    reason = `PUT: Price above Upper BB + RSI overbought (${rsi.toFixed(1)}), bearish momentum.`;
  } else if (waitConfluence) {
    signal = 'WAIT';
    reason = `WAIT: Indicators conflict or market in consolidation. RSI: ${rsi.toFixed(1)}.`;
  } else {
    signal = 'WAIT';
    reason = `WAIT: Insufficient confluence for CALL or PUT. RSI: ${rsi.toFixed(1)}.`;
  }

  return {
    signal,
    confidenceScore: confidence,
    evidenceQualityScore: confidence,
    summaryReason: reason,
    analysisTimestamp: new Date().toISOString(),
    candleObservation: observation,
  };
}

// Main exported function: analyze algorithmic signals
export function analyzeAlgorithmic(input: { prices: number[]; candles?: Candle[]; timeframe?: string; frame?: PixelFrame } | string, legacyPrices: number[] = [], legacyTimeframe = '1M'): AlgoAnalysisResult {
  const normalized = typeof input === 'string' ? { prices: legacyPrices, timeframe: legacyTimeframe } : input;
  const suppliedPrices = normalized.prices.filter(Number.isFinite);
  const framePrices = extractPricesFromFrame(normalized.frame);
  const prices = framePrices.length >= 20 ? framePrices : suppliedPrices;
  const timeframe = normalized.timeframe || '1M';
  const priceResult = analyzePriceData(prices, timeframe);
  const last = prices[prices.length - 1] || 0;
  const bb = calculateBollingerBands(prices) || { upper: last, middle: last, lower: last };
  const bandRange = Math.max(bb.upper - bb.lower, Number.EPSILON);
  const proximity = Math.min(1, Math.max(0, (last - bb.lower) / bandRange));
  const status = proximity <= .15 ? 'NEAR_LOWER' : proximity >= .85 ? 'NEAR_UPPER' : 'WITHIN_BANDS';
  const rsiValue = calculateRSI(prices);
  const rsiZone = rsiValue < 35 ? 'OVERSOLD' : rsiValue > 65 ? 'OVERBOUGHT' : 'NEUTRAL';
  const prior = prices[prices.length - 2] || last;
  const fallback = { open: prior, close: last, high: Math.max(prior, last), low: Math.min(prior, last) };
  const candle = measureCandle(framePrices.length >= 2 ? { open: framePrices[framePrices.length - 2], close: last, high: Math.max(framePrices[framePrices.length - 2], last), low: Math.min(framePrices[framePrices.length - 2], last) } : normalized.candles?.[normalized.candles.length - 1] || fallback);
  const pixelDiagnostics = analyzePixels(normalized.frame);
  const greenBias = (pixelDiagnostics?.greenPixels || 0) > (pixelDiagnostics?.redPixels || 0);
  const redBias = (pixelDiagnostics?.redPixels || 0) > (pixelDiagnostics?.greenPixels || 0);
  const callScore = (status === 'NEAR_LOWER' ? 1 : 0) + (rsiZone === 'OVERSOLD' ? 1 : 0) + (candle.rejection === 'BULLISH' ? 1 : 0) + (candle.momentum === 'BULLISH' ? 1 : 0) + (greenBias ? .25 : 0);
  const putScore = (status === 'NEAR_UPPER' ? 1 : 0) + (rsiZone === 'OVERBOUGHT' ? 1 : 0) + (candle.rejection === 'BEARISH' ? 1 : 0) + (candle.momentum === 'BEARISH' ? 1 : 0) + (redBias ? .25 : 0);
  const signal = callScore >= 2 && callScore > putScore ? 'CALL' : putScore >= 2 && putScore > callScore ? 'PUT' : 'WAIT';
  const confidenceScore = signal === 'WAIT' ? Math.round(Math.max(callScore, putScore) * 22) : Math.min(95, Math.round(Math.max(callScore, putScore) * 24 + 15));
  const source = framePrices.length >= 20 ? 'local chart-frame series' : 'submitted price series';
  const reasoning = `${signal}: ${source}; RSI(14) ${rsiValue.toFixed(1)} is ${rsiZone.toLowerCase()}; price is ${status.toLowerCase().replace('_', ' ')}; candle momentum is ${candle.momentum.toLowerCase()}.`;

  const combined: AlgoAnalysisResult = {
    signal,
    confidenceScore,
    evidenceQualityScore: Math.max(confidenceScore, prices.length >= 20 ? 70 : 20),
    summaryReason: reasoning,
    reasoning,
    analysisTimestamp: new Date().toISOString(),
    detectedAsset: priceResult.detectedAsset,
    detectedTimeframe: timeframe,
    candleObservation: `Body ${(candle.bodyRatio * 100).toFixed(1)}%; upper wick ${(candle.upperWickRatio * 100).toFixed(1)}%; lower wick ${(candle.lowerWickRatio * 100).toFixed(1)}%; ${candle.rejection.toLowerCase()} rejection.`,
    rsiValue,
    rsiZone,
    bollinger: { ...bb, proximity, status },
    candle,
    pixelDiagnostics,
  };

  return combined;
}
