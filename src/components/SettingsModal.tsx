import React, { useState, useEffect } from 'react';
import { getActiveDbMode, setActiveDbMode } from '../lib/firebase';
import { X, Key, Shield, HelpCircle, HardDrive, Database, Info } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onRefreshState: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onRefreshState }) => {
  const [apiKey, setApiKey] = useState('');
  const [dbMode, setDbMode] = useState<'user' | 'workspace'>('user');

  useEffect(() => {
    setApiKey(localStorage.getItem('taskflow_gemini_api_key') || '');
    setDbMode(getActiveDbMode());
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      localStorage.setItem('taskflow_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('taskflow_gemini_api_key');
    }
    setActiveDbMode(dbMode);
    
    // Dispatch a state recalculation in parent App
    onRefreshState();
    onClose();
  };

  const handleClearKey = () => {
    setApiKey('');
    localStorage.removeItem('taskflow_gemini_api_key');
  };

  return (
    <div className="fixed inset-0 bg-black/55 z-[999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#112240] border border-gray-250 dark:border-gold-500/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button 
          onClick={onClose} 
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gold-500 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 mb-2 flex items-center gap-2 select-none">
          <Database className="w-5 h-5 text-gold-500 animate-pulse" />
          <span>Sync & AI System Settings</span>
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-300 font-mono mb-6 leading-relaxed">
          Manage your cloud-based database synchronization for multi-device operations and customize Gemini AI integrations securely.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section: Cloud Sync Database Config */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5 select-none">
              <Shield className="w-3.5 h-3.5" />
              <span>Multi-Device Database Synchronization</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: User's recruitmen-2cc3d project */}
              <label className={`p-4 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                dbMode === 'user' 
                  ? 'border-gold-500 bg-gold-500/5 dark:bg-gold-500/10 ring-1 ring-gold-500/20' 
                  : 'border-gray-200 dark:border-slate-800 bg-gray-50/50 hover:bg-gold-500/5'
              }`}>
                <input 
                  type="radio" 
                  name="db_mode" 
                  value="user" 
                  checked={dbMode === 'user'} 
                  onChange={() => setDbMode('user')}
                  className="sr-only"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full flex items-center justify-center border ${dbMode === 'user' ? 'border-gold-500 bg-gold-500' : 'border-gray-300'}`}>
                      {dbMode === 'user' && <span className="w-1 h-1 bg-white rounded-full"></span>}
                    </span>
                    <h5 className="text-xs font-bold text-gray-800 dark:text-gold-500">Custom Cloud Project</h5>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-2">
                    ID: <b>recruitmen-2cc3d</b>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Syncs tasks directly into your custom external Firestore instance.
                  </p>
                </div>
              </label>

              {/* Option 2: Auto-provisioned safe workspace project */}
              <label className={`p-4 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                dbMode === 'workspace' 
                  ? 'border-gold-500 bg-gold-500/5 dark:bg-gold-500/10 ring-1 ring-gold-500/20' 
                  : 'border-gray-200 dark:border-slate-800 bg-gray-50/50 hover:bg-gold-500/5'
              }`}>
                <input 
                  type="radio" 
                  name="db_mode" 
                  value="workspace" 
                  checked={dbMode === 'workspace'} 
                  onChange={() => setDbMode('workspace')}
                  className="sr-only"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full flex items-center justify-center border ${dbMode === 'workspace' ? 'border-gold-500 bg-gold-500' : 'border-gray-300'}`}>
                      {dbMode === 'workspace' && <span className="w-1 h-1 bg-white rounded-full"></span>}
                    </span>
                    <h5 className="text-xs font-bold text-gray-800 dark:text-gold-500">Workspace Database</h5>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-2">
                    ID: <b>ai-studio-applet-webapp</b>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Secure developer sandbox pre-configured by Google Cloud Run.
                  </p>
                </div>
              </label>
            </div>
            
            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-2 text-[10px] text-gray-500">
              <Info className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <b>Synchronicity Notice:</b> Standard Firestore limits require your custom database to allow open reads/writes for unauthenticated operations (e.g. testing) unless you configure Firebase Authentication Rules inside recruitmen-2cc3d. The pre-provisioned workspace option is fully open by default.
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-200 dark:bg-slate-850"></div>

          {/* Section: Gemini API Key */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5 select-none">
              <Key className="w-3.5 h-3.5" />
              <span>Gemini AI Generative Engine</span>
            </h4>
            
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Your Local Gemini API Key (Optional)</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API Key here (starts with AIzaSy...)" 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white font-mono text-xs"
              />
              <p className="text-[9px] text-gray-400 mt-1.5 leading-normal">
                Leave this field blank to automatically fall back to the secure backend server-side <b>process.env.GEMINI_API_KEY</b> injected by Google AI Studio Build!
              </p>
            </div>
          </div>

          {/* Save/Close Button Footer Row */}
          <div className="flex gap-2.5 pt-2">
            <button 
              type="submit" 
              className="flex-1 bg-gold-500 text-white font-medium py-2.5 rounded-lg hover:bg-gold-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <span>Save & Sync Settings</span>
            </button>
            <button 
              type="button" 
              onClick={handleClearKey}
              className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-white text-xs font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Clear API Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default SettingsModal;
