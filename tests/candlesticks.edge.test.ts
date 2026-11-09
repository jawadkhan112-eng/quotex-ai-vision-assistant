import { describe, expect, it } from 'vitest';
import { detectCandlestickPatterns } from '../server/candlesticks';
import type { OHLC } from '../server/indicators';

describe('candlestick recognizer edge cases', () => {
  it('does not classify a zero-range candle as a doji or marubozu', () => {
    const flat: OHLC[] = [1,2,3].map(timestamp => ({ timestamp, open: 10, high: 10, low: 10, close: 10 }));
    expect(detectCandlestickPatterns(flat)).toEqual([]);
  });
  it('identifies an inside bar as neutral and never as a trade signal', () => {
    const input: OHLC[] = [
      { timestamp: 1, open: 10, high: 12, low: 8, close: 11 },
      { timestamp: 2, open: 10, high: 11, low: 9, close: 10.5 },
      { timestamp: 3, open: 10.2, high: 10.8, low: 9.4, close: 10.1 },
    ];
    expect(detectCandlestickPatterns(input).some(pattern => pattern.patternName === 'Inside Bar' && pattern.type === 'NEUTRAL')).toBe(true);
  });
});
