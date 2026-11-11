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
  /** Cumulative loss units to recover under the martingale ladder (1, 2, 4 …) */
  recoveryTarget: number;
  /** Stricter confluence threshold demanded while a recovery step is active */
  requiredConfluence: number;
  /** Stakes ladder for the current recovery sequence (1x, 2x, 4x base stake) */
  stakeMultiplier: number;
}

/** Hard gatekeeper: no CALL/PUT leaves the engine below this confluence. */
export const MIN_CONFIDENCE_THRESHOLD = 80;

/** Required confluence per MTG level — recovery steps demand progressively stricter setups. */
export const MTG_REQUIRED_CONFLUENCE: Record<MtgLevel, number> = {
  BASE: MIN_CONFIDENCE_THRESHOLD,
  MTG_LEVEL_1: 85,
  MTG_LEVEL_2: 90,
};

export interface ConfluenceBreakdown {
  rsiExtreme: boolean;
  bollingerBoundaryTouch: boolean;
  rejectionWickStrong: boolean;
  momentumAligned: boolean;
  trendAligned: boolean;
  choppyMarket: boolean;
  score: number; // weighted 0 - 100
}

export const NO_CHART_REASON = 'No valid trading chart detected on shared screen. Please share your Quotex chart window.';

export interface ChartDetectionResult {
  isChart: boolean;
  score: number; // 0 - 100
  reason: string;
}

/**
 * Smart chart-content validator. Scans the captured canvas frame to verify that a
 * trading chart (candle bodies, wicks, or vertical candle-stroke structure) is
 * actually present. Documents, chat windows, web pages and other non-chart content
 * fail instantly so no trading math is computed on them.
 */
export function detectChartPresence(frame?: { width: number; height: number; pixels: number[] }): ChartDetectionResult {
  if (!frame || !Array.isArray(frame.pixels) || frame.pixels.length < 4 || frame.width < 8 || frame.height < 8) {
    return { isChart: false, score: 0, reason: 'No captured frame available for chart validation.' };
  }

  const { width, height, pixels } = frame;
  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
  };
  const isGreenish = (c: { r: number; g: number; b: number }) => c.g > c.r * 1.1 && c.g > c.b * 1.1;
  const isReddish = (c: { r: number; g: number; b: number }) => c.r > c.g * 1.1 && c.r > c.b * 1.1;
  const isSignificant = (c: { r: number; g: number; b: number }) => Math.max(c.r, c.g, c.b) > 60;

  let green = 0;
  let red = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = px(x, y);
      if (!isSignificant(c)) continue;
      if (isGreenish(c)) green++;
      else if (isReddish(c)) red++;
    }
  }

  const candlePixels = green + red;
  const candleRatio = candlePixels / (width * height);

  // Both bull and bear colours present is the strongest chart signature.
  const balanced = candlePixels > 0 ? Math.min(green, red) / candlePixels : 0;

  // Charts show vertical strokes (candle bodies/wicks): columns where candle
  // colours are vertically contiguous, unlike scattered text highlights.
  let strokeColumns = 0;
  const columnsSampled = Math.min(width, 160);
  for (let ci = 0; ci < columnsSampled; ci++) {
    const x = Math.floor((ci * width) / columnsSampled);
    let run = 0;
    let bestRun = 0;
    for (let y = 0; y < height; y++) {
      const c = px(x, y);
      if (isSignificant(c) && (isGreenish(c) || isReddish(c))) {
        run++;
        if (run > bestRun) bestRun = run;
      } else run = 0;
    }
    if (bestRun >= Math.max(3, height * 0.04)) strokeColumns++;
  }
  const strokeRatio = strokeColumns / columnsSampled;

  let score = 0;
  if (candleRatio >= 0.002 && candleRatio <= 0.6) score += 35;
  else if (candleRatio > 0.6) score += 0; // solid colour wash, not a chart
  if (green > 30 && red > 30) score += 25;
  if (balanced >= 0.1) score += 20;
  if (strokeRatio >= 0.05) score += 20;

  const isChart = score >= 45 && candleRatio >= 0.002;
  return {
    isChart,
    score: Math.min(100, score),
    reason: isChart
      ? `Trading chart detected (score ${score}/100): ${(candleRatio * 100).toFixed(1)}% candle-colour pixels, vertical candle strokes in ${(strokeRatio * 100).toFixed(0)}% of sampled columns.`
      : NO_CHART_REASON,
  };
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
  /** Advanced candle-shape recognition from pixel + geometry analysis */
  pattern?: PatternAnalysis;
  /** Explicit next-candle prediction derived from pattern + indicator confluence */
  nextCandlePrediction: { prediction: PatternAnalysis['implication']; rationale: string };
  /** Smart screen-content validation: does the captured frame actually contain a trading chart? */
  chartDetection: {
    isChart: boolean;
    score: number; // 0 - 100 heuristic confidence that a chart grid/candles/axis is present
    reason: string;
  };
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

