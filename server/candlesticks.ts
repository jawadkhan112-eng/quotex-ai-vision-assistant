import { OHLC } from './indicators';

export interface CandlestickPatternMatch {
  patternName: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  invalidationLevel: number;
}

export function detectCandlestickPatterns(candles: OHLC[]): CandlestickPatternMatch[] {
  if (candles.length < 3) return [];

  const matches: CandlestickPatternMatch[] = [];

  const c1 = candles[candles.length - 3]; // 2 candles ago
  const c2 = candles[candles.length - 2]; // Previous candle
  const c3 = candles[candles.length - 1]; // Current candle

  const getBody = (c: OHLC) => Math.abs(c.close - c.open);
  const getUpperWick = (c: OHLC) => c.high - Math.max(c.open, c.close);
  const getLowerWick = (c: OHLC) => Math.min(c.open, c.close) - c.low;
  const getRange = (c: OHLC) => c.high - c.low;
  const isBullish = (c: OHLC) => c.close > c.open;
  const isBearish = (c: OHLC) => c.open > c.close;

  const range3 = getRange(c3);
  const body3 = getBody(c3);
  const upperWick3 = getUpperWick(c3);
  const lowerWick3 = getLowerWick(c3);

  // 1. DOJI (Single Candle)
  if (range3 > 0 && body3 / range3 <= 0.1) {
    matches.push({
      patternName: 'Doji',
      type: 'NEUTRAL',
      reliability: 'MEDIUM',
      description: 'Indecision candle with tiny body relative to total wick range.',
      invalidationLevel: c3.high,
    });
  }

  // 2. MARUBOZU (Single Candle)
  if (range3 > 0 && body3 / range3 >= 0.85) {
    const isBull = isBullish(c3);
    matches.push({
      patternName: isBull ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type: isBull ? 'BULLISH' : 'BEARISH',
      reliability: 'HIGH',
      description: `Strong directional body with minimal wicks indicating strong momentum.`,
      invalidationLevel: isBull ? c3.low : c3.high,
    });
  }

  // 3. HAMMER (Single Candle)
  if (
    range3 > 0 &&
    lowerWick3 >= 2 * body3 &&
    upperWick3 <= 0.5 * body3 &&
    isBearish(c2) // Prior downtrend condition
  ) {
    matches.push({
      patternName: 'Hammer',
      type: 'BULLISH',
      reliability: 'HIGH',
      description: 'Long lower wick rejecting lower prices during downtrend.',
      invalidationLevel: c3.low,
    });
  }

  // 4. SHOOTING STAR (Single Candle)
  if (
    range3 > 0 &&
    upperWick3 >= 2 * body3 &&
    lowerWick3 <= 0.25 * body3 &&
    isBullish(c2) // Prior uptrend condition
  ) {
    matches.push({
      patternName: 'Shooting Star',
      type: 'BEARISH',
      reliability: 'HIGH',
      description: 'Long upper wick rejecting higher prices at resistance.',
      invalidationLevel: c3.high,
    });
  }

  // 5. INVERTED HAMMER
  if (
    range3 > 0 &&
    upperWick3 >= 2 * body3 &&
    lowerWick3 <= 0.2 * body3 &&
    isBearish(c2)
  ) {
    matches.push({
      patternName: 'Inverted Hammer',
      type: 'BULLISH',
      reliability: 'MEDIUM',
      description: 'Potential bullish reversal attempt after downtrend.',
      invalidationLevel: c3.low,
    });
  }

  // 6. HANGING MAN
  if (
    range3 > 0 &&
    lowerWick3 >= 2 * body3 &&
    upperWick3 <= 0.2 * body3 &&
    isBullish(c2)
  ) {
    matches.push({
      patternName: 'Hanging Man',
      type: 'BEARISH',
      reliability: 'MEDIUM',
      description: 'Selling pressure emerging at top of uptrend.',
      invalidationLevel: c3.high,
    });
  }

  // 7. BULLISH ENGULFING (2 Candles)
  if (
    isBearish(c2) &&
    isBullish(c3) &&
    c3.close > c2.open &&
    c3.open < c2.close
  ) {
    matches.push({
      patternName: 'Bullish Engulfing',
      type: 'BULLISH',
      reliability: 'HIGH',
      description: 'Large bullish candle completely engulfs previous bearish body.',
      invalidationLevel: Math.min(c2.low, c3.low),
    });
  }

  // 8. BEARISH ENGULFING (2 Candles)
  if (
    isBullish(c2) &&
    isBearish(c3) &&
    c3.open > c2.close &&
    c3.close < c2.open
  ) {
    matches.push({
      patternName: 'Bearish Engulfing',
      type: 'BEARISH',
      reliability: 'HIGH',
      description: 'Large bearish candle completely engulfs previous bullish body.',
      invalidationLevel: Math.max(c2.high, c3.high),
    });
  }

  // 9. PIERCING LINE (2 Candles)
  if (
    isBearish(c2) &&
    isBullish(c3) &&
    c3.open < c2.low &&
    c3.close > c2.open - getBody(c2) * 0.5 &&
    c3.close < c2.open
  ) {
    matches.push({
      patternName: 'Piercing Line',
      type: 'BULLISH',
      reliability: 'HIGH',
      description: 'Bullish candle opens below prior low and closes above 50% midpoint.',
      invalidationLevel: c3.low,
    });
  }

  // 10. DARK CLOUD COVER (2 Candles)
  if (
    isBullish(c2) &&
    isBearish(c3) &&
    c3.open > c2.high &&
    c3.close < c2.close - getBody(c2) * 0.5 &&
    c3.close > c2.open
  ) {
    matches.push({
      patternName: 'Dark Cloud Cover',
      type: 'BEARISH',
      reliability: 'HIGH',
      description: 'Bearish candle opens above prior high and closes below 50% midpoint.',
      invalidationLevel: c3.high,
    });
  }

  // 11. INSIDE BAR (2 Candles)
  if (c3.high <= c2.high && c3.low >= c2.low) {
    matches.push({
      patternName: 'Inside Bar',
      type: 'NEUTRAL',
      reliability: 'MEDIUM',
      description: 'Consolidation inside prior candle high-low range.',
      invalidationLevel: c2.high,
    });
  }

  // 12. OUTSIDE BAR (2 Candles)
  if (c3.high > c2.high && c3.low < c2.low) {
    matches.push({
      patternName: 'Outside Bar',
      type: isBullish(c3) ? 'BULLISH' : 'BEARISH',
      reliability: 'MEDIUM',
      description: 'Expanded volatility wrapping completely around previous range.',
      invalidationLevel: c3.low,
    });
  }

  // 13. MORNING STAR (3 Candles)
  if (
    isBearish(c1) &&
    getBody(c2) < getBody(c1) * 0.3 &&
    isBullish(c3) &&
    c3.close > c1.open - getBody(c1) * 0.5
  ) {
    matches.push({
      patternName: 'Morning Star',
      type: 'BULLISH',
      reliability: 'HIGH',
      description: '3-candle bullish reversal: Bearish -> Small star -> Strong bullish close.',
      invalidationLevel: Math.min(c1.low, c2.low, c3.low),
    });
  }

  // 14. EVENING STAR (3 Candles)
  if (
    isBullish(c1) &&
    getBody(c2) < getBody(c1) * 0.3 &&
    isBearish(c3) &&
    c3.close < c1.close - getBody(c1) * 0.5
  ) {
    matches.push({
      patternName: 'Evening Star',
      type: 'BEARISH',
      reliability: 'HIGH',
      description: '3-candle bearish reversal: Bullish -> Small star -> Strong bearish close.',
      invalidationLevel: Math.max(c1.high, c2.high, c3.high),
    });
  }

  // 15. THREE WHITE SOLDIERS (3 Candles)
  if (
    isBullish(c1) &&
    isBullish(c2) &&
    isBullish(c3) &&
    c2.close > c1.close &&
    c3.close > c2.close &&
    getUpperWick(c1) < getBody(c1) * 0.4 &&
    getUpperWick(c2) < getBody(c2) * 0.4 &&
    getUpperWick(c3) < getBody(c3) * 0.4
  ) {
    matches.push({
      patternName: 'Three White Soldiers',
      type: 'BULLISH',
      reliability: 'HIGH',
      description: 'Three consecutive strong bullish candles with minimal upper wicks.',
      invalidationLevel: c1.open,
    });
  }

  // 16. THREE BLACK CROWS (3 Candles)
  if (
    isBearish(c1) &&
    isBearish(c2) &&
    isBearish(c3) &&
    c2.close < c1.close &&
    c3.close < c2.close &&
    getLowerWick(c1) < getBody(c1) * 0.4 &&
    getLowerWick(c2) < getBody(c2) * 0.4 &&
    getLowerWick(c3) < getBody(c3) * 0.4
  ) {
    matches.push({
      patternName: 'Three Black Crows',
      type: 'BEARISH',
      reliability: 'HIGH',
      description: 'Three consecutive strong bearish candles closing near lows.',
      invalidationLevel: c1.open,
    });
  }

  return matches;
}
