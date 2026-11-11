import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { LiveScreenAnalyzerView } from './components/LiveScreenAnalyzerView';
import { ScreenshotLabView } from './components/ScreenshotLabView';
import { AlgorithmLabView } from './components/AlgorithmLabView';
import { SignalTerminalView } from './components/SignalTerminalView';
import { MtgTrackerView } from './components/MtgTrackerView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { AlertsCenterView } from './components/AlertsCenterView';
import { Sidebar, type TabId } from './components/Sidebar';

export default function App() {
  const [symbol, setSymbol] = useState('EUR/USD (OTC)');
  const [timeframe, setTimeframe] = useState('1M');
  const [healthy, setHealthy] = useState(false);
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<TabId>('live');
  const check = async () => { try { setHealthy((await fetch('/api/health')).ok); } catch { setHealthy(false); } };
  useEffect(() => { check(); const id = setInterval(check, 15000); return () => clearInterval(id); }, []);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar activeTab={tab} onNavigate={setTab} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header selectedSymbol={symbol} setSelectedSymbol={setSymbol} selectedTimeframe={timeframe} setSelectedTimeframe={setTimeframe} isDarkMode={dark} setIsDarkMode={setDark} backendHealthy={healthy} onRefreshHealth={check} />
        <main className="flex-1 overflow-y-auto">
          {tab === 'live' && <LiveScreenAnalyzerView selectedSymbol={symbol} selectedTimeframe={timeframe} />}
          {tab === 'screenshot_lab' && <ScreenshotLabView />}
          {tab === 'algorithm_lab' && <AlgorithmLabView />}
          {tab === 'signal_terminal' && <SignalTerminalView />}
          {tab === 'mtg_tracker' && <MtgTrackerView />}
          {tab === 'diagnostics' && <DiagnosticsView />}
          {tab === 'alerts_center' && <AlertsCenterView />}
        </main>
      </div>
    </div>
  );
}
