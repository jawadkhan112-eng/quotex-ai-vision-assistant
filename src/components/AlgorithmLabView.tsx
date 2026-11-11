import React, { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import {
  calculateRSI, calculateBollingerBands, calculateEMA, calculateSMA, measureCandle,
  MIN_CONFIDENCE_THRESHOLD, MTG_REQUIRED_CONFLUENCE, classifyCandlePattern, type Candle,
} from '../../server/algorithmicEngine';

/**
 * Algorithm Lab — interactive, real calculations on user-supplied series.
 * Values shown are computed live in the browser by the same engine functions
 * the server uses. Nothing is pre-filled with demo market data: the user enters
 * their own observed closes or leaves defaults empty.
 */
export const AlgorithmLabView: React.FC = () => {
  const [input, setInput] = useState('');
  const [ohlc, setOhlc] = useState('');
  const [error, setError] = useState('');

  const parseSeries = (text: string): number[] | null => {
    const arr = text.split(/[,\s]+/).filter(Boolean).map(Number);
    if (arr.some((v) => !Number.isFinite(v)) || arr.length === 0) return null;
    return arr;
  };

  const closes = parseSeries(input) ?? [];
  const hasRsi = closes.length > 14;
  const hasBb = closes.length >= 20;
  const rsi = hasRsi ? calculateRSI(closes, 14) : undefined;
  const bb = hasBb ? calculateBollingerBands(closes, 20, 2) : undefined;
  const ema9 = closes.length >= 9 ? calculateEMA(closes, 9) : undefined;
  const sma20 = closes.length >= 20 ? calculateSMA(closes, 20) : undefined;

  const parseCandles = (text: string): Candle[] => {
    // Format: open,high,low,close per line
    return text.split('\n').map((line) => line.split(',').map(Number)).filter((a) => a.length === 4 && a.every((v) => Number.isFinite(v))).map(([open, high, low, close]) => ({ open, high, low, close }));
  };
  const candles = parseCandles(ohlc);
  const lastMetrics = candles.length ? measureCandle(candles[candles.length - 1]) : undefined;
  const lastPattern = candles.length && lastMetrics ? classifyCandlePattern(candles[candles.length - 1], lastMetrics) : 'NONE';

  const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-mono text-sm font-bold text-slate-200">{value}</p></div>
  );

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6"><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Deterministic · same functions as the server engine</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><FlaskConical className="h-6 w-6 text-cyan-300" />Algorithm Lab</h2></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Closing prices (comma or space separated, your own observations)</label>
        <textarea value={input} onChange={(e) => { setInput(e.target.value); setError(''); }} rows={4} className="mt-2 w-full border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400" placeholder="e.g. prices you read off your chart" />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-slate-400">Last candle OHLC — one per line: open,high,low,close</label>
        <textarea value={ohlc} onChange={(e) => setOhlc(e.target.value)} rows={3} className="mt-2 w-full border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400" placeholder={'78.0,78.4,77.6,78.2'} />
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        {closes.length > 0 && !hasRsi && <p className="mt-3 text-xs text-amber-300">RSI needs 15+ closes; Bollinger needs 20+. Values below show UNAVAILABLE rather than fabricated numbers.</p>}
      </div>
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live calculations</p>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-slate-800 bg-slate-800">
          <Metric label="RSI (14)" value={rsi !== undefined ? rsi.toFixed(2) : 'UNAVAILABLE'} />
          <Metric label="RSI zone" value={rsi === undefined ? '—' : rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'} />
          <Metric label="BB upper" value={bb?.upper.toFixed(5) ?? 'UNAVAILABLE'} />
          <Metric label="BB middle" value={bb?.middle.toFixed(5) ?? 'UNAVAILABLE'} />
          <Metric label="BB lower" value={bb?.lower.toFixed(5) ?? 'UNAVAILABLE'} />
          <Metric label="BB bandwidth" value={bb ? `${(bb.bandwidth * 100).toFixed(2)}%` : 'UNAVAILABLE'} />
          <Metric label="EMA (9)" value={ema9?.toFixed(5) ?? 'UNAVAILABLE'} />
          <Metric label="SMA (20)" value={sma20?.toFixed(5) ?? 'UNAVAILABLE'} />
          <Metric label="Body ratio" value={lastMetrics ? `${(lastMetrics.bodyRatio * 100).toFixed(1)}%` : '—'} />
          <Metric label="Upper / lower wick" value={lastMetrics ? `${(lastMetrics.upperWickRatio * 100).toFixed(0)}% / ${(lastMetrics.lowerWickRatio * 100).toFixed(0)}%` : '—'} />
          <Metric label="Pattern" value={lastPattern.replace('_', ' ')} />
          <Metric label="Momentum" value={lastMetrics?.momentum ?? '—'} />
        </div>
        <div className="mt-4 border border-cyan-400/25 bg-cyan-400/5 p-3 text-xs text-slate-300">
          <p className="font-semibold text-cyan-200">Engine thresholds</p>
          <p className="mt-1 font-mono">Minimum confluence gate: {MIN_CONFIDENCE_THRESHOLD}%</p>
          <p className="font-mono">MTG level requirements: BASE {MTG_REQUIRED_CONFLUENCE.BASE}% · L1 {MTG_REQUIRED_CONFLUENCE.MTG_LEVEL_1}% · L2 {MTG_REQUIRED_CONFLUENCE.MTG_LEVEL_2}%</p>
          <p className="mt-2 text-slate-400">A confluence score is an evidence-strength measure, not a verified win probability.</p>
        </div>
      </div>
    </div>
  </section>;
};
