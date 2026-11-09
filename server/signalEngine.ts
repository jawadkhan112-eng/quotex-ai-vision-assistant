import { OHLC, analyzeTechnicalIndicators } from './indicators';
import { detectCandlestickPatterns, CandlestickPatternMatch } from './candlesticks';
import { VisionAnalysisResult } from './geminiVision';
import { getActiveAiConfig } from './apiKeyManager';

export interface FinalSignalResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  evidenceQualityScore: number;
  summaryReason: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  indicatorConsensus: { bullishCount: number; bearishCount: number; neutralCount: number; trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  candlestickMatches: CandlestickPatternMatch[];
  visionInsights?: VisionAnalysisResult;
  invalidationLevel?: number;
  riskNotes: string[];
  disclaimer: string;
}

/**
 * Fuses only supplied candle data and actual AI vision output. The evidence threshold
 * defaults to the saved user setting; callers such as backtests may provide a fixed
 * threshold explicitly to keep a historical run deterministic.
 */
export function generateFusedSignal(
  candles?: OHLC[],
  visionResult?: VisionAnalysisResult,
  higherTimeframeCandles?: OHLC[],
  minimumEvidenceQuality?: number,
): FinalSignalResult {
  const supportingEvidence: string[] = [];
  const opposingEvidence: string[] = [];
  const riskNotes = ['Evidence quality is not a win probability or guarantee.', 'This assistant does not execute trades.'];
  const configuredThreshold = minimumEvidenceQuality ?? getActiveAiConfig().evidenceThreshold;
  const threshold = Number.isFinite(configuredThreshold) ? Math.min(90, Math.max(50, configuredThreshold)) : 65;
  let bullishWeight = 0;
  let bearishWeight = 0;
  let maximumWeight = 0;
  const consensus = { bullishCount: 0, bearishCount: 0, neutralCount: 0, trendBias: 'NEUTRAL' as 'BULLISH' | 'BEARISH' | 'NEUTRAL' };
  let patterns: CandlestickPatternMatch[] = [];

  if (candles && candles.length >= 14) {
    const indicators = analyzeTechnicalIndicators(candles);
    patterns = detectCandlestickPatterns(candles);
    if (indicators.ema9 !== undefined && indicators.ema21 !== undefined && indicators.ema50 !== undefined) {
      maximumWeight += 20;
      if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
        bullishWeight += 20; consensus.bullishCount++; supportingEvidence.push('EMA 9/21/50 bullish alignment.');
      } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
        bearishWeight += 20; consensus.bearishCount++; supportingEvidence.push('EMA 9/21/50 bearish alignment.');
      } else { consensus.neutralCount++; opposingEvidence.push('EMA averages are mixed.'); }
    }
    if (indicators.rsi14 !== undefined) {
      maximumWeight += 15;
      if (indicators.rsi14 > 50 && indicators.rsi14 < 70) { bullishWeight += 15; consensus.bullishCount++; supportingEvidence.push(`RSI(14) is bullish at ${indicators.rsi14.toFixed(1)}.`); }
      else if (indicators.rsi14 < 50 && indicators.rsi14 > 30) { bearishWeight += 15; consensus.bearishCount++; supportingEvidence.push(`RSI(14) is bearish at ${indicators.rsi14.toFixed(1)}.`); }
      else { consensus.neutralCount++; opposingEvidence.push(`RSI(14) at ${indicators.rsi14.toFixed(1)} signals an extreme/neutral zone.`); }
    }
    if (indicators.macd) {
      maximumWeight += 15;
      if (indicators.macd.histogram > 0) { bullishWeight += 15; consensus.bullishCount++; supportingEvidence.push('MACD histogram is positive.'); }
      else if (indicators.macd.histogram < 0) { bearishWeight += 15; consensus.bearishCount++; supportingEvidence.push('MACD histogram is negative.'); }
      else consensus.neutralCount++;
    }
    // Patterns contribute one bounded vote per direction, not unbounded votes for
    // several overlapping classifications of the same three candles.
    const bullishPattern = patterns.some(p => p.type === 'BULLISH');
    const bearishPattern = patterns.some(p => p.type === 'BEARISH');
    if (bullishPattern || bearishPattern) maximumWeight += 15;
    if (bullishPattern && bearishPattern) opposingEvidence.push('Candlestick rules detected conflicting bullish and bearish formations.');
    else if (bullishPattern) { bullishWeight += 15; supportingEvidence.push(`Bullish pattern: ${patterns.find(p => p.type === 'BULLISH')?.patternName}.`); }
    else if (bearishPattern) { bearishWeight += 15; supportingEvidence.push(`Bearish pattern: ${patterns.find(p => p.type === 'BEARISH')?.patternName}.`); }
    if (patterns.some(p => p.type === 'NEUTRAL')) opposingEvidence.push('A neutral candlestick formation indicates indecision.');
  }

  if (visionResult) {
    maximumWeight += 35;
    const quality = Number.isFinite(visionResult.evidenceQuality) ? Math.max(0, Math.min(100, visionResult.evidenceQuality)) : 0;
    if (!visionResult.chartReadable || quality < 60) opposingEvidence.push('Vision image is unreadable or its evidence quality is below 60/100.');
    else if (visionResult.signal === 'CALL') { bullishWeight += 35 * quality / 100; supportingEvidence.push(`Vision model reported CALL with ${quality}/100 visual evidence quality.`); }
    else if (visionResult.signal === 'PUT') { bearishWeight += 35 * quality / 100; supportingEvidence.push(`Vision model reported PUT with ${quality}/100 visual evidence quality.`); }
    else opposingEvidence.push(`Vision model returned WAIT: ${visionResult.riskNotes || 'visual evidence is inconclusive'}`);
    opposingEvidence.push(...(visionResult.conflicts || []));
    opposingEvidence.push(...(visionResult.opposingEvidence || []));
  }

  if (higherTimeframeCandles && higherTimeframeCandles.length >= 10) {
    maximumWeight += 15;
    const first = higherTimeframeCandles[0].close;
    const last = higherTimeframeCandles[higherTimeframeCandles.length - 1].close;
    if (last > first) { bullishWeight += 15; supportingEvidence.push('Supplied higher-timeframe candles trend upward.'); }
    else if (last < first) { bearishWeight += 15; supportingEvidence.push('Supplied higher-timeframe candles trend downward.'); }
    else opposingEvidence.push('Supplied higher-timeframe candles are unchanged.');
  }

  const score = maximumWeight ? Math.min(100, Math.round(Math.max(bullishWeight, bearishWeight) / maximumWeight * 100)) : 0;
  if (bullishWeight > bearishWeight + 20) consensus.trendBias = 'BULLISH';
  else if (bearishWeight > bullishWeight + 20) consensus.trendBias = 'BEARISH';
  const conflicted = bullishWeight > 0 && bearishWeight > 0 && Math.min(bullishWeight, bearishWeight) / Math.max(bullishWeight, bearishWeight) > 0.6;
  let signal: FinalSignalResult['signal'] = 'WAIT';
  let summaryReason = !maximumWeight ? 'No genuine candle or vision evidence was supplied; WAIT.' : `WAIT: evidence quality ${score}/100 is below the configured ${threshold}/100 threshold or evidence is conflicting.`;
  if (score >= threshold && opposingEvidence.length <= 2 && !conflicted && bullishWeight > bearishWeight + 20) {
    signal = 'CALL'; summaryReason = `CALL: bullish evidence confluence ${score}/100 meets the configured threshold (${threshold}/100).`;
  } else if (score >= threshold && opposingEvidence.length <= 2 && !conflicted && bearishWeight > bullishWeight + 20) {
    signal = 'PUT'; summaryReason = `PUT: bearish evidence confluence ${score}/100 meets the configured threshold (${threshold}/100).`;
  }
  if (!candles?.length) riskNotes.push('No OHLC candle data supplied; technical indicators and candlestick confirmations are unavailable.');
  return { signal, evidenceQualityScore: score, summaryReason, supportingEvidence, opposingEvidence,
    indicatorConsensus: consensus, candlestickMatches: patterns, visionInsights: visionResult,
    invalidationLevel: candles?.length ? candles[candles.length - 1].low : undefined,
    riskNotes, disclaimer: 'Analysis only. Evidence quality is a confluence score, not a probability of success or profit guarantee.' };
}
