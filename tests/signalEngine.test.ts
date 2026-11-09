import { describe, it, expect } from 'vitest';
import { generateFusedSignal } from '../server/signalEngine';
import type { OHLC } from '../server/indicators';

describe('Fused Signal Intelligence Engine Tests', () => {
  it('returns WAIT with no evidence', () => {
    const result = generateFusedSignal([]);
    expect(result.signal).toBe('WAIT');
    expect(result.evidenceQualityScore).toBe(0);
  });
  it('returns WAIT for unreadable visual evidence', () => {
    const result = generateFusedSignal(undefined, {
      signal: 'CALL', chartReadable: false, evidenceQuality: 40, trend: 'UNKNOWN', momentum: 'NEUTRAL',
      candleObservation: 'Unreadable', visibleIndicators: [], supportResistance: 'Unknown', reasons: [],
      opposingEvidence: [], conflicts: [], missingData: [], invalidation: 'N/A', riskNotes: 'Unclear',
    });
    expect(result.signal).toBe('WAIT');
  });
  it('requires configured minimum evidence quality', () => {
    const candles: OHLC[] = Array.from({ length: 60 }, (_, i) => ({ timestamp: i,
      open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i }));
    const vision = { signal: 'CALL' as const, chartReadable: true, evidenceQuality: 88, trend: 'STRONG_BULLISH' as const,
      momentum: 'ACCELERATING_UP' as const, candleObservation: 'Rising', visibleIndicators: [], supportResistance: 'N/A',
      reasons: [], opposingEvidence: [], conflicts: [], missingData: [], invalidation: 'N/A', riskNotes: 'None' };
    expect(generateFusedSignal(candles, vision, undefined, 65).signal).toBe('CALL');
    expect(generateFusedSignal(candles, vision, undefined, 90).signal).toBe('WAIT');
  });
});
