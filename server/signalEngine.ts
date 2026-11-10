import { VisionAnalysisResult } from './geminiVision.js';

export interface ConfirmationItem {
  id: string;
  name: string;
  status: 'PASSED' | 'FAILED' | 'UNCONFIRMED' | 'NOT_DETECTED';
  detail: string;
}

export interface ConfirmationChecklist {
  trendConfirmation: ConfirmationItem;
  candleStructureConfirmation: ConfirmationItem;
  momentumConfirmation: ConfirmationItem;
  supportResistanceConfirmation: ConfirmationItem;
  patternConfirmation: ConfirmationItem;
  visibleIndicatorConfirmation: ConfirmationItem;
  multiCandleConfirmation: ConfirmationItem;
}

export interface FinalSignalResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number; // 0 - 100 (Technical evidence score, NOT guaranteed win rate)
  evidenceQualityScore: number; // backward compatibility
  summaryReason: string;
  analysisTimestamp: string;
  selectedTimeframe: string;
  detectedAsset?: string;
  visualEvidence: string[];
  supportingEvidence: string[];
  opposingEvidence: string[];
  conflictingEvidence: string[];
  entryTimingGuidance: string;
  nextCandleExpiryEstimate: string;
  invalidationConditions: string;
  confirmationChecklist: ConfirmationChecklist;
  visionInsights?: VisionAnalysisResult;
  riskNotes: string[];
  disclaimer: string;
  providerUsed?: string;
  modelUsed?: string;
  // Pre-Close / Candle-Close Timing (Sure-Shot Edge)
  preCloseSignal?: boolean;
  candleCompletionStatus?: string;
  secondsToClose?: number;
  volatilityAssessment?: string;
}

/**
 * Pure Visual Chart Confirmation & Next-Candle Signal Engine
 * Evaluates vision observations exclusively from user's shared screen or uploaded screenshot.
 * Zero external market-data feed dependency.
 */