export type CandlePattern =
  | 'PINBAR'
  | 'HAMMER'
  | 'SHOOTING_STAR'
  | 'MARUBOZU'
  | 'DOJI'
  | 'SPINNING_TOP'
  | 'NONE';

export interface PatternAnalysis {
  pattern: CandlePattern;
  /** Direction the pattern statistically implies for the NEXT candle */
  implication: 'REVERSAL_BULLISH' | 'REVERSAL_BEARISH' | 'CONTINUATION_BULLISH' | 'CONTINUATION_BEARISH' | 'NONE';
  /** Buyers (green) vs sellers (red) pixel dominance — candle pressure */
  pressure: { buyers: number; sellers: number; dominant: 'BUYERS' | 'SELLERS' | 'BALANCED'; strength: number };
  description: string;
}

/**
 * Classifies the latest candle into a classical pattern from its body-to-wick
 * geometry and predicts the next-candle behaviour (reversal vs continuation).
 */
export function classifyCandlePattern(candle: Candle, metrics: CandleMetrics): PatternAnalysis['pattern'] {
  const { bodyRatio, upperWickRatio, lowerWickRatio } = metrics;
  if (bodyRatio >= 0.9) return 'MARUBOZU';
  if (bodyRatio < 0.1) return 'DOJI';
  if (lowerWickRatio >= 0.55 && lowerWickRatio > upperWickRatio * 2) return 'HAMMER';
  if (upperWickRatio >= 0.55 && upperWickRatio > lowerWickRatio * 2) return 'SHOOTING_STAR';
  if ((lowerWickRatio >= 0.5 || upperWickRatio >= 0.5) && bodyRatio <= 0.3) return 'PINBAR';
  if (bodyRatio >= 0.55) return 'MARUBOZU';
  return 'SPINNING_TOP';
}

/**
 * Pixel-level buyer/seller pressure: counts green vs red candle pixels to measure
 * which side is dominating the current candle formation and wick rejections.
 */
export function measurePixelPressure(frame?: { width: number; height: number; pixels: number[] }): PatternAnalysis['pressure'] {
  if (!frame || !Array.isArray(frame.pixels) || frame.pixels.length < 4) {
    return { buyers: 0, sellers: 0, dominant: 'BALANCED', strength: 0 };
  }
  const { width, height, pixels } = frame;
  let buyers = 0;
  let sellers = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (Math.max(r, g, b) <= 60) continue;
      if (g > r * 1.1 && g > b * 1.1) buyers++;
      else if (r > g * 1.1 && r > b * 1.1) sellers++;
    }
  }
  const total = buyers + sellers;
  const dominant: PatternAnalysis['pressure']['dominant'] =
    total === 0 ? 'BALANCED' : buyers / total > 0.6 ? 'BUYERS' : sellers / total > 0.6 ? 'SELLERS' : 'BALANCED';
  const strength = total === 0 ? 0 : Math.round(Math.abs(buyers - sellers) / total * 100);
  return { buyers, sellers, dominant, strength };
}

/**
 * Predictive next-candle logic: combines pattern, RSI extreme, and Bollinger
 * position to predict REVERSAL or CONTINUATION for the next candle.
 */
