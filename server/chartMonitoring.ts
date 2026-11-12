/**
 * CRITICAL TRADING TIMING RULE — STRICT NEXT-CANDLE ONLY
 * This rule is mandatory and must not be weakened.
 *
 * The current candle is for analysis and preparation.
 * The next candle is for the generated signal.
 *
 * NEVER issue an actionable signal in the middle of the current candle.
 * NEVER send a final CALL/PUT before verified candle closure.
 */

/**
 * Signal direction type
 */
export type SignalDirection = 'CALL' | 'PUT' | 'WAIT';

/**
 * Signal statuses per directive
 */
export type SignalStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'OUTCOME_PENDING'
  | 'WIN_VERIFIED'
  | 'LOSS_VERIFIED'
  | 'INVALIDATED';

/**
 * Adaptive setup classifications
 */
export type SetupClassification = 'HIGH-QUALITY' | 'DEVELOPING' | 'WEAK_OR_CONFLICTING';

/**
 * Signal record with all required fields per directive.
 * Every signal must include these fields when created automatically.
 */
export interface SignalRecord {
  signalId: string;
  monitoringSessionId: string;
  assetPair: string;
  marketType: 'LIVE' | 'OTC' | 'UNKNOWN';
  timeframe: string;
  direction: SignalDirection;
  confluenceScore: number;
  evidenceSummary: string;
  detectedIndicators: string[];
  candleCloseVerification: boolean;
  signalTimestamp: string;
  nextCandleEntryContext: string;
  entryExpiry: string;
  analysisSource: 'AUTOMATIC_LIVE' | 'MANUAL_ANALYZE_NOW';
  frameReference: string;
  algorithmVersion: string;
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  status: SignalStatus;
  setupClassification: SetupClassification;
}

/**
 * Configuration for frame sampling
 */
export const FRAME_SAMPLING_CONFIG = {
  normalRatePerSecond: 1,
  preCloseRatePerSecond: 1,
  maxQueueSize: 50,
  latencyWarningThresholdMs: 2000,
};

/**
 * Evidence types from analysis
 */
export type EvidenceType =
  | 'TREND'
  | 'EMA'
  | 'RSI'
  | 'BOLLINGER'
  | 'MACD'
  | 'MOMENTUM'
  | 'CANDLE_PATTERN'
  | 'SUPPORT_RESISTANCE'
  | 'ENGULFING'
  | 'PIN_BAR'
  | 'DOJI'
  | 'INSIDE_BAR'
  | 'BREAKOUT'
  | 'CHART_IDENTITY'
  | 'CANDLE_CLOSE_VERIFICATION';

/**
 * Evidence entry for weighted analysis
 */
export interface EvidenceEntry {
  type: EvidenceType;
  score: number; // contribution to confluence 0-100
  aligned: boolean; // supports the direction or contradicts
  weight: number; // how independent this evidence source is
}