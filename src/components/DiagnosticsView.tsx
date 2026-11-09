import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Cpu, Database, Monitor, Mic, Key } from 'lucide-react';

export const DiagnosticsView: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<{
    backend: boolean;
    database: boolean;
    screenShare: boolean;
    speechStt: boolean;
    speechTts: boolean;
    geminiKey: boolean;
  }>({
    backend: false,
    database: false,
    screenShare: false,
    speechStt: false,
    speechTts: false,
    geminiKey: false,
  });

  const runDiagnostics = async () => {
    setRunning(true);
    const results = {
      backend: false,
      database: false,
      screenShare: Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
      speechStt: Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
      speechTts: Boolean('speechSynthesis' in window),
      geminiKey: false,
    };

    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'OK') {
        results.backend = true;
        results.database = data.databaseStatus === 'ONLINE';
        results.geminiKey = data.geminiKeyConfigured;
      }
    } catch (err) {
      console.error(err);
    }

    setDiagResults(results);
    setRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" /> Diagnostics & System Health
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time verification of backend API, database storage, WebRTC screen share, and Gemini integration.
          </p>
        </div>

        <button
          onClick={runDiagnostics}
          disabled={running}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          Run System Diagnostics
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Backend Status */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Express REST Backend</h4>
              <p className="text-[11px] text-slate-400">Node.js API endpoints</p>
            </div>
          </div>
          <span className={`text-xs font-mono font-bold flex items-center gap-1 ${diagResults.backend ? 'text-emerald-400' : 'text-rose-400'}`}>
            {diagResults.backend ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {diagResults.backend ? 'PASS' : 'FAIL'}
          </span>
        </div>

        {/* Database Status */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-indigo-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">SQLite Database</h4>
              <p className="text-[11px] text-slate-400">analysis_history schema</p>
            </div>
          </div>
          <span className={`text-xs font-mono font-bold flex items-center gap-1 ${diagResults.database ? 'text-emerald-400' : 'text-rose-400'}`}>
            {diagResults.database ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {diagResults.database ? 'ONLINE' : 'FAIL'}
          </span>
        </div>

        {/* Screen Share WebRTC */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-emerald-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">WebRTC Screen Share</h4>
              <p className="text-[11px] text-slate-400">getDisplayMedia API</p>
            </div>
          </div>
          <span className={`text-xs font-mono font-bold flex items-center gap-1 ${diagResults.screenShare ? 'text-emerald-400' : 'text-rose-400'}`}>
            {diagResults.screenShare ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {diagResults.screenShare ? 'SUPPORTED' : 'UNSUPPORTED'}
          </span>
        </div>

        {/* Gemini API Key */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-amber-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Gemini Vision Key</h4>
              <p className="text-[11px] text-slate-400">GEMINI_API_KEY environment</p>
            </div>
          </div>
          <span className={`text-xs font-mono font-bold flex items-center gap-1 ${diagResults.geminiKey ? 'text-emerald-400' : 'text-amber-400'}`}>
            {diagResults.geminiKey ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {diagResults.geminiKey ? 'READY' : 'UNCONFIGURED'}
          </span>
        </div>
      </div>
    </div>
  );
};
