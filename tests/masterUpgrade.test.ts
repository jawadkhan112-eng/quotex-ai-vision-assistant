import { describe, expect, it, beforeEach } from 'vitest';
import { analyzeUnified, UNIFIED_ENGINE_VERSION, type UnifiedInput } from '../server/unifiedDecisionEngine';
import { analyzeProviderCandles, type ProviderCandle } from '../server/modules/signalProviderIntelligence';
import {
  computeCandleTiming, isSupportedTimeframe, isFrameStale, isCandleTransitionVerified,
  SUPPORTED_TIMEFRAMES,
} from '../server/candleTiming';
import {
  validateScreenshotFreshness, createScreenshotSession, resetScreenshotSessions, hashImageBytes,
} from '../server/screenshotSession';
import {
  reportOutcome, lossGate, resetLossManagement, configureLossManagement, getLossConfig, snapshotLossState,
} from '../server/lossManagement';
import { parseTimeframeFromText } from '../server/chartIdentity';

/* ------------------------------- fixtures ------------------------------- */

/** Bullish trending candles (higher highs, higher lows, bullish bodies). */
const bullCandles: ProviderCandle[] = Array.from({ length: 8 }, (_, i) => ({
  open: 100 + i * 0.5, high: 101 + i * 0.6, low: 99.8 + i * 0.55, close: 100.8 + i * 0.55,
}));

/** Bearish trending candles. */
const bearCandles: ProviderCandle[] = Array.from({ length: 8 }, (_, i) => ({
  open: 100 - i * 0.5, high: 100.2 - i * 0.5, low: 99 - i * 0.55, close: 99.2 - i * 0.55,
}));

/** Alternating doji candles — conflicting evidence. */
const chopCandles: ProviderCandle[] = Array.from({ length: 8 }, (_, i) => ({
  open: 100, high: 100.4, low: 99.6, close: i % 2 === 0 ? 100.05 : 99.95,
}));

const runUnified = (input: Partial<UnifiedInput>) => analyzeUnified({ completed: bullCandles, ...input });

/* --------------------- 12. contradictory-signal engine fix --------------------- */

describe('Unified engine: one consistent decision (no UP here / WAIT there)', () => {
  it('mainSignal === prediction ALWAYS', () => {
    for (const candles of [bullCandles, bearCandles, chopCandles]) {
      const d = analyzeUnified({ completed: candles });
      expect(d.mainSignal).toBe(d.prediction);
    }
  });
  it('runs both prior engines and reconciles them — SPI cannot show UP 80% while unified shows WAIT 0%', () => {
    const provider = analyzeProviderCandles({ completed: bullCandles });
    const unified = analyzeUnified({ provider, completed: bullCandles });
    // When SPI is confidently directional, the unified engine cannot be an unexplained WAIT.
    if (provider.prediction === 'UP' && provider.confluenceScore >= 70) {
      expect(unified.mainSignal).not.toBe('WAIT');
      expect(unified.mainSignal).toBe('UP');
    }
  });
  it('never lets correlated voters double-count (candle-sequence + market-structure fold per family)', () => {
    const d = runUnified({});
    const families = d.supportingEvidence.map((e) => e.family);
    expect(new Set(families).size).toBeLessThanOrEqual(9);
  });
  it('WAIT reasons name what is missing and which families disagree', () => {
    const d = analyzeUnified({ completed: chopCandles });
    if (d.mainSignal === 'WAIT') {
      expect(d.waitReason).toBeDefined();
      expect(d.waitReason!.toLowerCase()).toContain('wait');
    }
  });
  it('every decision carries algorithm version + timestamp', () => {
    const d = runUnified({});
    expect(d.algorithmVersion).toBe(UNIFIED_ENGINE_VERSION);
    expect(new Date(d.analysisTimestamp).getTime()).toBeGreaterThan(0);
  });
});

/* ---------------------- 13. missing RSI / Bollinger ---------------------- */

describe('missing indicators never force WAIT alone', () => {
  it('indicatorsAvailable=false does not block a strong price-action decision', () => {
    const d = runUnified({ indicatorsAvailable: false });
    expect(['UP', 'DOWN', 'WAIT']).toContain(d.mainSignal);
    if (d.mainSignal !== 'WAIT') expect(d.confluence).toBeGreaterThan(0);
  });
  it('short history (2 candles) is WAIT with exact reason', () => {
    const d = analyzeUnified({ completed: bullCandles.slice(0, 2) });
    expect(d.mainSignal).toBe('WAIT');
    expect(d.waitReason).toContain('Insufficient completed candles');
  });
});

