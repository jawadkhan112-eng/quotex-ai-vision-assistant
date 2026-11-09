import React, { useEffect, useMemo, useState } from 'react';
import { Sliders, CheckCircle2, AlertTriangle, Key, RefreshCw, Zap, Eye, EyeOff, Save, Trash2, Check, ShieldCheck } from 'lucide-react';

interface ProviderModel { id: string; name: string; text: boolean; vision: boolean; streaming: boolean; context?: number }
interface Provider { id: string; name: string; endpoint: string; auth: string; protocol: string; text: boolean; vision: boolean; streaming: boolean; modelDiscovery: string }
interface Entry { provider: Provider; hasKey: boolean; maskedKey: string; source: string; model: string; models?: ProviderModel[]; status?: string }
const PROVIDER_NAMES: Record<string, string> = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter', cerebras: 'Cerebras', huggingface: 'Hugging Face' };
const STATUS_LABEL: Record<string, string> = { connected: 'Connected', failed: 'Failed', invalid_key: 'Invalid Key', quota_exceeded: 'Quota Exceeded', rate_limited: 'Rate Limited', not_configured: 'Not Configured' };

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!contentType.includes('application/json')) throw new Error(text.startsWith('<') ? `Server returned HTML (${response.status}); check API routing.` : `Expected JSON response (${response.status}).`);
  let body: any;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error('Server returned malformed JSON.'); }
  if (!response.ok || body.success === false) throw new Error(body.error || body.message || `Request failed (${response.status}).`);
  return body;
}

