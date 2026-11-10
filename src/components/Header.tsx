import React from 'react';
import { Sun, Moon, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

interface HeaderProps {
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  selectedTimeframe: string;
  setSelectedTimeframe: (tf: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  backendHealthy: boolean;
  onRefreshHealth: () => void;
}

const POPULAR_PAIRS = [
  'EUR/USD (OTC)',
  'GBP/USD (OTC)',
  'USD/JPY (OTC)',
  'AUD/USD (OTC)',
  'USD/CAD (OTC)',
  'BTC/USD',
  'ETH/USD',
  'GOLD (OTC)',
];

export const Header: React.FC<HeaderProps> = ({
  selectedSymbol,
  setSelectedSymbol,
  selectedTimeframe,
  setSelectedTimeframe,
  isDarkMode,
  setIsDarkMode,
  backendHealthy,
  onRefreshHealth,
}) => {
  return (
    <header className="h-14 bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 flex items-center justify-between sticky top-0 z-20">
      {/* Symbol & Timeframe Selection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1">
          <span className="text-[11px] text-slate-400 font-medium">PAIR:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
          >
            {POPULAR_PAIRS.map((pair) => (
              <option key={pair} value={pair} className="bg-slate-900 text-slate-100">
                {pair}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-lg p-0.5">
          {['1M', '5M', '15M'].map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-2.5 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                selectedTimeframe === tf
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Safety Notice & System Actions */}
      <div className="flex items-center gap-3">
        {/* Strict Analysis-Only Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>ANALYSIS ONLY · LOCAL MATH ENGINE</span>
        </div>

        {/* Backend Status */}
        <button
          onClick={onRefreshHealth}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
          title="Click to recheck API backend health"
        >
          {backendHealthy ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}
          <span className="font-mono text-[11px]">{backendHealthy ? 'API ONLINE' : 'CONNECTING'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
          aria-label="Toggle Theme"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
        </button>
      </div>
    </header>
  );
};
