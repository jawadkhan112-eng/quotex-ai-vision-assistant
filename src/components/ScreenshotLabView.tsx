import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Camera, Eye, Trash2, Image as ImageIcon } from 'lucide-react';
import type { AlgoAnalysisResult } from '../types';
import { detectChartIdentity } from '../services/chartOcr';
import { describeIdentityChange, type ChartIdentity } from '../../server/chartIdentity';

interface ScreenshotRow {
  id: number;
  created_at: string;
  source: string;
  width: number | null;
  height: number | null;
  chart_valid: number;
  chart_score: number | null;
  signal: string;
  confidence: number;
  candles_detected: number | null;
  candle_quality: string | null;
  reasoning: string | null;
}

/**
 * Screenshot Lab — upload or drag-drop a chart screenshot, run the same
 * deterministic engine used for live frames, and persist the analysis.
 * Uses real image pixels; no fabricated inputs.
 */
export const ScreenshotLabView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AlgoAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [history, setHistory] = useState<ScreenshotRow[]>([]);
  // Each screenshot keeps its OWN identity — never overwritten by live-screen data.
  const [shotIdentity, setShotIdentity] = useState<ChartIdentity | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/screenshots?limit=50');
      const data = await res.json();
      if (data.success) setHistory(data.screenshots);
    } catch { /* history optional */ }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const analyzeImage = useCallback(async (image: HTMLImageElement) => {
    setWorking(true); setError(''); setResult(null); setShotIdentity(null);
    try {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const W = 320, H = 180;
      canvas.width = W; canvas.height = H;
      ctx.drawImage(image, 0, 0, W, H);
      const pixels = Array.from(ctx.getImageData(0, 0, W, H).data);
      // Independent identity detection on THIS exact screenshot.
      try {
        const detection = await detectChartIdentity(canvas);
        setShotIdentity(detection.identity);
      } catch { setShotIdentity(null); }
      const res = await fetch('/api/analyze-algorithmic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: { width: W, height: H, pixels } }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const analysis = data.result as AlgoAnalysisResult;
      setResult(analysis);
      // Persist the analysis record (metadata only, not the raw image).
      await fetch('/api/screenshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'UPLOAD', width: image.naturalWidth, height: image.naturalHeight, result: analysis }),
      });
      await loadHistory();
    } catch (e) { setError(e instanceof Error ? e.message : 'Screenshot analysis failed.'); }
    finally { setWorking(false); }
  }, [loadHistory]);

  const onFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please provide a PNG/JPG screenshot image.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null;
      setPreview(url); setShotIdentity(null);
      if (!url) return;
      const img = new Image();
      img.onload = () => void analyzeImage(img);
      img.src = url;
    };
    reader.readAsDataURL(file);
  }, [analyzeImage]);

  const captureCurrentScreen = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.play();
      await new Promise((r) => { video.onloadedmetadata = () => r(null); });
      const img = new Image();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      img.onload = () => { setPreview(canvas.toDataURL('image/png')); void analyzeImage(img); stream.getTracks().forEach((t) => t.stop()); };
      img.src = canvas.toDataURL('image/png');
    } catch { setError('Screen capture was not granted or failed.'); }
  };

  const remove = async (id: number) => { try { await fetch(`/api/screenshots/${id}`, { method: 'DELETE' }); await loadHistory(); } catch { /* ignore */ } };

  return <section className="mx-auto max-w-7xl p-5 lg:p-8">
    <div className="mb-6"><p className="font-mono text-[11px] uppercase tracking-[.24em] text-cyan-400">Same deterministic engine as live monitoring</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><ImageIcon className="h-6 w-6 text-cyan-300" />Screenshot Lab</h2></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <div
          className="grid aspect-video place-items-center overflow-hidden border border-slate-800 bg-slate-950"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        >
          {preview ? <img src={preview} alt="Screenshot preview" className="h-full w-full object-contain" /> : <p className="p-6 text-center text-sm text-slate-500">Drop a chart screenshot here, upload one, or capture the current screen.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium"><Upload className="h-4 w-4" />Upload screenshot<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} /></label>
          <button onClick={() => void captureCurrentScreen()} className="flex items-center gap-2 border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium"><Camera className="h-4 w-4" />Capture current screen</button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {error && <p className="mt-4 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      </div>
      <div className="border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Analysis result</p>
        {working && <p className="mt-4 text-sm text-slate-400">Analyzing…</p>}
        {result ? (
          <div className="mt-4 space-y-3">
            <div className={`border p-4 text-center ${result.signal === 'CALL' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : result.signal === 'PUT' ? 'border-rose-400 bg-rose-400/10 text-rose-300' : 'border-amber-400 bg-amber-400/10 text-amber-300'}`}>
              <p className="text-2xl font-black">{result.actionBadge}</p>
              <p className="mt-1 font-mono text-xs">{result.confidenceScore}% confluence · {result.expiry.label}</p>
            </div>
            <div className="border border-slate-800 bg-slate-950 p-3 font-mono text-xs">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Detected identity (this screenshot only)</p>
              <p className="mt-1">PAIR: <span className="font-bold text-slate-100">{shotIdentity?.pair.pair ?? 'UNKNOWN'}</span> ({shotIdentity?.pair.confidence ?? 0}%)</p>
              <p>MARKET: <span className="font-bold text-slate-100">{shotIdentity?.marketType.marketType ?? 'UNKNOWN'}</span></p>
              <p>TIMEFRAME: <span className="font-bold text-slate-100">{shotIdentity?.timeframe.timeframe ?? 'UNKNOWN'}</span> ({shotIdentity?.timeframe.confidence ?? 0}%)</p>
              <p className="text-slate-500">Status: {(shotIdentity?.pair.confidence ?? 0) >= 60 ? 'VERIFIED' : shotIdentity ? 'ESTIMATED' : 'UNKNOWN'} · detected from this image, independent of live screen</p>
            </div>
            <p className="font-mono text-xs text-slate-400">Chart: {result.chartDetection.isChart ? `valid (score ${result.chartDetection.score}/100)` : 'NOT VALID'}</p>
            <p className="text-sm text-slate-300">{result.reasoning}</p>
            {result.pattern && <p className="font-mono text-xs text-slate-500">{result.pattern.description}</p>}
          </div>
        ) : !working ? <p className="mt-4 text-sm text-slate-500">Analyze a screenshot to see the chart detection, signal, and reasoning here.</p> : null}
      </div>
    </div>
    <div className="mt-6 border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Analysis history (persisted)</p>
      {history.length === 0 ? <p className="mt-3 text-sm text-slate-500">No screenshot analyses saved yet.</p> : (
        <table className="mt-3 w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['Time', 'Source', 'Chart', 'Signal', 'Confidence', 'Candles', 'Quality', ''].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
          <tbody>{history.map((r) => (
            <tr key={r.id} className="border-b border-slate-800/60">
              <td className="px-2 py-1.5 font-mono text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-2 py-1.5">{r.source}</td>
              <td className="px-2 py-1.5">{r.chart_valid ? `✓ ${r.chart_score ?? ''}` : '✗'}</td>
              <td className={`px-2 py-1.5 font-bold ${r.signal === 'CALL' ? 'text-emerald-300' : r.signal === 'PUT' ? 'text-rose-300' : 'text-amber-300'}`}>{r.signal}</td>
              <td className="px-2 py-1.5 font-mono">{r.confidence}%</td>
              <td className="px-2 py-1.5">{r.candles_detected ?? '—'}</td>
              <td className="px-2 py-1.5">{r.candle_quality ?? '—'}</td>
              <td className="px-2 py-1.5 text-right"><button onClick={() => void remove(r.id)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
    <button className="hidden"><Eye className="h-4 w-4" /></button>
  </section>;
};
