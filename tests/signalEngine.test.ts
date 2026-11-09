import { describe, it, expect } from 'vitest';
import { generateFusedSignal } from '../server/signalEngine';
import { OHLC } from '../server/indicators';

describe('Fused Signal Intelligence Engine Tests', () => {
  it('returns WAIT when no data or weak data is provided', () => {
    const result = generateFusedSignal([]);
    expect(result.signal).toBe('WAIT');
    expect(result.summaryReason).toContain('WAIT recommended');
  });

  it('returns WAIT when vision AI reports unreadable chart or low evidence quality', () => {
    const candles: OHLC[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i,
      open: 1.0800,
      high: 1.0810,
      low: 1.0790,
      close: 1.0805,
    }));

    const result = generateFusedSignal(candles, {
      signal: 'CALL',
      chartReadable: false, // Unreadable
      evidenceQuality: 40,
      trend: 'NEUTRAL_SIDEWAYS',
      momentum: 'NEUTRAL',
      candleObservation: 'Blurry chart image',
      visibleIndicators: [],
      supportResistance: 'Unknown',
      reasons: [],
      opposingEvidence: ['Image pixelated'],
      conflicts: ['Indicators unreadable'],
      missingData: ['Timeframe missing'],
      invalidation: 'N/A',
      riskNotes: 'Do not trade on blurry screenshot',
    });

    expect(result.signal).toBe('WAIT');
  });

  it('generates CALL when strong bullish alignment exists across indicators and vision', () => {
    // Bullish candles sequence
    const candles: OHLC[] = Array.from({ length: 40 }, (_, i) => ({
      timestamp: i,
      open: 1.0800 + i * 0.0005,
      high: 1.0808 + i * 0.0005,
      low: 1.0798 + i * 0.0005,
      close: 1.0806 + i * 0.0005,
    }));

    const result = generateFusedSignal(candles, {
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 88,
      trend: 'STRONG_BULLISH',
      momentum: 'ACCELERATING_UP',
      candleObservation: 'Consecutive bullish candles closing near high',
      visibleIndicators: ['EMA 9/21 Crossover', 'RSI Bullish'],
      supportResistance: 'Support confirmed at 1.0800',
      reasons: ['Strong bullish momentum', 'Support bounce'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break below 1.0800',
      riskNotes: 'Normal risk management applies',
    });

    expect(result.signal).toBe('CALL');
    expect(result.evidenceQualityScore).toBeGreaterThanOrEqual(65);
  });
});
