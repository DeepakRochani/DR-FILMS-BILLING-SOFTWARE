import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Database, 
  Shield, 
  LogOut, 
  Mail, 
  Sparkles, 
  User, 
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import { 
  isStudioCloudAuthorized, 
  setStudioCloudAuthorized, 
  verifyAndAuthorizeStudioCloud,
  isCloudSyncActive,
  getSupabase,
  getCurrentAuthUser,
  getEffectiveCloudUserId
} from '../config/supabase';
import { syncBidirectional, enableDexieSyncHooks, setupRealtimeSync } from '../utils/supabaseSync';
import { db } from '../db/db';

function GoogleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function AppleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.78 1.06-1.85.94-2.93-.93.04-2.07.63-2.73 1.41-.58.68-1.09 1.77-.96 2.83 1.05.08 2.12-.53 2.75-1.31z" />
    </svg>
  );
}

export function StudioCloudModal({ isOpen, onClose }) {
  const [currentUser, setCurrentUser] = useState(() => getCurrentAuthUser());
  const [activeTab, setActiveTab] = useState('sso'); // 'sso' | 'email' | 'owner' | 'custom'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Email form
  const [emailMode, setEmailMode] = useState('signin'); // 'signin' | 'signup' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Owner Passcode
  const [passcode, setPasscode] = useState('');

  const isOwner = isStudioCloudAuthorized() || (currentUser?.email && ['contact@drfilms.studio', 'deepurochani@gmail.com'].includes(currentUser.email.toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOAuthSignIn = async (provider) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Cloud client could not be initialized.');
        setLoading(false);
        return;
      }
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin
        }
      });
      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      setError(err.message || 'OAuth sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Cloud client could not be initialized.');
        setLoading(false);
        return;
      }

      if (emailMode === 'magic') {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (authError) {
          setError(authError.message);
        } else {
          setSuccess('Login magic link sent to your email.');
        }
      } else if (emailMode === 'signup') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password
        });
        if (authError) {
          setError(authError.message);
        } else {
          if (data.session) {
            setSuccess('Account created and logged in.');
            enableDexieSyncHooks(db);
            setupRealtimeSync();
            await syncBidirectional();
            setTimeout(() => onClose(), 1200);
          } else {
            setSuccess('Confirmation email sent. Please check your inbox.');
          }
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (authError) {
          setError(authError.message);
        } else {
          setSuccess('Signed in successfully.');
          enableDexieSyncHooks(db);
          setupRealtimeSync();
          await syncBidirectional();
          setTimeout(() => onClose(), 1200);
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSignOut = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
      setStudioCloudAuthorized(false);
      try {
        sessionStorage.removeItem('drfilms_guest_mode');
      } catch {}
      const { resetToFreshWorkspace } = await import('../utils/workspaceManager');
      await resetToFreshWorkspace();
      setCurrentUser(null);
      setSuccess('Signed out. Local workspace reset to clean slate.');
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (err) {
      setError(err.message || 'Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await syncBidirectional();
      if (res.ok) {
        setSuccess(`Synced successfully. (${res.summary?.pulled || 0} updated)`);
      } else {
        setError(res.error || 'Sync completed with notices');
      }
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
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
                Billing Account & Cloud Sync
              </h3>
              <p className="text-xs text-slate-400">
                Private Workspace with Row-Level Security
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

        {/* Status / Logged In Card */}
        {currentUser ? (
          <div className="my-5 p-4 rounded-2xl bg-slate-950/70 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300">Signed In</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {isOwner ? 'DR FILMS Master Admin' : 'Private Workspace'}
              </span>
            </div>

            <div className="text-sm font-semibold text-slate-200 break-all">
              {currentUser.email}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {isOwner
                ? 'You have master administrative access to all DR FILMS bills and client records.'
                : 'Your bills, invoices, and client lists are isolated in your own private cloud database. No other user can see them.'}
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleSyncNow}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-2.5 px-3 rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Syncing...' : 'Sync Now'}</span>
              </button>

              {isOwner && (
                <a
                  href="/admin"
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs py-2.5 px-3 rounded-xl border border-amber-500/40 transition cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admin Portal</span>
                </a>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleSignOut}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold border border-slate-700/80 transition cursor-pointer"
                title="Sign out of your account"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 my-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setActiveTab('sso'); setError(''); setSuccess(''); }}
                className={`py-1.5 rounded-lg transition-all text-center ${
                  activeTab === 'sso'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google / Apple
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('email'); setError(''); setSuccess(''); }}
                className={`py-1.5 rounded-lg transition-all text-center ${
                  activeTab === 'email'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('owner'); setError(''); setSuccess(''); }}
                className={`py-1.5 rounded-lg transition-all text-center ${
                  activeTab === 'owner'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Owner PIN
              </button>
            </div>

            {/* SSO Tab (Google & Apple) */}
            {activeTab === 'sso' && (
              <div className="space-y-3.5 py-1">
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Sign in to get your own isolated billing workspace. Your bills and data are private to you.
                </p>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleOAuthSignIn('google')}
                  className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs py-3 px-4 rounded-xl shadow transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <GoogleIcon className="w-4 h-4" />
                  <span>Continue with Google</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleOAuthSignIn('apple')}
                  className="w-full flex items-center justify-center gap-3 bg-black hover:bg-slate-900 text-white font-semibold text-xs py-3 px-4 rounded-xl border border-slate-700 shadow transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <AppleIcon className="w-4 h-4" />
                  <span>Continue with Apple</span>
                </button>

                <div className="pt-2 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Database Row-Level Security Protected</span>
                </div>
              </div>
            )}

            {/* Email Tab */}
            {activeTab === 'email' && (
              <form onSubmit={handleEmailAuth} className="space-y-3 py-1">
                <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEmailMode('signin')}
                    className={`flex-1 py-1 rounded font-medium ${emailMode === 'signin' ? 'bg-slate-800 text-amber-300' : 'text-slate-400'}`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailMode('signup')}
                    className={`flex-1 py-1 rounded font-medium ${emailMode === 'signup' ? 'bg-slate-800 text-amber-300' : 'text-slate-400'}`}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailMode('magic')}
                    className={`flex-1 py-1 rounded font-medium ${emailMode === 'magic' ? 'bg-slate-800 text-amber-300' : 'text-slate-400'}`}
                  >
                    Magic Link
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="studio@example.com"
                    className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                  />
                </div>

                {emailMode !== 'magic' && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Processing...' : emailMode === 'signin' ? 'Sign In' : emailMode === 'signup' ? 'Create Private Workspace' : 'Send Magic Link'}
                </button>
              </form>
            )}

            {/* Owner Tab */}
            {activeTab === 'owner' && (
              <form onSubmit={handleConnectOwner} className="space-y-3 py-1">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your DR FILMS Master Passcode (0303) to link this device as Studio Admin with access to all studio bills.
                </p>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Studio Owner Passcode</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter 4-digit Master PIN (0303)"
                      className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs tracking-wider"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying & Syncing...' : 'Connect DR FILMS Master Studio'}
                </button>
              </form>
            )}
          </>
        )}

        {/* Feedback messages */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>DR FILMS Billing Suite</span>
          <span>Offline-First &bull; Multi-Tenant</span>
        </div>
      </div>
    </div>
  );
}
