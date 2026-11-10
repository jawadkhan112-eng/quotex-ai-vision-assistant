export type TabId =
  | 'live_screen'      // Primary: Live screen-sharing analysis
  | 'screenshot'       // Screenshot & clipboard capture
  | 'ai_analysis'      // Visual chart breakdown & confirmations
  | 'history'          // Signal history & logs
  | 'voice_assistant'  // AI Voice assistant
  | 'ai_settings'      // AI Provider settings
  | 'diagnostics'      // System health & WebRTC diagnostics
  | 'app_settings';    // App settings

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

export interface SignalData {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number; // 0 - 100 (Technical evidence score, not guaranteed win probability)
  evidenceQualityScore: number; // For backward compatibility
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
  // Candle Close & Pre-Close Timing (Sure-Shot Edge)
  preCloseSignal?: boolean;
  candleCompletionStatus?: string;
  secondsToClose?: number;
  volatilityAssessment?: string;
  visionInsights?: {
    chartReadable: boolean;
    evidenceQuality: number;
    trend: string;
    momentum: string;
    candleObservation: string;
    visibleIndicators: string[];
    supportResistance: string;
    reasons: string[];
    opposingEvidence: string[];
    conflicts: string[];
    missingData: string[];
    invalidation: string;
    riskNotes: string;
  };
  disclaimer: string;
  providerUsed?: string;
  modelUsed?: string;
}

export interface AlgoAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number; // 0-100% confidence based on technical confluence
  reasoning: string; // Mathematical reasoning for the signal
  rsiValue?: number; // RSI 14-period value
  bbPosition?: 'lower' | 'upper' | 'neutral'; // Bollinger Band position
  candleObservation?: string; // e.g., "Price below Lower BB + RSI oversold"
}

export interface HistoryRecord {
  id: number;
  timestamp: string;
  symbol: string;
  timeframe: string;
  signal: 'CALL' | 'PUT' | 'WAIT';
  evidence_score: number;
  chart_readable: number;
  trend?: string;
  momentum?: string;
  candle_observation?: string;
  visible_indicators?: string;
  support_resistance?: string;
  reasons?: string;
  opposing_evidence?: string;
  conflicts?: string;
  invalidation?: string;
  risk_notes?: string;
  image_path?: string;
  model_used: string;
  notes?: string;
}

export interface MonitoringLogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'CAPTURE' | 'ANALYSIS' | 'SIGNAL' | 'WARN' | 'ERROR';
  message: string;
  signal?: 'CALL' | 'PUT' | 'WAIT';
  confidence?: number;
}