export function predictNextCandle(input: {
  pattern: CandlePattern;
  rejection: 'BULLISH' | 'BEARISH' | 'NONE';
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rsiExtremeStrict: boolean;
  rsi?: number;
  bollingerStatus?: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS';
  bodyRatio: number;
}): PatternAnalysis['implication'] {
  const reversalSide = input.rejection === 'BULLISH' ? 'REVERSAL_BULLISH' : input.rejection === 'BEARISH' ? 'REVERSAL_BEARISH' : null;
  // Strong rejection wick at outer band with extreme RSI → reversal prediction.
  if (reversalSide && input.rsiExtremeStrict && (input.bollingerStatus === 'NEAR_LOWER' || input.bollingerStatus === 'NEAR_UPPER')) {
    return reversalSide;
  }
  // Solid body closing near outer band with momentum → continuation push.
  if (input.bodyRatio >= 0.55 && (input.bollingerStatus === 'NEAR_LOWER' || input.bollingerStatus === 'NEAR_UPPER')) {
    return input.momentum === 'BULLISH' ? 'CONTINUATION_BULLISH' : input.momentum === 'BEARISH' ? 'CONTINUATION_BEARISH' : 'NONE';
  }
  // Pattern-driven fallbacks.
  if (input.pattern === 'MARUBOZU') return input.momentum === 'BULLISH' ? 'CONTINUATION_BULLISH' : input.momentum === 'BEARISH' ? 'CONTINUATION_BEARISH' : 'NONE';
  if (input.pattern === 'HAMMER') return 'REVERSAL_BULLISH';
  if (input.pattern === 'SHOOTING_STAR') return 'REVERSAL_BEARISH';
  return 'NONE';
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
  // Martingale ladder: cumulative deficit units (1, 2, 4) and matching stake multipliers.
  const recoveryTarget = [0, 1, 3][mtgState.failures] ?? 0;
  const stakeMultiplier = [1, 2, 4][mtgState.failures] ?? 1;
  const requiredConfluence = MTG_REQUIRED_CONFLUENCE[level];
  return {
    level,
    consecutiveFailures: mtgState.failures,
    lastSignal: mtgState.lastSignal,
    lastOutcome: mtgState.lastOutcome,
    recoveryTarget,
    requiredConfluence,
    stakeMultiplier,
    riskWarning:
      level === 'BASE'
        ? undefined
        : `Previous signal failed — step ${level}. Recovery target: ${recoveryTarget} units at ${stakeMultiplier}x stake. Stricter ${requiredConfluence}% confluence required; reduce position size or skip after ${level === 'MTG_LEVEL_2' ? 'two' : 'one'} consecutive loss.`,
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

  // Smart screen-content validation: when a captured frame is present, verify a
  // trading chart actually exists before running any indicator math.
  let chartDetection = detectChartPresence(frame);
  if (frame && !chartDetection.isChart) {
    const mtgNow = buildMtg();
    return {
      signal: 'WAIT',
      confidenceScore: 0,
      evidenceQualityScore: 0,
      summaryReason: '🟡 WAIT — NO CHART DETECTED',
      analysisTimestamp: new Date().toISOString(),
      detectedAsset,
      detectedTimeframe: timeframe,
      candleObservation: chartDetection.reason,
      reasoning: NO_CHART_REASON,
      trendFilter: 'NEUTRAL',
      actionBadge: '🟡 WAIT — NO CHART',
      expiry: {
        recommendation: 'WAIT',
        label: 'WAIT (No Chart On Screen)',
        candles: 0,
        rationale: 'Switch your screen share to the live Quotex chart tab before requesting signals.',
      },
      confluence: {
        rsiExtreme: false,
        bollingerBoundaryTouch: false,
        rejectionWickStrong: false,
        momentumAligned: false,
        trendAligned: false,
        choppyMarket: true,
        score: 0,
      },
      mtg: mtgNow,
      forNextCandle: false,
      chartDetection,
      nextCandlePrediction: { prediction: 'NONE', rationale: 'Non-chart content — no prediction possible.' },
    };
  }
  if (!frame) chartDetection = { isChart: false, score: 0, reason: 'No captured frame available for chart validation.' };

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

  const mtg = buildMtg();
  const confidenceBase = Math.min(98, Math.round(agrees));
  const confidenceScore = mtg.level === 'BASE' ? confidenceBase : Math.round(confidenceBase * 0.9);

  // Strict 80%+ high-confidence gatekeeper. A CALL/PUT only leaves the engine when
  // ALL of the following hold: RSI extreme (<25 / >75), Bollinger outer-band
  // touch/pierce, prominent rejection wick, non-choppy market, and confluence above
  // the level-specific threshold (80% base / 85% MTG1 / 90% MTG2).
  const coreConditionsMet = rsiExtremeStrict && boundaryTouch && strongRejection;
  const requiredConfluence = MTG_REQUIRED_CONFLUENCE[mtg.level];
  const gatePassed = coreConditionsMet && !choppy && confidenceScore >= requiredConfluence;
  const signal: SignalDirection = gatePassed ? dirBias ?? 'WAIT' : 'WAIT';
  const gateFailureReason = gatePassed
    ? undefined
    : !rsiExtremeStrict
      ? `Gatekeeper: RSI ${rsi?.toFixed(1) ?? 'unavailable'} not in extreme zone (<25 oversold / >75 overbought).`
      : !boundaryTouch
        ? 'Gatekeeper: price has not touched or pierced the outer Bollinger Band.'
        : !strongRejection
          ? 'Gatekeeper: candle lacks a prominent body-to-wick rejection geometry.'
          : choppy
            ? 'Gatekeeper: market is choppy (mid-band price, overlapping candles, or band squeeze).'
            : `Gatekeeper: confluence ${confidenceScore}% below required ${requiredConfluence}% (MTG level ${mtg.level}).`;

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

  // Advanced pattern recognition + predictive next-candle logic.
  const patternName = lastCandle && candleMetrics ? classifyCandlePattern(lastCandle, candleMetrics) : 'NONE';
  const pixelPressure = measurePixelPressure(frame);
  const nextPrediction = predictNextCandle({
    pattern: patternName,
    rejection: candleMetrics?.rejection ?? 'NONE',
    momentum: candleMetrics?.momentum ?? 'NEUTRAL',
    rsiExtremeStrict,
    rsi,
    bollingerStatus: bollingerInfo?.status,
    bodyRatio: candleMetrics?.bodyRatio ?? 0,
  });
  if (patternName !== 'NONE') parts.push(`pattern ${patternName.replace('_', ' ').toLowerCase()}`);
  if (nextPrediction !== 'NONE') parts.push(`next-candle ${nextPrediction.replace('_', ' ').toLowerCase()} prediction`);
  if (pixelPressure.dominant !== 'BALANCED') parts.push(`${pixelPressure.dominant.toLowerCase()} dominating (${pixelPressure.strength}% pressure)`);
  if (bollingerInfo) parts.push(`Bollinger ${bollingerInfo.status.replace('_', ' ').toLowerCase()} (bandwidth ${(bollingerInfo.bandwidth * 100).toFixed(2)}%)`);
  if (candleMetrics) parts.push(`${candleMetrics.rejection.toLowerCase()} rejection wick ${(Math.max(candleMetrics.upperWickRatio, candleMetrics.lowerWickRatio) * 100).toFixed(0)}%`);
  if (swing) parts.push(`${swing.type.toLowerCase()} @ ${swing.level.toFixed(5)} (strength ${swing.strength})`);

  const reasoning = `${gateFailureReason ?? `Confluence ${confidenceScore}%` } — ${parts.join('; ') || 'insufficient data'}.${mtg.riskWarning ? ` ${mtg.riskWarning}` : ''}`;

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
    chartDetection,
    pattern: {
      pattern: patternName,
      implication: nextPrediction,
      pressure: pixelPressure,
      description: patternName === 'NONE'
        ? 'No classical candle pattern detected.'
        : `${patternName.replace('_', ' ')} formation detected (body ${(candleMetrics?.bodyRatio ?? 0) * 100 > 0 ? ((candleMetrics?.bodyRatio ?? 0) * 100).toFixed(0) : '0'}% of range).`,
    },
    nextCandlePrediction: {
      prediction: nextPrediction,
      rationale:
        nextPrediction.startsWith('REVERSAL')
          ? `Strong rejection wick at outer Bollinger band with RSI extreme — predicting next-candle ${nextPrediction.includes('BULLISH') ? 'bullish reversal' : 'bearish reversal'}.`
          : nextPrediction.startsWith('CONTINUATION')
            ? `Solid ${((candleMetrics?.bodyRatio ?? 0) * 100).toFixed(0)}% body closing near the outer band with momentum — predicting short-term 1M/2M ${nextPrediction.includes('BULLISH') ? 'bullish' : 'bearish'} push (continuation).`
            : 'Mixed signals — no directional next-candle prediction.',
    },
  };
}
