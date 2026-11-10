import React, { useState, useEffect } from 'react';
import { History, Download, Trash2, Search, Filter, RefreshCw } from 'lucide-react';
import { HistoryRecord } from '../types';
import { safeFetch } from '../apiClient';

export const SignalHistoryView: React.FC = () => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [signalFilter, setSignalFilter] = useState<string>('ALL');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await safeFetch<any>('/api/history?limit=100');
      if (data && data.success) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const deleteRecord = async (id: number) => {
    try {
      await safeFetch(`/api/history/${id}`, { method: 'DELETE' });
      setHistory(history.filter((h) => h.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all analysis history?')) return;
    try {
      await safeFetch('/api/history', { method: 'DELETE' });
      setHistory([]);
    } catch (err) {
      console.error(err);
    }
  };

  const exportCSV = () => {
    if (history.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Symbol', 'Timeframe', 'Signal', 'EvidenceScore', 'Trend', 'Model'];
    const rows = history.map((h) => [
      h.id,
      `"${h.timestamp}"`,
      `"${h.symbol}"`,
      `"${h.timeframe}"`,
      `"${h.signal}"`,
      h.evidence_score,
      `"${h.trend || ''}"`,
      `"${h.model_used}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `quotex_analysis_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSignal = signalFilter === 'ALL' || item.signal === signalFilter;
    return matchesSearch && matchesSignal;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" /> Signal Analysis History
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Structured SQLite database logs of all past chart screenshot analyses and signals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={history.length === 0}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs rounded-lg flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={clearAllHistory}
            disabled={history.length === 0}
            className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs rounded-lg flex items-center gap-1.5 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear History
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 w-64">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by asset symbol..."
            className="bg-transparent text-xs text-slate-100 focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Signal:</span>
          {['ALL', 'CALL', 'PUT', 'WAIT'].map((sig) => (
            <button
              key={sig}
              onClick={() => setSignalFilter(sig)}
              className={`px-2.5 py-1 rounded font-mono font-medium transition-colors ${
                signalFilter === sig
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sig}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Asset Symbol</th>
                <th className="p-3">TF</th>
                <th className="p-3">Signal</th>
                <th className="p-3">Quality</th>
                <th className="p-3">Model</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredHistory.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 text-slate-500">#{row.id}</td>
                  <td className="p-3 text-slate-400">{new Date(row.timestamp).toLocaleString()}</td>
                  <td className="p-3 font-semibold text-slate-100">{row.symbol}</td>
                  <td className="p-3 text-cyan-300">{row.timeframe}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.signal === 'CALL'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : row.signal === 'PUT'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {row.signal}
                    </span>
                  </td>
                  <td className="p-3 text-slate-200">{row.evidence_score}%</td>
                  <td className="p-3 text-slate-400">{row.model_used}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => deleteRecord(row.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                    {loading ? 'Loading analysis history...' : 'No analysis records match filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
