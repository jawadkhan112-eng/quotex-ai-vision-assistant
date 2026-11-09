import { describe, it, expect } from 'vitest';
import { detectCandlestickPatterns } from '../server/candlesticks';
import { OHLC } from '../server/indicators';

describe('Candlestick Pattern Recognition Engine Tests', () => {
  it('detects Bullish Engulfing pattern', () => {
    const candles: OHLC[] = [
      { timestamp: 1, open: 10, high: 10.5, low: 9.5, close: 10 },
      { timestamp: 2, open: 10, high: 10.2, low: 9.0, close: 9.1 }, // Bearish
      { timestamp: 3, open: 8.9, high: 10.5, low: 8.8, close: 10.3 }, // Engulfs prior body
    ];

    const patterns = detectCandlestickPatterns(candles);
    const engulfing = patterns.find((p) => p.patternName === 'Bullish Engulfing');
    expect(engulfing).toBeDefined();
    expect(engulfing?.type).toBe('BULLISH');
  });

  it('detects Doji candle', () => {
    const candles: OHLC[] = [
      { timestamp: 1, open: 10, high: 10, low: 10, close: 10 },
      { timestamp: 2, open: 10, high: 10, low: 10, close: 10 },
      { timestamp: 3, open: 10.0, high: 10.5, low: 9.5, close: 10.01 }, // Body 0.01 vs range 1.0
    ];

    const patterns = detectCandlestickPatterns(candles);
    const doji = patterns.find((p) => p.patternName === 'Doji');
    expect(doji).toBeDefined();
    expect(doji?.type).toBe('NEUTRAL');
  });

  it('detects Hammer pattern', () => {
    const candles: OHLC[] = [
      { timestamp: 1, open: 10, high: 10.5, low: 9.5, close: 10 },
      { timestamp: 2, open: 10, high: 10, low: 8.5, close: 8.6 }, // Bearish downtrend
      { timestamp: 3, open: 8.6, high: 8.61, low: 7.0, close: 8.55 }, // Long lower wick, tiny upper wick
    ];

    const patterns = detectCandlestickPatterns(candles);
    const hammer = patterns.find((p) => p.patternName === 'Hammer');
    expect(hammer).toBeDefined();
    expect(hammer?.type).toBe('BULLISH');
  });
});