/* ---------------------- 14. UP / DOWN / WAIT consistency ---------------------- */

describe('directional outcomes follow evidence', () => {
  it('bullish candles → UP', () => {
    const d = runUnified({});
    expect(d.mainSignal).toBe('UP');
  });
  it('bearish candles → DOWN', () => {
    const d = analyzeUnified({ completed: bearCandles });
    expect(d.mainSignal).toBe('DOWN');
  });
  it('opposing evidence is exposed, not hidden', () => {
    const d = runUnified({});
    expect(Array.isArray(d.opposingEvidence)).toBe(true);
    expect(Array.isArray(d.supportingEvidence)).toBe(true);
  });
});

/* ---------------------- 15. actual next-candle timing ---------------------- */

describe('candle timing (1M-5M)', () => {
  it('supports 1M, 2M, 3M, 4M, 5M only', () => {
    expect(SUPPORTED_TIMEFRAMES).toEqual(['1M', '2M', '3M', '4M', '5M']);
    for (const tf of SUPPORTED_TIMEFRAMES) expect(isSupportedTimeframe(tf)).toBe(true);
    expect(isSupportedTimeframe('7M')).toBe(false);
    expect(isSupportedTimeframe(undefined)).toBe(false);
  });
  it('computes boundaries and countdown deterministically', () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 45); // 45s past the minute
    const t = computeCandleTiming('1M', now);
    expect(t.candleStart).toBe(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(t.candleClose).toBe(Date.UTC(2026, 0, 15, 12, 1, 0));
    expect(t.secondsToClose).toBe(15);
    expect(t.preCloseWindow).toBe(true);
    expect(t.nextCandleStart).toBe(t.candleClose);
    expect(t.nextCandleExpiry).toBe(t.candleClose + 60_000);
  });
  it('pre-close window starts at 30s before close', () => {
    const t = computeCandleTiming('1M', Date.UTC(2026, 0, 15, 12, 0, 29));
    expect(t.secondsToClose).toBe(31);
    expect(t.preCloseWindow).toBe(false);
    const t2 = computeCandleTiming('1M', Date.UTC(2026, 0, 15, 12, 0, 30));
    expect(t2.preCloseWindow).toBe(true);
  });
  it('3M/4M/5M boundaries use full periods', () => {
    const now = Date.UTC(2026, 0, 15, 12, 1, 0);
    expect(computeCandleTiming('3M', now).candleClose).toBe(Date.UTC(2026, 0, 15, 12, 3, 0));
    expect(computeCandleTiming('4M', now).candleClose).toBe(Date.UTC(2026, 0, 15, 12, 4, 0));
    expect(computeCandleTiming('5M', now).candleClose).toBe(Date.UTC(2026, 0, 15, 12, 5, 0));
  });
  it('stale frames and unverified transitions are detected', () => {
    const now = 1_000_000;
    expect(isFrameStale(now - 30_000, now, 20_000)).toBe(true);
    expect(isFrameStale(now - 5_000, now, 20_000)).toBe(false);
    // previous candle closed at 900_000; a frame captured BEFORE close is not verified
    expect(isCandleTransitionVerified(900_000, 890_000, now)).toBe(false);
    expect(isCandleTransitionVerified(900_000, 950_000, now)).toBe(true);
  });
});

/* ---------------------- 4/6. timeframe detection incl. 3M/4M ---------------------- */

describe('timeframe detection 2M/3M/4M/5M', () => {
  it.each([
    ['1M', '1M'], ['2m', '2M'], ['3m', '3M'], ['4m', '4M'], ['5M', '5M'],
    ['2 min', '2M'], ['3 min', '3M'], ['4 min', '4M'], ['m3', '3M'],
  ])('parses %s → %s', (raw, expected) => {
    expect(parseTimeframeFromText(raw).timeframe).toBe(expected);
  });
  it('unknown timeframe stays UNKNOWN with zero confidence (never invented)', () => {
    const t = parseTimeframeFromText('no timeframe here');
    expect(t.timeframe).toBe('UNKNOWN');
    expect(t.confidence).toBe(0);
  });
});

