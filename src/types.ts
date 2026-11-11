export type TabId = 'live_screen';

export interface HistoryRecord {
  id: number;
  timestamp: string;
  symbol: string;
  timeframe: string;
  signal: string;
  evidence_score: number;
  chart_readable: number;
  candle_observation: string;
  reasons: string;
  trend?: string;
  model_used?: string;
}

export interface AlgoAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number;
  evidenceQualityScore: number;
  summaryReason: string;
  analysisTimestamp: string;
  detectedAsset?: string;
  detectedTimeframe?: string;
  candleObservation: string;
  reasoning?: string;
  rsiValue?: number;
  rsiZone?: 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT';
  bollinger?: { upper: number; middle: number; lower: number; proximity: number; status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS'; bandwidth: number };
  candle?: { bodyRatio: number; upperWickRatio: number; lowerWickRatio: number; rejection: 'BULLISH' | 'BEARISH' | 'NONE'; momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  pixelDiagnostics?: { greenPixels: number; redPixels: number; contrast: number; sampledPixels: number };
  supportResistance?: { level: number; type: 'SWING_HIGH' | 'SWING_LOW' | 'ROUND_NUMBER'; strength: number };
  trendFilter: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  actionBadge: string;
  expiry: { recommendation: 'NEXT_1M' | 'EXPIRY_2M' | 'EXPIRY_5M_PLUS' | 'WAIT'; label: string; candles: number; rationale: string };
  confluence: { rsiExtreme: boolean; bollingerBoundaryTouch: boolean; rejectionWickStrong: boolean; momentumAligned: boolean; trendAligned: boolean; choppyMarket: boolean; score: number };
  mtg: { level: 'BASE' | 'MTG_LEVEL_1' | 'MTG_LEVEL_2'; consecutiveFailures: number; lastSignal?: 'CALL' | 'PUT' | 'WAIT'; lastOutcome?: 'WIN' | 'LOSS'; riskWarning?: string };
  forNextCandle: boolean;
  chartDetection: { isChart: boolean; score: number; reason: string };
}
