import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  OHLC,
} from '../server/indicators';

describe('Technical Indicator Engine Tests', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('calculates SMA correctly with known values', () => {
    const sma5 = calculateSMA(prices, 5);
    expect(sma5).toBe(18); // (16+17+18+19+20) / 5
  });

  it('returns undefined for SMA with insufficient length', () => {
    const sma15 = calculateSMA(prices, 15);
    expect(sma15).toBeUndefined();
  });

  it('calculates EMA without crashing', () => {
    const ema5 = calculateEMA(prices, 5);
    expect(ema5).toBeGreaterThan(15);
  });

  it('calculates RSI 14 for upward trend', () => {
    const upSeries = Array.from({ length: 20 }, (_, i) => 1.05 + i * 0.01);
    const rsi = calculateRSI(upSeries, 14);
    expect(rsi).toBe(100); // pure upward gains
  });

  it('calculates Bollinger Bands middle line equal to SMA', () => {
    const closes = Array.from({ length: 20 }, () => 1.1000);
    const bb = calculateBollingerBands(closes, 20, 2);
    expect(bb?.middle).toBe(1.1000);
    expect(bb?.upper).toBe(1.1000);
    expect(bb?.lower).toBe(1.1000);
  });
});
