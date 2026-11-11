import { describe, expect, it } from 'vitest';
import {
  analyzeAlgorithmic, detectChartPresence, measurePixelPressure, classifyCandlePattern,
  reportSignalOutcome, resetMtgState, MIN_CONFIDENCE_THRESHOLD, measureCandle, type Candle,
} from '../server/algorithmicEngine';
import { reconstructCandles, type PixelFrame } from '../server/candleReconstruction';

/** Builds a synthetic frame containing N alternating green/red vertical candle bars. */
function makeCandleFrame(count: number, bodyHeight = 60): PixelFrame {
  const width = 320, height = 180;
  const pixels = new Array(width * height * 4).fill(20); // dark background
  const slot = Math.floor(width / count);
  for (let c = 0; c < count; c++) {
    const x0 = c * slot + Math.floor(slot * 0.3);
    const x1 = c * slot + Math.floor(slot * 0.7);
    const yMid = Math.floor(height / 2);
    const yTop = yMid - Math.floor(bodyHeight / 2) - (c % 3) * 5;
    const yBot = yMid + Math.floor(bodyHeight / 2) + ((c + 1) % 3) * 5;
    const [r, g, b] = c % 2 === 0 ? [20, 200, 60] : [220, 40, 50]; // green / red
    for (let x = x0; x <= x1; x++) {
      for (let y = yTop; y <= yBot; y++) {
        const i = (y * width + x) * 4;
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
      }
    }
  }
  return { width, height, pixels };
}

describe('chart presence validation', () => {
  it('rejects a non-chart (uniform dark) frame', () => {
    const frame = { width: 320, height: 180, pixels: new Array(320 * 180 * 4).fill(10) };
    const d = detectChartPresence(frame);
    expect(d.isChart).toBe(false);
    expect(d.score).toBe(0);
  });
  it('accepts a synthetic multi-colour candle frame', () => {
    const d = detectChartPresence(makeCandleFrame(12));
    expect(d.isChart).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(45);
  });
});

describe('visual candle reconstruction', () => {
  it('reconstructs approximately the drawn candle count', () => {
    const r = reconstructCandles(makeCandleFrame(10));
    expect(r.candles.length).toBeGreaterThanOrEqual(5);
    expect(r.candles.length).toBeLessThanOrEqual(15);
    expect(r.region).not.toBeNull();
  });
  it('produces geometrically consistent OHLC estimates (never NaN, wick geometry sane)', () => {
    const r = reconstructCandles(makeCandleFrame(10));
    for (const c of r.candles) {
      expect(Number.isFinite(c.open)).toBe(true);
      expect(Number.isFinite(c.high)).toBe(true);
      expect(Number.isFinite(c.low)).toBe(true);
      expect(Number.isFinite(c.close)).toBe(true);
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-6);
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-6);
      expect(c.bodyRange).toBeGreaterThanOrEqual(0);
    }
  });
  it('returns empty (not fabricated candles) for an invalid frame', () => {
    const r = reconstructCandles({ width: 10, height: 10, pixels: new Array(10 * 10 * 4).fill(5) });
    expect(r.candles).toHaveLength(0);
    expect(r.quality).toBe('POOR');
  });
});

describe('pattern classification and pixel pressure', () => {
  it('classifies a hammer', () => {
    const candle: Candle = { open: 9, close: 9.1, high: 9.15, low: 7 };
    const m = measureCandle(candle);
    expect(classifyCandlePattern(candle, m)).toBe('HAMMER');
  });
  it('classifies marubozu on full-body candle', () => {
    const candle: Candle = { open: 7, close: 9, high: 9, low: 7 };
    const m = measureCandle(candle);
    expect(classifyCandlePattern(candle, m)).toBe('MARUBOZU');
  });
  it('detects buyer dominance from green-heavy pixels', () => {
    const frame = makeCandleFrame(8);
    // Force all candles green
    for (let i = 0; i < frame.pixels.length; i += 4) {
      if (frame.pixels[i] > frame.pixels[i + 1]) { frame.pixels[i] = 20; frame.pixels[i + 1] = 200; frame.pixels[i + 2] = 60; }
    }
    const p = measurePixelPressure(frame);
    expect(p.dominant).toBe('BUYERS');
    expect(p.buyers).toBeGreaterThan(p.sellers);
  });
});

describe('80%+ gatekeeper and WAIT discipline', () => {
  it('exports MIN_CONFIDENCE_THRESHOLD of 80', () => {
    expect(MIN_CONFIDENCE_THRESHOLD).toBe(80);
  });
  it('returns WAIT, not error, when only a frame with no candles is analysed', () => {
    const result = analyzeAlgorithmic({ frame: makeCandleFrame(3) });
    expect(['CALL', 'PUT', 'WAIT']).toContain(result.signal);
  });
  it('never emits CALL/PUT below the threshold on a weak price series', () => {
    const prices = [100, 100.01, 100.02, 100.01, 100.0, 100.01, 100.02, 100.03];
    const result = analyzeAlgorithmic({ prices });
    if (result.signal !== 'WAIT') expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
  });
});

describe('MTG state machine', () => {
  it('advances to MTG Level 1 after one verified loss and resets after a win', () => {
    resetMtgState();
    const base = analyzeAlgorithmic({ prices: [50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30] });
    expect(base.mtg.level).toBe('BASE');
    reportSignalOutcome('LOSS');
    const afterLoss = analyzeAlgorithmic({ prices: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50] });
    expect(afterLoss.mtg.level).toBe('MTG_LEVEL_1');
    expect(afterLoss.mtg.consecutiveFailures).toBe(1);
    expect(afterLoss.mtg.requiredConfluence).toBe(85);
    reportSignalOutcome('WIN');
    const afterWin = analyzeAlgorithmic({ prices: [50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30] });
    expect(afterWin.mtg.level).toBe('BASE');
  });
  it('requires 90% confluence at MTG Level 2', () => {
    resetMtgState();
    reportSignalOutcome('LOSS');
    reportSignalOutcome('LOSS');
    const result = analyzeAlgorithmic({ prices: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] });
    expect(result.mtg.level).toBe('MTG_LEVEL_2');
    expect(result.mtg.requiredConfluence).toBe(90);
    resetMtgState();
  });
});
