import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2, Layers } from 'lucide-react';

interface MtgChain {
  id: number;
  created_at: string;
  updated_at: string;
  symbol: string;
  timeframe: string;
  level0_signal: string;
  level0_confidence: number;
  level0_outcome: string | null;
  level1_signal: string | null;
  level1_confidence: number | null;
  level1_outcome: string | null;
  level2_signal: string | null;
  level2_confidence: number | null;
  level2_outcome: string | null;
  status: string;
}

const outcomeTone = (o: string | null) =>
  o === 'WIN' ? 'text-emerald-300' : o === 'LOSS' ? 'text-rose-300' : o === 'PENDING' ? 'text-amber-300' : 'text-slate-500';

/**
 * MTG Tracker — persistent recovery chains from the mtg_chains table.
 * Outcomes are reported manually after visual verification; nothing is auto-won,
 * and stakes are never increased automatically.
 */
export const MtgTrackerView: React.FC = () => {
  const [chains, setChains] = useState<MtgChain[]>([]);
  const [stats, setStats] = useState<Array<{ status: string; count: number }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/mtg?limit=100');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setChains(data.chains);
      setStats(data.stats);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load MTG chains.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const recordOutcome = async (chain: MtgChain, outcome: 'WIN' | 'LOSS') => {
    setError('');
    try {
      const res = await fetch(`/api/mtg/${chain.id}/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to record outcome.'); }
  };

  const remove = async (id: number) => {
    try { await fetch(`/api/mtg/${id}`, { method: 'DELETE' }); await load(); } catch { /* row stays if deletion fails */ }
  };

  const stageLabel = (c: MtgChain) => {
    if (c.level2_outcome) return 'Level 2';
    if (c.level1_outcome) return 'Level 1';
    if (c.level0_outcome && c.level0_outcome !== 'PENDING') return 'Level 0 (outcome set)';
    return 'Level 0 (awaiting outcome)';
  };

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex items-center justify-between">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Visually verified outcomes only · no auto-staking</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><Layers className="h-6 w-6 text-cyan-300" />MTG Recovery Tracker</h2></div>
      <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50"><RefreshCw className="h-4 w-4" />{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {stats.length > 0 && (
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        {stats.map((s) => <span key={s.status} className="border border-slate-700 bg-slate-900 px-3 py-1 font-mono">{s.status}: {s.count}</span>)}
      </div>
    )}
    {error && <p className="mb-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {chains.length === 0 && !loading ? (
      <p className="border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-500">No MTG chains yet. Chains are created when you start recovery tracking after a verified loss.</p>
    ) : (
      <div className="space-y-3">
        {chains.map((c) => (
          <article key={c.id} className="border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stageLabel(c)} · {c.symbol} · {c.timeframe}</p>
                <p className="mt-1 font-mono text-sm">L0: <span className={outcomeTone(c.level0_outcome)}>{c.level0_signal} {c.level0_confidence}% [{c.level0_outcome ?? 'PENDING'}]</span>
                  {c.level1_signal && <> → L1: <span className={outcomeTone(c.level1_outcome)}>{c.level1_signal} {c.level1_confidence}% [{c.level1_outcome ?? 'PENDING'}]</span></>}
                  {c.level2_signal && <> → L2: <span className={outcomeTone(c.level2_outcome)}>{c.level2_signal} {c.level2_confidence}% [{c.level2_outcome ?? 'PENDING'}]</span></>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.status === 'PENDING' && <>
                  <button onClick={() => void recordOutcome(c, 'WIN')} className="border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">Verify WIN</button>
                  <button onClick={() => void recordOutcome(c, 'LOSS')} className="border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-200">Verify LOSS</button>
                </>}
                <span className={`font-mono text-xs ${c.status === 'COMPLETED' ? 'text-emerald-300' : c.status === 'FAILED' ? 'text-rose-300' : 'text-amber-300'}`}>{c.status}</span>
                <button onClick={() => void remove(c.id)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>;
};
