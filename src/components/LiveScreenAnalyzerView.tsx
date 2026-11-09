import React, { useState, useRef, useEffect } from 'react';
import { MonitorPlay, Play, Pause, Square, Camera, Zap, ShieldAlert, AlertTriangle } from 'lucide-react';
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
  const [streamActive, setStreamActive] = useState(false);
  const [streamPaused, setStreamPaused] = useState(false);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [signalResult, setSignalResult] = useState<SignalData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startScreenShare = async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStreamActive(true);
      setStreamPaused(false);

      // Listen for stream end (user clicks browser stop sharing button)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMessage(`Screen capture permission failed: ${err.message}`);
      }
    }
  };

  const pauseScreenShare = () => {
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getVideoTracks();
      tracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setStreamPaused(!streamPaused);
    }
  };

  const stopScreenShare = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setStreamPaused(false);
  };

  const captureCurrentFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedFrame(dataUrl);
    }
  };

  const analyzeCapturedFrame = async () => {
    if (!capturedFrame) return;

    setAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/analyze-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          base64Image: capturedFrame,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Frame analysis failed');

      setSignalResult(data.result);
      onAnalysisComplete(data.result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error analyzing captured frame');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    return () => {
      // Clean up stream resources on unmount
      stopScreenShare();
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-cyan-400" /> Authorized Live Screen Analyzer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Share your browser window or Quotex tab with user permission to capture frames for AI vision processing.
          </p>
        </div>

        {/* Capture Controls */}
        <div className="flex items-center gap-2">
          {!streamActive ? (
            <button
              onClick={startScreenShare}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" /> Start Screen Sharing
            </button>
          ) : (
            <>
              <button
                onClick={pauseScreenShare}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" /> {streamPaused ? 'Resume' : 'Pause'}
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

      {/* Privacy Notice */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Strict Privacy Protection: Screen capture is strictly user-authorized and never captures passwords or private account credentials.
          </span>
        </div>
        {streamActive && (
          <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] shrink-0 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> LIVE SHARING ACTIVE
          </span>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Screen Stream & Capture Canvas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Video Preview Window */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-3">
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
                  <p className="text-sm font-medium">Screen Sharing Inactive</p>
                  <p className="text-xs">Click "Start Screen Sharing" above to grant permission to capture your Quotex chart tab.</p>
                </div>
              )}
            </div>

            {streamActive && (
              <div className="flex items-center justify-between">
                <button
                  onClick={captureCurrentFrame}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg border border-slate-700 flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-cyan-400" /> Capture Frame
                </button>
                <span className="text-xs text-slate-400">Frame resolution auto-calibrated</span>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Right: Captured Frame & Vision Analysis Output */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
            <h3 className="font-semibold text-sm text-slate-200">Selected Frame Preview</h3>

            {capturedFrame ? (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 max-h-48">
                  <img src={capturedFrame} alt="Captured Frame" className="w-full h-full object-contain" />
                </div>

                <button
                  onClick={analyzeCapturedFrame}
                  disabled={analyzing || !geminiConnected}
                  className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    analyzing || !geminiConnected
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                  }`}
                >
                  <Zap className="w-4 h-4" /> {analyzing ? 'Analyzing Frame...' : 'Submit Frame for Vision AI'}
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-xs text-slate-500 space-y-1">
                <Camera className="w-6 h-6 mx-auto text-slate-600" />
                <p>No frame captured yet</p>
              </div>
            )}
          </div>

          {/* Signal Result Display */}
          {signalResult && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">FRAME SIGNAL</span>
                <span
                  className={`text-xl font-black font-mono px-3 py-0.5 rounded ${
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
              <p className="text-xs text-slate-300">{signalResult.summaryReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
