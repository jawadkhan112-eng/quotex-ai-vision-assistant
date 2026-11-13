import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Camera, Square, Zap, AlertTriangle, Timer, Volume2, VolumeX, ClipboardPaste, Image as ImageIcon, Maximize2, Pause, Play } from 'lucide-react';
import type { AlgoAnalysisResult as ShotAnalysisResult } from '../types';
import type { AlgoAnalysisResult } from '../types';
import type { ProviderDecision } from '../../server/modules/signalProviderIntelligence';
import type { UnifiedDecision } from '../../server/unifiedDecisionEngine';
import { alertManager } from '../services/alertManager';
import { safeFetchJson, analyzeFrameViaJpeg } from '../services/safeFetch';
import { detectChartIdentity, disposeOcr } from '../services/chartIdentityService';
import { describeIdentityChange, type ChartIdentity } from '../../server/chartIdentity';

interface Props { selectedSymbol: string; selectedTimeframe: string; }

/** Analysis capture resolution. Must stay high enough that real candles remain
 * multi-pixel wide; 320x180 collapsed real candles into slivers and broke
 * candle reconstruction (the original WAIT/zero-values root cause). */
const CAPTURE_W = 960;
const CAPTURE_H = 540;

/** Honest monitoring status machine — never pretends a stale frame is live. */
type MonitorStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'NO_FRESH_FRAME';

const FRESH_FRAME_LIMIT_MS = 5000; // a frame older than this is NO FRESH FRAME

