import React, { useEffect, useState } from 'react';
import { Bell, BellRing, RefreshCw } from 'lucide-react';
import { alertManager, type InAppAlert } from '../services/alertManager';

/**
 * Alerts Center — real in-app alert history from the AlertManager singleton,
 * plus persisted alert_log rows from the backend. Shows honest delivery channels.
 */
export const AlertsCenterView: React.FC = () => {
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const [permission, setPermission] = useState<string>(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  const [logRows, setLogRows] = useState<Array<{ id: number; created_at: string; signal_id: string; channel: string }>>([]);
  const [error, setError] = useState('');

  const refresh = async () => {
    setAlerts(alertManager.getHistory());
    try {
      const res = await fetch('/api/alerts?limit=50');
      const data = await res.json();
      if (data.success) setLogRows(data.alerts);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load alert log.'); }
  };
  useEffect(() => {
    refresh();
    const off = alertManager.onAlert(() => setAlerts(alertManager.getHistory()));
    return () => { off(); };
  }, []);

  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) { setError('Browser notifications are not supported in this browser.'); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'denied') setError('Notification permission was denied. In-app and sound alerts continue to work.');
  };

  const testAlert = async () => {
    await alertManager.dispatch({
      signalId: `TEST-${Date.now()}`, signal: 'WAIT', actionBadge: '🟡 TEST ALERT',
      confidenceScore: 0, expiryLabel: 'n/a', timingStatus: 'UNVERIFIED', timeframe: 'TEST',
      reasoning: 'This is a test alert triggered by you to verify sound and notification delivery.',
    });
    refresh();
  };

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex items-center justify-between">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Duplicate-prevented · honest channel reporting</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><BellRing className="h-6 w-6 text-cyan-300" />Alerts Center</h2></div>
      <div className="flex gap-2">
        <button onClick={() => void refresh()} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"><RefreshCw className="h-4 w-4" />Refresh</button>
        <button onClick={() => void testAlert()} className="border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">Send test alert</button>
      </div>
    </div>
    <div className="mb-5 border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Browser notifications</p>
      <div className="mt-2 flex items-center gap-3">
        <span className={`font-mono text-sm ${permission === 'granted' ? 'text-emerald-300' : permission === 'denied' ? 'text-rose-300' : 'text-amber-300'}`}>{permission}</span>
        {permission !== 'granted' && permission !== 'unsupported' && (
          <button onClick={() => void enableNotifications()} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-200"><Bell className="h-4 w-4" />Enable notifications</button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">If permission is denied, in-app and sound alerts continue. Sound and browser alerts respect the quiet-mode toggle in the Live Analyzer header.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Session alert history ({alerts.length})</p>
        {alerts.length === 0 ? <p className="mt-3 text-sm text-slate-500">No alerts yet in this session. Final signals from Live monitoring appear here.</p> : (
          <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
            {alerts.map((a, i) => (
              <li key={`${a.signalId}-${i}`} className="border border-slate-800 bg-slate-950 p-3 text-xs">
                <p className="font-mono font-bold">{a.actionBadge} · {a.confidenceScore}% · {a.timeframe}</p>
                <p className="mt-1 font-mono text-slate-500">{a.receivedAt} · channels: {a.channel} · timing {a.timingStatus}</p>
                <p className="mt-1 text-slate-400">{a.reasoning.slice(0, 120)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Persisted alert log ({logRows.length})</p>
        {logRows.length === 0 ? <p className="mt-3 text-sm text-slate-500">No persisted alert records yet.</p> : (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-2 py-1.5">Time</th><th className="px-2 py-1.5">Signal ID</th><th className="px-2 py-1.5">Channel</th></tr></thead>
            <tbody>{logRows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60">
                <td className="px-2 py-1.5 font-mono text-slate-400">{new Date(r.created_at).toLocaleTimeString()}</td>
                <td className="px-2 py-1.5 font-mono text-slate-300">{r.signal_id}</td>
                <td className="px-2 py-1.5">{r.channel}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  </section>;
};
