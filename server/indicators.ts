export interface OHLC {
  timestamp: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TechnicalIndicatorResults {
  ema9?: number; ema21?: number; ema50?: number;
  sma20?: number; sma50?: number; sma200?: number;
  rsi14?: number;
  macd?: { macdLine: number; signalLine: number; histogram: number };
  atr14?: number; adx14?: number;
  bollingerBands?: { upper: number; middle: number; lower: number; bandwidth: number };
  supertrend?: { value: number; direction: 'BULLISH' | 'BEARISH' };
  levels?: { support: number[]; resistance: number[] };
  breakoutStatus?: 'BULLISH_BREAKOUT' | 'BEARISH_BREAKOUT' | 'RETESTING' | 'RANGEBOUND';
}

const validPeriod = (period: number) => Number.isInteger(period) && period > 0;
export function calculateSMA(data: number[], period: number): number | undefined {
  if (!validPeriod(period) || data.length < period || !data.every(Number.isFinite)) return undefined;
  return data.slice(-period).reduce((sum, n) => sum + n, 0) / period;
}
export function calculateEMA(data: number[], period: number): number | undefined {
  if (!validPeriod(period) || data.length < period || !data.every(Number.isFinite)) return undefined;
  const alpha = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((sum, n) => sum + n, 0) / period;
  for (let i = period; i < data.length; i++) ema = alpha * data[i] + (1 - alpha) * ema;
  return ema;
}

/** Wilder RSI; flat data resolves to 50 rather than the misleading 100. */
export function calculateRSI(closes: number[], period = 14): number | undefined {
  if (!validPeriod(period) || closes.length <= period || !closes.every(Number.isFinite)) return undefined;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gain += change; else loss -= change;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** MACD with independently initialized fast/slow EMAs and an EMA signal series. */
export function calculateMACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): { macdLine: number; signalLine: number; histogram: number } | undefined {
  if (!validPeriod(fastPeriod) || !validPeriod(slowPeriod) || !validPeriod(signalPeriod) || fastPeriod >= slowPeriod || closes.length < slowPeriod + signalPeriod - 1 || !closes.every(Number.isFinite)) return undefined;
  const fastAlpha = 2 / (fastPeriod + 1), slowAlpha = 2 / (slowPeriod + 1);
  let fast = closes.slice(0, fastPeriod).reduce((s, n) => s + n, 0) / fastPeriod;
  let slow = closes.slice(0, slowPeriod).reduce((s, n) => s + n, 0) / slowPeriod;
  const series: number[] = [];
  for (let i = fastPeriod; i < slowPeriod; i++) fast = fastAlpha * closes[i] + (1 - fastAlpha) * fast;
  series.push(fast - slow);
  for (let i = slowPeriod; i < closes.length; i++) {
    fast = fastAlpha * closes[i] + (1 - fastAlpha) * fast;
    slow = slowAlpha * closes[i] + (1 - slowAlpha) * slow;
    series.push(fast - slow);
  }
  if (series.length < signalPeriod) return undefined;
  const signalLine = calculateEMA(series, signalPeriod);
  if (signalLine === undefined) return undefined;
  const macdLine = series[series.length - 1];
  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

export function calculateTrueRanges(candles: OHLC[]): number[] {
  return candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
}
function wilderSeries(values: number[], period: number): number[] {
  if (!validPeriod(period) || values.length < period) return [];
  const out: number[] = [];
  let current = values.slice(0, period).reduce((a, b) => a + b, 0);
  out.push(current);
  for (let i = period; i < values.length; i++) { current = current - current / period + values[i]; out.push(current); }
  return out;
}
export function calculateATR(candles: OHLC[], period = 14): number | undefined {
  if (!validPeriod(period) || candles.length < period || !candles.every(c => [c.high, c.low, c.close].every(Number.isFinite))) return undefined;
  const trs = calculateTrueRanges(candles);
  const smoothed = wilderSeries(trs, period);
  return smoothed.length ? smoothed[smoothed.length - 1] / period : undefined;
}

/** Wilder's Directional Movement System, returning the smoothed ADX (not a single DX). */
export function calculateADX(candles: OHLC[], period = 14): number | undefined {
  if (!validPeriod(period) || candles.length < 2 * period + 1) return undefined;
  const tr: number[] = [], plus: number[] = [], minus: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i], prev = candles[i - 1];
    const up = curr.high - prev.high, down = prev.low - curr.low;
    tr.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const trSm = wilderSeries(tr, period), plusSm = wilderSeries(plus, period), minusSm = wilderSeries(minus, period);
  const dx: number[] = [];
  for (let i = 0; i < trSm.length; i++) {
    if (trSm[i] === 0) { dx.push(0); continue; }
    const pdi = plusSm[i] / trSm[i] * 100, mdi = minusSm[i] / trSm[i] * 100;
    dx.push(pdi + mdi === 0 ? 0 : Math.abs(pdi - mdi) / (pdi + mdi) * 100);
  }
  if (dx.length < period) return undefined;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return adx;
}

export function calculateBollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): { upper: number; middle: number; lower: number; bandwidth: number } | undefined {
  if (!validPeriod(period) || closes.length < period || !Number.isFinite(stdDevMultiplier) || stdDevMultiplier < 0 || !closes.every(Number.isFinite)) return undefined;
  const slice = closes.slice(-period), middle = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((sum, n) => sum + (n - middle) ** 2, 0) / period);
  const upper = middle + stdDevMultiplier * std, lower = middle - stdDevMultiplier * std;
  return { upper, middle, lower, bandwidth: middle === 0 ? 0 : (upper - lower) / middle };
}

