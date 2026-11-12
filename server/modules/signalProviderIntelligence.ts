/**
 * Signal Provider Intelligence Engine
 * ===================================
 * Analyses the last N completed candles (default 5, optional 10) using real
 * extracted candle geometry and returns an explicit next-candle direction
 * decision: UP / DOWN / WAIT, with full evidence accounting.
 *
 * Design rules:
 * - Direction decision and opportunity qualification are SEPARATE outputs.
 *   A LOW-CONFIDENCE direction is still displayed; it is just not an alert.
 * - WAIT is a valid decision (insufficient/conflicting evidence), never a
 *   silent failure. Every WAIT carries an exact reason.
 * - No external data, no fabrication. RSI/Bollinger absence never forces WAIT
 *   when price-action evidence exists.
 */

export interface ProviderCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  /** true when this candle is still forming (excluded from completed analysis) */
  developing?: boolean;
}

export type DirectionDecision = 'UP' | 'DOWN' | 'WAIT';

export interface StrategyVote {
  strategy: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  strength: number; // 0-100
  evidence: string;
  satisfied: boolean;
}

export interface ProviderDecision {
  prediction: DirectionDecision;
  /** Confidence in the direction prediction, 0-100 (independent of confluence). */
  predictionConfidence: number;
  /** Weighted confluence across the 100-point opportunity categories. */
  confluenceScore: number;
  classification: 'HIGH QUALITY' | 'STRONG QUALIFIED' | 'QUALIFIED / CAUTION' | 'LOW CONFIDENCE';
  qualified: boolean; // confluence >= 60 AND direction !== WAIT
  bullishVotes: StrategyVote[];
  bearishVotes: StrategyVote[];
  neutralVotes: StrategyVote[];
  bullishScore: number;
  bearishScore: number;
  explanation: string;
  waitReason?: string;
  patternName: string;
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  candlesAnalyzed: number;
  analysisVersion: string;
}

export const PROVIDER_ENGINE_VERSION = 'SPI-1.0.0';
export const QUALIFIED_THRESHOLD = 60;

/* ----------------------------- helpers ----------------------------- */

const bodyOf = (c: ProviderCandle) => Math.abs(c.close - c.open);
const rangeOf = (c: ProviderCandle) => Math.max(c.high - c.low, 1e-9);
const upperWickOf = (c: ProviderCandle) => c.high - Math.max(c.open, c.close);
const lowerWickOf = (c: ProviderCandle) => Math.min(c.open, c.close) - c.low;
const bull = (c: ProviderCandle) => c.close > c.open;
const bear = (c: ProviderCandle) => c.close < c.open;
const bodyRatio = (c: ProviderCandle) => bodyOf(c) / rangeOf(c);
const upperWickRatio = (c: ProviderCandle) => upperWickOf(c) / rangeOf(c);
const lowerWickRatio = (c: ProviderCandle) => lowerWickOf(c) / rangeOf(c);

function trendOf(candles: ProviderCandle[]): ProviderDecision['trend'] {
  if (candles.length < 4) return 'RANGING';
  const half = Math.floor(candles.length / 2);
  const firstAvg = candles.slice(0, half).reduce((a, c) => a + (c.high + c.low) / 2, 0) / half;
  const lastAvg = candles.slice(half).reduce((a, c) => a + (c.high + c.low) / 2, 0) / (candles.length - half);
  const drift = (lastAvg - firstAvg) / Math.max(firstAvg, 1e-9);
  if (drift > 0.002) return 'BULLISH';
  if (drift < -0.002) return 'BEARISH';
  return 'RANGING';
}

function higherHighsLows(candles: ProviderCandle[]): { hh: number; hl: number; lh: number; ll: number } {
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].high > candles[i - 1].high) hh++;
    if (candles[i].low > candles[i - 1].low) hl++;
    if (candles[i].high < candles[i - 1].high) lh++;
    if (candles[i].low < candles[i - 1].low) ll++;
  }
  return { hh, hl, lh, ll };
}

