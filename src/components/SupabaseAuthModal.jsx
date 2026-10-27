import React, { useState, useEffect } from 'react';
import { X, Cloud, Mail, Lock, LogIn, UserPlus, LogOut, CheckCircle, AlertCircle, Shield, Sparkles } from 'lucide-react';
import { getSupabase } from '../config/supabase';

export function SupabaseAuthModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'magiclink'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const supabase = getSupabase();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (authError) {
        setError(authError.message);
      } else {
        setMessage('Signed in successfully.');
        setCurrentUser(data.user);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabase();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (authError) {
        setError(authError.message);
      } else {
        if (data.session) {
          setMessage('Account created and signed in.');
          setCurrentUser(data.user);
          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setMessage('Confirmation email sent. Please check your inbox.');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (authError) {
        setError(authError.message);
      } else {
        setMessage('Magic login link sent to your email.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      setCurrentUser(null);
      setMessage('Signed out successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 font-display">
                Supabase Cloud Account
              </h3>
              <p className="text-xs text-slate-400">
                DR-FILMS-BILLING-SOFTWARE
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current user logged in banner */}
        {currentUser ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300">Signed In</span>
              </div>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                Active Session
              </span>
            </div>
            <p className="text-sm font-medium text-slate-200 break-all font-mono">
              {currentUser.email}
            </p>
            <div className="text-[11px] text-slate-400">
              User ID: <span className="font-mono text-slate-300">{currentUser.id}</span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>{loading ? 'Signing out...' : 'Sign Out of Cloud'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mode Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
                className={`py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  mode === 'signin'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                className={`py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  mode === 'signup'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => { setMode('magiclink'); setError(''); setMessage(''); }}
                className={`py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  mode === 'magiclink'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Magic Link
              </button>
            </div>

            {/* Form */}
            <form onSubmit={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full glass-input pl-9 pr-3.5 py-2.5 rounded-xl text-sm font-medium"
                    placeholder="studio@example.com"
                  />
                </div>
              </div>

              {mode !== 'magiclink' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full glass-input pl-9 pr-3.5 py-2.5 rounded-xl text-sm font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {message && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {mode === 'signin' && <LogIn className="w-4 h-4" />}
                {mode === 'signup' && <UserPlus className="w-4 h-4" />}
                {mode === 'magiclink' && <Sparkles className="w-4 h-4" />}
                <span>
                  {loading
                    ? 'Processing...'
                    : mode === 'signin'
                    ? 'Sign In'
                    : mode === 'signup'
                    ? 'Create Studio Account'
                    : 'Send Magic Link'}
                </span>
              </button>
            </form>
          </>
        )}

        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Project: wzoikmcpaempxnxosnve</span>
          <span>Region: ap-southeast-2</span>
        </div>
      </div>
    </div>
  );
}
