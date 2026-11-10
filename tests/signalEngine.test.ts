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

  it('forces WAIT when volatility assessment is HIGH despite a strong setup', () => {
    const result = generateVisualConfirmationSignal({
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 90,
      trend: 'STRONG_BULLISH',
      momentum: 'ACCELERATING_UP',
      candleObservation: 'Strong bullish engulfing off support',
      candlestickPattern: 'Bullish Engulfing',
      visibleIndicators: ['EMA 9 above EMA 21'],
      supportResistance: 'Bounce off support at 1.0800',
      reasons: ['Strong rejection wick'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break below 1.0800',
      riskNotes: 'Normal',
      volatilityAssessment: 'HIGH',
      rejectionAnalysis: 'Spiky choppy price action',
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

    expect(result.signal).toBe('WAIT');
    expect(result.summaryReason).toContain('High market volatility');
    expect(result.volatilityAssessment).toBe('HIGH');
  });

  it('fires a sure-shot pre-close CALL signal when the candle is approaching close', () => {
    const result = generateVisualConfirmationSignal({
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 85,
      detectedAsset: 'EUR/USD (OTC)',
      detectedTimeframe: '1M',
      trend: 'STRONG_BULLISH',
      momentum: 'ACCELERATING_UP',
      candleObservation: 'Bullish rejection wick off support',
      candlestickPattern: 'Pin Bar',
      visibleIndicators: ['EMA 9/21 bullish alignment'],
      supportResistance: 'Support at 1.0800',
      reasons: ['Rejection wick off support'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break below 1.0800',
      riskNotes: 'Normal',
      candleCompletionStatus: 'APPROACHING_CLOSE',
      candleCloseSecondsRemaining: 8,
      nextCandleDirection: 'CALL',
      preCloseSignal: true,
      expiry: '1 Minute',
      volatilityAssessment: 'NORMAL',
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
    expect(result.preCloseSignal).toBe(true);
    expect(result.candleCompletionStatus).toBe('APPROACHING_CLOSE');
    expect(result.secondsToClose).toBe(8);
    expect(result.nextCandleExpiryEstimate).toBe('1 Minute');
    expect(result.summaryReason).toContain('Sure-Shot pre-close entry');
    expect(result.summaryReason).toContain('8s');
  });

  it('uses auto-detected asset and timeframe from the vision result', () => {
    const result = generateVisualConfirmationSignal(
      {
        signal: 'PUT',
        chartReadable: true,
        evidenceQuality: 80,
        detectedAsset: 'GBP/JPY (OTC)',
        detectedTimeframe: '5M',
        trend: 'STRONG_BEARISH',
        momentum: 'ACCELERATING_DOWN',
        candleObservation: 'Shooting star at resistance',
        candlestickPattern: 'Shooting Star',
        visibleIndicators: ['Resistance ceiling'],
        supportResistance: 'Resistance at 185.00',
        reasons: ['Rejection off resistance'],
        opposingEvidence: [],
        conflicts: [],
        missingData: [],
        invalidation: 'Break above 185.20',
        riskNotes: 'Normal',
        checklist: {
          trendConfirmed: true,
          candleStructureConfirmed: true,
          momentumConfirmed: true,
          supportResistanceConfirmed: true,
          patternConfirmed: true,
          visibleIndicatorConfirmed: true,
          multiCandleConfirmed: true,
        },
      },
      '5M',
      'GBP/JPY (OTC)'
    );

    expect(result.detectedAsset).toBe('GBP/JPY (OTC)');
    expect(result.selectedTimeframe).toBe('5M');
    expect(result.nextCandleExpiryEstimate).toBe('5 Minutes');
  });
});
