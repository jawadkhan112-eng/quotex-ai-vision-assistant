import React from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Eye,
  ShieldAlert,
  ListChecks,
  Clock,
  TrendingUp,
} from 'lucide-react';
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
          <BrainCircuit className="w-5 h-5 text-cyan-400" /> Deep AI Vision & Confirmation Audit
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Detailed inspection of candlestick anatomy, visual support/resistance boundaries, and the transparent confirmation checklist.
        </p>
      </div>

      {!latestSignal ? (
        <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-500 space-y-2">
          <Eye className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-medium">No Recent AI Vision Analysis</p>
          <p className="text-xs">
            Start Live Screen Sharing or analyze a chart screenshot to view structured visual confirmations.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Grid: Signal Decision & Timing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono">SIGNAL DECISION</span>
              <div
                className={`text-2xl font-black font-mono px-3 py-1 rounded inline-block ${
                  latestSignal.signal === 'CALL'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : latestSignal.signal === 'PUT'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}
              >
                {latestSignal.signal}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{latestSignal.summaryReason}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono">CONFIDENCE SCORE</span>
              <div className="text-3xl font-bold font-mono text-cyan-400">{latestSignal.confidenceScore}%</div>
              <span className="text-[10px] text-slate-500">Objective visual technical confluence</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono">TIMING & EXPIRY</span>
              <div className="text-xs font-mono text-slate-200">
                Expiry: <strong className="text-cyan-300">{latestSignal.nextCandleExpiryEstimate}</strong>
              </div>
              <div className="text-[11px] text-slate-400">Entry: {latestSignal.entryTimingGuidance}</div>
            </div>
          </div>

          {/* Transparent Confirmation Checklist Section */}
          {latestSignal.confirmationChecklist && (
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                <ListChecks className="w-4 h-4 text-cyan-400" /> Transparent Confirmation Checklist
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                {Object.values(latestSignal.confirmationChecklist).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800"
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      {item.status === 'PASSED' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : item.status === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <div>
                        <span className="text-slate-200 font-semibold block">{item.name}</span>
                        <span className="text-[11px] text-slate-400 font-sans block">{item.detail}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
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
                ))}
              </div>
            </div>
          )}

          {/* Visual Observations Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2">
                Visual Chart Observations
              </h3>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Candle Anatomy Observation:</span>
                  <p className="text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800/80 leading-relaxed">
                    {vision?.candleObservation || 'No specific candle observation.'}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Support / Resistance Levels:</span>
                  <p className="text-slate-300 font-mono text-[11px] bg-slate-950 p-2.5 rounded border border-slate-800/80">
                    {vision?.supportResistance || 'Support/Resistance levels unlabelled.'}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Visible Indicators Detected:</span>
                  <p className="text-slate-300 font-mono text-[11px] bg-slate-950 p-2.5 rounded border border-slate-800/80">
                    {vision?.visibleIndicators?.length
                      ? vision.visibleIndicators.join(', ')
                      : 'None visible on chart (Indicators only evaluated when drawn).'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2">
                Supporting & Opposing Evidence
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-emerald-400 font-semibold block mb-1">
                    Supporting Confluences ({latestSignal.supportingEvidence.length})
                  </span>
                  <ul className="space-y-1 text-slate-300 pl-5 list-disc">
                    {latestSignal.supportingEvidence.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>

                {latestSignal.opposingEvidence.length > 0 && (
                  <div className="border-t border-slate-800/80 pt-2">
                    <span className="text-amber-400 font-semibold block mb-1">
                      Opposing Risks ({latestSignal.opposingEvidence.length})
                    </span>
                    <ul className="space-y-1 text-amber-200/80 pl-5 list-disc">
                      {latestSignal.opposingEvidence.map((op, i) => (
                        <li key={i}>{op}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border-t border-slate-800/80 pt-2">
                  <span className="text-rose-400 font-semibold block mb-1">Invalidation Boundary</span>
                  <p className="text-rose-200/80">{latestSignal.invalidationConditions}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
