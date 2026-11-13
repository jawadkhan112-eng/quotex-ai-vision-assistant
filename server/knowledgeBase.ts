/**
 * Strategy Knowledge Base — documented technical-analysis rules and patterns.
 * ==========================================================================
 * A static catalogue of what each strategy family looks for. This is KNOWLEDGE,
 * not learned weights: learned performance lives in outcomeLearning.ts and is
 * derived only from VERIFIED historical outcomes. Nothing here is fabricated.
 */

export interface PatternDefinition {
  name: string;
  family: 'CANDLE_PATTERNS' | 'PRICE_ACTION' | 'MARKET_STRUCTURE';
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  definition: string;
  /** Candle indices used relative to the end of the completed series (0 = last) */
  candlesRequired: number;
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
}

export const PATTERN_KNOWLEDGE: PatternDefinition[] = [
  { name: 'BULLISH_ENGULFING', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 2, reliability: 'HIGH', definition: 'Bull candle body fully engulfs the previous bear candle body after a decline.' },
  { name: 'BEARISH_ENGULFING', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 2, reliability: 'HIGH', definition: 'Bear candle body fully engulfs the previous bull candle body after a rally.' },
  { name: 'HAMMER', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 1, reliability: 'MEDIUM', definition: 'Small body at the top, long lower wick (>=55% of range): buyers rejected lows.' },
  { name: 'SHOOTING_STAR', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 1, reliability: 'MEDIUM', definition: 'Small body at the bottom, long upper wick (>=55% of range): sellers rejected highs.' },
  { name: 'MORNING_STAR', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 3, reliability: 'HIGH', definition: 'Strong bear candle, small indecision candle, bull candle closing above the midpoint of the first.' },
  { name: 'EVENING_STAR', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 3, reliability: 'HIGH', definition: 'Strong bull candle, small indecision candle, bear candle closing below the midpoint of the first.' },
  { name: 'THREE_WHITE_SOLDIERS', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 3, reliability: 'HIGH', definition: 'Three consecutive strong bull candles — sustained bullish expansion.' },
  { name: 'THREE_BLACK_CROWS', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 3, reliability: 'HIGH', definition: 'Three consecutive strong bear candles — sustained bearish expansion.' },
  { name: 'PIERCING', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 2, reliability: 'MEDIUM', definition: 'Bull candle opens below prior bear close and closes above its midpoint.' },
  { name: 'DARK_CLOUD', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 2, reliability: 'MEDIUM', definition: 'Bear candle opens above prior bull close and closes below its midpoint.' },
  { name: 'DRAGONFLY_DOJI', family: 'CANDLE_PATTERNS', direction: 'UP', candlesRequired: 1, reliability: 'LOW', definition: 'Doji with long lower wick — demand at lows.' },
  { name: 'GRAVESTONE_DOJI', family: 'CANDLE_PATTERNS', direction: 'DOWN', candlesRequired: 1, reliability: 'LOW', definition: 'Doji with long upper wick — supply at highs.' },
  { name: 'TWEEZER_BOTTOM', family: 'PRICE_ACTION', direction: 'UP', candlesRequired: 2, reliability: 'LOW', definition: 'Two adjacent candles with matching lows — double support test.' },
  { name: 'TWEEZER_TOP', family: 'PRICE_ACTION', direction: 'DOWN', candlesRequired: 2, reliability: 'LOW', definition: 'Two adjacent candles with matching highs — double resistance test.' },
  { name: 'INSIDE_BAR', family: 'PRICE_ACTION', direction: 'NEUTRAL', candlesRequired: 2, reliability: 'LOW', definition: 'Candle range fully inside the prior candle — consolidation before expansion.' },
  { name: 'OUTSIDE_BAR', family: 'PRICE_ACTION', direction: 'NEUTRAL', candlesRequired: 2, reliability: 'LOW', definition: 'Candle engulfs the full prior range — volatility expansion.' },
  { name: 'FALSE_BREAKOUT', family: 'PRICE_ACTION', direction: 'NEUTRAL', candlesRequired: 3, reliability: 'MEDIUM', definition: 'Price breaks a swing level then closes back inside — trap; direction flips.' },
  { name: 'BREAK_RETEST', family: 'PRICE_ACTION', direction: 'NEUTRAL', candlesRequired: 4, reliability: 'MEDIUM', definition: 'Breakout level retested as support/resistance — continuation setup.' },
  { name: 'HIGHER_HIGHS_HIGHER_LOWS', family: 'MARKET_STRUCTURE', direction: 'UP', candlesRequired: 4, reliability: 'HIGH', definition: 'Ascending swing structure — bullish trend continuation.' },
  { name: 'LOWER_HIGHS_LOWER_LOWS', family: 'MARKET_STRUCTURE', direction: 'DOWN', candlesRequired: 4, reliability: 'HIGH', definition: 'Descending swing structure — bearish trend continuation.' },
  { name: 'BREAK_OF_STRUCTURE_UP', family: 'MARKET_STRUCTURE', direction: 'UP', candlesRequired: 4, reliability: 'HIGH', definition: 'Close above the most recent swing high — bullish structure shift.' },
  { name: 'BREAK_OF_STRUCTURE_DOWN', family: 'MARKET_STRUCTURE', direction: 'DOWN', candlesRequired: 4, reliability: 'HIGH', definition: 'Close below the most recent swing low — bearish structure shift.' },
];

