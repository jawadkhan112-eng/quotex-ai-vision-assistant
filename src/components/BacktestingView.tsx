import React, { useState } from 'react';
import { BarChart3, Play, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { safeFetch } from '../apiClient';

interface BacktestingViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
}

export const BacktestingView: React.FC<BacktestingViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
}) => {
  const [expiryCandles, setExpiryCandles] = useState(1);
  const [payoutPercentage, setPayoutPercentage] = useState(85);
  const [evidenceThreshold, setEvidenceThreshold] = useState(65);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runBacktest = async () => {
    setLoading(true);
    try {
      const data = await safeFetch<any>('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          expiryCandles,
          payoutPercentage,
          evidenceThreshold,
          useTestFixture: true,
        }),
      });

      if (data && data.success) {
        setResult(data.backtest);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" /> Strategy Backtesting Suite
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulate technical signal strategy parameters over historical OHLC market candles without look-ahead bias.
          </p>
        </div>
      </div>

      {/* Parameter Controls */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
        <div>
          <label className="text-slate-400 block mb-1 font-medium">Expiry Duration (Candles):</label>
          <select
            value={expiryCandles}
            onChange={(e) => setExpiryCandles(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
          >
            <option value={1}>1 Candle Expiry (e.g., 1M)</option>
            <option value={2}>2 Candles Expiry</option>
            <option value={5}>5 Candles Expiry</option>
          </select>
        </div>

        <div>
          <label className="text-slate-400 block mb-1 font-medium">Broker Payout (%):</label>
          <input
            type="number"
            value={payoutPercentage}
            onChange={(e) => setPayoutPercentage(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1 font-medium">Min Evidence Threshold (%):</label>
          <input
            type="number"
            value={evidenceThreshold}
            onChange={(e) => setEvidenceThreshold(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
          />
        </div>

        <div>
          <button
            onClick={runBacktest}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {loading ? 'Running Strategy Simulation...' : 'Execute Backtest'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-6">
          {/* Performance Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">WIN RATE</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">{result.winRate}%</div>
              <span className="text-[11px] text-slate-500 font-mono">Break-Even: {result.breakEvenWinRate}%</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">PROFIT FACTOR</span>
              <div className="text-2xl font-bold font-mono text-cyan-400">{result.profitFactor}</div>
              <span className="text-[11px] text-slate-500 font-mono">Expectancy: ${result.expectancy}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">TOTAL SIGNALS</span>
              <div className="text-2xl font-bold font-mono text-slate-100">{result.totalSignals}</div>
              <span className="text-[11px] text-slate-500 font-mono">
                CALL: {result.callCount} | PUT: {result.putCount} | WAIT: {result.waitCount}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">MAX DRAWDOWN</span>
              <div className="text-2xl font-bold font-mono text-rose-400">{result.maxDrawdown}%</div>
              <span className="text-[11px] text-slate-500 font-mono">Wins: {result.winCount} | Losses: {result.lossCount}</span>
            </div>
          </div>

          {/* Trade Execution Table */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="font-semibold text-sm text-slate-200">Simulated Trade Executions ({result.trades.length})</h3>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2.5">Entry Index</th>
                    <th className="p-2.5">Signal</th>
                    <th className="p-2.5">Entry Price</th>
                    <th className="p-2.5">Exit Price</th>
                    <th className="p-2.5">Result</th>
                    <th className="p-2.5 text-right">P&L ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {result.trades.slice(0, 50).map((t: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-2.5 text-slate-500">Candle #{t.entryIndex}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${t.signal === 'CALL' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                          {t.signal}
                        </span>
                      </td>
                      <td className="p-2.5">{t.entryPrice}</td>
                      <td className="p-2.5">{t.exitPrice}</td>
                      <td className="p-2.5">
                        <span className={t.result === 'WIN' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {t.result}
                        </span>
                      </td>
                      <td className={`p-2.5 text-right ${t.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.profit >= 0 ? `+$${t.profit}` : `-$${Math.abs(t.profit)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-500 space-y-2">
          <BarChart3 className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-medium">No Backtest Executed Yet</p>
          <p className="text-xs">Adjust parameters above and click "Execute Backtest" to run historical strategy simulation.</p>
        </div>
      )}
    </div>
  );
};