function detectPattern(candles: ProviderCandle[]): string {
  if (candles.length < 2) return 'INSUFFICIENT';
  const c = candles[candles.length - 1];
  const p = candles[candles.length - 2];
  const br = bodyRatio(c), uwr = upperWickRatio(c), lwr = lowerWickRatio(c);
  const bodyP = bodyRatio(p);

  if (candles.length >= 3) {
    const p2 = candles[candles.length - 3];
    // Morning / evening star (3-candle reversal)
    if (bear(p2) && bodyRatio(p2) > 0.5 && bodyP < 0.3 && bull(c) && c.close > (p2.open + p2.close) / 2) return 'MORNING_STAR';
    if (bull(p2) && bodyRatio(p2) > 0.5 && bodyP < 0.3 && bear(c) && c.close < (p2.open + p2.close) / 2) return 'EVENING_STAR';
    // Three white soldiers / three black crows
    if (candles.length >= 3) {
      const three = candles.slice(-3);
      if (three.every(bull) && three.every((x) => bodyRatio(x) > 0.55)) return 'THREE_WHITE_SOLDIERS';
      if (three.every(bear) && three.every((x) => bodyRatio(x) > 0.55)) return 'THREE_BLACK_CROWS';
    }
  }
  // Engulfing
  if (bull(c) && bear(p) && c.close > p.open && c.open < p.close && bodyRatio(c) > 0.5) return 'BULLISH_ENGULFING';
  if (bear(c) && bull(p) && c.close < p.open && c.open > p.close && bodyRatio(c) > 0.5) return 'BEARISH_ENGULFING';
  // Piercing / dark cloud
  if (bull(c) && bear(p) && bodyP > 0.5 && c.close > (p.open + p.close) / 2 && c.open < p.close) return 'PIERCING';
  if (bear(c) && bull(p) && bodyP > 0.5 && c.close < (p.open + p.close) / 2 && c.open > p.close) return 'DARK_CLOUD';
  // Single-candle shapes
  if (br < 0.1) {
    if (lwr > 0.6 && uwr < 0.1) return 'DRAGONFLY_DOJI';
    if (uwr > 0.6 && lwr < 0.1) return 'GRAVESTONE_DOJI';
    return 'DOJI';
  }
  if (lwr >= 0.55 && lwr > uwr * 2 && bull(c)) return 'HAMMER';
  if (lwr >= 0.55 && lwr > uwr * 2) return 'HANGING_MAN';
  if (uwr >= 0.55 && uwr > lwr * 2 && bear(c)) return 'SHOOTING_STAR';
  if (uwr >= 0.55 && uwr > lwr * 2) return 'INVERTED_HAMMER';
  if (br >= 0.9) return bull(c) ? 'BULL_MARUBOZU' : 'BEAR_MARUBOZU';
  // Inside / outside bar
  if (c.high < p.high && c.low > p.low) return 'INSIDE_BAR';
  if (c.high > p.high && c.low < p.low) return 'OUTSIDE_BAR';
  if (br >= 0.55) return bull(c) ? 'STRONG_BULL_BODY' : 'STRONG_BEAR_BODY';
  if (lwr >= 0.5 || uwr >= 0.5) return 'PIN_BAR';
  return 'NEUTRAL_BODY';
}

function supportResistance(candles: ProviderCandle[]): { support: number; resistance: number } | null {
  if (candles.length < 3) return null;
  const completed = candles;
  const support = Math.min(...completed.map((c) => c.low));
  const resistance = Math.max(...completed.map((c) => c.high));
  return { support, resistance };
}

/* ------------------------- strategy voters ------------------------- */

/**
 * Runs the independent strategy families over the completed candles.
 * Each voter is independent: correlated evidence (e.g. EMA alignment AND EMA
 * crossover) is folded into ONE vote so it cannot double-count.
 */
