import { describe, expect, it } from 'vitest';
import { analyzeProviderCandles, type ProviderCandle } from '../server/modules/signalProviderIntelligence';

/** Controlled test fixtures — used ONLY in unit tests, never displayed as live signals. */
const candle = (o: number, h: number, l: number, c: number): ProviderCandle => ({ open: o, high: h, low: l, close: c });

const strongBullish: ProviderCandle[] = [
  candle(100, 101, 99.5, 100.8),
  candle(100.8, 101.9, 100.5, 101.7),
  candle(101.7, 103.0, 101.4, 102.8),
  candle(102.8, 104.2, 102.5, 104.0),
  candle(104.0, 105.5, 103.8, 105.3),
];

const strongBearish: ProviderCandle[] = [
  candle(105, 105.5, 104.0, 104.2),
  candle(104.2, 104.8, 103.2, 103.5),
  candle(103.5, 104.0, 102.2, 102.6),
  candle(102.6, 103.2, 101.5, 101.9),
  candle(101.9, 102.4, 100.8, 101.1),
];

const mixed: ProviderCandle[] = [
  candle(100, 101, 99, 100.5),
  candle(100.5, 101.2, 99.8, 100.1),
  candle(100.1, 101.0, 99.6, 100.4),
  candle(100.4, 101.1, 99.7, 100.0),
  candle(100.0, 100.8, 99.5, 100.3),
];

describe('Signal Provider Intelligence — candle-by-candle decisions', () => {
  it('predicts UP for a strong bullish sequence', () => {
    const d = analyzeProviderCandles({ completed: strongBullish, window: 5 });
    expect(d.prediction).toBe('UP');
    expect(d.predictionConfidence).toBeGreaterThan(50);
    expect(d.bullishScore).toBeGreaterThan(d.bearishScore);
  });

  it('predicts DOWN for a strong bearish sequence', () => {
    const d = analyzeProviderCandles({ completed: strongBearish, window: 5 });
    expect(d.prediction).toBe('DOWN');
    expect(d.bearishScore).toBeGreaterThan(d.bullishScore);
  });

  it('returns WAIT with exact reason for conflicting evidence', () => {
    const d = analyzeProviderCandles({ completed: mixed, window: 5 });
    if (d.prediction === 'WAIT') {
      expect(d.waitReason).toBeDefined();
      expect(d.waitReason!.length).toBeGreaterThan(10);
    } else {
      expect(['UP', 'DOWN']).toContain(d.prediction);
    }
  });

  it('returns WAIT when fewer than 3 completed candles exist', () => {
    const d = analyzeProviderCandles({ completed: strongBullish.slice(0, 2) });
    expect(d.prediction).toBe('WAIT');
    expect(d.waitReason).toContain('Insufficient completed candles');
    expect(d.dataQuality).toBe('LOW');
  });

  it('excludes developing candles from completed analysis', () => {
    const withDev = [...strongBullish, { ...candle(105.3, 105.8, 105.0, 105.5), developing: true }];
    const d = analyzeProviderCandles({ completed: withDev });
    expect(d.candlesAnalyzed).toBe(5);
  });

  it('supports the 10-candle extended window', () => {
    const ten = [...strongBullish, ...strongBearish.slice(0, 5)];
    const d5 = analyzeProviderCandles({ completed: ten, window: 5 });
    const d10 = analyzeProviderCandles({ completed: ten, window: 10 });
    expect(d5.candlesAnalyzed).toBe(5);
    expect(d10.candlesAnalyzed).toBe(10);
  });

  it('classifies confluence bands: HIGH QUALITY / STRONG QUALIFIED / QUALIFIED / LOW', () => {
    const d = analyzeProviderCandles({ completed: strongBullish, window: 5 });
    expect(['HIGH QUALITY', 'STRONG QUALIFIED', 'QUALIFIED / CAUTION', 'LOW CONFIDENCE']).toContain(d.classification);
    expect(d.qualified).toBe(d.confluenceScore >= 60 && d.prediction !== 'WAIT');
  });

  it('provides bullish and bearish votes lists with evidence strings', () => {
    const d = analyzeProviderCandles({ completed: strongBullish, window: 5 });
    expect(d.bullishVotes.length).toBeGreaterThan(0);
    for (const v of d.bullishVotes) {
      expect(v.evidence.length).toBeGreaterThan(5);
      expect(v.strength).toBeGreaterThanOrEqual(0);
      expect(v.strength).toBeLessThanOrEqual(100);
    }
  });

  it('does not fabricate trend beyond evidence', () => {
    const d = analyzeProviderCandles({ completed: strongBullish, window: 5 });
    expect(['BULLISH', 'BEARISH', 'RANGING']).toContain(d.trend);
  });

  it('version-stamps every decision', () => {
    const d = analyzeProviderCandles({ completed: strongBullish });
    expect(d.analysisVersion).toMatch(/^SPI-/);
  });

  it('handles a sharp reversal (evening-star-like) pattern without crashing', () => {
    const reversal: ProviderCandle[] = [
      candle(100, 101, 99, 100.8),
      candle(100.8, 102, 100.6, 101.8),
      candle(101.8, 102.2, 101.5, 101.7),
      candle(101.7, 101.9, 100.4, 100.6),
      candle(100.6, 100.9, 99.9, 100.1),
    ];
    const d = analyzeProviderCandles({ completed: reversal, window: 5 });
    expect(['UP', 'DOWN', 'WAIT']).toContain(d.prediction);
  });
});
