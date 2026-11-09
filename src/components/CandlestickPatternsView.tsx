import React, { useEffect, useState } from 'react';
import { Flame, BookOpen, AlertCircle, UploadCloud } from 'lucide-react';
interface Props { selectedSymbol: string; selectedTimeframe: string }
interface Pattern { patternName: string; type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; reliability: string; description: string; invalidationLevel: number }
type Candle = { timestamp: number | string; open: number; high: number; low: number; close: number; volume?: number };
const library = [
  ['Bullish Engulfing','BULLISH','Prior bearish body is engulfed by the current bullish body.','Context: downtrend/support; confirm with subsequent price action.'],
  ['Bearish Engulfing','BEARISH','Prior bullish body is engulfed by the current bearish body.','Context: uptrend/resistance; confirm with subsequent price action.'],
  ['Hammer','BULLISH','Long lower wick and small body near range high.','Context: prior decline; wait for bullish confirmation.'],
  ['Inverted Hammer','BULLISH','Long upper wick and small body after a decline.','Context: prior decline; confirmation is required.'],
  ['Shooting Star','BEARISH','Long upper wick and small body after an advance.','Context: prior advance; confirmation is required.'],
  ['Hanging Man','BEARISH','Long lower wick near the top of an advance.','Context: prior advance; confirmation is required.'],
  ['Morning Star','BULLISH','Three-candle bearish-to-bullish reversal structure.','Context: decline; third candle must recover first candle body.'],
  ['Evening Star','BEARISH','Three-candle bullish-to-bearish reversal structure.','Context: advance; third candle must retrace first candle body.'],
  ['Piercing Line','BULLISH','Bullish candle recovers more than half of prior bearish body.','Context: decline; gaps may be uncommon in continuous markets.'],
  ['Dark Cloud Cover','BEARISH','Bearish candle closes below midpoint of prior bullish body.','Context: advance; gaps may be uncommon in continuous markets.'],
  ['Three White Soldiers','BULLISH','Three consecutive rising bullish candles with restrained upper wicks.','Check for late-move exhaustion and nearby resistance.'],
  ['Three Black Crows','BEARISH','Three consecutive falling bearish candles with restrained lower wicks.','Check for late-move exhaustion and nearby support.'],
  ['Doji','NEUTRAL','Open and close are close relative to full candle range.','Indecision only; wait for confirmation.'],
  ['Inside Bar','NEUTRAL','Current candle range is contained within prior range.','Compression; direction is unknown until breakout.'],
  ['Outside Bar','NEUTRAL','Current candle range exceeds prior high and low.','Volatility expansion; direction requires context.'],
  ['Marubozu','NEUTRAL','Large body with small wicks; direction can be up or down.','Momentum evidence only; not a standalone entry signal.'],
] as const;
export const CandlestickPatternsView: React.FC<Props> = ({ selectedSymbol, selectedTimeframe }) => {
  const [candlesJson, setCandlesJson] = useState('');
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const calculate = async () => {
    setError(''); setPatterns([]);
    let candles: Candle[];
    try { const parsed = JSON.parse(candlesJson); if (!Array.isArray(parsed)) throw new Error('Expected a JSON array.'); candles = parsed; }
    catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON'); return; }
    if (candles.length < 3) { setError('Provide at least 3 genuine OHLC candles.'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/analyze-technical', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe, candles }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Pattern calculation failed');
      setPatterns(data.candlestickPatterns); setSource(data.dataSource);
    } catch (e) { setError(e instanceof Error ? e.message : 'Pattern calculation failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setPatterns([]); setSource(''); }, [selectedSymbol, selectedTimeframe]);
  return <div className="p-6 space-y-6 max-w-7xl mx-auto">
    <div className="border-b border-slate-800 pb-4"><h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><Flame className="w-5 h-5 text-amber-400"/>Candlestick Recognition Engine</h2>
      <p className="text-xs text-slate-400 mt-0.5">Pattern checks use supplied OHLC only. A pattern is not a standalone trading signal.</p></div>
    <section className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><label htmlFor="pattern-candles" className="text-xs text-slate-300">OHLC JSON · {selectedSymbol} · {selectedTimeframe}</label>
      <textarea id="pattern-candles" rows={4} value={candlesJson} onChange={e => setCandlesJson(e.target.value)} placeholder={'[{"timestamp":1,"open":10,"high":12,"low":9,"close":11}]'} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono"/>
      <div className="flex gap-2"><label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs cursor-pointer"><UploadCloud className="w-4 h-4"/>Import JSON<input className="hidden" type="file" accept=".json,application/json" onChange={async e => { const f=e.target.files?.[0]; if(f) setCandlesJson(await f.text()); e.currentTarget.value=''; }}/></label>
        <button onClick={calculate} disabled={loading} className="px-4 py-2 bg-cyan-500 text-slate-950 rounded-lg text-xs font-semibold">{loading?'Calculating…':'Detect patterns'}</button></div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}{source && <p className="text-xs text-emerald-300">Source: {source}</p>}</section>
    <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><h3 className="font-semibold text-sm">Detected patterns ({patterns.length})</h3>
      {!patterns.length ? <p className="text-xs text-slate-400">No calculated patterns to show; provide candles and run detection.</p> : patterns.map((p,i)=><div key={`${p.patternName}-${i}`} className="p-3 bg-slate-950 rounded-lg border border-slate-800"><strong className="text-xs">{p.patternName} · {p.type}</strong><p className="text-xs text-slate-400 mt-1">{p.description}</p><p className="text-xs text-slate-500 mt-1">Invalidation: {p.invalidationLevel} · {p.reliability} reliability</p></div>)}</div>
    <section className="space-y-3"><h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-cyan-400"/>Pattern reference</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{library.map(([name,type,rule,confirmation])=><article key={name} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2"><div className="flex justify-between text-xs"><strong>{name}</strong><span>{type}</span></div><p className="text-xs text-slate-400">{rule}</p><p className="text-[11px] text-slate-500 border-t border-slate-800 pt-2"><AlertCircle className="inline w-3 h-3 mr-1"/>{confirmation}</p></article>)}</div>
    </section>
  </div>;
};