export const LiveScreenAnalyzerView: React.FC<Props> = ({ selectedSymbol: manualSymbol, selectedTimeframe: manualTimeframe }) => {
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
  const [paused, setPaused] = useState(false);
  const [lastCaptureAt, setLastCaptureAt] = useState<number | null>(null);
  // Ticking clock so frame age re-renders every second.
  const [nowTick, setNowTick] = useState(Date.now());
  const [captureResolution, setCaptureResolution] = useState<string | null>(null);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(false);
  // Honest status: RUNNING means fresh frames are actually arriving.
  const [status, setStatus] = useState<MonitorStatus>('IDLE');
  // Auto chart identity detection (pair / market type / timeframe via OCR).
  const [identity, setIdentity] = useState<ChartIdentity | null>(null);
  const [identityChanges, setIdentityChanges] = useState<string[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrRawSample, setOcrRawSample] = useState<string | null>(null);
  const resultRef = useRef<AlgoAnalysisResult | null>(null);
  const startingRef = useRef(false); // duplicate-session guard
  // Signal Provider Intelligence: candle-by-candle UP/DOWN/WAIT decision state.
  const [decision, setDecision] = useState<ProviderDecision | null>(null);
  // Unified authoritative decision — the ONE consistent result shown in the live panel.
  const [unified, setUnified] = useState<UnifiedDecision | null>(null);
  const [unifiedTiming, setUnifiedTiming] = useState<{ secondsToClose: number; nextCandleStart: number; nextCandleExpiry: number; candleStart: number; candleClose: number; timeframe: string } | null>(null);

  useEffect(() => {
    if (active && video.current && stream.current) video.current.srcObject = stream.current;
  }, [active]);

  // 1-second ticker for frame age + status freshness display.
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Honest status resolution: fresh frames arriving = RUNNING; stale = NO FRESH FRAME.
  useEffect(() => {
    if (!active) { setStatus(auto ? 'STOPPED' : 'IDLE'); return; }
    if (paused) { setStatus('PAUSED'); return; }
    if (lastCaptureAt && nowTick - lastCaptureAt > FRESH_FRAME_LIMIT_MS) setStatus('NO_FRESH_FRAME');
    else if (lastCaptureAt) setStatus('RUNNING');
  }, [active, paused, lastCaptureAt, nowTick, auto]);

  // Stream interruption detection: a shared track ending stops monitoring safely.
  useEffect(() => {
    const tracks = stream.current?.getVideoTracks() ?? [];
    const onEnded = () => { setActive(false); setAuto(false); setError('Screen share ended (stream interrupted). Restart monitoring to resume.'); };
    tracks.forEach((t) => t.addEventListener('ended', onEnded));
    return () => tracks.forEach((t) => t.removeEventListener('ended', onEnded));
  }, [active]);

  const runDecision = useCallback(async (analysis: AlgoAnalysisResult) => {
    const reconstructed = (analysis as { reconstructedCandles?: Array<{ open: number; high: number; low: number; close: number; quality?: number }> }).reconstructedCandles ?? [];
    if (reconstructed.length < 3) { setDecision(null); return; }
    try {
      const res = await safeFetchJson<{ success: boolean; decision?: ProviderDecision; meta?: Record<string, unknown>; error?: string }>('/api/provider-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: reconstructed.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close })),
          window: reconstructed.length >= 10 ? 10 : 5,
          // Detected identity ONLY — a manual fallback is never labelled OCR-detected.
          asset: identity?.pair.pair ?? analysis.detectedAsset ?? 'UNKNOWN',
          marketType: identity?.marketType.marketType ?? 'UNKNOWN',
          timeframe: identity?.timeframe.timeframe ?? 'UNKNOWN',
          source: 'LIVE',
        }),
      });
      if (res.ok && res.data?.success && res.data.decision) {
        setDecision(res.data.decision);
        void safeFetchJson('/api/decisions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: res.data.decision, meta: { ...res.data.meta, targetCandle: Date.now() } }),
        });
      }
    } catch { /* decision is supplementary; analysis result remains authoritative */ }
  }, [identity]);

  /**
   * Unified authoritative decision — same candles as SPI, ONE consistent result.
   * LIVE source tag guarantees the screenshot pipeline's decisions stay separate.
   */
  const runUnified = useCallback(async (analysis: AlgoAnalysisResult) => {
    const reconstructed = (analysis as { reconstructedCandles?: Array<{ open: number; high: number; low: number; close: number }> }).reconstructedCandles ?? [];
    if (reconstructed.length < 3) { setUnified(null); return; }
    try {
      const res = await safeFetchJson<{ success: boolean; decision?: UnifiedDecision; timing?: typeof unifiedTiming; error?: string }>('/api/unified-decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: reconstructed.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close })),
          window: reconstructed.length >= 10 ? 10 : 5,
          asset: identity?.pair.pair ?? analysis.detectedAsset ?? 'UNKNOWN',
          marketType: identity?.marketType.marketType ?? 'UNKNOWN',
          timeframe: identity?.timeframe.timeframe ?? 'UNKNOWN',
          source: 'LIVE',
        }),
      });
      if (res.ok && res.data?.success && res.data.decision) {
        setUnified(res.data.decision);
        setUnifiedTiming(res.data.timing ?? null);
      }
    } catch { /* unified is supplementary; never breaks live monitoring */ }
  }, [identity]);

  const run = useCallback(async () => {
    setWorking(true); setError('');
    try {
      let analysisCanvas: HTMLCanvasElement | undefined;
      if (active && !paused && video.current && canvas.current && video.current.videoWidth > 0) {
        const context = canvas.current.getContext('2d', { willReadFrequently: true });
        canvas.current.width = CAPTURE_W; canvas.current.height = CAPTURE_H;
        context?.drawImage(video.current, 0, 0, CAPTURE_W, CAPTURE_H);
        analysisCanvas = canvas.current;
        setLastCaptureAt(Date.now());
        setFramesCaptured((f) => f + 1);
        setCaptureResolution(`${video.current.videoWidth}×${video.current.videoHeight} → ${CAPTURE_W}×${CAPTURE_H}`);
      }
      // Real screen data only: without an active shared frame or user-supplied price
      // series, analysis is refused rather than falling back to synthetic prices.
      if (!analysisCanvas) {
        setError('No screen shared. Share your Quotex chart screen so analysis uses real chart pixels — synthetic price fallbacks are disabled.');
        setWorking(false);
        return;
      }
      // JPEG transport: ~100KB payload instead of multi-MB JSON — the 413 fix.
      const response = await analyzeFrameViaJpeg<{ success: boolean; result?: AlgoAnalysisResult; error?: string }>(analysisCanvas, {
        symbol: identity?.pair.pair ?? manualSymbol, timeframe: identity?.timeframe.timeframe ?? manualTimeframe,
      });
      if (!response.ok || !response.data?.success) {
        throw new Error(response.error ?? 'Analysis request failed.');
      }
      const data = response.data;
      setResult(data.result!);
      resultRef.current = data.result!;
      // Chain into the engines using the real reconstructed candle geometry.
      void runDecision(data.result!);
      void runUnified(data.result!);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Local analysis failed.'); }
    finally { setWorking(false); }
  }, [active, paused, manualSymbol, manualTimeframe, identity, runDecision, runUnified]);

  // Chart identity detection: throttled OCR pass on the shared frame. Runs only
  // when a canvas frame exists; identity change invalidates the locked signal.
  const identityRunningRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    const scan = async () => {
      if (identityRunningRef.current || !video.current || video.current.videoWidth === 0) return;
      identityRunningRef.current = true;
      setOcrBusy(true);
      try {
        const detection = await detectChartIdentity(video.current!, video.current!.videoWidth, video.current!.videoHeight);
        if (detection.ocrText) setOcrRawSample(detection.ocrText.slice(0, 240));
        setIdentity((previous) => {
          const changes = describeIdentityChange(previous, detection.identity);
          if (changes.length > 0 && previous) {
            setIdentityChanges(changes);
            setLockedSignal(null); // old chart's signal must not contaminate the new chart
            setUnified(null); setDecision(null); // pair/market/timeframe change resets the session
          }
          return detection.identity;
        });
      } catch { /* OCR failures degrade to UNKNOWN identity honestly */ }
      finally { identityRunningRef.current = false; setOcrBusy(false); }
    };
    scan();
    const timer = window.setInterval(scan, 10000); // identity refresh every 10s
    return () => { window.clearInterval(timer); void disposeOcr(); };
  }, [active]);

  // Continuous background frame ingestion: lightweight polling captures new frames constantly.
  useEffect(() => {
    if (!auto || !active || paused) return;
    const ingest = () => {
      if (video.current && canvas.current && video.current.videoWidth > 0) {
        const context = canvas.current.getContext('2d', { willReadFrequently: true });
        canvas.current.width = CAPTURE_W; canvas.current.height = CAPTURE_H;
        context?.drawImage(video.current, 0, 0, CAPTURE_W, CAPTURE_H);
      }
    };
    ingest();
    const timer = window.setInterval(ingest, 500);
    return () => window.clearInterval(timer);
  }, [auto, active, paused]);

  // Candle-close synchronised analysis: exactly 30 seconds before closure the
  // high-priority analysis fires and the resulting signal is locked for instant
  // execution at the open of the next candle.
  const runRef = useRef(run);
  runRef.current = run;
  // Quiet-mode toggle: controls sound + browser notification channels.
  const [quietMode, setQuietMode] = useState(alertManager.getSettings().quietMode);
  useEffect(() => { alertManager.updateSettings({ quietMode }); }, [quietMode]);
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
        void runRef.current(); // 30-second pre-close frame capture + high-priority analysis
      }
      if (second < 30 && lockedForMinute !== now.getMinutes() && resultRef.current) {
        lockedForMinute = now.getMinutes();
        const finalResult = resultRef.current;
        setLockedSignal(finalResult);
        if (finalResult.signal !== 'WAIT' && finalResult.chartDetection.isChart) {
          void alertManager.dispatch({
            signalId: finalResult.signalId,
            signal: finalResult.signal,
            actionBadge: finalResult.actionBadge,
            confidenceScore: finalResult.confidenceScore,
            expiryLabel: finalResult.expiry.label,
            timingStatus: finalResult.timingStatus,
            timeframe: finalResult.detectedTimeframe ?? '1M',
            reasoning: finalResult.reasoning ?? '',
          }).then((channels) => {
            if (channels.length > 0) {
              void fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signalId: finalResult.signalId, channels }) });
            }
          });
          void fetch('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: finalResult, inputSource: 'LIVE_FRAME' }) });
        }
      }
      if (second >= 0 && second < 2 && openedForMinute !== now.getMinutes()) {
        openedForMinute = now.getMinutes();
        setFlashNewCandle(true);
        window.setTimeout(() => setFlashNewCandle(false), 6000);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [auto]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    startingRef.current = false;
    setActive(false); setAuto(false); setPaused(false); setLastCaptureAt(null);
    setIdentity(null); setIdentityChanges([]); setUnified(null); setDecision(null);
    setLockedSignal(null); setStatus('STOPPED');
  }, []);

  /** One valid screen-sharing session; guards against overlapping streams. */
  const start = useCallback(async () => {
    if (stream.current || startingRef.current) return;
    startingRef.current = true;
    setStatus('STARTING');
    try {
      stream.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.current.getVideoTracks()[0]?.addEventListener('ended', stop);
      setActive(true);
      setError('');
      setStatus('RUNNING');
    } catch {
      startingRef.current = false;
      setStatus('IDLE');
      setError('Screen sharing was not granted. Share your Quotex chart screen so analysis uses real chart pixels.');
    }
  }, [stop]);

  /** Start auto-monitoring = start the stream AND the analysis loop together. */
  const startAuto = useCallback(async () => {
    if (!stream.current) await start();
    if (stream.current) setAuto(true);
  }, [start]);

  // Safe cleanup on unmount — never leave orphan tracks running.
  useEffect(() => () => stop(), [stop]);

  const frameAgeSeconds = lastCaptureAt ? Math.round((nowTick - lastCaptureAt) / 1000) : null;
  const frameFresh = frameAgeSeconds !== null && frameAgeSeconds <= Math.ceil(FRESH_FRAME_LIMIT_MS / 1000);
  const statusLabel: Record<MonitorStatus, string> = {
    IDLE: 'IDLE', STARTING: 'STARTING…', RUNNING: 'RUNNING', PAUSED: 'PAUSED', STOPPED: 'STOPPED', NO_FRESH_FRAME: 'NO FRESH FRAME',
  };
  const statusTone: Record<MonitorStatus, string> = {
    IDLE: 'text-slate-400', STARTING: 'text-cyan-300', RUNNING: 'text-emerald-300', PAUSED: 'text-amber-300', STOPPED: 'text-slate-500', NO_FRESH_FRAME: 'text-rose-300',
  };

  const predicted = unified?.prediction ?? 'WAIT';
  const cardTone = predicted === 'UP'
    ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
    : predicted === 'DOWN'
      ? 'border-rose-400 bg-rose-400/10 text-rose-300'
      : 'border-amber-400 bg-amber-400/10 text-amber-300';

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-4 border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Auto chart detection (OCR from the current shared frame)</p>
        <span className="font-mono text-xs text-slate-500">{ocrBusy ? 'Reading chart header…' : active ? 'Scanning every 10s' : 'Idle — share your chart screen'}</span>
      </div>
      {/* Detected identity vs manual fallback — shown separately, never conflated */}
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Detected pair (OCR)</p><p className="font-mono font-bold">{identity?.pair.pair ?? 'UNKNOWN'} <span className="text-[10px] text-slate-500">{identity ? `${identity.pair.confidence}%` : ''}</span></p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Detected market</p><p className="font-mono font-bold">{identity?.marketType.marketType ?? 'UNKNOWN'}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Detected timeframe (OCR)</p><p className={`font-mono font-bold ${(identity?.timeframe.confidence ?? 0) >= 60 ? '' : 'text-amber-300'}`}>{identity?.timeframe.timeframe ?? 'UNKNOWN'}{identity && (identity.timeframe.confidence ?? 0) < 60 ? ' — MANUAL CONFIRMATION REQUIRED' : ''} <span className="text-[10px] text-slate-500">{identity ? `${identity.timeframe.confidence}%` : ''}</span></p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Manual selection (fallback, NOT detection)</p><p className="font-mono text-slate-400">{manualSymbol} · {manualTimeframe}</p></div>
      </div>
      {identityChanges.length > 0 && <p className="mt-2 text-xs text-amber-300">⚠ {identityChanges.join(' · ')} — analysis session reset (old candles discarded)</p>}
      {ocrRawSample && <p className="mt-2 truncate font-mono text-[10px] text-slate-600" title={ocrRawSample}>OCR sample: {ocrRawSample}</p>}
    </div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Local / deterministic / zero API keys</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Algorithmic Trading &amp; Technical Analysis Terminal</h2></div>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-xs font-bold ${statusTone[status]}`}>● {statusLabel[status]}</span>
        {auto && <span className="font-mono text-xs text-cyan-300">Next candle close: {countdown}s</span>}
        <button onClick={() => setQuietMode((q) => !q)} className={`border px-3 py-2 text-sm font-semibold ${quietMode ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'}`} title="Toggle sound & notification alerts">{quietMode ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{quietMode ? 'Alerts off' : 'Alerts on'}</button>
        {active && auto && (
          <button onClick={() => setPaused((value) => !value)} className={`border px-3 py-2 text-sm font-semibold ${paused ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>{paused ? <><Play className="mr-1 inline h-4 w-4" />Resume monitoring</> : <><Pause className="mr-1 inline h-4 w-4" />Pause monitoring</>}</button>
        )}
        <button onClick={() => void (auto ? (setAuto(false), setStatus(active ? 'RUNNING' : 'STOPPED')) : startAuto())} className={`border px-4 py-2 text-sm font-semibold ${auto ? 'border-rose-400/40 bg-rose-400/10 text-rose-200' : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'}`}>{auto ? 'Stop auto-monitoring' : 'Start auto-monitoring'}</button>
        <button onClick={() => void run()} disabled={working} className="flex items-center gap-2 bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><Zap className="h-4 w-4" />{working ? 'Calculating…' : 'Analyse now'}</button>
      </div>
    </div>
    {auto && (
      <div className="mb-4 border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className={`flex items-center gap-2 ${preCloseActive ? 'font-bold text-amber-300' : 'text-slate-400'}`}><Timer className="h-4 w-4" />{paused ? 'Monitoring paused — analysis suspended' : preCloseActive ? `Analyzing in ${countdown}s... Pre-close window active` : `Pre-close analysis triggers at 30s — currently ${countdown}s to close`}</span>
          <span className={preCloseActive && !paused ? 'text-amber-300' : 'text-slate-500'}>{paused ? 'PAUSED' : preCloseActive ? 'HIGH-PRIORITY SCAN' : 'STANDBY'}</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
          <div className={`h-full transition-all duration-1000 ease-linear ${preCloseActive ? 'bg-amber-400' : 'bg-cyan-400'}`} style={{ width: `${(countdown / 60) * 100}%` }} />
        </div>
      </div>
    )}
    {lockedSignal && lockedSignal.signal !== 'WAIT' && lockedSignal.chartDetection.isChart && !flashNewCandle && (
      <div className={`mb-4 border-2 p-4 ${badgeTone(lockedSignal.signal)}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest opacity-75">Signal locked at candle close — execute at next candle open</p><p className="mt-1 text-xl font-black tracking-wider">{lockedSignal.actionBadge}</p></div><div className="text-right"><p className="text-2xl font-black">{lockedSignal.confidenceScore}%</p><p className="font-mono text-xs opacity-75">Expiry: {lockedSignal.expiry.label}</p></div></div><p className="mt-2 font-mono text-xs opacity-75">Execution target: For Next Candle Opening (Expiry: {lockedSignal.expiry.candles}M based on wick/structure)</p></div>
    )}
    {result && !result.chartDetection.isChart && (
      <div className="mb-4 flex items-start gap-3 border-2 border-amber-400 bg-amber-400/10 p-4 text-amber-200"><AlertTriangle className="mt-.5 h-6 w-6 shrink-0" /><div><p className="font-bold">No valid trading chart detected on shared screen</p><p className="mt-1 text-sm">Switch your screen share to the live Quotex chart window/tab, then let auto-monitoring re-validate the frame. No trading signals are generated from non-chart content.</p>{active && <p className="mt-1 font-mono text-xs">Validator score: {result.chartDetection.score}/100</p>}</div></div>
    )}
    {status === 'NO_FRESH_FRAME' && (
      <div className="mb-4 border-2 border-rose-400 bg-rose-400/10 p-4 text-rose-200"><p className="font-bold">NO FRESH FRAME — live decisions are stale</p><p className="mt-1 text-sm">Last captured frame is {frameAgeSeconds}s old (limit {FRESH_FRAME_LIMIT_MS / 1000}s). Old decisions are no longer presented as current. Check that screen sharing is still active.</p></div>
    )}
    {flashNewCandle && unified && unified.prediction !== 'WAIT' && (
      <div className={`mb-4 animate-pulse border-2 p-4 text-center text-lg font-black tracking-widest ${cardTone}`}>⚡ NEW CANDLE OPEN — {unified.prediction} · {unified.confluence}/100 confluence · For Next Candle Expiry</div>
    )}
    {/* LEFT: screenshot capture panel · RIGHT: live analysis */}
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <ScreenshotCapturePanel sharedStream={stream} sharedVideo={video} />
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr] min-w-0">
        <div className="border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-sm font-semibold">Live chart preview (actual shared frames)</span>
            <span className={`flex items-center gap-1.5 font-mono text-xs ${frameFresh ? 'text-emerald-300' : 'text-slate-500'}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${frameFresh ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
              {active ? (frameFresh ? 'LIVE FRAME' : 'STALE FRAME') : 'NOT SHARING'}
            </span>
          </div>
          <div className="relative mt-4 grid aspect-video place-items-center overflow-hidden border border-slate-800 bg-slate-950">
            <video ref={video} autoPlay muted className={active ? 'h-full w-full object-contain' : 'hidden'} />
            {!active && <div className="text-center text-slate-500"><Camera className="mx-auto mb-2 h-8 w-8" /><p className="text-sm">Start screen sharing to see the live chart here.</p><p className="mt-1 text-xs">The preview always renders the current shared stream — never a stored screenshot.</p></div>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-400">
            <span>Last frame: {lastCaptureAt ? new Date(lastCaptureAt).toLocaleTimeString() : '—'}</span>
            <span>Frame age: {frameAgeSeconds !== null ? `${frameAgeSeconds}s` : '—'}{frameAgeSeconds !== null && !frameFresh ? ' (STALE)' : ''}</span>
            <span>Capture resolution: {captureResolution ?? '—'}</span>
            <span>Frames captured: {framesCaptured}</span>
            <span>Processing: {working ? 'analyzing…' : decision || unified ? 'complete' : 'waiting for frames'}</span>
            <span>Status: <span className={statusTone[status]}>{statusLabel[status]}</span></span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={active ? stop : () => void start()} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium">{active ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{active ? 'Stop screen share' : 'Share chart screen'}</button>
            <button onClick={() => setPreviewZoom((z) => !z)} disabled={!active} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-40"><Maximize2 className="h-4 w-4" />Fullscreen</button>
          </div>
          {previewZoom && active && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-8" onClick={() => setPreviewZoom(false)}>
              <video ref={video} autoPlay muted className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
        {/* CLEAN SIGNAL CARD — single authoritative result, no strict-math rejection walls */}
        <div className="border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">NEXT CANDLE PREDICTION</p>
          <div className={`mt-4 border p-5 text-center ${cardTone}`}>
            <div className="text-4xl font-black tracking-[.12em]">{unified ? unified.prediction : 'WAIT'}</div>
            <div className="mt-2 font-mono text-sm">Confidence: {unified ? `${unified.predictionConfidence}%` : '—'}{unified && unified.prediction !== 'WAIT' ? '' : ''}</div>
            <div className="mt-1 font-mono text-xs">Confluence: {unified ? `${unified.confluence}/100` : '—'} <span className="opacity-60">(evidence score, not win probability)</span></div>
          </div>
          <div className="mt-4 space-y-1 text-xs text-slate-300">
            <p>Trend: <span className="font-bold text-slate-100">{decision?.trend ?? '—'}</span></p>
            <p>Detected pair: <span className="font-bold text-slate-100">{identity?.pair.pair ?? 'UNKNOWN'}</span></p>
            <p>Market: <span className="font-bold text-slate-100">{identity?.marketType.marketType ?? 'UNKNOWN'}</span></p>
            <p>Timeframe: <span className={`font-bold ${(identity?.timeframe.confidence ?? 0) >= 60 ? 'text-slate-100' : 'text-amber-300'}`}>{identity?.timeframe.timeframe ?? 'UNKNOWN'}{identity && (identity.timeframe.confidence ?? 0) < 60 ? ' — MANUAL CONFIRMATION REQUIRED' : ''}</span></p>
            <p>Next candle start: <span className="text-slate-100">{unifiedTiming ? new Date(unifiedTiming.nextCandleStart).toLocaleTimeString() : '—'}</span></p>
            <p>Next candle expiry: <span className="text-slate-100">{unifiedTiming ? new Date(unifiedTiming.nextCandleExpiry).toLocaleTimeString() : '—'}</span></p>
          </div>
          {unified && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Main reasons</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-300">
                {unified.supportingEvidence.slice(0, 5).map((e, i) => <li key={i}>{e.note}</li>)}
                {unified.supportingEvidence.length === 0 && <li className="text-slate-500">{unified.waitReason ?? 'Insufficient evidence'}</li>}
              </ul>
              {unified.waitReason && <p className="mt-2 border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">WAIT — {unified.waitReason}</p>}
            </div>
          )}
          {!unified && !working && <p className="mt-4 text-sm text-slate-500">Awaiting live frames — the authoritative prediction appears once at least 3 completed candles are readable from the shared chart.</p>}
          {/* Candle-extraction diagnostics — visibility, not decision logic */}
          {result && (
            <details className="mt-4 border border-slate-800 bg-slate-950 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-400">Diagnostics (chart rectangle, candles, OCR, indicators)</summary>
              <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-400">
                <span>Chart valid: {String(result.chartDetection.isChart)} ({result.chartDetection.score}/100)</span>
                <span>Validator: {result.chartDetection.reason.slice(0, 40)}</span>
                <span>Candles reconstructed: {result.reconstructedCandleCount ?? 0}</span>
                <span>Reconstruction quality: {result.reconstructionQuality ?? '—'}</span>
                <span>Last body ratio: {result.candle ? `${(result.candle.bodyRatio * 100).toFixed(0)}%` : '—'}</span>
                <span>Upper/lower wick: {result.candle ? `${(result.candle.upperWickRatio * 100).toFixed(0)}%/${(result.candle.lowerWickRatio * 100).toFixed(0)}%` : '—'}</span>
                <span>RSI: {result.rsiValue !== undefined ? result.rsiValue.toFixed(1) : 'unavailable (needs 15+ closes)'}</span>
                <span>Bollinger: {result.bollinger ? 'available' : 'unavailable (needs 20+ closes)'}</span>
                <span>Pattern: {result.pattern?.pattern ?? '—'}</span>
                <span>Momentum: {result.candle?.momentum ?? '—'}</span>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
      {error && <p className="mt-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {/* AUTHORITATIVE unified decision — evidence breakdown (single consistent result) */}
      {unified && <article className="mt-5 border-2 border-emerald-400 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-emerald-300" />Authoritative Decision Engine — LIVE SCREEN SHARE</div>
          <span className="font-mono text-xs text-slate-500">SOURCE: LIVE SCREEN SHARE · v{unified.algorithmVersion}</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Main signal</p><p className={`mt-1 font-mono text-xl font-black ${unified.mainSignal === 'UP' ? 'text-emerald-300' : unified.mainSignal === 'DOWN' ? 'text-rose-300' : 'text-amber-300'}`}>{unified.mainSignal}</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Prediction</p><p className={`mt-1 font-mono text-xl font-black ${unified.prediction === 'UP' ? 'text-emerald-300' : unified.prediction === 'DOWN' ? 'text-rose-300' : 'text-amber-300'}`}>{unified.prediction}</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Prediction confidence</p><p className="mt-1 font-mono text-xl font-black">{unified.predictionConfidence}%</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Confluence (evidence, not win prob.)</p><p className="mt-1 font-mono text-xl font-black">{unified.confluence}/100</p></div>
        </div>
        <p className="mt-2 font-mono text-xs text-slate-400">Classification: {unified.classification}{unified.qualified ? ' · QUALIFIED OPPORTUNITY' : ''} · Data quality: {unified.dataQuality} · {unified.candlesAnalyzed} completed candles</p>
        {unifiedTiming && <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-300 md:grid-cols-4">
          <span className="border border-slate-700 px-2 py-1">CURRENT CANDLE START: {new Date(unifiedTiming.candleStart).toLocaleTimeString()}</span>
          <span className="border border-slate-700 px-2 py-1">TIMEFRAME: {unifiedTiming.timeframe}</span>
          <span className="border border-amber-400/40 px-2 py-1 text-amber-200">CLOSE COUNTDOWN: {unifiedTiming.secondsToClose}s</span>
          <span className="border border-slate-700 px-2 py-1">NEXT CANDLE EXPIRY: {new Date(unifiedTiming.nextCandleExpiry).toLocaleTimeString()}</span>
        </div>}
        <div className="mt-3 grid gap-3 md:grid-cols-2 text-[11px]">
          <div><p className="font-bold text-emerald-300">Supporting evidence</p><ul className="mt-1 space-y-0.5 font-mono text-slate-400">{unified.supportingEvidence.map((e, i) => <li key={i}>[{e.family}] {e.note} ({e.strength})</li>)}</ul></div>
          <div><p className="font-bold text-rose-300">Opposing evidence</p><ul className="mt-1 space-y-0.5 font-mono text-slate-400">{unified.opposingEvidence.length === 0 ? <li>none</li> : unified.opposingEvidence.map((e, i) => <li key={i}>[{e.family}] {e.note} ({e.strength})</li>)}</ul></div>
        </div>
        {unified.disagreeingFamilies.length > 0 && <p className="mt-2 font-mono text-[11px] text-amber-300">Families in disagreement: {unified.disagreeingFamilies.join(', ')}</p>}
        {unified.waitReason && <p className="mt-2 border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">WAIT reason: {unified.waitReason}</p>}
      </article>}
      {/* Supplementary SPI family-vote breakdown — collapsed, subordinate */}
      {decision && <details className="mt-5 border-l-2 border-violet-400 bg-slate-900/70 p-5">
        <summary className="cursor-pointer text-sm font-semibold"><Activity className="mr-2 inline h-4 w-4 text-violet-300" />Signal Provider Intelligence — family-vote breakdown (subordinate)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Prediction</p><p className={`mt-1 font-mono text-xl font-black ${decision.prediction === 'UP' ? 'text-emerald-300' : decision.prediction === 'DOWN' ? 'text-rose-300' : 'text-amber-300'}`}>{decision.prediction}</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</p><p className="mt-1 font-mono text-xl font-black">{decision.predictionConfidence}%</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Confluence</p><p className="mt-1 font-mono text-xl font-black">{decision.confluenceScore}/100</p></div>
          <div className="border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Classification</p><p className="mt-1 font-mono text-sm font-bold text-slate-200">{decision.classification}{decision.qualified ? ' · QUALIFIED' : ''}</p></div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-[11px]">
          <div><p className="font-bold text-emerald-300">Supporting (UP)</p><ul className="mt-1 space-y-0.5 font-mono text-slate-400">{decision.bullishVotes.map((v) => <li key={v.strategy}>{v.strategy}: {v.evidence} ({v.strength})</li>)}</ul></div>
          <div><p className="font-bold text-rose-300">Opposing (DOWN)</p><ul className="mt-1 space-y-0.5 font-mono text-slate-400">{decision.bearishVotes.map((v) => <li key={v.strategy}>↳ {v.evidence}</li>)}</ul></div>
          <div><p className="font-bold text-slate-300">Neutral / indecisive</p><ul className="mt-1 space-y-0.5 font-mono text-slate-500">{decision.neutralVotes.map((v) => <li key={v.strategy}>{v.strategy}: {v.evidence}</li>)}</ul></div>
        </div>
      {/* The old strict-mathematical-reasoning panel was REMOVED — the authoritative unified engine is the sole decision source. */}
      </details>}
    <canvas ref={canvas} className="hidden" />
  </section>;
};
function badgeTone(signal: string): string {
  return signal === 'CALL' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
    : signal === 'PUT' ? 'border-rose-400 bg-rose-400/10 text-rose-300'
      : 'border-amber-400 bg-amber-400/10 text-amber-300';
}


/**
 * Left-side screenshot capture panel (Part 14). Captures the CURRENT frame from
 * the active shared screen without stopping live monitoring, shows the exact
 * captured image, and sends it to the Screenshot Lab pipeline for an
 * independent analysis with the same deterministic engine.
 */
const ScreenshotCapturePanel: React.FC<{ sharedStream: React.RefObject<MediaStream | null>; sharedVideo: React.RefObject<HTMLVideoElement | null> }> = ({ sharedVideo }) => {
  const shotCanvas = useRef<HTMLCanvasElement>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotAt, setShotAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState('');
  const [sendErr, setSendErr] = useState('');

  const capture = useCallback((chartCrop: boolean) => {
    const videoEl = sharedVideo.current;
    if (!videoEl || videoEl.videoWidth === 0) { setSendErr('No active shared screen — start screen sharing first.'); return; }
    const c = shotCanvas.current!;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    c.width = 320; c.height = 180;
    ctx.drawImage(videoEl, 0, 0, 320, 180);
    const pixels = ctx.getImageData(0, 0, 320, 180).data;
    const greenish = (i: number) => pixels[i + 1] > pixels[i] * 1.1 && pixels[i + 1] > pixels[i + 2] * 1.1;
    const reddish = (i: number) => pixels[i] > pixels[i + 1] * 1.1 && pixels[i] > pixels[i + 2] * 1.1;
    let x0 = 0, y0 = 0, x1 = c.width, y1 = c.height;
    if (chartCrop) {
      x0 = c.width; y0 = c.height; x1 = 0; y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if ((greenish(i) || reddish(i)) && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 60) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = c.width; y1 = c.height; }
    }
    const crop = document.createElement('canvas');
    crop.width = Math.max(2, x1 - x0 + 1); crop.height = Math.max(2, y1 - y0 + 1);
    crop.getContext('2d')!.drawImage(c, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    crop.toBlob((blob) => {
      if (blob) setShotUrl(URL.createObjectURL(blob));
    }, 'image/png');
    setShotAt(Date.now());
    setSendErr(''); setSentNote(chartCrop ? 'Chart region captured.' : 'Full frame captured.');
  }, [sharedVideo]);

  const sendToLab = useCallback(async () => {
    if (!shotUrl) { setSendErr('Capture a screenshot first.'); return; }
    setSending(true); setSendErr(''); setSentNote('');
    try {
      const img = new Image();
      img.src = shotUrl;
      await img.decode();
      const W = Math.min(1600, Math.max(320, img.naturalWidth || 960));
      const H = Math.min(900, Math.max(180, Math.round((img.naturalHeight / Math.max(img.naturalWidth, 1)) * W)));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, W, H);
      const res = await analyzeFrameViaJpeg<{ success: boolean; result?: ShotAnalysisResult; error?: string }>(c, { timeframe: '1M' });
      if (!res.ok || !res.data?.success) throw new Error(res.error || 'Screenshot analysis failed.');
      const analysis = res.data.result as ShotAnalysisResult;
      await safeFetchJson('/api/screenshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'LIVE_CAPTURE', width: img.naturalWidth || W, height: img.naturalHeight || H, result: analysis }),
      });
      setSentNote(`Independently analysed & saved (${analysis.signal} · ${analysis.confidenceScore}%). Open the Screenshot Lab tab for the full result and history.`);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Failed to send screenshot.');
    } finally { setSending(false); }
  }, [shotUrl]);

  return <aside className="flex flex-col gap-3 self-start border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2"><span className="flex items-center gap-2 text-sm font-semibold"><ClipboardPaste className="h-4 w-4 text-cyan-300" />Screenshot capture</span><span className="font-mono text-[10px] text-slate-500">Live-tab side panel</span></div>
    <div className="flex flex-col gap-2">
      <button onClick={() => capture(false)} className="flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200"><Camera className="h-4 w-4" />Capture Current Screen</button>
      <button onClick={() => capture(true)} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200"><ImageIcon className="h-4 w-4" />Capture Current Chart</button>
    </div>
    <div className="grid aspect-video place-items-center overflow-hidden border border-slate-800 bg-slate-950">
      {shotUrl ? <img src={shotUrl} alt="Captured screenshot" className="h-full w-full object-contain" /> : <p className="p-3 text-center text-xs text-slate-500">Captured screenshot appears here — the exact image sent to the lab.</p>}
    </div>
    {shotAt && <p className="font-mono text-[10px] text-emerald-400">Captured {new Date(shotAt).toLocaleTimeString()} — analysis runs independently on THIS image.</p>}
    <button onClick={() => void sendToLab()} disabled={sending || !shotUrl} className="flex items-center gap-2 bg-cyan-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"><Zap className="h-4 w-4" />{sending ? 'Sending…' : 'Send to Screenshot Analysis'}</button>
    {sentNote && <p className="text-[11px] text-emerald-300">{sentNote}</p>}
    {sendErr && <p className="text-[11px] text-rose-300">{sendErr}</p>}
    <canvas ref={shotCanvas} className="hidden" />
  </aside>;
};