export function generateVisualConfirmationSignal(
  visionResult: VisionAnalysisResult,
  requestedTimeframe = '1M',
  requestedSymbol = 'EUR/USD (OTC)'
): FinalSignalResult {
  const supportingEvidence: string[] = [];
  const opposingEvidence: string[] = [];
  const conflictingEvidence: string[] = [];
  const visualEvidence: string[] = [];
  const riskNotes: string[] = [];

  const now = new Date().toISOString();

  // If chart is unreadable, obstructed, or evidence quality is insufficient (< 60) -> strictly WAIT
  if (!visionResult || !visionResult.chartReadable || visionResult.evidenceQuality < 60) {
    return {
      signal: 'WAIT',
      confidenceScore: visionResult?.evidenceQuality ?? 0,
      evidenceQualityScore: visionResult?.evidenceQuality ?? 0,
      summaryReason: visionResult?.chartReadable === false
        ? 'Visual evidence insufficient: Chart candlesticks, prices, or timeframe are blurry, obscured, or not clearly readable.'
        : `WAIT recommended: Visual evidence score (${visionResult?.evidenceQuality ?? 0}%) is below the safe reliability threshold (60%).`,
      analysisTimestamp: now,
      selectedTimeframe: requestedTimeframe,
      detectedAsset: visionResult?.detectedAsset || requestedSymbol,
      visualEvidence: visionResult?.missingData || ['Chart resolution too low or candles obstructed'],
      supportingEvidence: [],
      opposingEvidence: visionResult?.opposingEvidence || ['Chart illegible or conflicting visual elements'],
      conflictingEvidence: visionResult?.conflicts || [],
      entryTimingGuidance: 'Do not enter trade. Wait for clean, legible chart view.',
      nextCandleExpiryEstimate: requestedTimeframe === '5M' ? '5 Minutes' : '1 Minute',
      invalidationConditions: 'Setup invalid due to unreadable chart conditions.',
      confirmationChecklist: {
        trendConfirmation: { id: 'trend', name: 'Trend Structure', status: 'UNCONFIRMED', detail: 'Chart unreadable' },
        candleStructureConfirmation: { id: 'candle', name: 'Candle Structure', status: 'UNCONFIRMED', detail: 'Candle bodies not distinct' },
        momentumConfirmation: { id: 'momentum', name: 'Momentum Alignment', status: 'UNCONFIRMED', detail: 'Cannot gauge momentum' },
        supportResistanceConfirmation: { id: 'sr', name: 'Key S/R Boundary', status: 'UNCONFIRMED', detail: 'Key levels obscured' },
        patternConfirmation: { id: 'pattern', name: 'Candlestick Pattern', status: 'UNCONFIRMED', detail: 'No clear formation' },
        visibleIndicatorConfirmation: { id: 'ind', name: 'Visible Indicators', status: 'NOT_DETECTED', detail: 'No indicators readable' },
        multiCandleConfirmation: { id: 'multi', name: 'Multi-Candle Sequence', status: 'UNCONFIRMED', detail: 'Sequence incomplete' },
      },
      visionInsights: visionResult,
      riskNotes: ['Trading in low-clarity market conditions increases false-signal risk.'],
      disclaimer: 'Analysis-only assistant. Evidence score represents visual technical confluence, NOT a guaranteed win rate or profit guarantee.',
      providerUsed: visionResult?.providerUsed,
      modelUsed: visionResult?.modelUsed,
    };
  }

  // Populate visual observations
  if (visionResult.candleObservation) visualEvidence.push(`Candle Anatomy: ${visionResult.candleObservation}`);
  if (visionResult.trend) visualEvidence.push(`Trend Structure: ${visionResult.trend.replace(/_/g, ' ')}`);
  if (visionResult.momentum) visualEvidence.push(`Momentum: ${visionResult.momentum.replace(/_/g, ' ')}`);
  if (visionResult.supportResistance) visualEvidence.push(`S/R Proximity: ${visionResult.supportResistance}`);

  // Opposing and conflict items
  if (visionResult.opposingEvidence && visionResult.opposingEvidence.length > 0) {
    opposingEvidence.push(...visionResult.opposingEvidence);
  }
  if (visionResult.conflicts && visionResult.conflicts.length > 0) {
    conflictingEvidence.push(...visionResult.conflicts);
  }

  // 1. Build Transparent Confirmation Checklist
  const isBullishBias = visionResult.signal === 'CALL' || visionResult.trend?.includes('BULLISH');
  const isBearishBias = visionResult.signal === 'PUT' || visionResult.trend?.includes('BEARISH');

  // Trend Confirmation
  const trendConfirmed = Boolean(
    (isBullishBias && (visionResult.trend === 'STRONG_BULLISH' || visionResult.trend === 'BULLISH')) ||
    (isBearishBias && (visionResult.trend === 'STRONG_BEARISH' || visionResult.trend === 'BEARISH'))
  );

  // Candle Structure Confirmation
  const candleStructureConfirmed = Boolean(
    visionResult.checklist?.candleStructureConfirmed !== undefined
      ? visionResult.checklist.candleStructureConfirmed
      : visionResult.candleObservation && !visionResult.candleObservation.toLowerCase().includes('indecision')
  );

  // Momentum Confirmation
  const momentumConfirmed = Boolean(
    visionResult.checklist?.momentumConfirmed !== undefined
      ? visionResult.checklist.momentumConfirmed
      : (isBullishBias && visionResult.momentum === 'ACCELERATING_UP') ||
        (isBearishBias && visionResult.momentum === 'ACCELERATING_DOWN')
  );

  // Support / Resistance Confirmation
  const srConfirmed = Boolean(
    visionResult.checklist?.supportResistanceConfirmed !== undefined
      ? visionResult.checklist.supportResistanceConfirmed
      : Boolean(visionResult.supportResistance)
  );

  // Candlestick Pattern Confirmation
  const patternConfirmed = Boolean(
    visionResult.checklist?.patternConfirmed !== undefined
      ? visionResult.checklist.patternConfirmed
      : Boolean(visionResult.candlestickPattern)
  );

  // Visible Indicator Confirmation (ONLY when actually visible)
  const hasVisibleIndicators = Boolean(visionResult.visibleIndicators && visionResult.visibleIndicators.length > 0);
  const indicatorConfirmed = hasVisibleIndicators && (visionResult.checklist?.visibleIndicatorConfirmed ?? true);

  // Multi-Candle Confirmation
  const multiCandleConfirmed = Boolean(
    visionResult.checklist?.multiCandleConfirmed !== undefined
      ? visionResult.checklist.multiCandleConfirmed
      : visionResult.evidenceQuality >= 70
  );

  const checklist: ConfirmationChecklist = {
    trendConfirmation: {
      id: 'trend',
      name: 'Trend Direction Alignment',
      status: trendConfirmed ? 'PASSED' : 'FAILED',
      detail: visionResult.trend ? visionResult.trend.replace(/_/g, ' ') : 'Neutral / Sideways structure',
    },
    candleStructureConfirmation: {
      id: 'candle',
      name: 'Candlestick Anatomy Confirmation',
      status: candleStructureConfirmed ? 'PASSED' : 'FAILED',
      detail: visionResult.candleObservation || 'No rejection or directional body observed',
    },
    momentumConfirmation: {
      id: 'momentum',
      name: 'Momentum Vector Confirmation',
      status: momentumConfirmed ? 'PASSED' : 'FAILED',
      detail: visionResult.momentum ? visionResult.momentum.replace(/_/g, ' ') : 'Consolidating / Low momentum',
    },
    supportResistanceConfirmation: {
      id: 'sr',
      name: 'Key Support / Resistance Boundary',
      status: srConfirmed ? 'PASSED' : 'UNCONFIRMED',
      detail: visionResult.supportResistance || 'Far from key swing boundary',
    },
    patternConfirmation: {
      id: 'pattern',
      name: 'Candlestick Pattern Formation',
      status: patternConfirmed ? 'PASSED' : 'NOT_DETECTED',
      detail: visionResult.candlestickPattern || 'No standalone reversal or continuation pattern',
    },
    visibleIndicatorConfirmation: {
      id: 'ind',
      name: 'Visible Technical Indicators',
      status: hasVisibleIndicators ? (indicatorConfirmed ? 'PASSED' : 'FAILED') : 'NOT_DETECTED',
      detail: hasVisibleIndicators ? visionResult.visibleIndicators.join(', ') : 'No indicators visible on chart',
    },
    multiCandleConfirmation: {
      id: 'multi',
      name: 'Multi-Candle Context Sequence',
      status: multiCandleConfirmed ? 'PASSED' : 'FAILED',
      detail: multiCandleConfirmed ? 'Recent candle sequence aligns with setup' : 'Sequence shows conflicting pauses',
    },
  };

  // Count Passed Confirmations
  const passedCount = Object.values(checklist).filter((c) => c.status === 'PASSED').length;

  // Next-Candle Decision Matrix
  let finalSignal: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let summaryReason = '';

  // Extract candle-close / pre-close timing cues from vision (Sure-Shot Edge)
  const candleCompletionStatus = visionResult.candleCompletionStatus || 'UNKNOWN';
  const secondsToClose = visionResult.candleCloseSecondsRemaining ?? undefined;
  const nextCandleDirection = visionResult.nextCandleDirection || 'WAIT';
  const preCloseSignal = Boolean(visionResult.preCloseSignal);
  const volatilityAssessment = visionResult.volatilityAssessment || 'NORMAL';

  // Strict risk override: HIGH volatility forces WAIT regardless of setup quality
  let volatilityForcedWait = false;
  if (volatilityAssessment === 'HIGH') {
    volatilityForcedWait = true;
    finalSignal = 'WAIT';
    summaryReason = `WAIT: High market volatility detected (${visionResult.rejectionAnalysis || 'choppy price action with no clear absorption zone'}). No high-probability entry — stand aside until volatility settles.`;
    riskNotes.push('High volatility environment: avoid entering until candle structure stabilizes.');
  }

  if (!volatilityForcedWait && visionResult.signal === 'CALL' && passedCount >= 3 && opposingEvidence.length <= 2 && conflictingEvidence.length === 0) {
    finalSignal = 'CALL';
    summaryReason = `CALL verified: ${passedCount} visual confirmations passed (Trend, Candle Anatomy, and Momentum aligned).`;
    supportingEvidence.push(...(visionResult.reasons || ['Bullish candle structure with rejection off support']));
    if (preCloseSignal && candleCompletionStatus === 'APPROACHING_CLOSE' && secondsToClose != null && secondsToClose <= 15) {
      summaryReason += ` Sure-Shot pre-close entry: current candle closing in ${secondsToClose}s — execute at the next ${requestedTimeframe} candle open.`;
      riskNotes.push(`Pre-close sure-shot window (${secondsToClose}s remaining). Enter exactly at next candle open.`);
    }
  } else if (!volatilityForcedWait && visionResult.signal === 'PUT' && passedCount >= 3 && opposingEvidence.length <= 2 && conflictingEvidence.length === 0) {
    finalSignal = 'PUT';
    summaryReason = `PUT verified: ${passedCount} visual confirmations passed (Trend, Candle Anatomy, and Momentum aligned).`;
    supportingEvidence.push(...(visionResult.reasons || ['Bearish candle structure with rejection off resistance']));
    if (preCloseSignal && candleCompletionStatus === 'APPROACHING_CLOSE' && secondsToClose != null && secondsToClose <= 15) {
      summaryReason += ` Sure-Shot pre-close entry: current candle closing in ${secondsToClose}s — execute at the next ${requestedTimeframe} candle open.`;
      riskNotes.push(`Pre-close sure-shot window (${secondsToClose}s remaining). Enter exactly at next candle open.`);
    }
  } else if (!volatilityForcedWait) {
    finalSignal = 'WAIT';
    if (conflictingEvidence.length > 0) {
      summaryReason = `WAIT: Conflicting visual evidence detected (${conflictingEvidence.join('; ')}).`;
    } else if (opposingEvidence.length > 2) {
      summaryReason = `WAIT: ${opposingEvidence.length} opposing factors or resistance barriers identified.`;
    } else if (passedCount < 3) {
      summaryReason = `WAIT: Insufficient confirmations (${passedCount} passed, minimum 3 independent confirmations required).`;
    } else {
      summaryReason = 'WAIT: Market conditions ambiguous. Awaiting clearer high-probability setup.';
    }
  }

  // Next-Candle Expiry & Entry Timing Guidance
  const nextCandleExpiry = requestedTimeframe === '5M' ? '5 Minutes' : '1 Minute';
  const entryTiming = visionResult.entryTiming || (
    finalSignal !== 'WAIT'
      ? `Enter exactly at the open of the next ${requestedTimeframe} candle.`
      : 'Stand aside. Re-scan next candle.'
  );

  const invalidation = visionResult.invalidation || (
    finalSignal === 'CALL'
      ? 'Break below recent candle low or failure to hold support'
      : finalSignal === 'PUT'
      ? 'Break above recent candle high or rejection of resistance'
      : 'Any high-volatility breakout contrary to current consolidation'
  );

  riskNotes.push('Never risk more than 1-2% of total account balance per trade.');
  riskNotes.push('Binary options expire strictly on time. Never chase a trade if the next-candle entry window has elapsed.');

  return {
    signal: finalSignal,
    confidenceScore: visionResult.evidenceQuality,
    evidenceQualityScore: visionResult.evidenceQuality,
    summaryReason,
    analysisTimestamp: now,
    selectedTimeframe: requestedTimeframe,
    detectedAsset: visionResult.detectedAsset || requestedSymbol,
    visualEvidence,
    supportingEvidence,
    opposingEvidence,
    conflictingEvidence,
    entryTimingGuidance: entryTiming,
    nextCandleExpiryEstimate: visionResult.expiry || visionResult.expiryEstimate || nextCandleExpiry,
    invalidationConditions: invalidation,
    confirmationChecklist: checklist,
    visionInsights: visionResult,
    riskNotes,
    disclaimer: 'Analysis-only assistant. Evidence score represents visual technical confluence, NOT a guaranteed win rate or profit guarantee.',
    providerUsed: visionResult.providerUsed,
    modelUsed: visionResult.modelUsed,
    // Pre-Close / Candle-Close Timing (Sure-Shot Edge)
    preCloseSignal,
    candleCompletionStatus,
    secondsToClose,
    volatilityAssessment,
  };
}

// Backward compatibility export
export const generateFusedSignal = generateVisualConfirmationSignal;
