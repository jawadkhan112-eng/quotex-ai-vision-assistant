import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MonitorPlay,
  Play,
  Pause,
  Square,
  Camera,
  Zap,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  TrendingUp,
  Flame,
  Activity,
  CheckCircle2,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';
import { SignalData } from '../types';

interface LiveScreenAnalyzerViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  onAnalysisComplete: (result: SignalData) => void;
  geminiConnected: boolean;
}

export const LiveScreenAnalyzerView: React.FC<LiveScreenAnalyzerViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
  onAnalysisComplete,
  geminiConnected,
}) => {
  // Session & Capture States
  const [streamActive, setStreamActive] = useState(false);
  const [streamPaused, setStreamPaused] = useState(false);
  const [autoAnalysisActive, setAutoAnalysisActive] = useState(false);
  const [analysisInterval, setAnalysisInterval] = useState<number>(10); // Default 10 seconds
  const [lastFrameTimestamp, setLastFrameTimestamp] = useState<string | null>(null);
  const [lastAnalysisTimestamp, setLastAnalysisTimestamp] = useState<string | null>(null);

  // Frame & Analysis States
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [signalResult, setSignalResult] = useState<SignalData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiUsageCount, setApiUsageCount] = useState<number>(0);

  // Refs for persistent stream and timers across tab switches
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const autoAnalysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);

  // 1. Start Screen Sharing (WebRTC getDisplayMedia)
  const startScreenShare = async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'browser', // Prefer browser tab selection
        } as any,
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setStreamActive(true);
      setStreamPaused(false);

      // Listen for actual track termination (e.g. native browser stop bar)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMessage(`Screen capture error: ${err.message}`);
      }
    }
  };

  // 2. Pause / Resume Stream
  const togglePauseStream = () => {
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getVideoTracks();
      const newPausedState = !streamPaused;
      tracks.forEach((track) => {
        track.enabled = !newPausedState;
      });
      setStreamPaused(newPausedState);
    }
  };

  // 3. Stop Screen Sharing & Clean Up All Resources
  const stopScreenShare = () => {
    // Stop auto monitoring loop
    if (autoAnalysisTimerRef.current) {
      clearInterval(autoAnalysisTimerRef.current);
      autoAnalysisTimerRef.current = null;
    }
    setAutoAnalysisActive(false);

    // Stop MediaStream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStreamActive(false);
    setStreamPaused(false);
    isAnalyzingRef.current = false;
  };

  // 4. Capture Current Frame from Video Stream
  const captureFrameFromVideo = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current || !streamActive) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2) return null; // Ensure video metadata is ready

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setCapturedFrame(dataUrl);
    setLastFrameTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return dataUrl;
  }, [streamActive]);

  // 5. Run Single Analysis Cycle
  const runAnalysisCycle = useCallback(
    async (overrideImage?: string) => {
      if (isAnalyzingRef.current || !geminiConnected) return;

      const frameData = overrideImage || captureFrameFromVideo();
      if (!frameData) return;

      isAnalyzingRef.current = true;
      setAnalyzing(true);
      setErrorMessage(null);

      try {
        const res = await fetch('/api/analyze-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedSymbol,
            timeframe: selectedTimeframe,
            base64Image: frameData,
          }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Frame analysis failed');

        setSignalResult(data.result);
        onAnalysisComplete(data.result);
        setApiUsageCount((prev) => prev + 1);
        setLastAnalysisTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err: any) {
        setErrorMessage(err.message || 'Error analyzing live chart frame');
      } finally {
        setAnalyzing(false);
        isAnalyzingRef.current = false;
      }
    },
    [captureFrameFromVideo, geminiConnected, onAnalysisComplete, selectedSymbol, selectedTimeframe]
  );

  // 6. Toggle Continuous Auto Chart Monitoring Loop
  const toggleAutoMonitoring = () => {
    if (autoAnalysisActive) {
      if (autoAnalysisTimerRef.current) {
        clearInterval(autoAnalysisTimerRef.current);
        autoAnalysisTimerRef.current = null;
      }
      setAutoAnalysisActive(false);
    } else {
      if (!streamActive) {
        setErrorMessage('Start Live Screen Sharing first before enabling Auto Chart Monitoring.');
        return;
      }
      setAutoAnalysisActive(true);
      runAnalysisCycle(); // Immediate initial run

      autoAnalysisTimerRef.current = setInterval(() => {
        runAnalysisCycle();
      }, analysisInterval * 1000);
    }
  };

  // Re-sync timer interval if interval changed while auto monitoring active
  useEffect(() => {
    if (autoAnalysisActive) {
      if (autoAnalysisTimerRef.current) clearInterval(autoAnalysisTimerRef.current);
      autoAnalysisTimerRef.current = setInterval(() => {
        runAnalysisCycle();
      }, analysisInterval * 1000);
    }
  }, [analysisInterval, autoAnalysisActive, runAnalysisCycle]);

  // 7. Tab Visibility Persistence Handling (Do NOT stop capture on tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Intentionally keep stream and timers alive when document.hidden is true!
      // Browser visibility change does NOT terminate user-authorized display MediaStream.
      if (!document.hidden && videoRef.current && mediaStreamRef.current) {
        // Re-attach stream to video element if browser paused playback
        videoRef.current.srcObject = mediaStreamRef.current;
        videoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoAnalysisTimerRef.current) clearInterval(autoAnalysisTimerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title Bar & Main Stream Controls */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-cyan-400" /> Dedicated Live Trading Workspace
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Continuous live shared Quotex chart monitoring with persistent tab-switching session continuity.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!streamActive ? (
            <button
              onClick={startScreenShare}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              <Play className="w-4 h-4 fill-current" /> Start Screen Sharing
            </button>
          ) : (
            <>
              <button
                onClick={togglePauseStream}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" /> {streamPaused ? 'Resume Capture' : 'Pause Capture'}
              </button>

              <button
                onClick={toggleAutoMonitoring}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
                  autoAnalysisActive
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> {autoAnalysisActive ? 'Pause Auto Monitoring' : 'Start Auto Monitoring'}
              </button>

              <button
                onClick={stopScreenShare}
                className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-medium rounded-lg flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" /> Stop Sharing
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Persistent Tab-Switching Active: You can switch browser tabs freely without interrupting live chart capture.
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {streamActive ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> LIVE SHARING ACTIVE
            </span>
          ) : (
            <span className="text-slate-500">STREAM INACTIVE</span>
          )}

          {autoAnalysisActive && (
            <span className="text-cyan-300 font-medium">
              MONITORING ({analysisInterval}s interval)
            </span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* SPLIT SCREEN WORKSPACE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT SIDE: AI LIVE ANALYSIS PANEL (col-span-6) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            {/* Header Status Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" /> AI Live Analysis Panel
                </h3>
                <p className="text-[11px] text-slate-400">
                  Symbol: <strong className="text-slate-200 font-mono">{selectedSymbol}</strong> ({selectedTimeframe})
                </p>
              </div>

              {lastAnalysisTimestamp && (
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" /> {lastAnalysisTimestamp}
                </span>
              )}
            </div>

            {/* Signal & Evidence Score Display */}
            {signalResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">LIVE SIGNAL</span>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className={`text-2xl font-black font-mono px-3.5 py-1 rounded-lg ${
                          signalResult.signal === 'CALL'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : signalResult.signal === 'PUT'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}
                      >
                        {signalResult.signal}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">EVIDENCE QUALITY</span>
                    <div className="text-xl font-bold font-mono text-cyan-400">
                      {signalResult.evidenceQualityScore}%
                    </div>
                    <span className="text-[10px] text-slate-500">Non-guaranteed score</span>
                  </div>
                </div>

                {/* Summary Reason */}
                <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                  {signalResult.summaryReason}
                </p>

                {/* Technicals & Candlestick Summary Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Trend Bias:</span>
                    <span className="text-cyan-300 font-semibold">{signalResult.indicatorConsensus?.trendBias || 'NEUTRAL'}</span>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Candlesticks:</span>
                    <span className="text-slate-200">
                      {signalResult.candlestickMatches?.length ? `${signalResult.candlestickMatches.length} Pattern(s)` : 'None detected'}
                    </span>
                  </div>
                </div>

                {/* Supporting Reasons List */}
                <div className="space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Supporting Evidence ({signalResult.supportingEvidence.length})
                  </span>
                  <ul className="space-y-1 text-slate-400 pl-5 list-disc">
                    {signalResult.supportingEvidence.map((re, idx) => (
                      <li key={idx}>{re}</li>
                    ))}
                  </ul>
                </div>

                {/* Opposing Factors List */}
                {signalResult.opposingEvidence.length > 0 && (
                  <div className="space-y-1.5 text-xs border-t border-slate-800/80 pt-2">
                    <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Opposing Factors ({signalResult.opposingEvidence.length})
                    </span>
                    <ul className="space-y-1 text-amber-200/80 pl-5 list-disc">
                      {signalResult.opposingEvidence.map((op, idx) => (
                        <li key={idx}>{op}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-dashed border-slate-800 rounded-lg p-10 text-center text-slate-500 space-y-2">
                <MonitorPlay className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-medium">Awaiting Chart Frames</p>
                <p className="text-xs">
                  Start Live Screen Sharing on the right and click "Analyze Now" or "Start Auto Monitoring" to populate live analysis.
                </p>
              </div>
            )}

            {/* Analysis Interval Controls Footer */}
            <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Monitoring Interval:</span>
                <select
                  value={analysisInterval}
                  onChange={(e) => setAnalysisInterval(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono"
                >
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds (Default)</option>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-mono text-[11px]">API Calls: {apiUsageCount}</span>
                <button
                  onClick={() => runAnalysisCycle()}
                  disabled={analyzing || !streamActive}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded text-xs flex items-center gap-1.5 font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin text-cyan-400' : ''}`} />
                  Analyze Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: LIVE SHARED QUOTEX CHART PREVIEW (col-span-6) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" /> Live Shared Chart Stream
              </h3>

              {lastFrameTimestamp && (
                <span className="text-[11px] font-mono text-slate-400">Last Frame: {lastFrameTimestamp}</span>
              )}
            </div>

            {/* Live Video MediaStream Display */}
            <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${streamActive ? 'block' : 'hidden'}`}
              />

              {!streamActive && (
                <div className="text-center p-8 space-y-2 text-slate-500">
                  <MonitorPlay className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-medium">Shared Screen Preview Inactive</p>
                  <p className="text-xs max-w-xs mx-auto">
                    Click "Start Screen Sharing" above to grant browser permission to stream your Quotex chart.
                  </p>
                </div>
              )}
            </div>

            {/* Video Controls & Frame Actions */}
            {streamActive && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <button
                  onClick={() => captureFrameFromVideo()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 font-medium"
                >
                  <Camera className="w-3.5 h-3.5 text-cyan-400" /> Capture Frame Snapshot
                </button>

                <span className="text-slate-500 font-mono text-[11px]">
                  Real-time WebRTC Stream Active
                </span>
              </div>
            )}
          </div>

          {/* Captured Frame Thumbnail Preview */}
          {capturedFrame && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-medium">Latest Captured Frame Thumbnail</span>
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 max-h-36">
                <img src={capturedFrame} alt="Captured Frame Preview" className="w-full h-full object-contain" />
              </div>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