/** Standard Supertrend using Wilder ATR and carried final bands. */
export function calculateSupertrend(candles: OHLC[], period = 10, multiplier = 3): { value: number; direction: 'BULLISH' | 'BEARISH' } | undefined {
  if (!validPeriod(period) || candles.length < period + 1 || !Number.isFinite(multiplier) || multiplier <= 0) return undefined;
  const tr = calculateTrueRanges(candles), atr = new Array<number>(candles.length).fill(Number.NaN);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  const upper = new Array<number>(candles.length).fill(Number.NaN), lower = [...upper];
  let direction: 'BULLISH' | 'BEARISH' = 'BULLISH';
  let line = Number.NaN;
  for (let i = period - 1; i < candles.length; i++) {
    const mid = (candles[i].high + candles[i].low) / 2;
    const basicUpper = mid + multiplier * atr[i], basicLower = mid - multiplier * atr[i];
    upper[i] = i === period - 1 || basicUpper < upper[i - 1] || candles[i - 1].close > upper[i - 1] ? basicUpper : upper[i - 1];
    lower[i] = i === period - 1 || basicLower > lower[i - 1] || candles[i - 1].close < lower[i - 1] ? basicLower : lower[i - 1];
    if (i > period - 1) {
      if (direction === 'BEARISH' && candles[i].close > upper[i]) direction = 'BULLISH';
      else if (direction === 'BULLISH' && candles[i].close < lower[i]) direction = 'BEARISH';
    }
    line = direction === 'BULLISH' ? lower[i] : upper[i];
  }
  return Number.isFinite(line) ? { value: line, direction } : undefined;
}

export function findSupportResistance(candles: OHLC[]): { support: number[]; resistance: number[] } {
  if (candles.length < 5) return { support: [], resistance: [] };
  const support: number[] = [], resistance: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low) support.push(candles[i].low);
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high) resistance.push(candles[i].high);
  }
  const uniqueLast = (values: number[]) => Array.from(new Set(values.map(v => Number(v.toFixed(5)))).values()).slice(-3);
  return { support: uniqueLast(support), resistance: uniqueLast(resistance) };
}

export function analyzeTechnicalIndicators(candles: OHLC[]): TechnicalIndicatorResults {
  const closes = candles.map(c => c.close);
  const levels = findSupportResistance(candles), last = candles[candles.length - 1];
  let breakoutStatus: TechnicalIndicatorResults['breakoutStatus'];
  if (last && levels.resistance.length && last.close > Math.max(...levels.resistance)) breakoutStatus = 'BULLISH_BREAKOUT';
  else if (last && levels.support.length && last.close < Math.min(...levels.support)) breakoutStatus = 'BEARISH_BREAKOUT';
  else if (last && [...levels.support, ...levels.resistance].some(level => Math.abs(last.close - level) <= (calculateATR(candles, 14) ?? 0) * 0.15)) breakoutStatus = 'RETESTING';
  else if (last) breakoutStatus = 'RANGEBOUND';
  return { ema9: calculateEMA(closes, 9), ema21: calculateEMA(closes, 21), ema50: calculateEMA(closes, 50),
    sma20: calculateSMA(closes, 20), sma50: calculateSMA(closes, 50), sma200: calculateSMA(closes, 200),
    rsi14: calculateRSI(closes, 14), macd: calculateMACD(closes, 12, 26, 9), atr14: calculateATR(candles, 14),
    adx14: calculateADX(candles, 14), bollingerBands: calculateBollingerBands(closes, 20, 2),
    supertrend: calculateSupertrend(candles, 10, 3), levels, breakoutStatus };
}