function runStrategies(completed: ProviderCandle[], developing?: ProviderCandle): StrategyVote[] {
  const votes: StrategyVote[] = [];
  const n = completed.length;
  const trend = trendOf(completed);
  const last = completed[n - 1];
  const pattern = detectPattern(completed);
  const hh = higherHighsLows(completed);

  // --- 1. Candle-sequence / momentum-structure voter ---
  {
    const recent = completed.slice(-3);
    const bulls = recent.filter(bull).length;
    const bears = recent.filter(bear).length;
    if (bulls >= 2) votes.push({ strategy: 'candle-sequence', direction: 'UP', strength: 40 + bulls * 15, evidence: `${bulls}/3 recent candles bullish`, satisfied: true });
    else if (bears >= 2) votes.push({ strategy: 'candle-sequence', direction: 'DOWN', strength: 40 + bears * 15, evidence: `${bears}/3 recent candles bearish`, satisfied: true });
    else votes.push({ strategy: 'candle-sequence', direction: 'NEUTRAL', strength: 20, evidence: 'mixed candle sequence', satisfied: false });
  }

  // --- 2. Market-structure voter (higher highs / lower lows) ---
  {
    if (hh.hh >= 2 && hh.hl >= 2) votes.push({ strategy: 'market-structure', direction: 'UP', strength: 60, evidence: `higher highs (${hh.hh}) and higher lows (${hh.hl})`, satisfied: true });
    else if (hh.lh >= 2 && hh.ll >= 2) votes.push({ strategy: 'market-structure', direction: 'DOWN', strength: 60, evidence: `lower highs (${hh.lh}) and lower lows (${hh.ll})`, satisfied: true });
    else votes.push({ strategy: 'market-structure', direction: 'NEUTRAL', strength: 20, evidence: 'no clean HH/HL or LH/LL structure', satisfied: false });
  }

  // --- 3. Trend voter ---
  {
    if (trend === 'BULLISH') votes.push({ strategy: 'trend', direction: 'UP', strength: 55, evidence: 'price trending up over analysis window', satisfied: true });
    else if (trend === 'BEARISH') votes.push({ strategy: 'trend', direction: 'DOWN', strength: 55, evidence: 'price trending down over analysis window', satisfied: true });
    else votes.push({ strategy: 'trend', direction: 'NEUTRAL', strength: 15, evidence: 'ranging / no directional trend', satisfied: false });
  }

  // --- 4. Pattern voter ---
  {
    const bullPatterns = ['MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_ENGULFING', 'PIERCING', 'HAMMER', 'DRAGONFLY_DOJI', 'BULL_MARUBOZU', 'STRONG_BULL_BODY'];
    const bearPatterns = ['EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_ENGULFING', 'DARK_CLOUD', 'SHOOTING_STAR', 'GRAVESTONE_DOJI', 'BEAR_MARUBOZU', 'STRONG_BEAR_BODY'];
    const neutralPatterns = ['DOJI', 'INSIDE_BAR', 'NEUTRAL_BODY', 'PIN_BAR', 'HANGING_MAN', 'INVERTED_HAMMER'];
    if (bullPatterns.includes(pattern)) votes.push({ strategy: 'candle-pattern', direction: 'UP', strength: 65, evidence: `pattern ${pattern.toLowerCase().replace(/_/g, ' ')}`, satisfied: true });
    else if (bearPatterns.includes(pattern)) votes.push({ strategy: 'candle-pattern', direction: 'DOWN', strength: 65, evidence: `pattern ${pattern.toLowerCase().replace(/_/g, ' ')}`, satisfied: true });
    else if (neutralPatterns.includes(pattern)) votes.push({ strategy: 'candle-pattern', direction: 'NEUTRAL', strength: 15, evidence: `indecisive pattern ${pattern.toLowerCase().replace(/_/g, ' ')}`, satisfied: false });
    else votes.push({ strategy: 'candle-pattern', direction: 'NEUTRAL', strength: 10, evidence: `unclassified formation`, satisfied: false });
  }

  // --- 5. Wick-rejection voter ---
  {
    const lwr = lowerWickRatio(last);
    const uwr = upperWickRatio(last);
    if (lwr >= 0.5 && lwr > uwr * 1.5) votes.push({ strategy: 'wick-rejection', direction: 'UP', strength: 55, evidence: `strong lower wick rejection (${Math.round(lwr * 100)}% of range)`, satisfied: true });
    else if (uwr >= 0.5 && uwr > lwr * 1.5) votes.push({ strategy: 'wick-rejection', direction: 'DOWN', strength: 55, evidence: `strong upper wick rejection (${Math.round(uwr * 100)}% of range)`, satisfied: true });
    else votes.push({ strategy: 'wick-rejection', direction: 'NEUTRAL', strength: 10, evidence: 'balanced wicks', satisfied: false });
  }

  // --- 6. Support/resistance proximity voter ---
  {
    const sr = supportResistance(completed);
    if (sr) {
      const range = Math.max(sr.resistance - sr.support, 1e-9);
      const nearSupport = (last.close - sr.support) / range;
      const nearResistance = (sr.resistance - last.close) / range;
      if (nearSupport <= 0.2) votes.push({ strategy: 'support-proximity', direction: 'UP', strength: 45, evidence: 'price at window support', satisfied: true });
      else if (nearResistance <= 0.2) votes.push({ strategy: 'resistance-proximity', direction: 'DOWN', strength: 45, evidence: 'price at window resistance', satisfied: true });
      else votes.push({ strategy: 's/r-proximity', direction: 'NEUTRAL', strength: 10, evidence: 'mid-range price', satisfied: false });
    }
  }

  // --- 7. Momentum / body-size voter ---
  {
    const avgBody = completed.reduce((a, c) => a + bodyRatio(c), 0) / n;
    const lastIsBull = bull(last);
    const momentum = bodyRatio(last) >= avgBody * 0.8 ? 'expanding' : 'contracting';
    if (lastIsBull && momentum === 'expanding') votes.push({ strategy: 'momentum', direction: 'UP', strength: 45, evidence: 'bullish body above average size (momentum expanding)', satisfied: true });
    else if (!lastIsBull && momentum === 'expanding') votes.push({ strategy: 'momentum', direction: 'DOWN', strength: 45, evidence: 'bearish body above average size (momentum expanding)', satisfied: true });
    else votes.push({ strategy: 'momentum', direction: 'NEUTRAL', strength: 15, evidence: `momentum contracting (last body ${(bodyRatio(last) * 100).toFixed(0)}% vs avg ${(avgBody * 100).toFixed(0)}%)`, satisfied: false });
  }

  // --- 8. Developing-candle continuation voter (separate, weaker) ---
  if (developing) {
    const devBull = bull(developing);
    if (devBull) votes.push({ strategy: 'developing-candle', direction: 'UP', strength: 25, evidence: 'developing candle currently bullish (weak confirmation)', satisfied: true });
    else votes.push({ strategy: 'developing-candle', direction: 'DOWN', strength: 25, evidence: 'developing candle currently bearish (weak confirmation)', satisfied: true });
  }

  return votes;
}

