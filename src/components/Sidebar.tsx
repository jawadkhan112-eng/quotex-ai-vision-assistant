import React from 'react';
import {
  LayoutDashboard,
  Camera,
  MonitorPlay,
  BrainCircuit,
  TrendingUp,
  Flame,
  Mic,
  History,
  BarChart3,
  Sliders,
  Activity,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { TabId } from '../types';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  geminiConnected: boolean;
}

const NAV_ITEMS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'screenshot', label: 'Screenshot Analyzer', icon: Camera },
  { id: 'live_screen', label: 'Live Screen Analyzer', icon: MonitorPlay },
  { id: 'ai_analysis', label: 'AI Vision Breakdown', icon: BrainCircuit },
  { id: 'indicators', label: 'Technical Indicators', icon: TrendingUp },
  { id: 'candlesticks', label: 'Candlestick Patterns', icon: Flame },
  { id: 'voice_assistant', label: 'AI Voice Assistant', icon: Mic },
  { id: 'history', label: 'Signal History', icon: History },
  { id: 'backtesting', label: 'Backtesting Suite', icon: BarChart3 },
  { id: 'ai_settings', label: 'AI Provider Settings', icon: Sliders },
  { id: 'diagnostics', label: 'Diagnostics & Health', icon: Activity },
  { id: 'app_settings', label: 'App Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, geminiConnected }) => {
  return (
    <aside className="w-64 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-slate-100 tracking-tight leading-none">QUOTEX AI VISION</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Analysis Terminal v1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Status Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-950/60 border border-slate-800/60 text-[11px]">
          <span className="text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> AI Engine
          </span>
          <span className={`font-mono font-medium ${geminiConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            {geminiConnected ? 'READY' : 'KEY MISSING'}
          </span>
        </div>
      </div>
    </aside>
  );
};
