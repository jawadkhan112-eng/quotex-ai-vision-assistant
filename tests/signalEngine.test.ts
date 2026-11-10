import { describe, it, expect } from 'vitest';
import { generateVisualConfirmationSignal } from '../server/signalEngine';
import { VisionAnalysisResult } from '../server/geminiVision';

describe('Fused Signal Intelligence & Visual Confirmation Tests', () => {
  it('returns WAIT when no data or weak data is provided', () => {
    const unreadable: VisionAnalysisResult = {
      signal: 'WAIT',
      chartReadable: false,
      evidenceQuality: 0,
      trend: 'UNKNOWN',
      momentum: 'NEUTRAL',
      candleObservation: '',
      supportResistance: '',
      visibleIndicators: [],
      reasons: [],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: '',
      riskNotes: '',
    };
    const result = generateVisualConfirmationSignal(unreadable);
    expect(result.signal).toBe('WAIT');
    expect(result.summaryReason).toContain('Visual evidence insufficient');
  });

  it('returns WAIT when vision AI reports unreadable chart or low evidence quality', () => {
    const result = generateVisualConfirmationSignal({
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

  it('generates CALL when strong bullish alignment exists across confirmations', () => {
    const result = generateVisualConfirmationSignal({
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 88,
      trend: 'STRONG_BULLISH',
      momentum: 'ACCELERATING_UP',
      candleObservation: 'Consecutive bullish candles closing near high',
      candlestickPattern: 'Three White Soldiers',
      visibleIndicators: ['EMA 9/21 Crossover', 'RSI Bullish'],
      supportResistance: 'Support confirmed at 1.0800',
      reasons: ['Strong bullish momentum', 'Support bounce'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break below 1.0800',
      riskNotes: 'Normal risk management applies',
      checklist: {
        trendConfirmed: true,
        candleStructureConfirmed: true,
        momentumConfirmed: true,
        supportResistanceConfirmed: true,
        patternConfirmed: true,
        visibleIndicatorConfirmed: true,
        multiCandleConfirmed: true,
      },
    });

    expect(result.signal).toBe('CALL');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(65);
    expect(result.confirmationChecklist.trendConfirmation.status).toBe('PASSED');
  });
});
