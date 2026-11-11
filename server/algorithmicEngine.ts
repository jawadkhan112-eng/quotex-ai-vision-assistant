// Algorithmic technical-analysis engine. It is deterministic and makes no network calls.

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type SignalDirection = 'CALL' | 'PUT' | 'WAIT';

export interface AlgoSignal {
  signal: SignalDirection;
  confidenceScore: number; // 0 - 100
  evidenceQualityScore: number;
  summaryReason: string;
  analysisTimestamp: string;
  detectedAsset?: string;
  detectedTimeframe?: string;
}

export type ExpiryRecommendation =
  | 'NEXT_1M'
  | 'EXPIRY_2M'
  | 'EXPIRY_5M_PLUS'
  | 'WAIT';

export type MtgLevel = 'BASE' | 'MTG_LEVEL_1' | 'MTG_LEVEL_2';

export interface MtgState {
  level: MtgLevel;
  consecutiveFailures: number;
  lastSignal?: SignalDirection;
  lastOutcome?: 'WIN' | 'LOSS';
  riskWarning?: string;
}

export interface ConfluenceBreakdown {
  rsiExtreme: boolean;
  bollingerBoundaryTouch: boolean;
  rejectionWickStrong: boolean;
  momentumAligned: boolean;
  trendAligned: boolean;
  choppyMarket: boolean;
  score: number; // weighted 0 - 100
}

