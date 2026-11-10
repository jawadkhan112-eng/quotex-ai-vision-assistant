export type TabId = 'live_screen';

export interface AlgoAnalysisResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidenceScore: number;
  reasoning?: string;
  rsiValue?: number;
  candleObservation?: string;
  summaryReason?: string;
  bollinger?: { upper: number; middle: number; lower: number; proximity: number; status: 'NEAR_LOWER' | 'NEAR_UPPER' | 'WITHIN_BANDS' };
  candle?: { bodyRatio: number; upperWickRatio: number; lowerWickRatio: number; rejection: 'BULLISH' | 'BEARISH' | 'NONE'; momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
}