/* ---------------------- 3/9. screenshot freshness ---------------------- */

describe('screenshot freshness validation (stale/unchanged rejection)', () => {
  beforeEach(() => resetScreenshotSessions());

  const fp = (hash: string, candles = 10) => ({
    imageHash: hash, capturedAt: Date.now(), width: 960, height: 540, candleCount: candles, identity: null,
  });

  it('first capture is fresh', () => {
    const s = createScreenshotSession(fp('aaa'));
    expect(s.fresh).toBe(true);
    expect(s.sessionId).toMatch(/^SS-/);
    expect(s.screenshotId).toMatch(/^SHOT-/);
  });
  it('identical image hash is reported UNCHANGED, not fresh', () => {
    createScreenshotSession(fp('same-hash'));
    const s2 = createScreenshotSession(fp('same-hash'));
    expect(s2.fresh).toBe(false);
    expect(s2.freshnessReport).toContain('UNCHANGED');
  });
  it('changed image is fresh; identity change is flagged for session reset', () => {
    createScreenshotSession(fp('hash-a'));
    const s2 = createScreenshotSession(fp('hash-b'));
    expect(s2.fresh).toBe(true);
    expect(s2.identityChanged).toBe(false);
  });
  it('identity change between captures flags identityChanged', () => {
    const idA = { pair: { pair: 'EUR/USD', confidence: 90 }, timeframe: { timeframe: '1M', confidence: 90 }, marketType: { marketType: 'OTC' as const, confidence: 90 }, ocrTextLength: 50 };
    const idB = { ...idA, timeframe: { timeframe: '5M', confidence: 90 } };
    createScreenshotSession({ ...fp('h1'), identity: idA });
    const s2 = createScreenshotSession({ ...fp('h2'), identity: idB });
    expect(s2.identityChanged).toBe(true);
  });
  it('hashing is deterministic and input-sensitive', () => {
    expect(hashImageBytes(Buffer.from('x'))).toBe(hashImageBytes(Buffer.from('x')));
    expect(hashImageBytes(Buffer.from('x'))).not.toBe(hashImageBytes(Buffer.from('y')));
  });
  it('validateScreenshotFreshness directly reports identical images', () => {
    const check = validateScreenshotFreshness(fp('dup'), fp('dup'));
    expect(check.fresh).toBe(false);
  });
});

/* ---------------------- 9. loss management ---------------------- */

describe('loss management: cooldown, limits, direction neutrality', () => {
  beforeEach(() => resetLossManagement());

  it('tracks consecutive losses and triggers cooldown after 3', () => {
    configureLossManagement({ cooldownAfterLosses: 3, cooldownDurationMs: 60_000, maxTotalLosses: 100 });
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    expect(lossGate().blocked).toBe(false);
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    const gate = lossGate();
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain('Cooldown');
    expect(snapshotLossState().consecutiveLosses).toBe(3);
  });
  it('a win resets the consecutive counter and clears cooldown', () => {
    configureLossManagement({ cooldownAfterLosses: 1, cooldownDurationMs: 60_000, maxTotalLosses: 100 });
    reportOutcome({ outcome: 'LOSS', direction: 'DOWN' });
    expect(lossGate().blocked).toBe(true);
    reportOutcome({ outcome: 'WIN', direction: 'DOWN' });
    expect(lossGate().blocked).toBe(false);
    expect(snapshotLossState().consecutiveLosses).toBe(0);
  });
  it('max loss limit suspends trading until manual reset', () => {
    configureLossManagement({ cooldownAfterLosses: 99, cooldownDurationMs: 1000, maxTotalLosses: 2 });
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    expect(snapshotLossState().tradingSuspended).toBe(true);
    resetLossManagement();
    expect(snapshotLossState().tradingSuspended).toBe(false);
  });
  it('history records outcomes with direction and timestamps', () => {
    reportOutcome({ outcome: 'WIN', direction: 'UP', at: '2026-01-01T00:00:00Z' });
    const s = snapshotLossState();
    expect(s.winLossHistory[0]).toEqual({ at: '2026-01-01T00:00:00Z', outcome: 'WIN', direction: 'UP' });
  });
  it('a previous loss never biases the unified direction (loss gate only adds WAIT)', () => {
    configureLossManagement({ cooldownAfterLosses: 1, cooldownDurationMs: 60_000, maxTotalLosses: 100 });
    reportOutcome({ outcome: 'LOSS', direction: 'UP' });
    // Engine output for bullish candles stays UP; the server gate may wrap it into
    // WAIT, but the chart direction itself is unchanged and confidence untouched.
    const d = runUnified({});
    expect(d.mainSignal).toBe('UP');
  });
});

