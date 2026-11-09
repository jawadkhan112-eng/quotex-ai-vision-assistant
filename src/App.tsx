import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ScreenshotAnalyzerView } from './components/ScreenshotAnalyzerView';
import { LiveScreenAnalyzerView } from './components/LiveScreenAnalyzerView';
import { AiAnalysisView } from './components/AiAnalysisView';
import { TechnicalIndicatorsView } from './components/TechnicalIndicatorsView';
import { CandlestickPatternsView } from './components/CandlestickPatternsView';
import { VoiceAssistantView } from './components/VoiceAssistantView';
import { SignalHistoryView } from './components/SignalHistoryView';
import { BacktestingView } from './components/BacktestingView';
import { AiSettingsView } from './components/AiSettingsView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { AppSettingsView } from './components/AppSettingsView';
import { TabId, SignalData } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState('EUR/USD (OTC)');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1M');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [latestSignal, setLatestSignal] = useState<SignalData | null>(null);

  // Sync dark class on html root element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Check backend health
  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'OK') {
        setBackendHealthy(true);
        setGeminiConnected(data.geminiKeyConfigured);
      } else {
        setBackendHealthy(false);
      }
    } catch (err) {
      setBackendHealthy(false);
      setGeminiConnected(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        geminiConnected={geminiConnected}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          selectedSymbol={selectedSymbol}
          setSelectedSymbol={setSelectedSymbol}
          selectedTimeframe={selectedTimeframe}
          setSelectedTimeframe={setSelectedTimeframe}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          backendHealthy={backendHealthy}
          onRefreshHealth={checkHealth}
        />

        <main className="flex-1 overflow-y-auto bg-slate-950 text-slate-100">
          {activeTab === 'dashboard' && (
            <DashboardView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
              latestSignal={latestSignal}
              setActiveTab={setActiveTab}
              geminiConnected={geminiConnected}
            />
          )}

          {activeTab === 'screenshot' && (
            <ScreenshotAnalyzerView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
              onAnalysisComplete={setLatestSignal}
              geminiConnected={geminiConnected}
            />
          )}

          {activeTab === 'live_screen' && (
            <LiveScreenAnalyzerView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
              onAnalysisComplete={setLatestSignal}
              geminiConnected={geminiConnected}
            />
          )}

          {activeTab === 'ai_analysis' && (
            <AiAnalysisView latestSignal={latestSignal} />
          )}

          {activeTab === 'indicators' && (
            <TechnicalIndicatorsView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
            />
          )}

          {activeTab === 'candlesticks' && (
            <CandlestickPatternsView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
            />
          )}

          {activeTab === 'voice_assistant' && (
            <VoiceAssistantView latestSignal={latestSignal} />
          )}

          {activeTab === 'history' && <SignalHistoryView />}

          {activeTab === 'backtesting' && (
            <BacktestingView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
            />
          )}

          {activeTab === 'ai_settings' && (
            <AiSettingsView
              geminiConnected={geminiConnected}
              onRefreshHealth={checkHealth}
            />
          )}

          {activeTab === 'diagnostics' && <DiagnosticsView />}

          {activeTab === 'app_settings' && (
            <AppSettingsView
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
            />
          )}
        </main>
      </div>
    </div>
  );
};
