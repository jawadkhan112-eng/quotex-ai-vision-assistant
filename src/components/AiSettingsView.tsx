import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Key,
  RefreshCw,
  Zap,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Check,
  Layers,
  Cpu,
  Database,
  Radio,
} from 'lucide-react';
import { safeFetch } from '../apiClient';

interface AiSettingsViewProps {
  geminiConnected: boolean;
  onRefreshHealth: () => void;
}

interface ProviderStatus {
  id: string;
  name: string;
  hasKey: boolean;
  maskedKey: string;
  isCustom: boolean;
  visionSupported: boolean;
  defaultModel: string;
  supportedModels: Array<{ id: string; name: string; vision: boolean }>;
}

export const AiSettingsView: React.FC<AiSettingsViewProps> = ({ geminiConnected, onRefreshHealth }) => {
  const [provider, setProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('NOT_SET');
  const [isCustomKey, setIsCustomKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [evidenceThreshold, setEvidenceThreshold] = useState(65);
  const [backupProvider, setBackupProvider] = useState('groq');
  const [backupModel, setBackupModel] = useState('llama-3.3-70b-versatile');

  const [allProviders, setAllProviders] = useState<ProviderStatus[]>([]);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; vision: boolean }>>([]);

  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    sampleResponse?: string;
  } | null>(null);

  // Load existing configuration from backend on mount
  const fetchAiConfig = async () => {
    try {
      const data = await safeFetch<any>('/api/ai-config');
      if (data.success) {
        setProvider(data.provider || 'gemini');
        setSelectedModel(data.model || 'gemini-1.5-flash');
        setMaskedKey(data.maskedKey || 'NOT_SET');
        setIsCustomKey(data.isCustomKey || false);
        setHasKey(data.hasKey || false);
        setEvidenceThreshold(data.evidenceThreshold || 65);
        setBackupProvider(data.backupProvider || 'groq');
        setBackupModel(data.backupModel || 'llama-3.3-70b-versatile');

        if (data.allProviders) {
          setAllProviders(data.allProviders);
          const activeEntry = data.allProviders.find((p: any) => p.id === (data.provider || 'gemini'));
          if (activeEntry) {
            setAvailableModels(activeEntry.supportedModels || []);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
    }
  };

  useEffect(() => {
    fetchAiConfig();
  }, []);

  // Update models list when provider changes
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const p = allProviders.find((entry) => entry.id === newProvider);
    if (p) {
      setAvailableModels(p.supportedModels || []);
      setSelectedModel(p.defaultModel || (p.supportedModels[0]?.id ?? ''));
      setMaskedKey(p.maskedKey || 'NOT_SET');
      setIsCustomKey(p.isCustom);
      setHasKey(p.hasKey);
    }
    setTestResult(null);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setTestResult(null);

    try {
      const data = await safeFetch<any>('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput ? apiKeyInput.trim() : undefined,
          provider,
          model: selectedModel,
          evidenceThreshold,
          backupProvider,
          backupModel,
        }),
      });

      if (data.success) {
        setMaskedKey(data.maskedKey);
        setIsCustomKey(data.isCustomKey);
        setHasKey(data.hasKey);
        setApiKeyInput('');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await fetchAiConfig();
        onRefreshHealth();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error saving AI configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustomKey = async () => {
    if (!window.confirm(`Are you sure you want to remove your custom API key for ${provider}?`)) return;
    try {
      const data = await safeFetch<any>(`/api/ai-config/key?provider=${provider}`, { method: 'DELETE' });
      if (data.success) {
        setMaskedKey(data.maskedKey);
        setIsCustomKey(data.isCustomKey);
        setHasKey(data.hasKey);
        setApiKeyInput('');
        setTestResult(null);
        await fetchAiConfig();
        onRefreshHealth();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to remove key.',
      });
    }
  };

  const testProviderConnection = async () => {
    setTestingKey(true);
    setTestResult(null);
    try {
      const data = await safeFetch<any>('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeyOverride: apiKeyInput ? apiKeyInput.trim() : undefined,
          modelOverride: selectedModel,
          providerOverride: provider,
        }),
      });

      setTestResult({
        success: data.success,
        message: data.message,
        latencyMs: data.latencyMs,
        sampleResponse: data.sampleResponse,
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
          Configure production AI vision providers (Google Gemini, Groq, OpenRouter), manage AES-256 encrypted keys, and calibrate evidence thresholds.
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
              <span>Active Provider: <strong className="text-cyan-300 uppercase">{provider}</strong></span>
              {isCustomKey && (
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                  ENCRYPTED USER KEY
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-0.5">
              Active Key: <span className="text-slate-200 font-semibold">{maskedKey}</span> | Model: <span className="text-cyan-400">{selectedModel}</span>
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

      {/* Quick Provider Selection Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {allProviders.map((p) => {
          const isSelected = p.id === provider;
          return (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-500/10'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>{p.name.split(' ')[0]}</span>
                {p.hasKey ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                )}
              </div>
              <div className="text-[10px] font-mono opacity-80 truncate">{p.maskedKey}</div>
              <div className="text-[9px] mt-1 text-slate-400">
                {p.visionSupported ? '✓ Vision Supported' : '• Text / Logic Only'}
              </div>
            </button>
          );
        })}
      </div>

      {/* API Key Input & Configuration Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <Key className="w-4 h-4 text-cyan-400" /> Enter / Update API Key & Model
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Select Provider:</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none focus:border-cyan-500/50"
              >
                {allProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.hasKey ? '(Configured)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Select Model:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none focus:border-cyan-500/50"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.vision ? '· [Vision]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-xs font-medium">
              API Key for {provider.toUpperCase()} (AES-256 Encrypted):
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={isCustomKey ? 'Enter new API key to update (or leave empty to keep current)' : `Paste your ${provider} API key`}
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
              Keys are encrypted at rest using AES-256-GCM. Production defaults are integrated for Gemini, Groq, and OpenRouter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-slate-400 block mb-1 text-xs font-medium">
                Automatic Backup Provider:
              </label>
              <select
                value={backupProvider}
                onChange={(e) => setBackupProvider(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500/50"
              >
                <option value="groq">Groq (Ultra-fast failover)</option>
                <option value="openrouter">OpenRouter (Multi-model failover)</option>
                <option value="gemini">Google Gemini</option>
              </select>
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
                className="w-full accent-cyan-400 cursor-pointer mt-2"
              />
              <p className="text-[11px] text-slate-500">
                Signals with evidence quality score below {evidenceThreshold}% default to <span className="font-mono text-amber-300 font-bold">WAIT</span> for strict risk management.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Configuration'}
            </button>

            <button
              onClick={testProviderConnection}
              disabled={testingKey}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded-lg flex items-center gap-2 transition-colors"
            >
              {testingKey ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" /> : <Zap className="w-4 h-4 text-cyan-400" />}
              Test {provider.toUpperCase()} Connection
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
            className={`p-4 rounded-xl border text-xs space-y-1 mt-4 ${
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
            {testResult.sampleResponse && (
              <p className="font-mono text-[11px] opacity-80 bg-slate-950/50 p-2 rounded mt-1 border border-emerald-500/20">
                Response: {testResult.sampleResponse}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