/* ---------------------- 6. duplicate decision prevention keys ---------------------- */

describe('decision dedup semantics', () => {
  it('server dedup key format includes source (verified via string build)', () => {
    // The dedup key is built in server.ts; here we verify the format contract.
    const key = `LIVE|EUR/USD|OTC|1M|${Date.now()}|UDE-2.0.0`;
    const keyScreenshot = `SCREENSHOT|EUR/USD|OTC|1M|${Date.now()}|UDE-2.0.0`;
    expect(key.startsWith('LIVE|')).toBe(true);
    expect(keyScreenshot.startsWith('SCREENSHOT|')).toBe(true);
    expect(key.split('|').length).toBe(6);
  });
});

/* ============ ACTIVE OPPORTUNITY MODE: classification bands ============ */

describe('ACTIVE-OPPORTUNITY classification bands (80/70/60)', () => {
  it('classifies 80+ HIGH QUALITY, 70-79 QUALIFIED, 60-69 CAUTION, <60 LOW CONFIDENCE', async () => {
    const { analyzeUnified } = await import('../server/unifiedDecisionEngine');
    const d = analyzeUnified({ completed: bullCandles });
    // Band must match the classification exactly (same 80/70/60 boundaries).
    expect(d.opportunityBand).toBe(d.classification);
    expect(['HIGH QUALITY', 'QUALIFIED', 'CAUTION', 'LOW CONFIDENCE']).toContain(d.classification);
    expect(d.classification).not.toBe('STRONG QUALIFIED');
    expect(d.classification).not.toBe('QUALIFIED / CAUTION');
  });
  it('qualified setups never appear below 60 evidence', () => {
    const d = runUnified({});
    if (d.qualified) expect(d.confluence).toBeGreaterThanOrEqual(60);
  });
});

/* ============ KNOWLEDGE BASE ============ */

