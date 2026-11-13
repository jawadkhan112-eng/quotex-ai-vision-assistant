/**
 * Unified Decision Engine — the ONE authoritative decision pipeline.
 * ==========================================================================
 * Root cause fixed here: the legacy `analyzeAlgorithmic` engine and the Signal
 * Provider Intelligence (`analyzeProviderCandles`) engine ran as parallel,
 * un-reconciled views. The main engine could emit "WAIT — 0% confluence" while
 * SPI showed "UP — 80% / 96 confluence" for the same candles.
 *
 * This module takes BOTH structured outputs plus direct candle evidence and
 * produces exactly one consistent decision per target candle:
 *   { mainSignal, prediction, predictionConfidence, confluence, classification,
 *     supportingEvidence, opposingEvidence, waitReason }
 *
 * Correlation control: strategy families are grouped, and each GROUP contributes
 * at most once — e.g. EMA 9/20/50/200 alignment counts as ONE trend-family vote,
 * never four independent confirmations.
 *
 * Deterministic, no network, no fabricated data.
 */

import type { ProviderCandle, ProviderDecision } from './modules/signalProviderIntelligence.js';
import { familyWeightMultiplier } from './outcomeLearning.js';

export type Direction = 'UP' | 'DOWN' | 'WAIT';

export interface StrategyEvidence {
  /** Strategy family: TREND | MOMENTUM | PRICE_ACTION | CANDLE_PATTERNS | S_R | VOLATILITY | MARKET_STRUCTURE | CANDLE_SEQUENCE | REVERSAL */
  family: string;
  direction: Direction | 'NEUTRAL';
  /** Evidence strength 0-100 within the family */
  strength: number;
  /** Data quality backing this specific piece of evidence */
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** Source candle indices (into the completed-candle array) this evidence uses */
  sourceCandleIds: number[];
  /** Independent families carry full weight; correlated members are folded in */
  correlatedWith?: string[];
  note: string;
}

export interface UnifiedDecision {
  /** The single authoritative main signal */
  mainSignal: Direction;
  /** Same value as mainSignal — kept as an explicit field so the UI can never show them differently */
  prediction: Direction;
  predictionConfidence: number;
  /** 0-100 evidence score (NOT a win probability) */
  confluence: number;
  classification: 'HIGH QUALITY' | 'QUALIFIED' | 'CAUTION' | 'LOW CONFIDENCE';
  qualified: boolean;
  /** ACTIVE-OPPORTUNITY band: HIGH QUALITY 80+, QUALIFIED 70-79, CAUTION 60-69, LOW <60 */
  opportunityBand: 'HIGH QUALITY' | 'QUALIFIED' | 'CAUTION' | 'LOW CONFIDENCE';
  supportingEvidence: StrategyEvidence[];
  opposingEvidence: StrategyEvidence[];
  /** Precise WAIT reason: which families disagree, what evidence is missing */
  waitReason?: string;
  /** Which strategy families disagreed (empty when decision is clean) */
  disagreeingFamilies: string[];
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  candlesAnalyzed: number;
  algorithmVersion: string;
  analysisTimestamp: string;
}

export const UNIFIED_ENGINE_VERSION = 'UDE-2.0.0';

/** Independent strategy families — full weight is granted once per family. */
const FAMILIES = [
  'TREND', 'MOMENTUM', 'PRICE_ACTION', 'CANDLE_PATTERNS', 'S_R',
  'VOLATILITY', 'MARKET_STRUCTURE', 'CANDLE_SEQUENCE', 'REVERSAL',
] as const;
export type Family = (typeof FAMILIES)[number];

/** Relative weight of each family in the ensemble. Calibratable — overrides from
 * verified outcomes are applied via outcomeLearning at decision time. */
let FAMILY_WEIGHT: Record<Family, number> = {
  TREND: 14,
  MOMENTUM: 12,
  PRICE_ACTION: 15,
  CANDLE_PATTERNS: 13,
  S_R: 10,
  VOLATILITY: 8,
  MARKET_STRUCTURE: 12,
  CANDLE_SEQUENCE: 9,
  REVERSAL: 7,
};

