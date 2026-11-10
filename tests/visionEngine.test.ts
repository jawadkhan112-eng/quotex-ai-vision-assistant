import { describe, it, expect } from 'vitest';
import { generateVisualConfirmationSignal } from '../server/signalEngine';
import { VisionAnalysisResult } from '../server/geminiVision';

describe('Screen-Sharing AI Vision & Confirmation Engine Tests', () => {
  it('strictly returns WAIT when chart is not readable or blurry', () => {
    const unreadableResult: VisionAnalysisResult = {
      signal: 'CALL',
      chartReadable: false,
      evidenceQuality: 25,
      trend: 'UNKNOWN',
      momentum: 'NEUTRAL',
      candleObservation: 'Candles blurry and unreadable',
      supportResistance: '',
      visibleIndicators: [],
      reasons: [],
      opposingEvidence: ['Chart obscured'],
      conflicts: [],
      missingData: ['Candlesticks blurry'],
      invalidation: 'Image unreadable',
      riskNotes: 'Do not trade',
    };

    const signal = generateVisualConfirmationSignal(unreadableResult, '1M', 'EUR/USD (OTC)');
    expect(signal.signal).toBe('WAIT');
    expect(signal.confidenceScore).toBe(25);
    expect(signal.summaryReason).toContain('Visual evidence insufficient');
    expect(signal.confirmationChecklist.trendConfirmation.status).toBe('UNCONFIRMED');
  });

  it('confirms high-confidence CALL signal when all independent visual confirmations pass', () => {
    const bullishVision: VisionAnalysisResult = {
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 88,
      detectedAsset: 'EUR/USD (OTC)',
      detectedTimeframe: '1M',
      trend: 'STRONG_BULLISH',
      momentum: 'ACCELERATING_UP',
      candleObservation: 'Strong bullish engulfing candle with long lower rejection wick off support level',
      candlestickPattern: 'Bullish Engulfing',
      supportResistance: 'Clean bounce off major horizontal support zone at 1.0825',
      visibleIndicators: ['EMA 9 above EMA 21 crossover', 'RSI in bullish 55 expansion'],
      reasons: ['Strong rejection wick from support', 'Higher-high / higher-low structure confirmed'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break below 1.0820 support boundary',
      entryTiming: 'Enter immediately at the open of next 1M candle',
      expiryEstimate: '1 Minute',
      riskNotes: 'Normal 1M volatility',
      checklist: {
        trendConfirmed: true,
        candleStructureConfirmed: true,
        momentumConfirmed: true,
        supportResistanceConfirmed: true,
        patternConfirmed: true,
        visibleIndicatorConfirmed: true,
        multiCandleConfirmed: true,
      },
      providerUsed: 'gemini',
      modelUsed: 'gemini-1.5-flash',
    };

    const signal = generateVisualConfirmationSignal(bullishVision, '1M', 'EUR/USD (OTC)');
    expect(signal.signal).toBe('CALL');
    expect(signal.confidenceScore).toBe(88);
    expect(signal.confirmationChecklist.trendConfirmation.status).toBe('PASSED');
    expect(signal.confirmationChecklist.candleStructureConfirmation.status).toBe('PASSED');
    expect(signal.confirmationChecklist.momentumConfirmation.status).toBe('PASSED');
    expect(signal.confirmationChecklist.patternConfirmation.status).toBe('PASSED');
    expect(signal.entryTimingGuidance).toContain('open of next 1M candle');
    expect(signal.nextCandleExpiryEstimate).toBe('1 Minute');
  });

  it('confirms high-confidence PUT signal with clear rejection of resistance', () => {
    const bearishVision: VisionAnalysisResult = {
      signal: 'PUT',
      chartReadable: true,
      evidenceQuality: 85,
      detectedAsset: 'GBP/USD (OTC)',
      detectedTimeframe: '5M',
      trend: 'BEARISH',
      momentum: 'ACCELERATING_DOWN',
      candleObservation: 'Shooting star candle with prominent upper wick rejecting descending trendline',
      candlestickPattern: 'Shooting Star Reversal',
      supportResistance: 'Rejection of key resistance ceiling at 1.2950',
      visibleIndicators: ['Bearish MACD histogram expansion'],
      reasons: ['Upper rejection wick confirms seller absorption at resistance', 'Lower high formed'],
      opposingEvidence: [],
      conflicts: [],
      missingData: [],
      invalidation: 'Break above 1.2960 swing high',
      entryTiming: 'Enter on next 5M candle open',
      expiryEstimate: '5 Minutes',
      riskNotes: 'Standard 5M risk rules apply',
      checklist: {
        trendConfirmed: true,
        candleStructureConfirmed: true,
        momentumConfirmed: true,
        supportResistanceConfirmed: true,
        patternConfirmed: true,
        visibleIndicatorConfirmed: true,
        multiCandleConfirmed: true,
      },
      providerUsed: 'groq',
      modelUsed: 'llama-3.2-11b-vision-preview',
    };

    const signal = generateVisualConfirmationSignal(bearishVision, '5M', 'GBP/USD (OTC)');
    expect(signal.signal).toBe('PUT');
    expect(signal.confidenceScore).toBe(85);
    expect(signal.confirmationChecklist.trendConfirmation.status).toBe('PASSED');
    expect(signal.confirmationChecklist.candleStructureConfirmation.status).toBe('PASSED');
    expect(signal.nextCandleExpiryEstimate).toBe('5 Minutes');
  });

  it('defaults to WAIT when opposing evidence or conflicts exist', () => {
    const conflictedVision: VisionAnalysisResult = {
      signal: 'CALL',
      chartReadable: true,
      evidenceQuality: 65,
      trend: 'NEUTRAL_SIDEWAYS',
      momentum: 'CONSOLIDATING',
      candleObservation: 'Small spinning top candle in tight range',
      supportResistance: 'Trapped between support and immediate resistance ceiling',
      visibleIndicators: [],
      reasons: ['Minor bounce attempt'],
      opposingEvidence: ['Immediate overhead resistance barrier', 'Low volume indecision candle', 'Conflicting trendlines'],
      conflicts: ['Trend is sideways while momentum is decelerating'],
      missingData: [],
      invalidation: 'Level breach',
      riskNotes: 'High chop risk',
    };

    const signal = generateVisualConfirmationSignal(conflictedVision, '1M', 'EUR/USD (OTC)');
    expect(signal.signal).toBe('WAIT');
    expect(signal.summaryReason).toContain('WAIT');
  });
});
