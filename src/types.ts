export type TabId =
  | 'dashboard'
  | 'screenshot'
  | 'live_screen'
  | 'ai_analysis'
  | 'indicators'
  | 'candlesticks'
  | 'voice_assistant'
  | 'history'
  | 'backtesting'
  | 'ai_settings'
  | 'diagnostics'
  | 'app_settings';

export interface SignalData {
  signal: 'CALL' | 'PUT' | 'WAIT';
  evidenceQualityScore: number;
  summaryReason: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  indicatorConsensus: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  candlestickMatches: {
    patternName: string;
    type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    reliability: string;
    description: string;
    invalidationLevel: number;
  }[];
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
  invalidationLevel?: number;
  riskNotes: string[];
  disclaimer: string;
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
