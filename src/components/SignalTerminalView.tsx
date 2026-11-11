import React, { useEffect, useState } from 'react';
import { RadioTower, RefreshCw } from 'lucide-react';

interface HistoryRow {
  id: number;
  timestamp: string;
  symbol: string;
  timeframe: string;
  signal: string;
  evidence_score: number;
  chart_readable: number;
  candle_observation: string;
  reasons: string;
}

/**
 * Signal Terminal — real data from /api/history (analysis_history table).
 * Shows the latest generated signals with timestamp, confidence, chart validation,
 * and reasoning. No fabricated entries: rows exist only for analyses actually run.
 */
export const SignalTerminalView: React.FC = () => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/history?limit=50');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRows(data.history);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load signal history.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const tone = (s: string) => s === 'CALL' ? 'text-emerald-300' : s === 'PUT' ? 'text-rose-300' : 'text-amber-300';

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex items-center justify-between">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Persisted · verified · from analysis_history</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><RadioTower className="h-6 w-6 text-cyan-300" />Signal Terminal</h2></div>
      <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50"><RefreshCw className="h-4 w-4" />{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {error && <p className="mb-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {rows.length === 0 && !loading ? <p className="border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-500">No signals recorded yet. Run an analysis in the Live Analyzer — real analyses appear here automatically.</p> : (
      <div className="overflow-x-auto border border-slate-800 bg-slate-900/70">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>{['Time', 'Symbol', 'TF', 'Signal', 'Confidence', 'Chart OK', 'Observation', 'Reasoning'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                <td className="px-3 py-2">{r.symbol}</td>
                <td className="px-3 py-2 font-mono">{r.timeframe}</td>
                <td className={`px-3 py-2 font-bold ${tone(r.signal)}`}>{r.signal}</td>
                <td className="px-3 py-2 font-mono">{r.evidence_score}%</td>
                <td className="px-3 py-2">{r.chart_readable ? '✓' : '✗'}</td>
                <td className="max-w-[280px] truncate px-3 py-2 text-slate-400" title={r.candle_observation}>{r.candle_observation}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-slate-400" title={r.reasons}>{r.reasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>;
};
