import React, { useState } from 'react';
import { Sliders, ShieldCheck, CheckCircle2, AlertTriangle, Key, RefreshCw, Zap } from 'lucide-react';

interface AiSettingsViewProps {
  geminiConnected: boolean;
  onRefreshHealth: () => void;
}

export const AiSettingsView: React.FC<AiSettingsViewProps> = ({ geminiConnected, onRefreshHealth }) => {
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [evidenceThreshold, setEvidenceThreshold] = useState(65);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);

  const testGeminiConnection = async () => {
    setTestingKey(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-gemini', { method: 'POST' });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
      onRefreshHealth();
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection test failed.' });
    } finally {
      setTestingKey(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" /> AI Provider & Engine Configuration
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure vision AI models, validate API keys, and set signal confluence evidence thresholds.
        </p>
      </div>

      {/* Model Selection Card */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-sm text-slate-200">Active AI Vision Model</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-medium">Select Gemini Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended · Fast Vision & Analysis)</option>
              <option value="gemini-4-argon">gemini-4-argon (High Thinking · Deep Reasoning)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-medium">Safe Evidence Threshold (%):</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="90"
                value={evidenceThreshold}
                onChange={(e) => setEvidenceThreshold(Number(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
              <span className="font-mono text-cyan-300 font-bold w-12 text-right">{evidenceThreshold}%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Signals below this score return WAIT by default.</p>
          </div>
        </div>
      </div>

      {/* API Key Connection Test */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" /> API Key Security & Connection Status
          </span>
          {geminiConnected ? (
            <span className="text-emerald-400 text-xs font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> KEY CONFIGURED
            </span>
          ) : (
            <span className="text-amber-400 text-xs font-mono flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> KEY UNCONFIGURED
            </span>
          )}
        </h3>

        <p className="text-xs text-slate-400 leading-relaxed">
          API keys are securely held on the Node.js backend environment (<code className="text-cyan-300 font-mono">GEMINI_API_KEY</code>) and are NEVER exposed to browser client bundles or JavaScript code.
        </p>

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={testGeminiConnection}
            disabled={testingKey}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded-lg flex items-center gap-2 transition-colors"
          >
            {testingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-cyan-400" />}
            Test Gemini Connection
          </button>
        </div>

        {testResult && (
          <div
            className={`p-3.5 rounded-lg border text-xs ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};
