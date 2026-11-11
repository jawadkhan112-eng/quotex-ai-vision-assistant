import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Camera, Square, Zap, AlertTriangle, Timer } from 'lucide-react';
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
  const [result, setResult] = useState<AlgoAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [flashNewCandle, setFlashNewCandle] = useState(false);
  const [preCloseActive, setPreCloseActive] = useState(false);
  const [lockedSignal, setLockedSignal] = useState<AlgoAnalysisResult | null>(null);
  const resultRef = useRef<AlgoAnalysisResult | null>(null);

  useEffect(() => {
    if (active && video.current && stream.current) video.current.srcObject = stream.current;
  }, [active]);

  const run = useCallback(async () => {
    setWorking(true); setError('');
    try {
      let frame: { width: number; height: number; pixels: number[] } | undefined;
      if (active && video.current && canvas.current && video.current.videoWidth > 0) {
        const context = canvas.current.getContext('2d', { willReadFrequently: true });
        canvas.current.width = 320; canvas.current.height = 180;
        context?.drawImage(video.current, 0, 0, 320, 180);
        frame = { width: 320, height: 180, pixels: Array.from(context?.getImageData(0, 0, 320, 180).data ?? []) };
      }
      const response = await fetch('/api/analyze-algorithmic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe, prices: active ? [] : samplePrices, frame }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.result);
      resultRef.current = data.result;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Local analysis failed.'); }
    finally { setWorking(false); }
  }, [active, selectedSymbol, selectedTimeframe]);

  // Continuous background frame ingestion: lightweight polling captures new frames constantly.
  useEffect(() => {
    if (!auto || !active) return;
    const ingest = () => {
      if (video.current && canvas.current && video.current.videoWidth > 0) {
        const context = canvas.current.getContext('2d', { willReadFrequently: true });
        canvas.current.width = 320; canvas.current.height = 180;
        context?.drawImage(video.current, 0, 0, 320, 180);
      }
    };
    ingest();
    const timer = window.setInterval(ingest, 500);
    return () => window.clearInterval(timer);
  }, [auto, active]);

  // Candle-close synchronised analysis: exactly 30 seconds before closure the
  // high-priority analysis fires and the resulting signal is locked for instant
  // execution at the open of the next candle.
  const runRef = useRef(run);
  runRef.current = run;
  const audioRef = useRef<AudioContext | null>(null);
  const beep = useCallback((frequency: number) => {
    try {
      audioRef.current ??= new AudioContext();
      const oscillator = audioRef.current.createOscillator();
      const gain = audioRef.current.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, audioRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioRef.current.currentTime + 0.35);
      oscillator.connect(gain).connect(audioRef.current.destination);
      oscillator.start();
      oscillator.stop(audioRef.current.currentTime + 0.35);
    } catch { /* audio is optional */ }
  }, []);
  useEffect(() => {
    if (!auto) return;
    let firedForMinute: number | null = null;
    let lockedForMinute: number | null = null;
    let openedForMinute: number | null = null;
    const tick = () => {
      const now = new Date();
      const second = now.getSeconds();
      const toClosure = 60 - second;
      setCountdown(toClosure);
      const inWindow = second >= 30 && second < 60;
      setPreCloseActive(inWindow);
      if (second >= 30 && firedForMinute !== now.getMinutes()) {
        firedForMinute = now.getMinutes();
        beep(inWindow ? 520 : 660); // audible cue that the pre-close window opened
        void runRef.current(); // 30-second pre-close frame capture + high-priority analysis
      }
      if (second < 30 && lockedForMinute !== now.getMinutes() && resultRef.current) {
        lockedForMinute = now.getMinutes();
        const finalResult = resultRef.current;
        setLockedSignal(finalResult);
        // Signal locked at candle close — flash badge + audio cue for instant execution.
        if (finalResult.signal !== 'WAIT' && finalResult.chartDetection.isChart) {
          beep(finalResult.signal === 'CALL' ? 880 : 440);
          window.setTimeout(() => beep(finalResult.signal === 'CALL' ? 880 : 440), 450);
        }
      }
      if (second >= 0 && second < 2 && openedForMinute !== now.getMinutes()) {
        openedForMinute = now.getMinutes();
        setFlashNewCandle(true);
        window.setTimeout(() => setFlashNewCandle(false), 6000); // flash alert at new candle open
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [auto, beep]);

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.current.getVideoTracks()[0]?.addEventListener('ended', stop);
      setActive(true);
    } catch { setError('Screen sharing was not granted. You can still run deterministic price analysis.'); }
  };
  const stop = () => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setActive(false); setAuto(false); };

  const badgeTone =
    result?.signal === 'CALL'
      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
      : result?.signal === 'PUT'
        ? 'border-rose-400 bg-rose-400/10 text-rose-300'
        : 'border-amber-400 bg-amber-400/10 text-amber-300';
  const badgeLabel = result
    ? result.expiry.recommendation === 'WAIT'
      ? '🟡 WAIT'
      : result.actionBadge
    : '🟡 WAIT';

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Local / deterministic / zero API keys</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Algorithmic Trading &amp; Technical Analysis Terminal</h2></div>
      <div className="flex items-center gap-3">
        {auto && <span className="font-mono text-xs text-cyan-300">Next candle close: {countdown}s</span>}
        <button onClick={() => setAuto((value) => !value)} className={`border px-4 py-2 text-sm font-semibold ${auto ? 'border-rose-400/40 bg-rose-400/10 text-rose-200' : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'}`}>{auto ? 'Stop auto-monitoring' : 'Start auto-monitoring'}</button>
        <button onClick={() => void run()} disabled={working} className="flex items-center gap-2 bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><Zap className="h-4 w-4" />{working ? 'Calculating…' : 'Analyse now'}</button>
      </div>
    </div>
    {auto && (
      <div className="mb-4 border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className={`flex items-center gap-2 ${preCloseActive ? 'font-bold text-amber-300' : 'text-slate-400'}`}><Timer className="h-4 w-4" />{preCloseActive ? `Analyzing in ${countdown}s... Pre-close window active` : `Pre-close analysis triggers at 30s — currently ${countdown}s to close`}</span>
          <span className={preCloseActive ? 'text-amber-300' : 'text-slate-500'}>{preCloseActive ? 'HIGH-PRIORITY SCAN' : 'STANDBY'}</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
          <div className={`h-full transition-all duration-1000 ease-linear ${preCloseActive ? 'bg-amber-400' : 'bg-cyan-400'}`} style={{ width: `${(countdown / 60) * 100}%` }} />
        </div>
      </div>
    )}
    {lockedSignal && lockedSignal.signal !== 'WAIT' && lockedSignal.chartDetection.isChart && !flashNewCandle && (
      <div className={`mb-4 border-2 p-4 ${badgeTone}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest opacity-75">Signal locked at candle close — execute at next candle open</p><p className="mt-1 text-xl font-black tracking-wider">{lockedSignal.actionBadge}</p></div><div className="text-right"><p className="text-2xl font-black">{lockedSignal.confidenceScore}%</p><p className="font-mono text-xs opacity-75">Expiry: {lockedSignal.expiry.label}</p></div></div><p className="mt-2 font-mono text-xs opacity-75">Execution target: For Next Candle Opening (Expiry: {lockedSignal.expiry.candles}M based on wick/structure)</p></div>
    )}
    {result && !result.chartDetection.isChart && (
      <div className="mb-4 flex items-start gap-3 border-2 border-amber-400 bg-amber-400/10 p-4 text-amber-200"><AlertTriangle className="mt-.5 h-6 w-6 shrink-0" /><div><p className="font-bold">No valid trading chart detected on shared screen</p><p className="mt-1 text-sm">Switch your screen share to the live Quotex chart window/tab, then let auto-monitoring re-validate the frame. No trading signals are generated from non-chart content.</p>{active && <p className="mt-1 font-mono text-xs">Validator score: {result.chartDetection.score}/100</p>}</div></div>
    )}
    {flashNewCandle && result && result.signal !== 'WAIT' && (
      <div className={`mb-4 animate-pulse border-2 p-4 text-center text-lg font-black tracking-widest ${badgeTone}`}>⚡ NEW CANDLE OPEN — {badgeLabel} · {result.confidenceScore}% confluence · For Next Candle Expiry</div>
    )}
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <div className="border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center justify-between border-b border-slate-800 pb-3"><span className="text-sm font-semibold">Chart frame input</span><span className="font-mono text-xs text-slate-400">{selectedSymbol} · {selectedTimeframe}{auto ? ' · continuous scan active' : ''}</span></div>
        <div className="relative mt-4 grid aspect-video place-items-center overflow-hidden border border-slate-800 bg-slate-950"><video ref={video} autoPlay muted className={active ? 'h-full w-full object-contain' : 'hidden'} />{!active && <div className="text-center text-slate-500"><Camera className="mx-auto mb-2 h-8 w-8" /><p className="text-sm">Optional local screen frame</p><p className="mt-1 text-xs">Pixels never leave this terminal.</p></div>}</div>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={active ? stop : start} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium">{active ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{active ? 'Stop screen share' : 'Share chart screen'}</button></div>
      </div>
      <div className="border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Signal output · for next candle expiry</p>
        <div className={`mt-4 border p-5 text-center ${badgeTone}`}>
          <div className="text-3xl font-black tracking-[.12em]">{badgeLabel}</div>
          <div className="mt-2 font-mono text-sm">{result ? `${result.confidenceScore}% confluence` : 'Awaiting analysis'}</div>
          <div className="mt-1 font-mono text-xs">{result ? `Recommended expiry: ${result.expiry.label} (${result.expiry.candles > 0 ? `${result.expiry.candles} candle${result.expiry.candles > 1 ? 's' : ''}` : 'stand aside'})` : ''}</div>
        </div>
        {result?.mtg && result.mtg.level !== 'BASE' && (
          <div className="mt-3 border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200"><span className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />{result.mtg.level.replace('_', ' ')} ACTIVE</span><p className="mt-1">{result.mtg.riskWarning}</p></div>
        )}
        {result && (
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-slate-800 bg-slate-800">
            <Metric label="RSI (14)" value={`${result.rsiValue?.toFixed(1) ?? '—'}${result.rsiZone ? ` · ${result.rsiZone}` : ''}`} />
            <Metric label="Bollinger position" value={`${result.bollinger ? `${result.bollinger.status.replace('_', ' ')} @ ${(result.bollinger.proximity * 100).toFixed(0)}%` : '—'}`} />
            <Metric label="Bollinger bandwidth" value={result.bollinger ? `${(result.bollinger.bandwidth * 100).toFixed(2)}%` : '—'} />
            <Metric label="Body ratio" value={`${((result.candle?.bodyRatio ?? 0) * 100).toFixed(1)}%`} />
            <Metric label="Upper / lower wick" value={`${((result.candle?.upperWickRatio ?? 0) * 100).toFixed(0)}% / ${((result.candle?.lowerWickRatio ?? 0) * 100).toFixed(0)}%`} />
            <Metric label="Wick rejection" value={result.candle?.rejection ?? '—'} />
            <Metric label="Momentum" value={result.candle?.momentum ?? '—'} />
            <Metric label="Trend filter" value={result.trendFilter} />
          </div>
        )}
      </div>
    </div>
    {error && <p className="mt-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {result && <article className="mt-5 border-l-2 border-cyan-400 bg-slate-900/70 p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-cyan-300" />Strict mathematical reasoning · confluence breakdown</div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono">
        <span className={`border px-2 py-1 ${result.confluence.rsiExtreme ? 'border-emerald-400 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>RSI extreme (&lt;25 / &gt;75): {result.confluence.rsiExtreme ? 'YES' : 'NO'}</span>
        <span className={`border px-2 py-1 ${result.confluence.bollingerBoundaryTouch ? 'border-emerald-400 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>BB boundary touch: {result.confluence.bollingerBoundaryTouch ? 'YES' : 'NO'}</span>
        <span className={`border px-2 py-1 ${result.confluence.rejectionWickStrong ? 'border-emerald-400 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Strong rejection wick: {result.confluence.rejectionWickStrong ? 'YES' : 'NO'}</span>
        <span className={`border px-2 py-1 ${result.confluence.momentumAligned ? 'border-emerald-400 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Momentum aligned: {result.confluence.momentumAligned ? 'YES' : 'NO'}</span>
        <span className="border border-slate-700 px-2 py-1 text-slate-300">Weighted score: {result.confluence.score}%</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{result.reasoning || result.summaryReason}</p>
      <p className="mt-2 font-mono text-xs text-slate-400">{result.candleObservation}</p>
      <p className="mt-2 font-mono text-xs text-slate-500">{result.expiry.rationale}</p>
    </article>}
    <canvas ref={canvas} className="hidden" />
  </section>;
};
const Metric = ({ label, value }: { label: string; value: string }) => <div className="bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-mono text-xs font-bold text-slate-200">{value}</p></div>;
