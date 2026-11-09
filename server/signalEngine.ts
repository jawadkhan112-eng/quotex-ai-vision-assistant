import { OHLC, analyzeTechnicalIndicators, TechnicalIndicatorResults } from './indicators';
import { detectCandlestickPatterns, CandlestickPatternMatch } from './candlesticks';
import { VisionAnalysisResult } from './geminiVision';

export interface FinalSignalResult {
  signal: 'CALL' | 'PUT' | 'WAIT';
  evidenceQualityScore: number; // 0 - 100
  summaryReason: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  indicatorConsensus: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  candlestickMatches: CandlestickPatternMatch[];
  visionInsights?: VisionAnalysisResult;
  invalidationLevel?: number;
  riskNotes: string[];
  disclaimer: string;
}

export function generateFusedSignal(
  candles?: OHLC[],
  visionResult?: VisionAnalysisResult,
  higherTimeframeCandles?: OHLC[]
): FinalSignalResult {
  const supportingEvidence: string[] = [];
  const opposingEvidence: string[] = [];
  const riskNotes: string[] = [];

  let bullishWeight = 0;
  let bearishWeight = 0;
  let maxPossibleWeight = 0;

  // 1. Technical Indicators Confluence
  let techResults: TechnicalIndicatorResults | undefined;
  let candlestickMatches: CandlestickPatternMatch[] = [];

  let indicatorConsensus = {
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    trendBias: 'NEUTRAL' as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  };

  if (candles && candles.length >= 14) {
    techResults = analyzeTechnicalIndicators(candles);
    candlestickMatches = detectCandlestickPatterns(candles);
    const lastClose = candles[candles.length - 1].close;

    // EMA Alignment
    if (techResults.ema9 && techResults.ema21 && techResults.ema50) {
      maxPossibleWeight += 20;
      if (techResults.ema9 > techResults.ema21 && techResults.ema21 > techResults.ema50) {
        bullishWeight += 20;
        indicatorConsensus.bullishCount++;
        supportingEvidence.push(`Bullish EMA Ribbon alignment (EMA9 > EMA21 > EMA50) at ${lastClose.toFixed(5)}`);
      } else if (techResults.ema9 < techResults.ema21 && techResults.ema21 < techResults.ema50) {
        bearishWeight += 20;
        indicatorConsensus.bearishCount++;
        supportingEvidence.push(`Bearish EMA Ribbon alignment (EMA9 < EMA21 < EMA50) at ${lastClose.toFixed(5)}`);
      } else {
        indicatorConsensus.neutralCount++;
        opposingEvidence.push(`Entangled EMA lines indicate rangebound/choppy price action.`);
      }
    }

    // RSI
    if (techResults.rsi14 !== undefined) {
      maxPossibleWeight += 15;
      if (techResults.rsi14 > 50 && techResults.rsi14 < 70) {
        bullishWeight += 15;
        indicatorConsensus.bullishCount++;
        supportingEvidence.push(`RSI(14) is bullish in expansion zone (${techResults.rsi14.toFixed(1)})`);
      } else if (techResults.rsi14 < 50 && techResults.rsi14 > 30) {
        bearishWeight += 15;
        indicatorConsensus.bearishCount++;
        supportingEvidence.push(`RSI(14) is bearish in contraction zone (${techResults.rsi14.toFixed(1)})`);
      } else if (techResults.rsi14 >= 70) {
        opposingEvidence.push(`RSI(14) is overbought at ${techResults.rsi14.toFixed(1)} - exhaustion risk`);
        indicatorConsensus.neutralCount++;
      } else if (techResults.rsi14 <= 30) {
        opposingEvidence.push(`RSI(14) is oversold at ${techResults.rsi14.toFixed(1)} - bounce risk`);
        indicatorConsensus.neutralCount++;
      }
    }

    // MACD
    if (techResults.macd) {
      maxPossibleWeight += 15;
      if (techResults.macd.histogram > 0 && techResults.macd.macdLine > techResults.macd.signalLine) {
        bullishWeight += 15;
        indicatorConsensus.bullishCount++;
        supportingEvidence.push(`MACD positive histogram expansion (${techResults.macd.histogram.toFixed(6)})`);
      } else if (techResults.macd.histogram < 0 && techResults.macd.macdLine < techResults.macd.signalLine) {
        bearishWeight += 15;
        indicatorConsensus.bearishCount++;
        supportingEvidence.push(`MACD negative histogram expansion (${techResults.macd.histogram.toFixed(6)})`);
      }
    }

    // Candlestick Pattern Weight
    for (const pattern of candlestickMatches) {
      maxPossibleWeight += 15;
      if (pattern.type === 'BULLISH') {
        bullishWeight += 15;
        supportingEvidence.push(`Candlestick Pattern: ${pattern.patternName} (${pattern.description})`);
      } else if (pattern.type === 'BEARISH') {
        bearishWeight += 15;
        supportingEvidence.push(`Candlestick Pattern: ${pattern.patternName} (${pattern.description})`);
      } else {
        opposingEvidence.push(`Candlestick Pattern: ${pattern.patternName} signals market indecision.`);
      }
    }
  }

  // 2. Vision AI Integration
  if (visionResult) {
    maxPossibleWeight += 35;
    if (visionResult.signal === 'CALL') {
      bullishWeight += 35 * (visionResult.evidenceQuality / 100);
      supportingEvidence.push(`AI Vision detected Bullish chart setup (Quality: ${visionResult.evidenceQuality}%)`);
    } else if (visionResult.signal === 'PUT') {
      bearishWeight += 35 * (visionResult.evidenceQuality / 100);
      supportingEvidence.push(`AI Vision detected Bearish chart setup (Quality: ${visionResult.evidenceQuality}%)`);
    } else {
      opposingEvidence.push(`AI Vision output WAIT: ${visionResult.riskNotes || 'Visual evidence incomplete'}`);
    }

    if (visionResult.conflicts && visionResult.conflicts.length > 0) {
      opposingEvidence.push(...visionResult.conflicts);
    }
  }

  // 3. Multi-Timeframe Confirmation
  if (higherTimeframeCandles && higherTimeframeCandles.length >= 10) {
    const htfCloses = higherTimeframeCandles.map((c) => c.close);
    const htfLast = htfCloses[htfCloses.length - 1];
    const htfFirst = htfCloses[0];

    maxPossibleWeight += 15;
    if (htfLast > htfFirst) {
      bullishWeight += 15;
      supportingEvidence.push(`Higher Timeframe trend is Bullish`);
    } else if (htfLast < htfFirst) {
      bearishWeight += 15;
      supportingEvidence.push(`Higher Timeframe trend is Bearish`);
    }
  }

  // Calculate Overall Evidence Quality Score (0 - 100)
  const totalDominantWeight = Math.max(bullishWeight, bearishWeight);
  const rawQuality = maxPossibleWeight > 0 ? (totalDominantWeight / maxPossibleWeight) * 100 : 0;
  const evidenceQualityScore = Math.min(100, Math.round(rawQuality));

  // Determine Consensus Trend Bias
  if (bullishWeight > bearishWeight + 15) {
    indicatorConsensus.trendBias = 'BULLISH';
  } else if (bearishWeight > bullishWeight + 15) {
    indicatorConsensus.trendBias = 'BEARISH';
  } else {
    indicatorConsensus.trendBias = 'NEUTRAL';
  }

  // 4. Default WAIT Decision Matrix
  let finalSignal: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let summaryReason = 'Insufficient or conflicting evidence across indicators, candlestick patterns, and vision AI.';

  const MIN_REQUIRED_QUALITY = 65;

  if (
    bullishWeight > bearishWeight + 20 &&
    evidenceQualityScore >= MIN_REQUIRED_QUALITY &&
    opposingEvidence.length <= 2
  ) {
    finalSignal = 'CALL';
    summaryReason = `Strong Bullish confluence (${evidenceQualityScore}% quality) supported by trend momentum and pattern alignment.`;
  } else if (
    bearishWeight > bullishWeight + 20 &&
    evidenceQualityScore >= MIN_REQUIRED_QUALITY &&
    opposingEvidence.length <= 2
  ) {
    finalSignal = 'PUT';
    summaryReason = `Strong Bearish confluence (${evidenceQualityScore}% quality) supported by trend momentum and pattern alignment.`;
  } else {
    finalSignal = 'WAIT';
    if (opposingEvidence.length > 2) {
      summaryReason = `WAIT recommended: ${opposingEvidence.length} opposing factors or conflicting signals detected.`;
    } else if (evidenceQualityScore < MIN_REQUIRED_QUALITY) {
      summaryReason = `WAIT recommended: Evidence quality score (${evidenceQualityScore}%) is below the safe threshold of ${MIN_REQUIRED_QUALITY}%.`;
    }
  }

  riskNotes.push('Never risk more than 1-2% of total capital per trade.');
  riskNotes.push('Binary options carry market risk. Always wait for candle confirmation at key level boundaries.');

  return {
    signal: finalSignal,
    evidenceQualityScore,
    summaryReason,
    supportingEvidence,
    opposingEvidence,
    indicatorConsensus,
    candlestickMatches,
    visionInsights: visionResult,
    invalidationLevel: candles && candles.length > 0 ? candles[candles.length - 1].low : undefined,
    riskNotes,
    disclaimer:
      'Analysis-only assistant. Evidence score represents technical confluence quality, NOT a guaranteed win rate or profit guarantee.',
  };
}