export interface StrategyRule {
  family: 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'CANDLE_SEQUENCE' | 'PRICE_ACTION';
  name: string;
  definition: string;
  /** Minimum completed candles required before this rule may run */
  minCandles: number;
  /** Data the rule depends on; 'rsi14' etc. missing data disables the rule honestly */
  requires?: 'rsi14' | 'bollinger20' | 'macd' | 'stochastic' | 'atr14';
}

export const STRATEGY_RULES: StrategyRule[] = [
  { family: 'TREND', name: 'EMA_ALIGNMENT', definition: 'EMA9 vs EMA20 position indicates short-term trend direction.', minCandles: 20 },
  { family: 'TREND', name: 'HIGHER_LOW_SEQUENCE', definition: 'Consecutive higher lows show sustained demand.', minCandles: 4 },
  { family: 'MOMENTUM', name: 'RSI_DIRECTIONAL_LEAN', definition: 'RSI below 45 leans CALL, above 55 leans PUT; extremes add strength.', minCandles: 15, requires: 'rsi14' },
  { family: 'MOMENTUM', name: 'BODY_EXPANSION', definition: 'Last body >= 80% of average body size indicates momentum expansion.', minCandles: 4 },
  { family: 'VOLATILITY', name: 'BOLLINGER_EDGE', definition: 'Close near an outer band with directional body indicates continuation or reversal context.', minCandles: 20, requires: 'bollinger20' },
  { family: 'VOLATILITY', name: 'SQUEEZE', definition: 'Bollinger bandwidth below 0.3% indicates consolidation — expansion expected.', minCandles: 20, requires: 'bollinger20' },
  { family: 'CANDLE_SEQUENCE', name: 'THREE_CLOSE_SEQUENCE', definition: 'Direction of 2-of-3 most recent closes.', minCandles: 3 },
  { family: 'PRICE_ACTION', name: 'WINDOW_SUPPORT_RESISTANCE', definition: 'Price near the visible window support/resistance reacts.', minCandles: 3 },
];

/** Calibratable default evidence weights (section 6 of the blueprint). */
export const DEFAULT_EVIDENCE_WEIGHTS: Record<string, number> = {
  MARKET_STRUCTURE: 20,
  PRICE_ACTION: 20,
  CANDLE_PATTERNS: 15,
  MOMENTUM: 15,
  INDICATOR_CONFIRMATION: 10,
  CANDLE_SEQUENCE: 10,
  VOLATILITY_DATA_QUALITY: 10,
};

export function describePattern(name: string): PatternDefinition | undefined {
  return PATTERN_KNOWLEDGE.find((p) => p.name === name);
}
