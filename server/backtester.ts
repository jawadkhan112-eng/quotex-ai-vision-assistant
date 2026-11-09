import { OHLC, analyzeTechnicalIndicators } from './indicators';
import { detectCandlestickPatterns } from './candlesticks';

export interface BacktestOptions {
  symbol: string;
  timeframe: string;
  expiryCandles: number; // e.g., 1 for 1-minute expiry
  payoutPercentage: number; // e.g., 85 for 85% payout
  evidenceThreshold: number; // e.g. 65
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  totalCandles: number;
  totalSignals: number;
  callCount: number;
  putCount: number;
  waitCount: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  winRate: number; // percentage
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number; // percentage
  breakEvenWinRate: number; // e.g. 54.05% for 85% payout
  equityCurve: { candleIndex: number; equity: number }[];
  trades: {
    entryIndex: number;
    exitIndex: number;
    signal: 'CALL' | 'PUT';
    entryPrice: number;
    exitPrice: number;
    result: 'WIN' | 'LOSS' | 'TIE';
    profit: number;
  }[];
}

export function runStrategyBacktest(
  candles: OHLC[],
  options: BacktestOptions
): BacktestResult {
  const { symbol, timeframe, expiryCandles = 1, payoutPercentage = 85, evidenceThreshold = 65 } = options;

  let callCount = 0;
  let putCount = 0;
  let waitCount = 0;
  let winCount = 0;
  let lossCount = 0;
  let tieCount = 0;

  let currentEquity = 1000;
  let peakEquity = 1000;
  let maxDrawdown = 0;

  const trades: BacktestResult['trades'] = [];
  const equityCurve: BacktestResult['equityCurve'] = [{ candleIndex: 0, equity: 1000 }];

  const breakEvenWinRate = (1 / (1 + payoutPercentage / 100)) * 100;

  // Need at least 50 candles for indicators
  for (let i = 50; i < candles.length - expiryCandles; i++) {
    const historicalSlice = candles.slice(0, i + 1);
    const tech = analyzeTechnicalIndicators(historicalSlice);
    const patterns = detectCandlestickPatterns(historicalSlice);

    const currentCandle = candles[i];
    let bullishScore = 0;
    let bearishScore = 0;

    // Technical scoring without look-ahead
    if (tech.ema9 && tech.ema21 && tech.ema50) {
      if (tech.ema9 > tech.ema21 && tech.ema21 > tech.ema50) bullishScore += 30;
      else if (tech.ema9 < tech.ema21 && tech.ema21 < tech.ema50) bearishScore += 30;
    }

    if (tech.rsi14 !== undefined) {
      if (tech.rsi14 > 50 && tech.rsi14 < 70) bullishScore += 25;
      else if (tech.rsi14 < 50 && tech.rsi14 > 30) bearishScore += 25;
    }

    if (tech.macd) {
      if (tech.macd.histogram > 0) bullishScore += 25;
      else if (tech.macd.histogram < 0) bearishScore += 25;
    }

    for (const p of patterns) {
      if (p.type === 'BULLISH') bullishScore += 20;
      else if (p.type === 'BEARISH') bearishScore += 20;
    }

    let signal: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
    if (bullishScore >= evidenceThreshold && bullishScore > bearishScore + 15) {
      signal = 'CALL';
    } else if (bearishScore >= evidenceThreshold && bearishScore > bullishScore + 15) {
      signal = 'PUT';
    }

    if (signal === 'WAIT') {
      waitCount++;
      continue;
    }

    if (signal === 'CALL') callCount++;
    if (signal === 'PUT') putCount++;

    // Evaluate outcome after expiryCandles
    const entryPrice = currentCandle.close;
    const exitCandle = candles[i + expiryCandles];
    const exitPrice = exitCandle.close;

    const tradeAmount = 10;
    let result: 'WIN' | 'LOSS' | 'TIE' = 'LOSS';
    let profit = -tradeAmount;

    if (signal === 'CALL') {
      if (exitPrice > entryPrice) {
        result = 'WIN';
        profit = tradeAmount * (payoutPercentage / 100);
      } else if (exitPrice === entryPrice) {
        result = 'TIE';
        profit = 0;
      }
    } else if (signal === 'PUT') {
      if (exitPrice < entryPrice) {
        result = 'WIN';
        profit = tradeAmount * (payoutPercentage / 100);
      } else if (exitPrice === entryPrice) {
        result = 'TIE';
        profit = 0;
      }
    }

    if (result === 'WIN') winCount++;
    else if (result === 'LOSS') lossCount++;
    else tieCount++;

    currentEquity += profit;
    if (currentEquity > peakEquity) peakEquity = currentEquity;

    const dd = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({ candleIndex: i, equity: Number(currentEquity.toFixed(2)) });
    trades.push({
      entryIndex: i,
      exitIndex: i + expiryCandles,
      signal,
      entryPrice,
      exitPrice,
      result,
      profit: Number(profit.toFixed(2)),
    });
  }

  const totalSignals = callCount + putCount;
  const winRate = totalSignals > 0 ? (winCount / totalSignals) * 100 : 0;
  const totalProfit = winCount * (10 * (payoutPercentage / 100));
  const totalLoss = lossCount * 10;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;
  const expectancy = totalSignals > 0 ? (totalProfit - totalLoss) / totalSignals : 0;

  return {
    symbol,
    timeframe,
    totalCandles: candles.length,
    totalSignals,
    callCount,
    putCount,
    waitCount,
    winCount,
    lossCount,
    tieCount,
    winRate: Number(winRate.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    breakEvenWinRate: Number(breakEvenWinRate.toFixed(2)),
    equityCurve,
    trades,
  };
}
