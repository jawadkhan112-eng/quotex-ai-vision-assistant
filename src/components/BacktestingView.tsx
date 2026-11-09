import React, { useState } from 'react';
import { BarChart3, Play, RefreshCw, AlertTriangle, UploadCloud } from 'lucide-react';
interface Props { selectedSymbol: string; selectedTimeframe: string }
type Candle = { timestamp: string | number; open: number; high: number; low: number; close: number; volume?: number };
export const BacktestingView: React.FC<Props> = ({ selectedSymbol, selectedTimeframe }) => {
  const [expiryCandles, setExpiryCandles] = useState(1);
  const [payoutPercentage, setPayoutPercentage] = useState(85);
  const [evidenceThreshold, setEvidenceThreshold] = useState(65);
  const [candlesJson, setCandlesJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const runBacktest = async () => {
    setError(''); setResult(null);
    let candles: Candle[];
    try { const parsed = JSON.parse(candlesJson); if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of historical candles.'); candles = parsed; }
    catch (e) { setError(e instanceof Error ? e.message : 'Invalid historical data JSON'); return; }
    if (candles.length < 51) { setError('At least 51 genuine historical candles are required. No sample prices are generated.'); return; }
    if (payoutPercentage <= 0 || payoutPercentage > 100) { setError('Payout must be greater than 0 and no more than 100%.'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe, expiryCandles, payoutPercentage, evidenceThreshold, candles }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Backtest failed (${response.status})`);
      setResult(data.backtest);
    } catch (e) { setError(e instanceof Error ? e.message : 'Backtest failed'); }
    finally { setLoading(false); }
  };
  return <div className="p-6 space-y-6 max-w-7xl mx-auto">
    <div className="border-b border-slate-800 pb-4"><h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-400"/>Strategy Backtesting Suite</h2>
      <p className="text-xs text-slate-400 mt-0.5">Historical simulation requires genuine OHLC input; no synthetic candles or future data are added.</p></div>
    <section className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"><label htmlFor="backtest-candles" className="text-xs text-slate-300">Historical OHLC JSON · {selectedSymbol} · {selectedTimeframe}</label>
      <textarea id="backtest-candles" rows={5} value={candlesJson} onChange={e=>setCandlesJson(e.target.value)} placeholder={'Paste a JSON array of at least 51 candles: [{"timestamp":"...","open":1,"high":2,"low":0.5,"close":1.5}]'} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono"/>
      <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs cursor-pointer"><UploadCloud className="w-4 h-4"/>Import OHLC JSON<input className="hidden" type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files?.[0];if(f)setCandlesJson(await f.text());e.currentTarget.value='';}}/></label>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs">
        <label className="text-slate-400">Expiry (candles)<select value={expiryCandles} onChange={e=>setExpiryCandles(Number(e.target.value))} className="block w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"><option value={1}>1</option><option value={2}>2</option><option value={5}>5</option></select></label>
        <label className="text-slate-400">Payout (%)<input type="number" min="1" max="100" value={payoutPercentage} onChange={e=>setPayoutPercentage(Number(e.target.value))} className="block w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"/></label>
        <label className="text-slate-400">Evidence threshold<input type="number" min="0" max="100" value={evidenceThreshold} onChange={e=>setEvidenceThreshold(Number(e.target.value))} className="block w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"/></label>
        <button onClick={runBacktest} disabled={loading} className="py-2.5 px-4 bg-cyan-500 text-slate-950 font-semibold rounded-lg flex items-center justify-center gap-2">{loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<Play className="w-4 h-4"/>}{loading?'Running…':'Run historical backtest'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4"/>{error}</p>}
    </section>
    {result && <div className="space-y-4"><p className="text-xs text-amber-300">Simulation on supplied historical candles; past results do not guarantee future outcomes.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">{[['Win rate',`${result.winRate}%`],['Profit factor',result.profitFactor],['Signals',result.totalSignals],['Max drawdown',`${result.maxDrawdown}%`]].map(([label,value])=><div key={label} className="p-4 rounded-xl bg-slate-900 border border-slate-800"><span className="text-slate-400">{label}</span><p className="text-xl font-mono mt-1">{value}</p></div>)}</div>
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs">CALL {result.callCount} · PUT {result.putCount} · WAIT {result.waitCount} · Wins {result.winCount} · Losses {result.lossCount} · Ties {result.tieCount}</div>
    </div>}
  </div>;
};
