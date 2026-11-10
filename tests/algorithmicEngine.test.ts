import { describe, expect, it } from 'vitest';
import { analyzeAlgorithmic, calculateBollingerBands, calculateRSI, measureCandle } from '../server/algorithmicEngine';
describe('local algorithmic engine', () => {
  const downtrend = Array.from({ length: 25 }, (_, i) => 100 - i);
  it('calculates deterministic RSI and Bollinger bands', () => { expect(calculateRSI(downtrend)).toBe(0); expect(calculateBollingerBands(downtrend)?.lower).toBeLessThan(calculateBollingerBands(downtrend)?.middle || 0); });
  it('measures rejection wicks without image or network dependencies', () => { expect(measureCandle({ open: 9, close: 9.2, high: 9.25, low: 7 }).rejection).toBe('BULLISH'); });
  it('returns a fully local analysis payload', () => { const result = analyzeAlgorithmic({ prices: downtrend, candles: [{ open: 78, close: 77, high: 78.1, low: 74 }] }); expect(['CALL','PUT','WAIT']).toContain(result.signal); expect(result.bollinger).toBeDefined(); expect(result.candleObservation).toContain('wick'); });
});
