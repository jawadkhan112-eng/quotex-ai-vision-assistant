import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Camera, Play, Square } from 'lucide-react';
import type { AlgoAnalysisResult } from '../types';

interface Props { selectedSymbol: string; selectedTimeframe: string; }
const samplePrices = [1.071, 1.069, 1.068, 1.067, 1.066, 1.067, 1.065, 1.064, 1.063, 1.062, 1.061, 1.060, 1.059, 1.058, 1.057, 1.058, 1.056, 1.055, 1.054, 1.056, 1.058];

export const LiveScreenAnalyzerView: React.FC<Props> = ({ selectedSymbol, selectedTimeframe }) => {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [auto, setAuto] = useState(false);
  const [working, setWorking] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showFlashing, setShowFlashing] = useState(false);
  const [lastCandleTime, setLastCandleTime] = useState<Date | null>(null);

  useEffect(() => {
    if (active && video.current && stream.current) video.current.srcObject = stream.current;
  }, [active]);

  const run = useCallback(async () => {
    setWorking(true); setError('');
    try {
      let frame: { width: number; height: number; pixels: number[] } | undefined;
      if (active && video.current && canvas.current) {
        const context = canvas.current.getContext('2d', { willReadFrequently: true });
        canvas.current.width = 320; canvas.current.height = 180;
        context?.drawImage(video.current, 0, 0, 320, 180);
        frame = { width: 320, height: 180, pixels: Array.from(context?.getImageData(0, 0, 320, 180).data ?? []) };
      }
      const response = await fetch('/api/analyze-algorithmic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe, prices: active ? [] : samplePrices, frame }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Local analysis failed.'); }
    finally { setWorking(false); }
  }, [active, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    if (!auto) return;
    void run();
    const timer = window.setInterval(() => void run(), 1000); // High-frequency 1-second polling when auto monitoring
    return () => window.clearInterval(timer);
  }, [auto, run]);
  // Candle closure timer - synchronizes with 1M candle closure at final 10 seconds
  useEffect(() => {
    if (!auto) return;
    const updateCountdown = () => {
      const now = new Date();
      const seconds = now.getSeconds();
      const toClosure = 60 - seconds;
      const msUntilClosure = toClosure * 1000;
      setCountdown(msUntilClosure);
      // Trigger analysis in the final 10 seconds of the candle
      if (msUntilClosure <= 10000 && msUntilClosure > 0) {
        setLastCandleTime(new Date());
        void run();
      }
    };
    updateCountdown(); // Initial call
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [auto, run]);

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setActive(true);
    } catch { setError('Screen sharing was not granted. You can still run deterministic price analysis.'); }
  };
  const stop = () => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setActive(false); setAuto(false); };
  const tone = result?.signal === 'CALL' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : result?.signal === 'PUT' ? 'border-rose-400 bg-rose-400/10 text-rose-300' : 'border-amber-400 bg-amber-400/10 text-amber-300';

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Local / deterministic / zero API keys</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Algorithmic Trading & Technical Analysis Terminal</h2></div>
      <button onClick={() => setAuto((value) => !value)} className="border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"><span className="text-sm font-medium text-cyan-200">{result.confidenceScore}% Sureshot</span></button>
    </div>
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <div className="border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center justify-between border-b border-slate-800 pb-3"><span className="text-sm font-semibold">Chart frame input</span><span className="font-mono text-xs text-slate-400">{selectedSymbol} · {selectedTimeframe}</span></div>
        <div className="relative mt-4 grid aspect-video place-items-center overflow-hidden border border-slate-800 bg-slate-950"><video ref={video} autoPlay muted className={active ? 'h-full w-full object-contain' : 'hidden'} />{!active && <div className="text-center text-slate-500"><Camera className="mx-auto mb-2 h-8 w-8" /><p className="text-sm">Optional local screen frame</p><p className="mt-1 text-xs">Pixels never leave this terminal.</p></div>}</div>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={active ? stop : start} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium">{active ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{active ? 'Stop screen share' : 'Share chart screen'}</button><button disabled={working} onClick={() => void run()} className="flex items-center gap-2 bg-cyan-400 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><Play className="h-4 w-4" />{working ? 'Calculating…' : 'Run Algorithmic Analysis'}</button></div>
      </div>
      <div className="border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Current mathematical signal</p><div className={`mt-4 border p-5 text-center ${tone}`}><div className="text-4xl font-black tracking-[.18em]">{result?.signal || 'WAIT'}</div><div className="mt-2 font-mono text-sm">{result ? `${result.confidenceScore}% confluence` : 'Awaiting analysis'}</div></div><div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-slate-800 bg-slate-800"><Metric label="RSI (14)" value={result?.rsiValue?.toFixed(1) || '—'} /><Metric label="Bollinger" value={result?.bollinger?.status.replace('_', ' ') || '—'} /><Metric label="Body ratio" value={result ? `${((result.candle?.bodyRatio ?? 0) * 100).toFixed(1)}%` : '—'} /><Metric label="Upper / lower wick" value={result ? `${((result.candle?.upperWickRatio ?? 0) * 100).toFixed(0)}% / ${((result.candle?.lowerWickRatio ?? 0) * 100).toFixed(0)}%` : '—'} /><Metric label="Momentum" value={result?.candle?.momentum || '—'} /><Metric label="Wick rejection" value={result?.candle?.rejection || '—'} /></div></div>
    </div>
    {error && <p className="mt-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {result && <article className="mt-5 border-l-2 border-cyan-400 bg-slate-900/70 p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" />Strict mathematical reasoning</div><p className="mt-2 text-sm leading-6 text-slate-300">{result.reasoning || result.summaryReason}</p><p className="mt-2 font-mono text-xs text-slate-400">{result.candleObservation}</p></article>}
    <canvas ref={canvas} className="hidden" />
  </section>;
};
const Metric = ({ label, value }: { label: string; value: string }) => <div className="bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-mono text-xs font-bold text-slate-200">{value}</p></div>;
