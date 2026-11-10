// Algorithmic technical-analysis engine. It is deterministic and makes no network calls.

export interface AlgoSignal {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number; // 0 - 100
  evidenceQualityScore: number;
  summaryReason: string;
  analysisTimestamp: string;
  detectedAsset?: string;
  detectedTimeframe?: string;
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
  bollinger?: { upper: number; middle: number; lower: number; proximity: number; status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS' };
  candle?: { bodyRatio: number; upperWickRatio: number; lowerWickRatio: number; rejection: 'BULLISH' | 'BEARISH' | 'NONE'; momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  pixelDiagnostics?: { greenPixels: number; redPixels: number; contrast: number; sampledPixels: number };
  supportResistance?: { level: number; type: 'SWING_HIGH' | 'SWING_LOW' | 'ROUND_NUMBER'; strength: number };
  trendFilter: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}