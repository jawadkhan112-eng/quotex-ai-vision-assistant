import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Zap, AlertTriangle, CheckCircle2, ShieldAlert, FileImage, RefreshCw, Clipboard, Crop } from 'lucide-react';
import { SignalData } from '../types';

interface ScreenshotAnalyzerViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  onAnalysisComplete: (result: SignalData) => void;
  geminiConnected: boolean;
}

export const ScreenshotAnalyzerView: React.FC<ScreenshotAnalyzerViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
  onAnalysisComplete,
  geminiConnected,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cropActive, setCropActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [signalResult, setSignalResult] = useState<SignalData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Helper to load image file into preview
  const loadImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload or paste a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
      setErrorMessage(null);
      setSignalResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImageFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadImageFile(file);
  };

  // Global Ctrl+V Paste Event Listener
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            loadImageFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // Dedicated "Paste Screenshot" Button handler using Clipboard API
  const handlePasteButtonClick = async () => {
    setErrorMessage(null);
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], 'clipboard_screenshot.png', { type: imageType });
            loadImageFile(file);
            return;
          }
        }
        setErrorMessage('No image found on clipboard. Copy a chart screenshot first (Ctrl+C or Win+Shift+S) and click Paste.');
      } else {
        setErrorMessage('Direct clipboard button access is restricted by browser. Please press Ctrl+V to paste your screenshot.');
      }
    } catch (err: any) {
      setErrorMessage('Clipboard permission denied or no image on clipboard. Please press Ctrl+V directly to paste.');
    }
  };

  const runVisionAnalysis = async () => {
    if (!imagePreview) return;

    setAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/analyze-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          base64Image: imagePreview,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Vision analysis failed');
      }

      setSignalResult(data.result);
      onAnalysisComplete(data.result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to backend vision server.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Title */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" /> Screenshot Vision Analyzer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Paste with <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-cyan-300">Ctrl+V</kbd>, drag & drop, or click to upload your Quotex chart.
          </p>
        </div>

        {/* Action Buttons Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePasteButtonClick}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Clipboard className="w-3.5 h-3.5 text-cyan-400" /> Paste Screenshot (Ctrl+V)
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Left Upload & Preview, Right Analysis Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Image Dropzone & Preview */}
        <div className="lg:col-span-5 space-y-4">
          {!imagePreview ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-8 text-center cursor-pointer bg-slate-900/50 hover:bg-slate-900 transition-all space-y-3"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">
                  Click to upload, drop image, or press <span className="text-cyan-400 font-mono">Ctrl+V</span>
                </p>
                <p className="text-xs text-slate-500">Supports PNG, JPG, WEBP Quotex 1M/5M screenshots</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 max-h-96 flex items-center justify-center">
                <img
                  ref={imageRef}
                  src={imagePreview}
                  alt="Chart Screenshot"
                  className="max-h-96 object-contain w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={runVisionAnalysis}
                  disabled={analyzing || !geminiConnected}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    analyzing || !geminiConnected
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                  }`}
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      Analyzing Chart Vision...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> One-Click AI Vision Analysis
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setImagePreview(null);
                    setSignalResult(null);
                  }}
                  className="px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {!geminiConnected && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Gemini API key is not configured. Add GEMINI_API_KEY in AI Provider Settings or Vercel Environment.</span>
            </div>
          )}
        </div>

        {/* Right Column: Signal & Analysis Display */}
        <div className="lg:col-span-7">
          {signalResult ? (
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5">
              {/* Signal Header Card */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs text-slate-400 font-medium">RECOMMENDED SIGNAL</span>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className={`text-3xl font-black font-mono px-4 py-1 rounded-lg ${
                        signalResult.signal === 'CALL'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : signalResult.signal === 'PUT'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}
                    >
                      {signalResult.signal}
                    </span>
                    <span className="text-xs text-slate-400 max-w-xs leading-tight">
                      {signalResult.summaryReason}
                    </span>
                  </div>
                </div>

                {/* Evidence Quality Score */}
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-medium">EVIDENCE QUALITY</span>
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    {signalResult.evidenceQualityScore}%
                  </div>
                  <span className="text-[10px] text-slate-500">Non-guaranteed score</span>
                </div>
              </div>

              {/* Supporting Evidence */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Supporting Evidence ({signalResult.supportingEvidence.length})
                </h4>
                <ul className="space-y-1 text-xs text-slate-300 pl-5 list-disc">
                  {signalResult.supportingEvidence.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>

              {/* Opposing Factors */}
              {signalResult.opposingEvidence.length > 0 && (
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Opposing Factors & Risks ({signalResult.opposingEvidence.length})
                  </h4>
                  <ul className="space-y-1 text-xs text-amber-200/80 pl-5 list-disc">
                    {signalResult.opposingEvidence.map((item, idx) => (
                      <li key={idx} className="leading-relaxed">{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Candlestick Patterns */}
              {signalResult.candlestickMatches.length > 0 && (
                <div className="border-t border-slate-800/80 pt-3 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-300">Detected Candlestick Formations</h4>
                  <div className="flex flex-wrap gap-2">
                    {signalResult.candlestickMatches.map((pat, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200"
                      >
                        {pat.patternName} ({pat.type})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Invalidation Level */}
              {signalResult.invalidationLevel && (
                <div className="border-t border-slate-800/80 pt-3 text-xs text-slate-400 flex items-center justify-between">
                  <span>Invalidation Price Level:</span>
                  <span className="font-mono text-cyan-300 font-semibold">{signalResult.invalidationLevel}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500 space-y-2 bg-slate-900/30">
              <FileImage className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-medium">No Analysis Result Yet</p>
              <p className="text-xs max-w-sm mx-auto">
                Paste a screenshot using <kbd className="text-cyan-400">Ctrl+V</kbd> or click "Paste Screenshot" to automatically load and analyze your chart.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