/** Allow operators/tests to recalibrate the design weights. */
export function setEvidenceWeights(weights: Partial<Record<Family, number>>): void {
  FAMILY_WEIGHT = { ...FAMILY_WEIGHT, ...weights };
}
export function getEvidenceWeights(): Record<Family, number> {
  return { ...FAMILY_WEIGHT };
}

/** Which family a SPI strategy-voter belongs to — folds correlated voters into one. */
function familyOf(strategy: string): Family {
  const s = strategy.toLowerCase();
  if (s.includes('trend') || s.includes('ema')) return 'TREND';
  if (s.includes('momentum') || s.includes('rsi') || s.includes('macd') || s.includes('stoch')) return 'MOMENTUM';
  if (s.includes('wick') || s.includes('rejection') || s.includes('price')) return 'PRICE_ACTION';
  if (s.includes('pattern') || s.includes('candle') && !s.includes('sequence')) return 'CANDLE_PATTERNS';
  if (s.includes('support') || s.includes('resistance') || s.includes('s/r')) return 'S_R';
  if (s.includes('volatility') || s.includes('bollinger') || s.includes('atr')) return 'VOLATILITY';
  if (s.includes('market-structure') || s.includes('structure')) return 'MARKET_STRUCTURE';
  if (s.includes('sequence')) return 'CANDLE_SEQUENCE';
  if (s.includes('reversal') || s.includes('developing')) return 'REVERSAL';
  return 'PRICE_ACTION';
}

/* ---------------- direct candle evidence (family-level, independent) --------------- */

interface DirectEvidence {
  family: Family;
  direction: Direction | 'NEUTRAL';
  strength: number;
  sourceCandleIds: number[];
  note: string;
}