export interface AlgoAnalysisResult {
  signal: SignalDirection;
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
  bollinger?: { upper: number; middle: number; lower: number; proximity: number; status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS'; bandwidth: number };
  candle?: { bodyRatio: number; upperWickRatio: number; lowerWickRatio: number; rejection: 'BULLISH' | 'BEARISH' | 'NONE'; momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  pixelDiagnostics?: { greenPixels: number; redPixels: number; contrast: number; sampledPixels: number };
  supportResistance?: { level: number; type: 'SWING_HIGH' | 'SWING_LOW' | 'ROUND_NUMBER'; strength: number };
  trendFilter: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  /** Expiry-specific directive, e.g. "NEXT 1M CALL", "2M / MULTI-CANDLE EXPIRY PUT", "WAIT (No Clear Confluence)" */
  actionBadge: string;
  /** Machine-readable expiry decision matrix output */
  expiry: { recommendation: ExpiryRecommendation; label: string; candles: number; rationale: string };
  /** Weighted multi-indicator confluence breakdown */
  confluence: ConfluenceBreakdown;
  /** Martingale progression tag applied to this signal */
  mtg: MtgState;
  /** Explicit statement that the signal applies to the next candle */
  forNextCandle: boolean;
}

/* ------------------------------------------------------------------ */
/* Internal indicator helpers                                          */
/* ------------------------------------------------------------------ */

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

export interface CandleMetrics {
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  rejection: 'BULLISH' | 'BEARISH' | 'NONE';
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export function measureCandle(candle: Candle): CandleMetrics {
  const range = Math.max(candle.high - candle.low, 1e-9);
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  let rejection: CandleMetrics['rejection'] = 'NONE';
  if (lowerWickRatio >= 0.55 && lowerWickRatio > upperWickRatio * 2) rejection = 'BULLISH';
  else if (upperWickRatio >= 0.55 && upperWickRatio > lowerWickRatio * 2) rejection = 'BEARISH';

  const momentum: CandleMetrics['momentum'] =
    candle.close > candle.open ? 'BULLISH' : candle.close < candle.open ? 'BEARISH' : 'NEUTRAL';

  return { bodyRatio, upperWickRatio, lowerWickRatio, rejection, momentum };
}

/* ------------------------------------------------------------------ */
/* Martingale (MTG) tracking state                                     */
/* ------------------------------------------------------------------ */

const mtgState: { failures: number; lastSignal?: SignalDirection; lastOutcome?: 'WIN' | 'LOSS' } = {
  failures: 0,
};

/**
 * Report the outcome of the previous signal so the next analysis can be
 * tagged with the correct Martingale (MTG) level.
 */
export function reportSignalOutcome(outcome: 'WIN' | 'LOSS'): void {
  mtgState.lastOutcome = outcome;
  if (outcome === 'LOSS') mtgState.failures = Math.min(mtgState.failures + 1, 2);
  else mtgState.failures = 0;
}

export function resetMtgState(): void {
  mtgState.failures = 0;
  mtgState.lastOutcome = undefined;
  mtgState.lastSignal = undefined;
}

function buildMtg(): MtgState {
  const level: MtgLevel =
    mtgState.failures >= 2 ? 'MTG_LEVEL_2' : mtgState.failures === 1 ? 'MTG_LEVEL_1' : 'BASE';
  return {
    level,
    consecutiveFailures: mtgState.failures,
    lastSignal: mtgState.lastSignal,
    lastOutcome: mtgState.lastOutcome,
    riskWarning:
      level === 'BASE'
        ? undefined
        : `Previous signal failed — step ${level}. MTG doubles stake risk; reduce position size or skip after ${level === 'MTG_LEVEL_2' ? 'two' : 'one'} consecutive loss.`,
  };
}

/* ------------------------------------------------------------------ */
/* Core analysis                                                       */
/* ------------------------------------------------------------------ */

interface AnalyzeInput {
  prices?: number[];
  candles?: Candle[];
  timeframe?: string;
  frame?: { width: number; height: number; pixels: number[] };
  detectedAsset?: string;
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function trendOf(prices: number[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (prices.length < 6) return 'NEUTRAL';
  const recent = prices.slice(-6);
  const first = recent.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last = recent.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const delta = (last - first) / Math.max(Math.abs(first), 1e-9);
  if (delta > 0.0005) return 'BULLISH';
  if (delta < -0.0005) return 'BEARISH';
  return 'NEUTRAL';
}

function nearestSwingLevel(candles: Candle[] | undefined): AlgoAnalysisResult['supportResistance'] {
  if (!candles || candles.length < 10) return undefined;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high
    )
      swingHighs.push(candles[i].high);
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low
    )
      swingLows.push(candles[i].low);
  }
  const last = candles[candles.length - 1].close;
  const candidates: Array<{ level: number; type: 'SWING_HIGH' | 'SWING_LOW'; distance: number }> = [
    ...swingHighs.map((level) => ({ level, type: 'SWING_HIGH' as const, distance: Math.abs(level - last) })),
    ...swingLows.map((level) => ({ level, type: 'SWING_LOW' as const, distance: Math.abs(level - last) })),
  ];
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  const strength = Math.max(0, 100 - (best.distance / Math.max(last, 1e-9)) * 1000);
  return { level: best.level, type: best.type, strength: Math.round(strength) };
}

function pixelDiagnostics(frame?: { width: number; height: number; pixels: number[] }) {
  if (!frame || !Array.isArray(frame.pixels) || frame.pixels.length < 4) return undefined;
  let green = 0;
  let red = 0;
  let lumSum = 0;
  let sampled = 0;
  const stride = Math.max(1, Math.floor(frame.pixels.length / 4 / 20000)) * 4;
  for (let i = 0; i + 2 < frame.pixels.length; i += stride) {
    const r = frame.pixels[i];
    const g = frame.pixels[i + 1];
    const b = frame.pixels[i + 2];
    if (g > r * 1.15 && g > b * 1.15) green++;
    else if (r > g * 1.15 && r > b * 1.15) red++;
    lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sampled++;
  }
  if (sampled === 0) return undefined;
  return {
    greenPixels: green,
    redPixels: red,
    contrast: Number((lumSum / sampled).toFixed(2)),
    sampledPixels: sampled,
  };
}

/**
 * Dynamic expiry & timeframe decision matrix.
 * Chooses NEXT_1M / 2M / 5M+ / WAIT based on structure and candle behaviour.
 */
function decideExpiry(input: {
  signal: SignalDirection;
  confluenceScore: number;
  rsiValue?: number;
  bollinger?: { proximity: number; status: string; bandwidth: number };
  candle?: CandleMetrics;
  nearMajorLevel: boolean;
  choppy: boolean;
}): AlgoAnalysisResult['expiry'] {
  if (input.signal === 'WAIT' || input.choppy || input.confluenceScore < 55) {
    return {
      recommendation: 'WAIT',
      label: 'WAIT (No Clear Confluence)',
      candles: 0,
      rationale: 'Price is mid-band or RSI neutral (40-60) with conflicting wicks — low probability, stand aside.',
    };
  }
  const strongWick =
    input.candle?.rejection === 'BULLISH' || input.candle?.rejection === 'BEARISH';
  const rsiExtreme = finite(input.rsiValue) && (input.rsiValue! < 25 || input.rsiValue! > 75);

  // 1) Major swing high/low hit with strong rejection → 5M+ sureshot expiry.
  if (input.nearMajorLevel && strongWick && input.confluenceScore >= 70) {
    return {
      recommendation: 'EXPIRY_5M_PLUS',
      label: input.signal === 'CALL' ? '5M+ SURESHOT CALL' : '5M+ SURESHOT PUT',
      candles: 5,
      rationale: 'Strong support/resistance swing zone hit with dominant rejection wick — wider 5-minute expiry maximises win-rate safety.',
    };
  }

  // 2) Fast reversal at extreme band touch with RSI extreme → next 1M candle.
  if ((input.bollinger?.status === 'NEAR_LOWER' || input.bollinger?.status === 'NEAR_UPPER') && (rsiExtreme || strongWick)) {
    return {
      recommendation: 'NEXT_1M',
      label: `${input.signal === 'CALL' ? 'NEXT 1M CALL' : 'NEXT 1M PUT'}`,
      candles: 1,
      rationale: 'High-momentum Bollinger boundary touch with immediate reversal power — enter on the very next candle.',
    };
  }

  // 3) Continuation / mid-trend with meaningful volatility → 2 candle expiry.
  return {
    recommendation: 'EXPIRY_2M',
    label: `${input.signal === 'CALL' ? 'NEXT 2M CALL' : 'NEXT 2M PUT'}`,
    candles: 2,
    rationale: 'Trend momentum plus band width favour a sustained move spanning two candles.',
  };
}

export function analyzeAlgorithmic(input: AnalyzeInput): AlgoAnalysisResult {
  const { prices = [], candles, timeframe = '1M', frame, detectedAsset } = input;

  const series =
    prices.length >= 2 ? prices : candles && candles.length > 0 ? candles.map((c) => c.close) : [];

  if (series.length < 2 || series.some((v) => !Number.isFinite(v))) {
    throw new Error('At least two finite closing prices are required for local algorithmic analysis.');
  }

  const trendFilter = trendOf(series);
  const rsi = calculateRSI(series, 14);
  const bb = calculateBollingerBands(series, 20, 2);
  const lastClose = series[series.length - 1];

  let bollingerInfo: AlgoAnalysisResult['bollinger'];
  if (bb) {
    const width = Math.max(bb.upper - bb.lower, 1e-9);
    const proximity = (lastClose - bb.middle) / (width / 2); // -1 lower edge .. +1 upper edge
    const status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS' =
      proximity <= -0.75 ? 'NEAR_LOWER' : proximity >= 0.75 ? 'NEAR_UPPER' : 'WITHIN_BANDS';
    bollingerInfo = { upper: bb.upper, middle: bb.middle, lower: bb.lower, proximity, status, bandwidth: bb.bandwidth };
  }

  const lastCandle: Candle | undefined =
    candles && candles.length > 0
      ? candles[candles.length - 1]
      : undefined;
  const candleMetrics = lastCandle ? measureCandle(lastCandle) : undefined;

  const swing = nearestSwingLevel(candles);
  const nearMajorLevel = Boolean(swing && swing.strength >= 80);

  const rsiZone: AlgoAnalysisResult['rsiZone'] = !finite(rsi)
    ? undefined
    : rsi < 30
      ? 'OVERSOLD'
      : rsi > 70
        ? 'OVERBOUGHT'
        : 'NEUTRAL';

  const rsiExtremeStrict = finite(rsi) && (rsi < 25 || rsi > 75);
  const rsiNeutralZone = finite(rsi) && rsi >= 40 && rsi <= 60;
  const boundaryTouch = bollingerInfo?.status !== undefined && bollingerInfo.status !== 'WITHIN_BANDS';
  const strongRejection = candleMetrics?.rejection === 'BULLISH' || candleMetrics?.rejection === 'BEARISH';

  const dirBias: SignalDirection | null =
    candleMetrics?.rejection === 'BULLISH' || (rsi !== undefined && rsi < 30) || bollingerInfo?.status === 'NEAR_LOWER'
      ? 'CALL'
      : candleMetrics?.rejection === 'BEARISH' || (rsi !== undefined && rsi > 70) || bollingerInfo?.status === 'NEAR_UPPER'
        ? 'PUT'
        : null;

  // Directional agreement across factors
  let agrees = 0;
  if (dirBias) {
    if (rsiExtremeStrict && ((dirBias === 'CALL' && rsi! < 25) || (dirBias === 'PUT' && rsi! > 75))) agrees += 35;
    if (boundaryTouch && ((dirBias === 'CALL' && bollingerInfo!.status === 'NEAR_LOWER') || (dirBias === 'PUT' && bollingerInfo!.status === 'NEAR_UPPER'))) agrees += 30;
    if (strongRejection && ((dirBias === 'CALL' && candleMetrics!.rejection === 'BULLISH') || (dirBias === 'PUT' && candleMetrics!.rejection === 'BEARISH'))) agrees += 25;
    if ((dirBias === 'CALL' && trendFilter === 'BULLISH') || (dirBias === 'PUT' && trendFilter === 'BEARISH')) agrees += 10;
    if ((dirBias === 'CALL' && candleMetrics!.momentum === 'BULLISH') || (dirBias === 'PUT' && candleMetrics!.momentum === 'BEARISH')) agrees += 5;
  }

  const choppy =
    (!boundaryTouch && rsiNeutralZone) ||
    (candleMetrics !== undefined && candleMetrics.bodyRatio < 0.25 && Math.abs(candleMetrics.upperWickRatio - candleMetrics.lowerWickRatio) < 0.1) ||
    (bb !== undefined && bb.bandwidth < 0.002);

  const signal: SignalDirection = choppy || agrees < 55 ? 'WAIT' : dirBias ?? 'WAIT';

  const mtg = buildMtg();
  const confidenceBase = Math.min(98, Math.round(agrees));
  const confidenceScore = mtg.level === 'BASE' ? confidenceBase : Math.round(confidenceBase * 0.85);

  const expiry = decideExpiry({
    signal,
    confluenceScore: confidenceScore,
    rsiValue: rsi,
    bollinger: bollingerInfo ? { proximity: bollingerInfo.proximity, status: bollingerInfo.status, bandwidth: bollingerInfo.bandwidth } : undefined,
    candle: candleMetrics,
    nearMajorLevel,
    choppy,
  });

  const actionBadge =
    expiry.recommendation === 'WAIT'
      ? '🟡 WAIT'
      : signal === 'CALL'
        ? expiry.recommendation === 'NEXT_1M'
          ? '🟢 NEXT 1M CALL'
          : `🟢 ${expiry.label}`
        : expiry.recommendation === 'NEXT_1M'
          ? '🔴 NEXT 1M PUT'
          : `🔴 ${expiry.label}`;

  const parts: string[] = [];
  if (finite(rsi)) parts.push(`RSI(14) ${rsi!.toFixed(1)} (${rsiZone})`);
  if (bollingerInfo) parts.push(`Bollinger ${bollingerInfo.status.replace('_', ' ').toLowerCase()} (bandwidth ${(bollingerInfo.bandwidth * 100).toFixed(2)}%)`);
  if (candleMetrics) parts.push(`${candleMetrics.rejection.toLowerCase()} rejection wick ${(Math.max(candleMetrics.upperWickRatio, candleMetrics.lowerWickRatio) * 100).toFixed(0)}%`);
  if (swing) parts.push(`${swing.type.toLowerCase()} @ ${swing.level.toFixed(5)} (strength ${swing.strength})`);

  const reasoning = `Confluence ${confidenceScore}% — ${parts.join('; ') || 'insufficient data'}.${mtg.riskWarning ? ` ${mtg.riskWarning}` : ''}`;

  mtg.lastSignal = signal;

  const observation = lastCandle
    ? `Candle O:${lastCandle.open.toFixed(5)} H:${lastCandle.high.toFixed(5)} L:${lastCandle.low.toFixed(5)} C:${lastCandle.close.toFixed(5)} — body ${(candleMetrics!.bodyRatio * 100).toFixed(0)}%, upper wick ${(candleMetrics!.upperWickRatio * 100).toFixed(0)}%, lower wick ${(candleMetrics!.lowerWickRatio * 100).toFixed(0)}%.`
    : `Close-only series, last price ${lastClose.toFixed(5)}.`;

  return {
    signal,
    confidenceScore,
    evidenceQualityScore: confidenceScore,
    summaryReason: actionBadge,
    analysisTimestamp: new Date().toISOString(),
    detectedAsset,
    detectedTimeframe: timeframe,
    candleObservation: observation,
    reasoning,
    rsiValue: rsi,
    rsiZone,
    bollinger: bollingerInfo,
    candle: candleMetrics,
    pixelDiagnostics: pixelDiagnostics(frame),
    supportResistance: swing,
    trendFilter,
    actionBadge,
    expiry,
    confluence: {
      rsiExtreme: rsiExtremeStrict,
      bollingerBoundaryTouch: boundaryTouch,
      rejectionWickStrong: strongRejection,
      momentumAligned: Boolean(dirBias && (dirBias === 'CALL' ? candleMetrics?.momentum === 'BULLISH' : candleMetrics?.momentum === 'BEARISH')),
      trendAligned: Boolean(dirBias && (dirBias === 'CALL' ? trendFilter === 'BULLISH' : trendFilter === 'BEARISH')),
      choppyMarket: choppy,
      score: confidenceScore,
    },
    mtg,
    forNextCandle: true,
  };
}
