import { describe, expect, it } from 'vitest';
import { calculateADX, calculateATR, calculateRSI, calculateSupertrend, type OHLC } from '../server/indicators';

const candles = (closes: number[]): OHLC[] => closes.map((close, i) => ({
  timestamp: i, open: close - 0.5, high: close + 1, low: close - 1, close,
}));

describe('Wilder indicator edge cases', () => {
  it('returns neutral RSI for a flat sequence', () => {
    expect(calculateRSI(Array(20).fill(10), 14)).toBe(50);
  });
  it('returns zero ATR for a flat OHLC sequence', () => {
    const flat = Array.from({ length: 16 }, (_, i) => ({ timestamp: i, open: 10, high: 10, low: 10, close: 10 }));
    expect(calculateATR(flat, 14)).toBe(0);
  });
  it('does not report ADX before enough data exists', () => {
    expect(calculateADX(candles(Array.from({ length: 20 }, (_, i) => i + 1)), 14)).toBeUndefined();
  });
  it('calculates a bounded ADX after the Wilder warmup', () => {
    const result = calculateADX(candles(Array.from({ length: 60 }, (_, i) => i + 1)), 14);
    expect(result).toBeDefined();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
  it('returns a finite trailing Supertrend on adequate data', () => {
    const result = calculateSupertrend(candles(Array.from({ length: 40 }, (_, i) => 100 + i)), 10, 3);
    expect(result).toBeDefined();
    expect(Number.isFinite(result?.value)).toBe(true);
    expect(result?.direction).toBe('BULLISH');
  });
});
