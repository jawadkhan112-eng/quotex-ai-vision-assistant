/**
 * Verified-Outcome Learning Engine.
 * ==========================================================================
 * Records actual decision outcomes (WIN/LOSS verified against the target
 * candle's observed movement — never auto-won) and computes per-strategy,
 * per-pair, per-timeframe, per-market-type performance. Weights adjust ONLY
 * after an adequate sample size. This is the only place the engine "learns",
 * and only from stored verified outcomes. No fabricated history.
 */

import { db } from './db.js';

export interface OutcomeRecord {
  decisionId: string;
  source: 'LIVE' | 'SCREENSHOT';
  asset: string;
  marketType: string;
  timeframe: string;
  prediction: 'UP' | 'DOWN' | 'WAIT';
  confluence: number;
  topStrategyFamilies: string[];
  marketCondition: 'TRENDING' | 'RANGING';
  targetCandle: string;
  /** Verified against the actual target-candle movement: WIN | LOSS | EXPIRED | INVALID */
  outcome: 'WIN' | 'LOSS' | 'EXPIRED' | 'INVALID';
  observedMove?: number;
  recordedAt: string;
}

export interface StrategyPerformance {
  key: string;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  consecutiveLosses: number;
  /** multiplicative confidence multiplier in [0.8, 1.2], 1.0 = uncalibrated */
  weightMultiplier: number;
  calibrated: boolean;
}

/** Minimum verified outcomes before a weight is adjusted (overfitting guard). */
export const MIN_SAMPLE_SIZE = 12;
/** Outcome ledger for the current process (DB is the durable store when available). */
const ledger: OutcomeRecord[] = [];
const MAX_LEDGER = 500;

export function recordOutcome(record: OutcomeRecord): void {
  ledger.push(record);
  if (ledger.length > MAX_LEDGER) ledger.shift();
  try {
    db.prepare(`INSERT OR REPLACE INTO strategy_outcomes (
      decision_id, recorded_at, source, asset, market_type, timeframe, prediction,
      confluence, top_strategy_families, market_condition, target_candle, outcome, observed_move
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.decisionId, record.recordedAt, record.source, record.asset, record.marketType,
        record.timeframe, record.prediction, record.confluence, JSON.stringify(record.topStrategyFamilies),
        record.marketCondition, record.targetCandle, record.outcome, record.observedMove ?? null);
  } catch { /* DB optional in unit-test environments */ }
}

export interface PerformanceFilter {
  source?: string;
  asset?: string;
  marketType?: string;
  timeframe?: string;
  marketCondition?: string;
  /** filter by strategy family recorded in topStrategyFamilies */
  family?: string;
}

function matches(r: OutcomeRecord, f: PerformanceFilter): boolean {
  if (f.source && r.source !== f.source) return false;
  if (f.asset && r.asset !== f.asset) return false;
  if (f.marketType && r.marketType !== f.marketType) return false;
  if (f.timeframe && r.timeframe !== f.timeframe) return false;
  if (f.marketCondition && r.marketCondition !== f.marketCondition) return false;
  if (f.family && !r.topStrategyFamilies.includes(f.family)) return false;
  return true;
}

/** Compute WIN/LOSS performance for a slice of records (WAIT/EXPIRED/INVALID excluded). */
export function computePerformance(filter: PerformanceFilter = {}): StrategyPerformance {
  const relevant = ledger.filter((r) => matches(r, filter) && (r.outcome === 'WIN' || r.outcome === 'LOSS'));
  const wins = relevant.filter((r) => r.outcome === 'WIN').length;
  const losses = relevant.filter((r) => r.outcome === 'LOSS').length;
  const n = wins + losses;
  // Consecutive-loss streak (most recent first)
  let consecutive = 0;
  for (let i = relevant.length - 1; i >= 0 && relevant[i].outcome === 'LOSS'; i--) consecutive++;

  const winRate = n === 0 ? 0 : wins / n;
  const calibrated = n >= MIN_SAMPLE_SIZE;
  // Weight calibration: only after adequate sample, bounded to ±20%.
  let weightMultiplier = 1.0;
  if (calibrated) {
    weightMultiplier = Math.max(0.8, Math.min(1.2, 0.7 + winRate));
  }
  return {
    key: Object.entries(filter).map(([k, v]) => `${k}=${v}`).join('&') || 'ALL',
    sampleSize: n, wins, losses, winRate: Number(winRate.toFixed(4)),
    consecutiveLosses: consecutive, weightMultiplier: Number(weightMultiplier.toFixed(4)), calibrated,
  };
}

/**
 * The one entry point the unified engine uses: a small multiplier for a
 * family/market slice, derived ONLY from verified stored outcomes.
 */
export function familyWeightMultiplier(family: string, marketType: string, timeframe: string): number {
  const overall = computePerformance({ family, marketType, timeframe });
  if (!overall.calibrated) return 1.0; // not enough evidence: keep design weights
  return overall.weightMultiplier;
}

/** All performance slices for the UI / reports. */
export function performanceReport(): Array<PerformanceFilter & StrategyPerformance> {
  const dimensions: Array<[string, string | undefined]> = [
    ['source', undefined], ['marketType', undefined], ['timeframe', undefined],
  ];
  const slices: Array<PerformanceFilter & StrategyPerformance> = [];
  slices.push({ ...computePerformance({}) });
  for (const [field] of dimensions) {
    const values = new Set(ledger.map((r) => String((r as unknown as Record<string, unknown>)[field])));
    for (const v of values) {
      if (!v || v === 'UNKNOWN') continue;
      const f: PerformanceFilter = { [field]: v } as PerformanceFilter;
      slices.push({ ...f, ...computePerformance(f) });
    }
  }
  for (const fam of ['MARKET_STRUCTURE', 'PRICE_ACTION', 'CANDLE_PATTERNS', 'MOMENTUM', 'TREND', 'VOLATILITY', 'CANDLE_SEQUENCE']) {
    slices.push({ family: fam, ...computePerformance({ family: fam }) });
  }
  return slices;
}

/** Test / reset helper. */
export function resetOutcomeLedger(): void {
  ledger.length = 0;
}
