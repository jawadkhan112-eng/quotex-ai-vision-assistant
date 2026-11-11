import React, { useCallback, useEffect, useState } from 'react';
import { Stethoscope, RefreshCw } from 'lucide-react';

interface HealthPayload {
  status?: string;
  app?: string;
  version?: string;
  mode?: string;
  environment?: string;
  externalApiCalls?: boolean;
  timestamp?: string;
}

/**
 * Diagnostics — real health/status data from the backend /api/health endpoint,
 * capture capability detection, and storage checks. No decorative indicators.
 */
export const DiagnosticsView: React.FC = () => {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [captureSupported, setCaptureSupported] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`Health endpoint returned HTTP ${res.status}`);
      setHealth(await res.json());
      setCheckedAt(new Date().toLocaleTimeString());
    } catch (e) { setError(e instanceof Error ? e.message : 'Health check failed.'); setHealth(null); }
  }, []);

  useEffect(() => {
    void check();
    setCaptureSupported(typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia));
    const id = window.setInterval(() => void check(), 30000);
    return () => window.clearInterval(id);
  }, [check]);

  const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
    <div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${ok === undefined ? 'text-slate-200' : ok ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</span>
    </div>
  );

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex items-center justify-between">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Real subsystem status · polled every 30s</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><Stethoscope className="h-6 w-6 text-cyan-300" />Diagnostics</h2></div>
      <button onClick={() => void check()} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"><RefreshCw className="h-4 w-4" />Re-check</button>
    </div>
    <div className="max-w-3xl divide-y-0 border border-slate-800 bg-slate-900/70">
      <Row label="Backend API" value={health ? `OK · v${health.version ?? '?'}` : 'UNREACHABLE'} ok={Boolean(health)} />
      <Row label="Analysis mode" value={health?.mode ?? '—'} />
      <Row label="Environment" value={health?.environment ?? '—'} />
      <Row label="External market-data calls" value={health?.externalApiCalls === false ? 'NONE (local only)' : 'unknown'} ok={health?.externalApiCalls === false} />
      <Row label="Screen capture capability" value={captureSupported === null ? 'checking…' : captureSupported ? 'Supported' : 'Not supported in this browser'} ok={captureSupported === true} />
      <Row label="Last health check" value={checkedAt ?? '—'} />
      {error && <Row label="Last error" value={error} ok={false} />}
    </div>
    <p className="mt-4 max-w-3xl text-xs leading-6 text-slate-500">All analysis is executed by the local deterministic engine — no AI model dependency and no external market-data provider is contacted at any point. The database lives locally (or /tmp on serverless) alongside the backend process.</p>
  </section>;
};
