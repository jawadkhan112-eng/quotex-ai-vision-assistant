import React from 'react';
import { Settings, Shield, HardDrive, Info } from 'lucide-react';

interface AppSettingsViewProps {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
}

export const AppSettingsView: React.FC<AppSettingsViewProps> = ({ isDarkMode, setIsDarkMode }) => {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" /> Application Settings & Compliance
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage local terminal display settings, screenshot retention disclosures, and system metadata.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-sm text-slate-200">Theme & Display Settings</h3>
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-200 font-medium block">Dark Theme Terminal Mode</span>
            <span className="text-slate-500">Optimized high-contrast dark palette for trading chart analysis</span>
          </div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors ${
              isDarkMode ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {isDarkMode ? 'DARK MODE' : 'LIGHT MODE'}
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" /> Screenshot & Data Retention Policy
        </h3>
        <p className="text-slate-400 leading-relaxed">
          Uploaded screenshots and captured frames are saved locally in the server <code className="text-cyan-300 font-mono">/uploads</code> folder solely for analysis records stored in your local SQLite database. Screenshots are never shared or sent to external marketing third parties.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" /> Analysis-Only Disclaimers
        </h3>
        <ul className="space-y-1.5 text-slate-400 list-disc pl-5">
          <li>This application does NOT contain automatic trade execution capabilities.</li>
          <li>The software does NOT click broker buttons or perform automated trading logins.</li>
          <li>Signal output (CALL / PUT / WAIT) is an explainable technical perspective only.</li>
          <li>Evidence Quality Score is NOT a winning rate guarantee or profit promise.</li>
        </ul>
      </div>
    </div>
  );
};
