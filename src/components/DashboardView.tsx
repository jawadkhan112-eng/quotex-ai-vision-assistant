import React from 'react';
import { Camera, MonitorPlay, TrendingUp, ShieldCheck, AlertTriangle, Zap, CheckCircle2, ArrowRight } from 'lucide-react';
import { SignalData, TabId } from '../types';

interface DashboardViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  latestSignal: SignalData | null;
  setActiveTab: (tab: TabId) => void;
  geminiConnected: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
  latestSignal,
  setActiveTab,
  geminiConnected,
}) => {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Hero Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 p-6 relative overflow-hidden">
        <div className="max-w-2xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
            <Zap className="w-3.5 h-3.5" /> AI Vision Binary Analysis Suite
          </div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            Quotex Chart Intelligence Terminal
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Multi-modal analysis engine combining screenshot vision AI, deterministic candlestick rule evaluation, and mathematical technical indicator calculations for explainable signal insights.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('screenshot')}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Analyze Screenshot
            </button>
            <button
              onClick={() => setActiveTab('live_screen')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
            >
              <MonitorPlay className="w-4 h-4" /> Live Screen Sharing
            </button>
          </div>
        </div>
      </div>

      {/* Grid Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Selected Pair & Timeframe */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Active Asset Pair</span>
          <div className="text-lg font-bold text-slate-100 font-mono">{selectedSymbol}</div>
          <div className="text-xs text-cyan-400 font-mono">Timeframe: {selectedTimeframe}</div>
        </div>

        {/* Latest Signal */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Latest Signal Status</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-xl font-black font-mono px-2.5 py-0.5 rounded ${
                latestSignal?.signal === 'CALL'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : latestSignal?.signal === 'PUT'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}
            >
              {latestSignal?.signal || 'WAIT'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {latestSignal?.summaryReason || 'No analysis run yet'}
          </p>
        </div>

        {/* Evidence Quality Score */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Evidence Quality Score</span>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {latestSignal?.evidenceQualityScore ?? 0} <span className="text-xs text-slate-400 font-sans">/ 100</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all"
              style={{ width: `${latestSignal?.evidenceQualityScore ?? 0}%` }}
            />
          </div>
        </div>

        {/* Engine Connectivity */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Vision Engine Status</span>
          <div className="flex items-center gap-2 text-sm font-semibold font-mono">
            {geminiConnected ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> GEMINI ACTIVE
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> KEY UNSET
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Model: gemini-3.8-flash</p>
        </div>
      </div>

      {/* Main Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          onClick={() => setActiveTab('screenshot')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all space-y-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Camera className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-100 flex items-center justify-between">
            Screenshot Vision Analysis
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Upload Quotex chart screenshots to evaluate candlestick direction, wicks, support/resistance zones, and momentum.
          </p>
        </div>

        <div
          onClick={() => setActiveTab('ai_analysis')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all space-y-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-100 flex items-center justify-between">
            Visual Confirmation Engine
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Audit transparent multi-condition confirmation checklist (Trend, S/R, Candlestick Anatomy, and Momentum) from screen captures.
          </p>
        </div>

        <div
          onClick={() => setActiveTab('voice_assistant')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all space-y-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-100 flex items-center justify-between">
            AI Talkable Voice Assistant
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ask conversational questions about current market signals, risk management, candlestick meanings, and signal rejections.
          </p>
        </div>
      </div>

      {/* Strict Ethical Safety & Risk Notice */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
        <div className="font-semibold text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Operational Safety & Risk Disclosure
        </div>
        <p className="leading-relaxed">
          This software is an analysis-only assistant designed to provide evidence-based technical perspectives. It NEVER executes trades automatically, clicks broker buttons, or interacts with Quotex logins. The evidence score represents technical confluence quality, NOT a guaranteed win rate or profit guarantee. Always practice strict risk management.
        </p>
      </div>
    </div>
  );
};
