import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LiveScreenAnalyzerView } from './components/LiveScreenAnalyzerView';
import { ScreenshotAnalyzerView } from './components/ScreenshotAnalyzerView';
import { AiAnalysisView } from './components/AiAnalysisView';
import { VoiceAssistantView } from './components/VoiceAssistantView';
import { SignalHistoryView } from './components/SignalHistoryView';
import { AiSettingsView } from './components/AiSettingsView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { AppSettingsView } from './components/AppSettingsView';
import { TabId, SignalData } from './types';
import { safeFetch } from './apiClient';

export default function App() {
  // Flagship default view is live screen sharing workspace
  const [activeTab, setActiveTab] = useState<TabId>('live_screen');
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

  // Handle asset/timeframe auto-detected from the shared chart by the vision engine
  const handleAssetTimeframeDetected = useCallback((detectedAsset: string, detectedTimeframe: string) => {
    setSelectedSymbol((prev) => (prev === detectedAsset ? prev : detectedAsset));
    setSelectedTimeframe((prev) => (prev === detectedTimeframe ? prev : detectedTimeframe));
    console.log(
      '[Auto-Detect] Chart header asset/timeframe:',
      detectedAsset,
      detectedTimeframe
    );
  }, []);

  // Check backend health
  const checkHealth = async () => {
    try {
      const data = await safeFetch<any>('/api/health');
      if (data && data.status === 'OK') {
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
          {activeTab === 'live_screen' && (
            <LiveScreenAnalyzerView
              selectedSymbol={selectedSymbol}
              selectedTimeframe={selectedTimeframe}
              onAnalysisComplete={setLatestSignal}
              onAssetTimeframeDetected={handleAssetTimeframeDetected}
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

          {activeTab === 'ai_analysis' && (
            <AiAnalysisView latestSignal={latestSignal} />
          )}

          {activeTab === 'voice_assistant' && (
            <VoiceAssistantView latestSignal={latestSignal} />
          )}

          {activeTab === 'history' && <SignalHistoryView />}

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
}
