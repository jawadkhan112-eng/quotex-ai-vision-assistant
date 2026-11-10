import React, { useState, useRef, useEffect, useCallback } from 'react';
import { safeFetch } from '../apiClient';
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
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  SlidersHorizontal,
  FileText,
  ListChecks,
} from 'lucide-react';
import { SignalData, MonitoringLogEntry } from '../types';

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
  const [lastAnalyzedHash, setLastAnalyzedHash] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [signalResult, setSignalResult] = useState<SignalData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiUsageCount, setApiUsageCount] = useState<number>(0);

  // Monitoring Activity Logs
  const [monitoringLogs, setMonitoringLogs] = useState<MonitoringLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: 'INFO',
      message: 'Live Screen-Sharing AI Vision terminal initialized. Awaiting user screen share permission.',
    },
  ]);

  const addLog = (type: MonitoringLogEntry['type'], message: string, signal?: 'CALL' | 'PUT' | 'WAIT', confidence?: number) => {
    setMonitoringLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type,
        message,
        signal,
        confidence,
      },
      ...prev.slice(0, 49), // Keep latest 50 entries
    ]);
  };

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
          displaySurface: 'browser', // Suggest browser tab selection
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
      addLog('INFO', 'Browser screen share started successfully. Ready for AI frame capture.');

      // Listen for actual track termination (e.g. native browser "Stop sharing" button)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          addLog('WARN', 'User stopped screen sharing from browser controls.');
          stopScreenShare();
        };
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Screen sharing permission was denied by the user.');
        addLog('WARN', 'Screen sharing permission denied by user.');
      } else {
        setErrorMessage(`Screen capture error: ${err.message}`);
        addLog('ERROR', `Screen capture failure: ${err.message}`);
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
      addLog('INFO', newPausedState ? 'Live screen capture paused.' : 'Live screen capture resumed.');
    }
  };

  // 3. Stop Screen Sharing & Clean Up All Resources
  const stopScreenShare = () => {
    if (autoAnalysisTimerRef.current) {
      clearInterval(autoAnalysisTimerRef.current);
      autoAnalysisTimerRef.current = null;
    }
    setAutoAnalysisActive(false);

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
    addLog('INFO', 'Screen sharing session ended.');
  };

  // 4. Capture Current Frame with Image Optimization & Deduplication Check
  const captureFrameFromVideo = useCallback((): { dataUrl: string; hash: string } | null => {
    if (!videoRef.current || !canvasRef.current || !streamActive) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2) return null;

    // Scale to standard HD resolution for optimal AI latency & cost
    const targetWidth = Math.min(1280, video.videoWidth || 1280);
    const targetHeight = Math.min(720, video.videoHeight || 720);

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Lightweight fingerprint of frame based on sample byte slice
    const hash = dataUrl.slice(100, 300);

    setCapturedFrame(dataUrl);
    setLastFrameTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return { dataUrl, hash };
  }, [streamActive]);

  // 5. Run Single Analysis Cycle
  const runAnalysisCycle = useCallback(
    async (overrideImage?: string, skipDeduplication = false) => {
      if (isAnalyzingRef.current) return;

      let frameData: string;
      let frameHash = '';

      if (overrideImage) {
        frameData = overrideImage;
      } else {
        const capture = captureFrameFromVideo();
        if (!capture) return;
        frameData = capture.dataUrl;
        frameHash = capture.hash;
      }

      // Deduplication: prevent sending unchanged identical frames
      if (!skipDeduplication && frameHash && frameHash === lastAnalyzedHash) {
        addLog('CAPTURE', 'Frame identical to previous capture (market paused or chart static). Skipping redundant AI call.');
        return;
      }

      isAnalyzingRef.current = true;
      setAnalyzing(true);
      setErrorMessage(null);
      addLog('ANALYSIS', `Transmitting chart frame to AI Vision Engine for ${selectedSymbol} (${selectedTimeframe})...`);

      try {
        const data = await safeFetch<any>('/api/analyze-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedSymbol,
            timeframe: selectedTimeframe,
            base64Image: frameData,
          }),
        });

        if (!data || !data.success) throw new Error(data?.error || 'Frame analysis failed');

        setSignalResult(data.result);
        onAnalysisComplete(data.result);
        setLastAnalyzedHash(frameHash);
        setApiUsageCount((prev) => prev + 1);
        setLastAnalysisTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        addLog(
          'SIGNAL',
          `Analysis complete: ${data.result.signal} (${data.result.confidenceScore}% confidence) — ${data.result.summaryReason}`,
          data.result.signal,
          data.result.confidenceScore
        );
      } catch (err: any) {
        setErrorMessage(err.message || 'Error analyzing live chart frame');
        addLog('ERROR', `Analysis failed: ${err.message}`);
      } finally {
        setAnalyzing(false);
        isAnalyzingRef.current = false;
      }
    },
    [captureFrameFromVideo, lastAnalyzedHash, onAnalysisComplete, selectedSymbol, selectedTimeframe]
  );

  // 6. Toggle Continuous Auto Chart Monitoring Loop
  const toggleAutoMonitoring = () => {
    if (autoAnalysisActive) {
      if (autoAnalysisTimerRef.current) {
        clearInterval(autoAnalysisTimerRef.current);
        autoAnalysisTimerRef.current = null;
      }
      setAutoAnalysisActive(false);
      addLog('INFO', 'Auto chart monitoring loop paused.');
    } else {
      if (!streamActive) {
        setErrorMessage('Start Live Screen Sharing first before enabling Auto Chart Monitoring.');
        return;
      }
      setAutoAnalysisActive(true);
      addLog('INFO', `Auto chart monitoring started at ${analysisInterval}s interval.`);
      runAnalysisCycle(undefined, true);

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

  // 7. Tab Visibility Persistence Handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && videoRef.current && mediaStreamRef.current) {
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
            <MonitorPlay className="w-5 h-5 text-cyan-400" /> Screen-Sharing Live Chart Workspace
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Share your live Quotex chart tab or window for continuous multimodal AI vision analysis and next-candle signal generation.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!streamActive ? (
            <button
              onClick={startScreenShare}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              <Play className="w-4 h-4 fill-current" /> Select Screen / Tab to Share
            </button>
          ) : (
            <>
              <button
                onClick={togglePauseStream}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" /> {streamPaused ? 'Resume Stream' : 'Pause Stream'}
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
            Data Source: <strong className="text-slate-200">User's Shared Screen Exclusively</strong> (No external market data feeds used).
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {streamActive ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> LIVE SHARING ACTIVE
            </span>
          ) : (
            <span className="text-slate-500">SCREEN SHARING IDLE</span>
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
        {/* LEFT SIDE: AI LIVE ANALYSIS & CONFIRMATIONS PANEL (col-span-6) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            {/* Header Status Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" /> Next-Candle Signal Panel
                </h3>
                <p className="text-[11px] text-slate-400">
                  Target: <strong className="text-slate-200 font-mono">{selectedSymbol}</strong> ({selectedTimeframe} expiry)
                </p>
              </div>

              {lastAnalysisTimestamp && (
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" /> {lastAnalysisTimestamp}
                </span>
              )}
            </div>

            {/* Signal & Confidence Score Display */}
            {signalResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">NEXT-CANDLE SIGNAL</span>
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
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">CONFIDENCE SCORE</span>
                    <div className="text-xl font-bold font-mono text-cyan-400">
                      {signalResult.confidenceScore}%
                    </div>
                    <span className="text-[10px] text-slate-500">Technical confluence score</span>
                  </div>
                </div>

                {/* Summary Reason */}
                <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                  {signalResult.summaryReason}
                </p>

                {/* Timing & Expiry Guidance Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Entry Timing:</span>
                    <span className="text-cyan-300 font-semibold">{signalResult.entryTimingGuidance}</span>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Next-Candle Expiry:</span>
                    <span className="text-slate-200">{signalResult.nextCandleExpiryEstimate}</span>
                  </div>
                </div>

                {/* Transparent Confirmation Checklist */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <span className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-cyan-400" /> Transparent Confirmation Checklist
                  </span>

                  <div className="space-y-1.5 text-xs font-mono">
                    {signalResult.confirmationChecklist &&
                      Object.values(signalResult.confirmationChecklist).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            {item.status === 'PASSED' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : item.status === 'FAILED' ? (
                              <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            ) : (
                              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <span className="text-slate-300">{item.name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400 truncate max-w-[160px]">{item.detail}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                item.status === 'PASSED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : item.status === 'FAILED'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Invalidation Conditions */}
                <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs space-y-1">
                  <span className="font-semibold text-rose-400 block">Signal Invalidation Condition:</span>
                  <p className="text-rose-200/80 leading-relaxed">{signalResult.invalidationConditions}</p>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-slate-800 rounded-lg p-10 text-center text-slate-500 space-y-2">
                <MonitorPlay className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-medium">Awaiting Chart Frames</p>
                <p className="text-xs">
                  Share your Quotex browser tab on the right and click "Analyze Frame Now" or "Start Auto Monitoring".
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
                  <option value={10}>10 seconds (Recommended)</option>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-mono text-[11px]">API Calls: {apiUsageCount}</span>
                <button
                  onClick={() => runAnalysisCycle(undefined, true)}
                  disabled={analyzing || !streamActive}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded text-xs flex items-center gap-1.5 font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin text-cyan-400' : ''}`} />
                  Analyze Frame Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: LIVE SHARED QUOTEX CHART PREVIEW & LOGS (col-span-6) */}
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
                    Click "Select Screen / Tab to Share" above to grant browser permission to stream your Quotex chart.
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
                  <Camera className="w-3.5 h-3.5 text-cyan-400" /> Manual Snapshot Capture
                </button>

                <span className="text-slate-500 font-mono text-[11px]">
                  WebRTC Display Stream Active
                </span>
              </div>
            )}
          </div>

          {/* Monitoring Activity Logs */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" /> Monitoring Activity Log
              </span>
              <span className="text-[10px] font-mono text-slate-500">{monitoringLogs.length} events</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto text-[11px] font-mono pr-1">
              {monitoringLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-1.5 rounded bg-slate-950/70 border border-slate-800/60 flex items-start gap-2"
                >
                  <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                  <span
                    className={`font-bold shrink-0 ${
                      log.type === 'SIGNAL'
                        ? log.signal === 'CALL'
                          ? 'text-emerald-400'
                          : log.signal === 'PUT'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                        : log.type === 'ERROR'
                        ? 'text-rose-400'
                        : log.type === 'WARN'
                        ? 'text-amber-400'
                        : log.type === 'ANALYSIS'
                        ? 'text-cyan-400'
                        : 'text-slate-400'
                    }`}
                  >
                    [{log.type}]
                  </span>
                  <span className="text-slate-300 leading-tight">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