/** Candle-sequence + market-structure + price-action evidence straight from OHLC. */
function directCandleEvidence(completed: ProviderCandle[]): DirectEvidence[] {
  const out: DirectEvidence[] = [];
  const n = completed.length;
  if (n < 3) return out;
  const last = completed[n - 1];
  const body = Math.abs(last.close - last.open);
  const range = Math.max(last.high - last.low, 1e-9);
  const bodyRatio = body / range;
  const upperWick = (last.high - Math.max(last.open, last.close)) / range;
  const lowerWick = (Math.min(last.open, last.close) - last.low) / range;

  // MARKET_STRUCTURE: higher-highs/higher-lows over the window (one vote, not per-candle)
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 1; i < n; i++) {
    if (completed[i].high > completed[i - 1].high) hh++;
    if (completed[i].low > completed[i - 1].low) hl++;
    if (completed[i].high < completed[i - 1].high) lh++;
    if (completed[i].low < completed[i - 1].low) ll++;
  }
  if (hh >= 2 && hl >= 2) out.push({ family: 'MARKET_STRUCTURE', direction: 'UP', strength: 60, sourceCandleIds: [n - 3, n - 2, n - 1], note: `higher highs (${hh}) and higher lows (${hl})` });
  else if (lh >= 2 && ll >= 2) out.push({ family: 'MARKET_STRUCTURE', direction: 'DOWN', strength: 60, sourceCandleIds: [n - 3, n - 2, n - 1], note: `lower highs (${lh}) and lower lows (${ll})` });
  else out.push({ family: 'MARKET_STRUCTURE', direction: 'NEUTRAL', strength: 15, sourceCandleIds: [n - 2, n - 1], note: 'no clean HH/HL or LH/LL structure' });

  // CANDLE_SEQUENCE: 3 most recent closes direction
  const recent = completed.slice(-3);
  const bulls = recent.filter((c) => c.close > c.open).length;
  const bears = recent.filter((c) => c.close < c.open).length;
  if (bulls >= 2) out.push({ family: 'CANDLE_SEQUENCE', direction: 'UP', strength: 35 + bulls * 15, sourceCandleIds: [n - 3, n - 2, n - 1], note: `${bulls}/3 recent candles bullish` });
  else if (bears >= 2) out.push({ family: 'CANDLE_SEQUENCE', direction: 'DOWN', strength: 35 + bears * 15, sourceCandleIds: [n - 3, n - 2, n - 1], note: `${bears}/3 recent candles bearish` });
  else out.push({ family: 'CANDLE_SEQUENCE', direction: 'NEUTRAL', strength: 15, sourceCandleIds: [n - 3, n - 2, n - 1], note: 'mixed candle sequence' });

  // PRICE_ACTION: single-candle wick rejection (long-wick rejection / pin bar)
  if (lowerWick >= 0.5 && lowerWick > upperWick * 1.5) out.push({ family: 'PRICE_ACTION', direction: 'UP', strength: 55, sourceCandleIds: [n - 1], note: `strong lower-wick rejection (${Math.round(lowerWick * 100)}% of range)` });
  else if (upperWick >= 0.5 && upperWick > lowerWick * 1.5) out.push({ family: 'PRICE_ACTION', direction: 'DOWN', strength: 55, sourceCandleIds: [n - 1], note: `strong upper-wick rejection (${Math.round(upperWick * 100)}% of range)` });
  else if (bodyRatio < 0.1) out.push({ family: 'PRICE_ACTION', direction: 'NEUTRAL', strength: 20, sourceCandleIds: [n - 1], note: 'doji-grade indecision candle' });
  else out.push({ family: 'PRICE_ACTION', direction: 'NEUTRAL', strength: 10, sourceCandleIds: [n - 1], note: 'balanced candle geometry' });

  // S/R proximity from the observable window
  const support = Math.min(...completed.map((c) => c.low));
  const resistance = Math.max(...completed.map((c) => c.high));
  const sRange = Math.max(resistance - support, 1e-9);
  const nearSupport = (last.close - support) / sRange;
  const nearResistance = (resistance - last.close) / sRange;
  if (nearSupport <= 0.2) out.push({ family: 'S_R', direction: 'UP', strength: 45, sourceCandleIds: [n - 1], note: 'price at window support' });
  else if (nearResistance <= 0.2) out.push({ family: 'S_R', direction: 'DOWN', strength: 45, sourceCandleIds: [n - 1], note: 'price at window resistance' });
  else out.push({ family: 'S_R', direction: 'NEUTRAL', strength: 10, sourceCandleIds: [n - 1], note: 'mid-range price' });

  return out;
}

/* ------------------------------ aggregation ------------------------------ */

interface FamilyScore { direction: Direction | 'NEUTRAL'; score: number; members: StrategyEvidence[] }

/**
 * Fold every evidence item into family-level scores. Correlated voters inside
 * the SAME family contribute once (max member strength, not the sum).
 */
function aggregate(evidence: StrategyEvidence[]): Map<Family, FamilyScore> {
  const byFamily = new Map<Family, FamilyScore>();
  for (const e of evidence) {
    const fam = (FAMILIES as readonly string[]).includes(e.family) ? (e.family as Family) : 'PRICE_ACTION';
    const existing = byFamily.get(fam);
    const score = e.strength * (e.direction === 'NEUTRAL' ? 0.3 : 1);
    if (!existing) {
      byFamily.set(fam, { direction: e.direction, score, members: [e] });
    } else {
      existing.members.push(e);
      if (e.direction !== 'NEUTRAL' && e.strength > existing.score) {
        existing.direction = e.direction;
        existing.score = score;
      }
    }
  }
  return byFamily;
}

export interface UnifiedInput {
  /** Structured output of the Signal Provider Intelligence engine (may be null) */
  provider?: ProviderDecision | null;
  /** Structured output of the legacy algorithmic engine (main signal view) */
  legacy?: { signal: 'CALL' | 'PUT' | 'WAIT'; confidenceScore: number; trendFilter: string } | null;
  completed: ProviderCandle[];
  developing?: ProviderCandle;
  /** Detected market type — used for verified-outcome weight calibration */
  marketType?: string;
  /** Detected timeframe — used for verified-outcome weight calibration */
  timeframe?: string;
  /** When false, missing indicator evidence (RSI/Bollinger) does NOT force WAIT —
   * price-action evidence alone can qualify a decision. */
  indicatorsAvailable?: boolean;
}

