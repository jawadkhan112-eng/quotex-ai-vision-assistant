export interface OHLC {
  timestamp: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TechnicalIndicatorResults {
  ema9?: number;
  ema21?: number;
  ema50?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  rsi14?: number;
  macd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  atr14?: number;
  adx14?: number;
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
  };
  supertrend?: {
    value: number;
    direction: 'BULLISH' | 'BEARISH';
  };
  levels?: {
    support: number[];
    resistance: number[];
  };
  breakoutStatus?: 'BULLISH_BREAKOUT' | 'BEARISH_BREAKOUT' | 'RETESTING' | 'RANGEBOUND';
}

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(data: number[], period: number): number | undefined {
  if (data.length < period || period <= 0) return undefined;
  const slice = data.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(data: number[], period: number): number | undefined {
  if (data.length < period || period <= 0) return undefined;
  const k = 2 / (period + 1);
  // Start with SMA for initial value
  let ema = data.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculates Relative Strength Index (RSI 14)
 */
export function calculateRSI(closes: number[], period = 14): number | undefined {
  if (closes.length <= period) return undefined;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculates Moving Average Convergence Divergence (MACD 12/26/9)
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number; signalLine: number; histogram: number } | undefined {
  if (closes.length < slowPeriod + signalPeriod) return undefined;

  const macdSeries: number[] = [];
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);

  let emaFast = closes.slice(0, fastPeriod).reduce((acc, v) => acc + v, 0) / fastPeriod;
  let emaSlow = closes.slice(0, slowPeriod).reduce((acc, v) => acc + v, 0) / slowPeriod;

  // Align starting index for MACD line calculation
  for (let i = slowPeriod; i < closes.length; i++) {
    emaFast = closes[i] * kFast + emaFast * (1 - kFast);
    emaSlow = closes[i] * kSlow + emaSlow * (1 - kSlow);
    macdSeries.push(emaFast - emaSlow);
  }

  if (macdSeries.length < signalPeriod) return undefined;

  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = calculateEMA(macdSeries, signalPeriod) || macdLine;
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates Average True Range (ATR 14)
 */
export function calculateATR(candles: OHLC[], period = 14): number | undefined {
  if (candles.length < period + 1) return undefined;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  if (trs.length < period) return undefined;
  return calculateEMA(trs, period);
}

/**
 * Calculates Average Directional Index (ADX 14)
 */
export function calculateADX(candles: OHLC[], period = 14): number | undefined {
  if (candles.length < period * 2) return undefined;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  const smoothedTR = calculateEMA(trs, period) || 1;
  const smoothedPlusDM = calculateEMA(plusDMs, period) || 0;
  const smoothedMinusDM = calculateEMA(minusDMs, period) || 0;

  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;

  const diSum = plusDI + minusDI;
  const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;

  return dx;
}

/**
 * Calculates Bollinger Bands (20, 2)
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): { upper: number; middle: number; lower: number; bandwidth: number } | undefined {
  if (closes.length < period) return undefined;

  const slice = closes.slice(-period);
  const middle = slice.reduce((acc, v) => acc + v, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const bandwidth = middle === 0 ? 0 : (upper - lower) / middle;

  return { upper, middle, lower, bandwidth };
}

/**
 * Calculates Supertrend
 */
export function calculateSupertrend(
  candles: OHLC[],
  period = 10,
  multiplier = 3
): { value: number; direction: 'BULLISH' | 'BEARISH' } | undefined {
  if (candles.length < period) return undefined;

  const atr = calculateATR(candles, period) || 0;
  const lastCandle = candles[candles.length - 1];
  const hl2 = (lastCandle.high + lastCandle.low) / 2;

  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;

  const direction = lastCandle.close >= lowerBand ? 'BULLISH' : 'BEARISH';
  const value = direction === 'BULLISH' ? lowerBand : upperBand;

  return { value, direction };
}

/**
 * Identifies key Support and Resistance zones from OHLC swing points
 */
export function findSupportResistance(candles: OHLC[]): { support: number[]; resistance: number[] } {
  if (candles.length < 10) return { support: [], resistance: [] };

  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    // Local Low (Support)
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low
    ) {
      supports.push(candles[i].low);
    }

    // Local High (Resistance)
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high
    ) {
      resistances.push(candles[i].high);
    }
  }

  // Deduplicate and round to 5 decimals
  const format = (arr: number[]) =>
    Array.from(new Set(arr.map((n) => Number(n.toFixed(5))))).slice(-3);

  return {
    support: format(supports),
    resistance: format(resistances),
  };
}

/**
 * Comprehensive technical analysis suite
 */
export function analyzeTechnicalIndicators(candles: OHLC[]): TechnicalIndicatorResults {
  const closes = candles.map((c) => c.close);

  return {
    ema9: calculateEMA(closes, 9),
    ema21: calculateEMA(closes, 21),
    ema50: calculateEMA(closes, 50),
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    sma200: calculateSMA(closes, 200),
    rsi14: calculateRSI(closes, 14),
    macd: calculateMACD(closes, 12, 26, 9),
    atr14: calculateATR(candles, 14),
    adx14: calculateADX(candles, 14),
    bollingerBands: calculateBollingerBands(closes, 20, 2),
    supertrend: calculateSupertrend(candles, 10, 3),
    levels: findSupportResistance(candles),
  };
}
