import React from 'react';
import { Activity, Camera, FlaskConical, RadioTower, Layers, Stethoscope, Zap } from 'lucide-react';

export type TabId = 'live' | 'screenshot_lab' | 'algorithm_lab' | 'signal_terminal' | 'mtg_tracker' | 'diagnostics';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'live', label: 'Live Analyzer', icon: <Activity className="h-4 w-4" /> },
  { id: 'screenshot_lab', label: 'Screenshot Lab', icon: <Camera className="h-4 w-4" /> },
  { id: 'algorithm_lab', label: 'Algorithm Lab', icon: <FlaskConical className="h-4 w-4" /> },
  { id: 'signal_terminal', label: 'Signal Terminal', icon: <RadioTower className="h-4 w-4" /> },
  { id: 'mtg_tracker', label: 'MTG Tracker', icon: <Layers className="h-4 w-4" /> },
  { id: 'diagnostics', label: 'Diagnostics', icon: <Stethoscope className="h-4 w-4" /> },
];

export const Sidebar: React.FC<{ activeTab: TabId; onNavigate: (tab: TabId) => void }> = ({ activeTab, onNavigate }) => (
  <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:flex">
    <div className="border-b border-slate-800 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><Zap className="h-5 w-5" /></span>
        <div>
          <h1 className="text-sm font-bold tracking-wide text-slate-100">QUOTEX TERMINAL</h1>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-cyan-300">Local Math Engine</p>
        </div>
      </div>
    </div>
    <nav className="flex-1 space-y-1 p-3">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
          className={`flex w-full items-center gap-3 rounded border px-3 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === tab.id
              ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
    <div className="m-3 flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/5 p-3 text-[11px] text-emerald-300">
      <Zap className="h-4 w-4" />100% local processing
    </div>
  </aside>
);
