import React, { useState, useEffect } from 'react';
import { TrendingUp, RefreshCw, Layers, Activity, SlidersHorizontal } from 'lucide-react';

interface IndicatorData {
  ema9?: number;
  ema21?: number;
  ema50?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  rsi14?: number;
  macd?: { macdLine: number; signalLine: number; histogram: number };
  atr14?: number;
  adx14?: number;
  bollingerBands?: { upper: number; middle: number; lower: number; bandwidth: number };
  supertrend?: { value: number; direction: string };
  levels?: { support: number[]; resistance: number[] };
}

interface TechnicalIndicatorsViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
}

export const TechnicalIndicatorsView: React.FC<TechnicalIndicatorsViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
}) => {
  const [loading, setLoading] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorData | null>(null);
  const [fusedSignal, setFusedSignal] = useState<any>(null);

  const fetchTechnicalData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze-technical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe }),
      });
      const data = await res.json();
      if (data.success) {
        setIndicators(data.indicators);
        setFusedSignal(data.fusedSignal);
      }
    } catch (err) {
      console.error('Failed to load technical indicators:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicalData();
  }, [selectedSymbol, selectedTimeframe]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" /> Technical Indicator Engine
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mathematical technical indicator calculations calculated from validated OHLC candle data.
          </p>
        </div>

        <button
          onClick={fetchTechnicalData}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 rounded-lg flex items-center gap-2 font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recalculate Indicators
        </button>
      </div>

      {/* Indicator Consensus Gauge */}
      {fusedSignal && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-medium">INDICATOR BIAS:</span>
            <span
              className={`text-sm font-bold font-mono px-3 py-1 rounded ${
                fusedSignal.indicatorConsensus?.trendBias === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : fusedSignal.indicatorConsensus?.trendBias === 'BEARISH'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}
            >
              {fusedSignal.indicatorConsensus?.trendBias}
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-slate-500">Bullish Indicators: </span>
              <span className="text-emerald-400 font-bold">{fusedSignal.indicatorConsensus?.bullishCount}</span>
            </div>
            <div>
              <span className="text-slate-500">Bearish Indicators: </span>
              <span className="text-rose-400 font-bold">{fusedSignal.indicatorConsensus?.bearishCount}</span>
            </div>
            <div>
              <span className="text-slate-500">Neutral: </span>
              <span className="text-amber-400 font-bold">{fusedSignal.indicatorConsensus?.neutralCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid Tables */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Trend Indicators */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" /> Moving Averages (Trend)
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">EMA (9):</span>
              <span className="text-cyan-300 font-semibold">{indicators?.ema9?.toFixed(5) || 'Calculating...'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">EMA (21):</span>
              <span className="text-cyan-300 font-semibold">{indicators?.ema21?.toFixed(5) || 'Calculating...'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">EMA (50):</span>
              <span className="text-cyan-300 font-semibold">{indicators?.ema50?.toFixed(5) || 'Calculating...'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">SMA (20):</span>
              <span className="text-slate-300">{indicators?.sma20?.toFixed(5) || 'Calculating...'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">SMA (50):</span>
              <span className="text-slate-300">{indicators?.sma50?.toFixed(5) || 'Calculating...'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">SMA (200):</span>
              <span className="text-slate-300">{indicators?.sma200?.toFixed(5) || 'Calculating...'}</span>
            </div>
          </div>
        </div>

        {/* Momentum & Oscillators */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" /> Momentum & Oscillators
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">RSI (14):</span>
              <span className="text-indigo-300 font-semibold">{indicators?.rsi14?.toFixed(2) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">MACD Line:</span>
              <span className="text-indigo-300">{indicators?.macd?.macdLine.toFixed(6) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">MACD Signal:</span>
              <span className="text-indigo-300">{indicators?.macd?.signalLine.toFixed(6) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">MACD Hist:</span>
              <span className={indicators?.macd?.histogram && indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {indicators?.macd?.histogram.toFixed(6) || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">ADX (14):</span>
              <span className="text-indigo-300">{indicators?.adx14?.toFixed(2) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">ATR (14):</span>
              <span className="text-indigo-300">{indicators?.atr14?.toFixed(5) || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Volatility & Support/Resistance */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" /> Volatility & Support/Resistance
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">BB Upper (20,2):</span>
              <span className="text-emerald-300">{indicators?.bollingerBands?.upper.toFixed(5) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">BB Lower (20,2):</span>
              <span className="text-emerald-300">{indicators?.bollingerBands?.lower.toFixed(5) || 'N/A'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800/80">
              <span className="text-slate-400">Supertrend Dir:</span>
              <span className={indicators?.supertrend?.direction === 'BULLISH' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {indicators?.supertrend?.direction || 'N/A'}
              </span>
            </div>
            <div className="p-2 bg-slate-950 rounded border border-slate-800/80 space-y-1">
              <span className="text-slate-400 block text-[11px]">Key Resistance Levels:</span>
              <div className="flex flex-wrap gap-1 text-[11px] text-rose-300">
                {indicators?.levels?.resistance.map((r, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-rose-500/30">
                    {r}
                  </span>
                )) || 'None detected'}
              </div>
            </div>
            <div className="p-2 bg-slate-950 rounded border border-slate-800/80 space-y-1">
              <span className="text-slate-400 block text-[11px]">Key Support Levels:</span>
              <div className="flex flex-wrap gap-1 text-[11px] text-emerald-300">
                {indicators?.levels?.support.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-emerald-500/30">
                    {s}
                  </span>
                )) || 'None detected'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
