import React from 'react';
import { BrainCircuit, CheckCircle2, AlertTriangle, Eye, ShieldAlert } from 'lucide-react';
import { SignalData } from '../types';

interface AiAnalysisViewProps {
  latestSignal: SignalData | null;
}

export const AiAnalysisView: React.FC<AiAnalysisViewProps> = ({ latestSignal }) => {
  const vision = latestSignal?.visionInsights;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-cyan-400" /> Deep AI Vision Breakdown
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Detailed visual inspection breakdown of chart candlestick anatomy, visible indicators, and structure.
        </p>
      </div>

      {!latestSignal ? (
        <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-500 space-y-2">
          <Eye className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-medium">No Recent AI Vision Analysis</p>
          <p className="text-xs">Run a Screenshot or Live Screen Analysis first to view structured AI vision metrics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Signal Overview Card */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2">
              Signal & Confluence Overview
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">DECISION</span>
                <div className="text-2xl font-black font-mono text-cyan-400">{latestSignal.signal}</div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">QUALITY SCORE</span>
                <div className="text-2xl font-bold font-mono text-slate-100">{latestSignal.evidenceQualityScore}/100</div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-slate-400">Summary Reasoning:</span>
              <p className="text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                {latestSignal.summaryReason}
              </p>
            </div>
          </div>

          {/* Candle Observation & Structure */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2">
              Candlestick Anatomy & Price Action
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-1 font-medium">Visible Trend & Momentum:</span>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono">
                    Trend: {vision?.trend || 'N/A'}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-mono">
                    Momentum: {vision?.momentum || 'N/A'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-medium">Candle Observation:</span>
                <p className="text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800">
                  {vision?.candleObservation || 'No specific candle observation.'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-medium">Visible Support & Resistance:</span>
                <p className="text-slate-300 font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800">
                  {vision?.supportResistance || 'Support/Resistance levels unlabelled.'}
                </p>
              </div>
            </div>
          </div>

          {/* Supporting Reasons */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="font-semibold text-sm text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <CheckCircle2 className="w-4 h-4" /> Supporting Evidence
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300 pl-5 list-disc">
              {latestSignal.supportingEvidence.map((ev, i) => (
                <li key={i}>{ev}</li>
              ))}
            </ul>
          </div>

          {/* Risk Factors & Opposing Arguments */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="font-semibold text-sm text-amber-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <AlertTriangle className="w-4 h-4" /> Opposing Factors & Conflicts
            </h3>
            <ul className="space-y-1.5 text-xs text-amber-200/80 pl-5 list-disc">
              {latestSignal.opposingEvidence.map((op, i) => (
                <li key={i}>{op}</li>
              ))}
              {latestSignal.opposingEvidence.length === 0 && (
                <li className="text-slate-500 italic list-none">No critical opposing factors detected.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