/* --------------------------- scoring --------------------------- */

function scoreVotes(votes: StrategyVote[]): { bullish: number; bearish: number; neutral: number } {
  let bullish = 0, bearish = 0, neutral = 0;
  for (const v of votes) {
    const weighted = v.strength * (v.satisfied ? 1 : 0.4);
    if (v.direction === 'UP') bullish += weighted;
    else if (v.direction === 'DOWN') bearish += weighted;
    else neutral += weighted;
  }
  return { bullish, bearish, neutral };
}

/**
 * Core entry point: decide the next-candle direction from completed candles.
 */
export function analyzeProviderCandles(input: {
  completed: ProviderCandle[];
  developing?: ProviderCandle;
  /** 5 (default) or 10 */
  window?: 5 | 10;
}): ProviderDecision {
  const { developing } = input;
  const window = input.window ?? 5;
  const completed = input.completed.filter((c) => !c.developing).slice(-window);
  const n = completed.length;

  if (n < 3) {
    return {
      prediction: 'WAIT',
      predictionConfidence: 0,
      confluenceScore: 0,
      classification: 'LOW CONFIDENCE',
      qualified: false,
      bullishVotes: [], bearishVotes: [], neutralVotes: [],
      bullishScore: 0, bearishScore: 0,
      explanation: `Only ${n} completed candle(s) available; at least 3 are required for a directional decision.`,
      waitReason: `Insufficient completed candles: ${n}/3 minimum. Share more chart history so the engine can analyze the last ${window}.`,
      patternName: 'INSUFFICIENT',
      trend: 'RANGING',
      dataQuality: 'LOW',
      candlesAnalyzed: n,
      analysisVersion: PROVIDER_ENGINE_VERSION,
    };
  }

  const votes = runStrategies(completed, developing);
  const scores = scoreVotes(votes);
  const total = scores.bullish + scores.bearish;
  const pattern = detectPattern(completed);
  const trend = trendOf(completed);

  // Dominance requires a meaningful margin — not just a 1-vote edge.
  const dominance = total === 0 ? 0 : Math.abs(scores.bullish - scores.bearish) / total;
  const dominantSide = scores.bullish > scores.bearish ? 'UP' : 'DOWN';
  const enoughEvidence = total >= 60; // aggregate evidence floor
  const conflicting = dominance < 0.15; // near-tie

  const prediction: DirectionDecision = !enoughEvidence
    ? 'WAIT'
    : conflicting
      ? 'WAIT'
      : dominantSide;

  const predictionConfidence = prediction === 'WAIT'
    ? Math.round(dominance * 50)
    : Math.round(Math.min(95, 40 + dominance * 55));

  // Confluence: normalise weighted evidence to the 100-point opportunity scale.
  const dominantRaw = Math.max(scores.bullish, scores.bearish);
  const confluenceScore = Math.max(0, Math.min(100, Math.round((dominantRaw / (dominantRaw + scores.neutral + 40)) * 110)));

  const classification: ProviderDecision['classification'] =
    confluenceScore >= 80 ? 'HIGH QUALITY'
      : confluenceScore >= 70 ? 'STRONG QUALIFIED'
        : confluenceScore >= 60 ? 'QUALIFIED / CAUTION'
          : 'LOW CONFIDENCE';

  const bullishVotes = votes.filter((v) => v.direction === 'UP');
  const bearishVotes = votes.filter((v) => v.direction === 'DOWN');
  const neutralVotes = votes.filter((v) => v.direction === 'NEUTRAL');

  const explanation = prediction === 'WAIT'
    ? conflicting
      ? `Conflicting evidence: bullish ${scores.bullish.toFixed(0)} vs bearish ${scores.bearish.toFixed(0)} (near parity). Pattern: ${pattern.toLowerCase()}.`
      : `Insufficient aggregate evidence (bullish ${scores.bullish.toFixed(0)} + bearish ${scores.bearish.toFixed(0)} < 60 floor). Pattern: ${pattern.toLowerCase()}.`
    : `${prediction === 'UP' ? 'Bullish' : 'Bearish'} evidence dominates (${scores.bullish.toFixed(0)} vs ${scores.bearish.toFixed(0)}, ${Math.round(dominance * 100)}% net dominance). Trend: ${trend.toLowerCase()}. Pattern: ${pattern.toLowerCase().replace(/_/g, ' ')}. Top ${prediction === 'UP' ? 'bullish' : 'bearish'} votes: ${(prediction === 'UP' ? bullishVotes : bearishVotes).slice(0, 3).map((v) => v.strategy).join(', ')}.`;

  const avgQuality = completed.reduce((a, c) => a + rangeOf(c), 0) / n;
  const dataQuality: ProviderDecision['dataQuality'] = n >= 8 && avgQuality > 0 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW';

  return {
    prediction,
    predictionConfidence,
    confluenceScore,
    classification,
    qualified: confluenceScore >= QUALIFIED_THRESHOLD && prediction !== 'WAIT',
    bullishVotes, bearishVotes, neutralVotes,
    bullishScore: Math.round(scores.bullish),
    bearishScore: Math.round(scores.bearish),
    explanation,
    waitReason: prediction === 'WAIT' ? explanation : undefined,
    patternName: pattern,
    trend,
    dataQuality,
    candlesAnalyzed: n,
    analysisVersion: PROVIDER_ENGINE_VERSION,
  };
}
