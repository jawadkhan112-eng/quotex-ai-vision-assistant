// Algorithmic Technical Analysis Engine
// Zero external API dependency - operates entirely on price data and mathematical indicators

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
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number {
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
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const middle = slice.reduce((acc, val) => acc + val, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + stdDev * std, middle, lower: middle - stdDev * std };
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
export function analyzeAlgorithmic(
  base64Image: string,
  prices: number[],
  timeframe: string = '1M'
): AlgoAnalysisResult {
  const priceResult = analyzePriceData(prices, timeframe);

  const combined: AlgoAnalysisResult = {
    signal: priceResult.signal,
    confidenceScore: priceResult.confidenceScore,
    evidenceQualityScore: Math.max(priceResult.evidenceQualityScore, 20),
    summaryReason: priceResult.summaryReason,
    analysisTimestamp: new Date().toISOString(),
    detectedAsset: priceResult.detectedAsset,
    detectedTimeframe: timeframe,
    candleObservation: `${priceResult.candleObservation} | Frame analysis pending.`,
  };

  return combined;
}