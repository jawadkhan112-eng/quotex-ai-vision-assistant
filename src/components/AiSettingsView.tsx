import React, { useState, useEffect } from 'react';
import { Sliders, ShieldCheck, CheckCircle2, AlertTriangle, Key, RefreshCw, Zap, Eye, EyeOff, Save, Trash2, Check } from 'lucide-react';

interface AiSettingsViewProps {
  geminiConnected: boolean;
  onRefreshHealth: () => void;
}

export const AiSettingsView: React.FC<AiSettingsViewProps> = ({ geminiConnected, onRefreshHealth }) => {
  const [provider, setProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('NOT_SET');
  const [isCustomKey, setIsCustomKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [evidenceThreshold, setEvidenceThreshold] = useState(65);

  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  // Load existing configuration from backend on mount
  const fetchAiConfig = async () => {
    try {
      const res = await fetch('/api/ai-config');
      const data = await res.json();
      if (data.success) {
        setProvider(data.provider || 'gemini');
        setSelectedModel(data.model || 'gemini-3.8-flash');
        setMaskedKey(data.maskedKey || 'NOT_SET');
        setIsCustomKey(data.isCustomKey || false);
        setHasKey(data.hasKey || false);
        setEvidenceThreshold(data.evidenceThreshold || 65);
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
    }
  };

  useEffect(() => {
    fetchAiConfig();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setTestResult(null);

    try {
      const res = await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput ? apiKeyInput.trim() : undefined,
          provider,
          model: selectedModel,
          evidenceThreshold,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMaskedKey(data.maskedKey);
        setIsCustomKey(data.isCustomKey);
        setHasKey(data.hasKey);
        setApiKeyInput('');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onRefreshHealth();
      }
    } catch (err) {
      console.error('Error saving AI config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustomKey = async () => {
    if (!window.confirm('Are you sure you want to remove your custom API key?')) return;
    try {
      const res = await fetch('/api/ai-config/key', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMaskedKey(data.maskedKey);
        setIsCustomKey(data.isCustomKey);
        setHasKey(data.hasKey);
        setApiKeyInput('');
        setTestResult(null);
        onRefreshHealth();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const testGeminiConnection = async () => {
    setTestingKey(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeyOverride: apiKeyInput ? apiKeyInput.trim() : undefined,
          modelOverride: selectedModel,
        }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        latencyMs: data.latencyMs,
      });
      onRefreshHealth();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setTestingKey(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" /> AI Provider & API Settings
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure your Gemini API key, select vision models, and adjust evidence quality thresholds.
        </p>
      </div>

      {/* Active Provider & Key Status Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold font-mono text-sm">
            AI
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>Active Provider: <strong className="text-cyan-300 capitalize">{provider}</strong></span>
              {isCustomKey && (
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                  CUSTOM KEY SAVED
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-0.5">
              Active Key: <span className="text-slate-200 font-semibold">{maskedKey}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasKey ? (
            <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> API READY
            </span>
          ) : (
            <span className="px-3 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> KEY UNCONFIGURED
            </span>
          )}
        </div>
      </div>

      {/* API Key Input & Configuration Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <Key className="w-4 h-4 text-cyan-400" /> Enter / Update API Key
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Select Provider:</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none focus:border-cyan-500/50"
              >
                <option value="gemini">Google Gemini (Recommended Vision & Chat)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Select Model:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none focus:border-cyan-500/50"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Fast Vision & Analysis)</option>
                <option value="gemini-4-argon">gemini-4-argon (High Thinking Reasoning)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-xs font-medium">
              API Key (Password Masked):
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={isCustomKey ? 'Enter new API key to update (or leave empty to keep current)' : 'Paste your Gemini API key (AIza...)'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-2.5 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Keys are securely stored on the backend database and are NEVER sent to client JavaScript or console logs.
            </p>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-xs font-medium">
              Evidence Quality Threshold: <span className="text-cyan-300 font-mono font-bold">{evidenceThreshold}%</span>
            </label>
            <input
              type="range"
              min="50"
              max="90"
              value={evidenceThreshold}
              onChange={(e) => setEvidenceThreshold(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Signals with evidence quality score below {evidenceThreshold}% default to <span className="font-mono text-amber-300 font-bold">WAIT</span> for risk management.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Configuration'}
            </button>

            <button
              onClick={testGeminiConnection}
              disabled={testingKey}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded-lg flex items-center gap-2 transition-colors"
            >
              {testingKey ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" /> : <Zap className="w-4 h-4 text-cyan-400" />}
              Test API Connection
            </button>

            {isCustomKey && (
              <button
                onClick={handleRemoveCustomKey}
                className="px-3.5 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs rounded-lg flex items-center gap-1.5 font-medium ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Custom Key
              </button>
            )}
          </div>
        </div>

        {/* Test Result Feedback Alert */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-1 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </span>
              {testResult.latencyMs && (
                <span className="font-mono text-[11px] opacity-80">Latency: {testResult.latencyMs}ms</span>
              )}
            </div>
            <p className="leading-relaxed">{testResult.message}</p>
          </div>
        )}
      </div>
    </div>
  );
};