export function analyzeUnified(input: UnifiedInput): UnifiedDecision {
  const completed = (input.completed ?? []).filter((c) => !c.developing);
  const n = completed.length;
  const now = new Date().toISOString();

  if (n < 3) {
    return {
      mainSignal: 'WAIT', prediction: 'WAIT', predictionConfidence: 0, confluence: 0,
      classification: 'LOW CONFIDENCE', opportunityBand: 'LOW CONFIDENCE', qualified: false,
      supportingEvidence: [], opposingEvidence: [],
      waitReason: `Insufficient completed candles: ${n}/3 minimum. Share more chart history.`,
      disagreeingFamilies: [], dataQuality: 'LOW', candlesAnalyzed: n,
      algorithmVersion: UNIFIED_ENGINE_VERSION, analysisTimestamp: now,
    };
  }

  // ---- collect evidence: direct candle evidence + SPI votes (family-folded) + legacy signal ----
  const evidence: StrategyEvidence[] = [];

  for (const d of directCandleEvidence(completed)) {
    evidence.push({
      family: d.family, direction: d.direction, strength: d.strength,
      dataQuality: n >= 8 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW',
      sourceCandleIds: d.sourceCandleIds, note: d.note,
    });
  }

  if (input.provider) {
    const allVotes = [...input.provider.bullishVotes, ...input.provider.bearishVotes, ...input.provider.neutralVotes];
    for (const v of allVotes) {
      evidence.push({
        family: familyOf(v.strategy),
        direction: v.direction === 'NEUTRAL' ? 'NEUTRAL' : v.direction,
        strength: v.strength,
        dataQuality: input.provider.dataQuality,
        sourceCandleIds: [n - 1],
        correlatedWith: [v.strategy],
        note: `${v.strategy}: ${v.evidence}`,
      });
    }
    // SPI pattern verdict is CANDLE_PATTERNS-family evidence
    if (input.provider.patternName !== 'INSUFFICIENT') {
      const bullP = ['MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_ENGULFING', 'PIERCING', 'HAMMER', 'DRAGONFLY_DOJI', 'BULL_MARUBOZU', 'STRONG_BULL_BODY'];
      const bearP = ['EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_ENGULFING', 'DARK_CLOUD', 'SHOOTING_STAR', 'GRAVESTONE_DOJI', 'BEAR_MARUBOZU', 'STRONG_BEAR_BODY'];
      if (bullP.includes(input.provider.patternName)) evidence.push({ family: 'CANDLE_PATTERNS', direction: 'UP', strength: 65, dataQuality: input.provider.dataQuality, sourceCandleIds: [n - 1], note: `pattern ${input.provider.patternName}` });
      else if (bearP.includes(input.provider.patternName)) evidence.push({ family: 'CANDLE_PATTERNS', direction: 'DOWN', strength: 65, dataQuality: input.provider.dataQuality, sourceCandleIds: [n - 1], note: `pattern ${input.provider.patternName}` });
    }
  }

  if (input.legacy && input.legacy.signal !== 'WAIT') {
    const dir: Direction = input.legacy.signal === 'CALL' ? 'UP' : 'DOWN';
    evidence.push({
      family: 'REVERSAL',
      direction: dir,
      strength: Math.min(70, Math.max(25, input.legacy.confidenceScore)),
      dataQuality: 'MEDIUM',
      sourceCandleIds: [n - 1],
      correlatedWith: ['legacy-algorithmic-engine'],
      note: `legacy engine signal ${input.legacy.signal} (${input.legacy.confidenceScore}%), trend ${input.legacy.trendFilter}`,
    });
  }

  // ---- aggregate with correlation control ----
  const byFamily = aggregate(evidence);
  let upScore = 0, downScore = 0, neutralScore = 0;
  const supporting: StrategyEvidence[] = [];
  const opposing: StrategyEvidence[] = [];

  // Determine dominant side first so supporting/opposing lists are correct.
  for (const [fam, fs] of byFamily) {
    // Verified-outcome learning multiplier: 1.0 unless ≥12 verified outcomes exist.
    const learned = familyWeightMultiplier(fam, input.marketType ?? 'UNKNOWN', input.timeframe ?? 'UNKNOWN');
    const w = fs.score * FAMILY_WEIGHT[fam] * learned;
    if (fs.direction === 'UP') upScore += w;
    else if (fs.direction === 'DOWN') downScore += w;
    else neutralScore += w;
  }

  const dominant: Direction = upScore === downScore ? 'WAIT' : upScore > downScore ? 'UP' : 'DOWN';
  for (const fs of byFamily.values()) {
    for (const m of fs.members) {
      const aligned = dominant !== 'WAIT' && m.direction === dominant;
      if (aligned) supporting.push(m);
      else if (m.direction !== 'NEUTRAL' && dominant !== 'WAIT') opposing.push(m);
    }
  }

  const total = upScore + downScore;
  const dominance = total === 0 ? 0 : Math.abs(upScore - downScore) / total;
  const dominantSide: Direction = upScore >= downScore ? 'UP' : 'DOWN';
  const evidenceFloor = total >= 55; // aggregate weighted-evidence floor
  const conflicting = dominance < 0.18;

  const waitParts: string[] = [];
  if (!evidenceFloor) waitParts.push(`aggregate weighted evidence ${Math.round(total)} below 55 floor`);
  if (conflicting && evidenceFloor) waitParts.push(`bullish ${Math.round(upScore)} vs bearish ${Math.round(downScore)} — near-parity conflict`);

  // Disagreement reporting: name the families on the losing side
  const disagreeingFamilies = dominant === 'WAIT'
    ? []
    : opposing.map((o) => o.family).filter((f, i, arr) => arr.indexOf(f) === i);

  // Missing RSI/Bollinger NEVER forces WAIT by itself — recorded, not blocking.
  if (input.indicatorsAvailable === false && !evidenceFloor) {
    waitParts.push('indicator data (RSI/Bollinger) unavailable — price-action evidence alone did not reach the evidence floor');
  }

  const prediction: Direction = waitParts.length > 0 ? 'WAIT' : dominantSide;

  const predictionConfidence = prediction === 'WAIT'
    ? Math.round(dominance * 45)
    : Math.round(Math.min(95, 42 + dominance * 53));

  const dominantRaw = Math.max(upScore, downScore);
  const confluence = Math.max(0, Math.min(100, Math.round((dominantRaw / (dominantRaw + neutralScore + 35)) * 105)));

  const classification: UnifiedDecision['classification'] =
    confluence >= 80 ? 'HIGH QUALITY' : confluence >= 70 ? 'QUALIFIED' : confluence >= 60 ? 'CAUTION' : 'LOW CONFIDENCE';

  const dataQuality: UnifiedDecision['dataQuality'] = n >= 8 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW';

  const waitReason = prediction === 'WAIT'
    ? `${waitParts.join('; ')}.${disagreeingFamilies.length > 0 ? ` Families in disagreement: ${disagreeingFamilies.join(', ')}.` : ' No family reached a directional majority.'} Missing: ${n >= 8 ? 'confirmation from additional independent families' : 'more completed candles (8+ for HIGH data quality)'}.`
    : undefined;

  return {
    mainSignal: prediction,
    prediction,
    predictionConfidence,
    confluence,
    classification,
    opportunityBand: classification,
    qualified: confluence >= 60 && prediction !== 'WAIT',
    supportingEvidence: supporting.slice(0, 8),
    opposingEvidence: opposing.slice(0, 8),
    waitReason,
    disagreeingFamilies,
    dataQuality,
    candlesAnalyzed: n,
    algorithmVersion: UNIFIED_ENGINE_VERSION,
    analysisTimestamp: now,
  };
}
