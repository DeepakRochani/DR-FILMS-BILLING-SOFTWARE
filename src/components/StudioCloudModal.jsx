import React, { useState } from 'react';
import { X, Cloud, Lock, CheckCircle2, AlertCircle, RefreshCw, Database, Shield, LogOut } from 'lucide-react';
import { 
  isStudioCloudAuthorized, 
  setStudioCloudAuthorized, 
  verifyAndAuthorizeStudioCloud,
  isCustomSupabaseConfigured,
  setCustomSupabaseCredentials,
  getActiveSupabaseUrl,
  isCloudSyncActive
} from '../config/supabase';
import { syncBidirectional, enableDexieSyncHooks, setupRealtimeSync } from '../utils/supabaseSync';
import { db } from '../db/db';

export function StudioCloudModal({ isOpen, onClose }) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('owner'); // 'owner' | 'custom'

  // Custom Supabase states
  const [customUrl, setCustomUrl] = useState(localStorage.getItem('drfilms_supabase_url') || '');
  const [customKey, setCustomKey] = useState(localStorage.getItem('drfilms_supabase_anon_key') || '');

  const isOwnerConnected = isStudioCloudAuthorized();
  const isCustomConnected = isCustomSupabaseConfigured();

  if (!isOpen) return null;

  const handleConnectOwner = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await verifyAndAuthorizeStudioCloud(passcode);
      if (!res.success) {
        setError(res.error || 'Incorrect passcode');
        setLoading(false);
        return;
      }

      enableDexieSyncHooks(db);
      setupRealtimeSync();
      const syncRes = await syncBidirectional();

      if (syncRes.ok) {
        setSuccess('Studio Cloud connected successfully. All bills and clients synced.');
      } else {
        setSuccess('Studio Cloud connected. Initial sync in progress.');
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectOwner = () => {
    setStudioCloudAuthorized(false);
    setSuccess('Disconnected from Studio Cloud. Reverted to Private Local Mode.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleSaveCustom = (e) => {
    e.preventDefault();
    if (!customUrl.trim() || !customKey.trim()) {
      setError('Both Supabase URL and Anon Key are required');
      return;
    }
    setCustomSupabaseCredentials(customUrl.trim(), customKey.trim());
    enableDexieSyncHooks(db);
    setupRealtimeSync();
    setSuccess('Custom Supabase credentials saved.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleClearCustom = () => {
    setCustomSupabaseCredentials('', '');
    setCustomUrl('');
    setCustomKey('');
    setSuccess('Custom credentials removed. Reverted to Private Local Mode.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Cloud Sync & Multi-Device
              </h3>
              <p className="text-xs text-slate-400">
                Private Local Mode vs Studio Cloud
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex rounded-xl bg-slate-950/80 p-1 border border-slate-800 my-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setActiveTab('owner'); setError(''); setSuccess(''); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'owner'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DR FILMS Owner
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('custom'); setError(''); setSuccess(''); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'custom'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Custom Database
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Tab: Studio Owner */}
        {activeTab === 'owner' && (
          <div className="space-y-4">
            {isOwnerConnected ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Studio Cloud Connected</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This device is verified as the DR FILMS Studio Owner. Your bills, clients, and catalog sync in real-time across your authorized devices.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      await syncBidirectional();
                      setLoading(false);
                      setSuccess('Sync completed.');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>Sync Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectOwner}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectOwner} className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold">
                    <Shield className="w-4 h-4" />
                    <span>Private Local Mode Active</span>
                  </div>
                  <p className="text-slate-400">
                    By default, this software operates 100% locally on this device. New users and clients have their own independent workspaces.
                  </p>
                  <p className="text-slate-400">
                    If you are the Studio Owner, enter your 4-digit Master PIN to sync your bills and clients.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Studio Owner Passcode / Master PIN
                  </label>
                  <input
                    type="password"
                    maxLength={10}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter owner PIN (e.g. 0303)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !passcode.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>Connect & Sync Studio</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab: Custom Database */}
        {activeTab === 'custom' && (
          <form onSubmit={handleSaveCustom} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 leading-relaxed">
              Third-party studios can connect their own Supabase project to enable multi-device sync for their independent workspace.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Supabase Anon Key
              </label>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="eyJhbGciOi..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                Save Custom Cloud
              </button>
              {isCustomConnected && (
                <button
                  type="button"
                  onClick={handleClearCustom}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