export const AiSettingsView: React.FC<{ geminiConnected: boolean; onRefreshHealth: () => void }> = ({ onRefreshHealth }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [provider, setProvider] = useState('gemini');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [primary, setPrimary] = useState('gemini');
  const [fallback, setFallback] = useState('');
  const [threshold, setThreshold] = useState(65);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const selected = entries.find(entry => entry.provider.id === provider);
  const availableModels = useMemo(() => models, [models]);

  const refresh = async () => {
    try {
      const data = await jsonRequest('/api/providers');
      setEntries(data.providers || []); setPrimary(data.defaults.primary); setFallback(data.defaults.fallback || ''); setThreshold(data.evidenceThreshold || 65);
      const active = (data.providers || []).find((entry: Entry) => entry.provider.id === provider);
      if (active) { setModels(active.models || []); setModel(active.model || ''); }
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not load providers.' }); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const item = entries.find(entry => entry.provider.id === provider);
    setModels(item?.models || []); setModel(item?.model || ''); setKey('');
  }, [provider, entries]);

  const loadModels = async () => {
    setLoading(true); setMessage(null);
    try {
      const data = await jsonRequest(`/api/providers/${provider}/models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key || undefined }) });
      setModels(data.models || []); if (!model && data.models?.length) setModel(data.models[0].id);
      setMessage({ ok: true, text: `Loaded ${data.models?.length || 0} models from ${PROVIDER_NAMES[provider]}.` });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Model discovery failed.' }); }
    finally { setLoading(false); }
  };
  const test = async () => {
    if (!model) { setMessage({ ok: false, text: 'Select a model first.' }); return; }
    setLoading(true); setMessage(null); setStatus(prev => ({ ...prev, [provider]: 'testing' }));
    try {
      const data = await jsonRequest(`/api/providers/${provider}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key || undefined, model }) });
      setStatus(prev => ({ ...prev, [provider]: 'connected' }));
      setMessage({ ok: true, text: `Connection verified for ${data.provider} / ${data.model} (${data.latencyMs} ms).` });
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Connection test failed.';
      const kind = /quota/i.test(text) ? 'quota_exceeded' : /rate limit/i.test(text) ? 'rate_limited' : /invalid|unauthorized/i.test(text) ? 'invalid_key' : 'failed';
      setStatus(prev => ({ ...prev, [provider]: kind })); setMessage({ ok: false, text });
    } finally { setLoading(false); }
  };
  const save = async () => {
    if (!model) { setMessage({ ok: false, text: 'Select a model first.' }); return; }
    if (!key && !selected?.hasKey) { setMessage({ ok: false, text: 'Enter an API key before saving this provider.' }); return; }
    setLoading(true); setMessage(null);
    try {
      await jsonRequest(`/api/providers/${provider}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key || undefined, model, evidenceThreshold: threshold }) });
      setKey(''); await refresh(); onRefreshHealth(); setMessage({ ok: true, text: `${PROVIDER_NAMES[provider]} settings saved securely on the server.` });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save provider settings.' }); }
    finally { setLoading(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove saved ${PROVIDER_NAMES[provider]} key?`)) return;
    setLoading(true);
    try { await jsonRequest(`/api/providers/${provider}/credential`, { method: 'DELETE' }); setStatus(prev => ({ ...prev, [provider]: 'not_configured' })); await refresh(); onRefreshHealth(); setMessage({ ok: true, text: 'Saved key removed. Environment key may still be available.' }); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not remove key.' }); }
    finally { setLoading(false); }
  };
  const saveDefaults = async () => {
    setLoading(true);
    try { await jsonRequest('/api/providers/defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ primary, fallback, evidenceThreshold: threshold }) }); setMessage({ ok: true, text: 'Default and fallback providers saved.' }); await refresh(); onRefreshHealth(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save defaults.' }); }
    finally { setLoading(false); }
  };

  return <div className="p-6 space-y-6 max-w-6xl mx-auto">
    <header className="border-b border-slate-800 pb-4"><h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><Sliders className="w-5 h-5 text-cyan-400"/>AI Providers & API Management</h2>
      <p className="text-xs text-slate-400 mt-1">Credentials are sent to the backend only. Provider models are discovered through authenticated provider APIs; vision is enabled only for Gemini in this integration.</p></header>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{entries.map(entry => {
      const id = entry.provider.id, current = provider === id, state = status[id] || (entry.hasKey ? 'not_tested' : 'not_configured');
      return <button type="button" key={id} onClick={() => setProvider(id)} className={`text-left p-4 rounded-xl border ${current ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}>
        <div className="flex justify-between gap-2"><strong className="text-sm">{entry.provider.name}</strong><span className={`text-[10px] ${state === 'connected' ? 'text-emerald-300' : state === 'not_configured' ? 'text-amber-300' : 'text-slate-400'}`}>{STATUS_LABEL[state] || (entry.hasKey ? 'Saved · not tested' : 'Not Configured')}</span></div>
        <p className="text-[10px] text-slate-400 mt-2">Text: {entry.provider.text ? 'Yes' : 'No'} · Vision: {entry.provider.vision ? 'Yes' : 'No'} · Streaming: {entry.provider.streaming ? 'Yes' : 'No'}</p>
        <p className="text-[10px] text-slate-500 mt-1">{entry.hasKey ? `${entry.source}: ${entry.maskedKey}` : 'No key configured'}</p>
      </button>;
    })}</div>
    {selected && <section className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{selected.provider.name} configuration</h3><p className="text-xs text-slate-400 mt-1">{selected.provider.protocol} · Authentication: {selected.provider.auth}</p></div><button onClick={loadModels} disabled={loading} className="px-3 py-2 bg-slate-800 rounded-lg text-xs flex items-center gap-2"><RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`}/>Discover models</button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs text-slate-400">API key <div className="relative mt-1"><input autoComplete="new-password" type={showKey?'text':'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder={selected.hasKey?`Saved ${selected.maskedKey}; enter replacement or keep empty`:'Paste provider API key'} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pr-10 text-slate-100 font-mono"/><button type="button" aria-label={showKey?'Hide API key':'Show API key'} onClick={()=>setShowKey(!showKey)} className="absolute right-3 top-2.5">{showKey?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div></label>
        <label className="text-xs text-slate-400">Provider model<select value={model} onChange={e=>setModel(e.target.value)} className="block w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100">{!models.length&&<option value="">Discover models first</option>}{models.map(m=><option key={m.id} value={m.id}>{m.name} · {m.vision?'Vision':'Text'}{m.context?` · ${m.context} context`:''}</option>)}</select></label>
      </div>
      <div className="text-[11px] text-slate-500">Key is stored encrypted at rest. Configure <code>CREDENTIAL_ENCRYPTION_KEY</code> on the server before saving user keys. No usage/quota endpoint is queried unless the provider exposes one.</div>
      <div className="flex flex-wrap gap-2"><button onClick={save} disabled={loading} className="px-4 py-2 bg-cyan-500 text-slate-950 rounded-lg text-xs font-semibold flex items-center gap-2"><Save className="w-4 h-4"/>Save / Update</button><button onClick={test} disabled={loading} className="px-4 py-2 bg-slate-800 rounded-lg text-xs flex items-center gap-2"><Zap className="w-4 h-4"/>Test exact key & model</button><button onClick={remove} disabled={loading||!selected.hasKey} className="px-4 py-2 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-lg text-xs flex items-center gap-2"><Trash2 className="w-4 h-4"/>Remove saved key</button></div>
    </section>}
    <section className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4"><h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-400"/>Provider routing</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><label>Default AI provider<select value={primary} onChange={e=>setPrimary(e.target.value)} className="block w-full bg-slate-950 border border-slate-800 rounded p-2 mt-1">{entries.map(e=><option key={e.provider.id} value={e.provider.id}>{e.provider.name}</option>)}</select></label>
        <label>Authorized fallback<select value={fallback} onChange={e=>setFallback(e.target.value)} className="block w-full bg-slate-950 border border-slate-800 rounded p-2 mt-1"><option value="">Disabled</option>{entries.filter(e=>e.provider.id!==primary).map(e=><option key={e.provider.id} value={e.provider.id}>{e.provider.name}</option>)}</select></label>
        <label>Signal evidence threshold: {threshold}%<input type="range" min="50" max="90" value={threshold} onChange={e=>setThreshold(Number(e.target.value))} className="block w-full mt-2 accent-cyan-400"/></label></div>
      <button onClick={saveDefaults} disabled={loading} className="px-4 py-2 bg-slate-800 rounded-lg text-xs">Save routing settings</button>
      <p className="text-[11px] text-slate-500">Fallback is used only when explicitly selected and configured. Non-Gemini models are text-only in this integration; screenshot vision requires a discovered Gemini model.</p>
    </section>
    {message && <div role={message.ok?'status':'alert'} className={`p-3 rounded-lg text-xs flex gap-2 ${message.ok?'bg-emerald-500/10 text-emerald-300':'bg-rose-500/10 text-rose-300'}`}>{message.ok?<CheckCircle2 className="w-4 h-4"/>:<AlertTriangle className="w-4 h-4"/>}{message.text}</div>}
    <p className="text-[11px] text-slate-500">Environment defaults: GEMINI_API_KEY and GEMINI_MODEL. User-managed keys require server-side CREDENTIAL_ENCRYPTION_KEY. Environment secrets are never returned to the browser. Provider usage details: Not available from provider unless an official usage API is added.</p>
  </div>;
};
