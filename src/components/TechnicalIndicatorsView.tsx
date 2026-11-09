import React, { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, Layers, Activity, SlidersHorizontal, UploadCloud } from 'lucide-react';

type Candle = { timestamp: string | number; open: number; high: number; low: number; close: number; volume?: number };
interface IndicatorData {
  ema9?: number; ema21?: number; ema50?: number; sma20?: number; sma50?: number; sma200?: number; rsi14?: number;
  macd?: { macdLine: number; signalLine: number; histogram: number }; atr14?: number; adx14?: number;
  bollingerBands?: { upper: number; middle: number; lower: number; bandwidth: number };
  supertrend?: { value: number; direction: string }; levels?: { support: number[]; resistance: number[] };
  breakoutStatus?: string;
}
interface Props { selectedSymbol: string; selectedTimeframe: string }
const STORAGE_KEY = 'qav-ohlc-data';

export const TechnicalIndicatorsView: React.FC<Props> = ({ selectedSymbol, selectedTimeframe }) => {
  const [loading, setLoading] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorData | null>(null);
  const [fusedSignal, setFusedSignal] = useState<any>(null);
  const [candlesJson, setCandlesJson] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState('');

  const recalculate = async () => {
    setError(''); setIndicators(null); setFusedSignal(null);
    let candles: Candle[];
    try {
      const parsed = JSON.parse(candlesJson);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of OHLC candles.');
      candles = parsed;
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON'); return; }
    if (candles.length < 14) { setError('Enter at least 14 genuine OHLC candles. No sample prices are generated.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/analyze-technical', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe, candles }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Analysis failed (${res.status})`);
      setIndicators(data.indicators); setFusedSignal(data.fusedSignal); setDataSource(data.dataSource || 'Provided OHLC');
      localStorage.setItem(STORAGE_KEY, candlesJson);
    } catch (e) { setError(e instanceof Error ? e.message : 'Technical analysis failed'); }
    finally { setLoading(false); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { setCandlesJson(await file.text()); setError(''); }
    catch { setError('Could not read the selected data file.'); }
  };
  useEffect(() => { setIndicators(null); setFusedSignal(null); }, [selectedSymbol, selectedTimeframe]);

  const value = (n?: number, digits = 5) => n === undefined || !Number.isFinite(n) ? 'Unavailable' : n.toFixed(digits);
  return <div className="p-6 space-y-6 max-w-7xl mx-auto">
    <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-3">
      <div><h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-indigo-400" /> Technical Indicator Engine</h2>
        <p className="text-xs text-slate-400 mt-0.5">Calculations use only OHLC data you provide; no synthetic market prices are generated.</p></div>
      <button onClick={recalculate} disabled={loading} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 rounded-lg flex items-center gap-2 font-medium">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Calculating…' : 'Calculate from OHLC'}
      </button>
    </div>
    <section className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
      <label className="text-xs text-slate-300 font-medium" htmlFor="indicator-candles">Genuine OHLC JSON ({selectedSymbol} · {selectedTimeframe})</label>
      <textarea id="indicator-candles" value={candlesJson} onChange={e => setCandlesJson(e.target.value)} rows={5}
        placeholder={'Paste JSON: [{"timestamp":"2026-01-01T00:00:00Z","open":1.1,"high":1.2,"low":1.0,"close":1.15}]'}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono" />
      <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs text-slate-200 cursor-pointer"><UploadCloud className="w-4 h-4" /> Import OHLC JSON file
        <input type="file" accept=".json,application/json" className="hidden" onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {dataSource && indicators && <p className="text-xs text-emerald-300">Source: {dataSource}; {fusedSignal?.candleCount ?? ''} candles supplied.</p>}
    </section>
    {fusedSignal && <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4"><span className="text-xs text-slate-400">INDICATOR BIAS:</span><span className="text-sm font-bold font-mono text-cyan-300">{fusedSignal.indicatorConsensus?.trendBias || 'NEUTRAL'}</span></div>
      <div className="text-xs font-mono text-slate-300">Bullish {fusedSignal.indicatorConsensus?.bullishCount ?? 0} · Bearish {fusedSignal.indicatorConsensus?.bearishCount ?? 0} · Neutral {fusedSignal.indicatorConsensus?.neutralCount ?? 0}</div>
    </div>}
    {!indicators && !loading && <div className="p-8 text-center rounded-xl border border-dashed border-slate-800 text-slate-400 text-sm">Provide genuine candle data to calculate indicators. Data is not fetched from Quotex.</div>}
    {indicators && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><h3 className="font-semibold text-sm text-slate-200"><Layers className="inline w-4 h-4 text-cyan-400 mr-2"/>Moving Averages</h3>
        {[['EMA 9', indicators.ema9], ['EMA 21', indicators.ema21], ['EMA 50', indicators.ema50], ['SMA 20', indicators.sma20], ['SMA 50', indicators.sma50], ['SMA 200', indicators.sma200]].map(([label, n]) => <div key={String(label)} className="flex justify-between text-xs font-mono"><span className="text-slate-400">{label}</span><span>{value(n as number | undefined)}</span></div>)}</div>
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><h3 className="font-semibold text-sm text-slate-200"><Activity className="inline w-4 h-4 text-indigo-400 mr-2"/>Momentum & Volatility</h3>
        {[['RSI 14', value(indicators.rsi14, 2)], ['MACD', value(indicators.macd?.macdLine, 6)], ['MACD Signal', value(indicators.macd?.signalLine, 6)], ['ADX 14', value(indicators.adx14, 2)], ['ATR 14', value(indicators.atr14)]].map(([label, text]) => <div key={label} className="flex justify-between text-xs font-mono"><span className="text-slate-400">{label}</span><span>{text}</span></div>)}</div>
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><h3 className="font-semibold text-sm text-slate-200"><SlidersHorizontal className="inline w-4 h-4 text-emerald-400 mr-2"/>Levels & Direction</h3>
        <p className="text-xs">Bollinger upper / lower: {value(indicators.bollingerBands?.upper)} / {value(indicators.bollingerBands?.lower)}</p>
        <p className="text-xs">Supertrend: {indicators.supertrend?.direction || 'Unavailable'} ({value(indicators.supertrend?.value)})</p>
        <p className="text-xs">Breakout: {indicators.breakoutStatus || 'Unavailable'}</p>
        <p className="text-xs break-words">Resistance: {indicators.levels?.resistance.join(', ') || 'None detected'}</p>
        <p className="text-xs break-words">Support: {indicators.levels?.support.join(', ') || 'None detected'}</p></div>
    </div>}
  </div>;
};