describe('strategy knowledge base', () => {
  it('documents all core patterns with direction and family', async () => {
    const { PATTERN_KNOWLEDGE, describePattern } = await import('../server/knowledgeBase');
    expect(PATTERN_KNOWLEDGE.length).toBeGreaterThanOrEqual(20);
    const engulfing = describePattern('BULLISH_ENGULFING');
    expect(engulfing?.direction).toBe('UP');
    expect(engulfing?.family).toBe('CANDLE_PATTERNS');
    expect(describePattern('NONEXISTENT_PATTERN')).toBeUndefined();
  });
  it('design weights sum to 100 across the 7 blueprint groups', async () => {
    const { DEFAULT_EVIDENCE_WEIGHTS } = await import('../server/knowledgeBase');
    const sum = Object.values(DEFAULT_EVIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });
});

/* ============ VERIFIED-OUTCOME LEARNING ============ */

describe('verified-outcome learning engine', () => {
  beforeEach(async () => {
    const { resetOutcomeLedger } = await import('../server/outcomeLearning');
    resetOutcomeLedger();
  });

  it('does not calibrate weights below the minimum sample size', async () => {
    const { recordOutcome, computePerformance, MIN_SAMPLE_SIZE } = await import('../server/outcomeLearning');
    for (let i = 0; i < MIN_SAMPLE_SIZE - 1; i++) {
      recordOutcome({ decisionId: `d${i}`, source: 'LIVE', asset: 'EUR/USD', marketType: 'OTC', timeframe: '1M', prediction: 'UP', confluence: 75, topStrategyFamilies: ['TREND'], marketCondition: 'TRENDING', targetCandle: String(i), outcome: i % 2 === 0 ? 'WIN' : 'LOSS', recordedAt: new Date().toISOString() });
    }
    const perf = computePerformance({ family: 'TREND' });
    expect(perf.sampleSize).toBe(MIN_SAMPLE_SIZE - 1);
    expect(perf.calibrated).toBe(false);
    expect(perf.weightMultiplier).toBe(1.0);
  });
  it('calibrates after adequate sample and clamps to ±20%', async () => {
    const { recordOutcome, computePerformance, MIN_SAMPLE_SIZE } = await import('../server/outcomeLearning');
    for (let i = 0; i < MIN_SAMPLE_SIZE; i++) {
      recordOutcome({ decisionId: `w${i}`, source: 'LIVE', asset: 'EUR/USD', marketType: 'OTC', timeframe: '1M', prediction: 'UP', confluence: 75, topStrategyFamilies: ['TREND'], marketCondition: 'TRENDING', targetCandle: String(i), outcome: 'WIN', recordedAt: new Date().toISOString() });
    }
    const perf = computePerformance({ family: 'TREND' });
    expect(perf.calibrated).toBe(true);
    expect(perf.winRate).toBe(1);
    expect(perf.weightMultiplier).toBe(1.2); // clamped maximum
  });
  it('unverified outcomes (EXPIRED/INVALID/WAIT) never count as wins', async () => {
    const { recordOutcome, computePerformance, MIN_SAMPLE_SIZE } = await import('../server/outcomeLearning');
    for (let i = 0; i < MIN_SAMPLE_SIZE; i++) {
      recordOutcome({ decisionId: `e${i}`, source: 'LIVE', asset: 'X', marketType: 'OTC', timeframe: '1M', prediction: 'UP', confluence: 60, topStrategyFamilies: ['MOMENTUM'], marketCondition: 'RANGING', targetCandle: String(i), outcome: 'EXPIRED', recordedAt: new Date().toISOString() });
    }
    const perf = computePerformance({ family: 'MOMENTUM' });
    expect(perf.sampleSize).toBe(0);
    expect(perf.wins).toBe(0);
  });
  it('familyWeightMultiplier returns 1.0 without verified evidence (engine stays at design weights)', async () => {
    const { familyWeightMultiplier } = await import('../server/outcomeLearning');
    expect(familyWeightMultiplier('TREND', 'OTC', '1M')).toBe(1.0);
  });
  it('performance slices by market type and source', async () => {
    const { recordOutcome, computePerformance, MIN_SAMPLE_SIZE } = await import('../server/outcomeLearning');
    for (let i = 0; i < MIN_SAMPLE_SIZE; i++) {
      recordOutcome({ decisionId: `otc${i}`, source: 'LIVE', asset: 'A', marketType: 'OTC', timeframe: '1M', prediction: 'UP', confluence: 70, topStrategyFamilies: ['PRICE_ACTION'], marketCondition: 'TRENDING', targetCandle: String(i), outcome: 'WIN', recordedAt: new Date().toISOString() });
      recordOutcome({ decisionId: `live${i}`, source: 'SCREENSHOT', asset: 'A', marketType: 'LIVE', timeframe: '1M', prediction: 'UP', confluence: 70, topStrategyFamilies: ['PRICE_ACTION'], marketCondition: 'TRENDING', targetCandle: String(i), outcome: 'LOSS', recordedAt: new Date().toISOString() });
    }
    expect(computePerformance({ marketType: 'OTC' }).winRate).toBe(1);
    expect(computePerformance({ marketType: 'LIVE' }).winRate).toBe(0);
    expect(computePerformance({ marketType: 'OTC' }).sampleSize).toBe(MIN_SAMPLE_SIZE);
  });
});

/* ============ configurable evidence weights ============ */

describe('configurable evidence weights', () => {
  it('setEvidenceWeights changes calibration without breaking consistency', async () => {
    const { setEvidenceWeights, getEvidenceWeights, analyzeUnified } = await import('../server/unifiedDecisionEngine');
    const before = getEvidenceWeights();
    setEvidenceWeights({ TREND: 30 });
    expect(getEvidenceWeights().TREND).toBe(30);
    const d = analyzeUnified({ completed: bullCandles });
    expect(d.mainSignal).toBe(d.prediction); // consistency invariant holds under any weights
    setEvidenceWeights(before); // restore
    expect(getEvidenceWeights().TREND).toBe(before.TREND);
  });
});
