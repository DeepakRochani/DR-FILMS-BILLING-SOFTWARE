import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, AlertCircle, X, KeyRound, CheckCircle2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { verifyPin, hashPin, generateSalt, getRemainingLockoutSeconds, recordFailedAttempt, resetLockoutState } from '../utils/security';
import { logAuditEvent, AUDIT_CATEGORIES } from '../utils/auditLogger';

// Admin Auth Scope Identifier (replaced by in-memory authentication in Phase 2)
export const ADMIN_AUTH_SCOPE = 'drfilms_admin_auth';

export function AdminPinModal({ isOpen, onClose, onAuthenticated }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Read admin security profile (strictly isolated from customer app PIN)
  const adminProfile = useLiveQuery(() => db.settings.get('admin_security_profile'));

  // First-time setup state if no Admin Master PIN exists
  const hasConfiguredPin = Boolean(adminProfile && adminProfile.pinHash);

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setError('');
      setIsVerifying(false);
      const remaining = getRemainingLockoutSeconds();
      setLockoutRemaining(remaining);
    }
  }, [isOpen]);

  useEffect(() => {
    let timer;
    if (lockoutRemaining > 0) {
      timer = setInterval(() => {
        setLockoutRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  if (!isOpen) return null;

  const handleDigitClick = (digit) => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setError('');
    if (isSettingUp) {
      if (pin.length < 6) {
        setPin(prev => prev + digit);
      }
    } else {
      if (pin.length < 6) {
        const nextPin = pin + digit;
        setPin(nextPin);
        if (nextPin.length >= 4) {
          // Auto submit when 4 or 6 digits if standard
        }
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setError('');
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setPin('');
    setConfirmPin('');
    setError('');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (lockoutRemaining > 0 || isVerifying) return;

    if (!pin || pin.length < 4) {
      setError('Please enter a 4-6 digit PIN.');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // 1. If first time setup without any PIN
      if (!hasConfiguredPin || isSettingUp) {
        if (!confirmPin) {
          setError('Please confirm your new Admin Master PIN.');
          setIsVerifying(false);
          return;
        }
        if (pin !== confirmPin) {
          setError('PINs do not match. Please re-enter.');
          setIsVerifying(false);
          return;
        }

        const salt = generateSalt();
        const pinHash = await hashPin(pin, salt);
        await db.settings.put({
          key: 'admin_security_profile',
          pinHash,
          salt,
          updatedAt: new Date().toISOString()
        });

        await logAuditEvent({
          category: AUDIT_CATEGORIES.AUTH,
          action: 'ADMIN_MASTER_PIN_CONFIGURED',
          details: 'Admin Master PIN was configured.'
        });

        resetLockoutState();
        if (onAuthenticated) onAuthenticated();
        if (onClose) onClose();
        return;
      }

      // 2. Verify exclusively against adminProfile
      if (!adminProfile || !adminProfile.pinHash || !adminProfile.salt) {
        setError('Admin Master PIN has not been configured yet.');
        setIsVerifying(false);
        return;
      }

      const isValid = await verifyPin(pin, adminProfile.salt, adminProfile.pinHash);

      if (isValid) {
        resetLockoutState();
        await logAuditEvent({
          category: AUDIT_CATEGORIES.AUTH,
          action: 'ADMIN_PORTAL_LOGIN_SUCCESS',
          details: 'Admin Master PIN successfully verified.'
        });
        if (onAuthenticated) onAuthenticated();
        if (onClose) onClose();
      } else {
        const lockRes = recordFailedAttempt();
        if (lockRes.isLockedOut) {
          setLockoutRemaining(lockRes.lockoutSeconds);
          setError(`Too many failed attempts. Locked for ${lockRes.lockoutSeconds} seconds.`);
        } else {
          setError(`Incorrect PIN. ${lockRes.remainingAttempts} attempt(s) remaining.`);
        }
        setPin('');
        await logAuditEvent({
          category: AUDIT_CATEGORIES.AUTH,
          action: 'ADMIN_PORTAL_LOGIN_FAILED',
          details: 'Incorrect Admin Master PIN entered.'
        });
      }
    } catch (err) {
      console.error('Admin PIN verification error:', err);
      setError('Verification error. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative animate-scaleIn">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-500/10">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 font-display">
            {isSettingUp || !hasConfiguredPin ? 'Set Admin Master PIN' : 'Admin Portal Access'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isSettingUp || !hasConfiguredPin
              ? 'Create a secure 4-6 digit PIN to protect the Admin Control Deck'
              : 'Enter Master Admin PIN to open the User Control & Website Panel'}
          </p>
        </div>

        {/* Error / Lockout Banner */}
        {lockoutRemaining > 0 ? (
          <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Access temporarily locked. Try again in {lockoutRemaining}s.</span>
          </div>
        ) : error ? (
          <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 text-center">
              {isSettingUp || !hasConfiguredPin ? 'Enter New 4-6 Digit PIN' : 'Master PIN'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              disabled={lockoutRemaining > 0 || isVerifying}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] py-3 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl text-slate-100 font-mono outline-none transition-colors"
            />
          </div>

          {(isSettingUp || !hasConfiguredPin) && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 text-center">
                Confirm Master PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={confirmPin}
                disabled={lockoutRemaining > 0 || isVerifying}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center text-2xl tracking-[0.5em] py-3 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl text-slate-100 font-mono outline-none transition-colors"
              />
            </div>
          )}

          {/* Quick Digit Grid */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={lockoutRemaining > 0 || isVerifying}
                onClick={() => handleDigitClick(String(digit))}
                className="py-2.5 bg-slate-800/80 hover:bg-slate-700/80 active:bg-amber-600 active:text-slate-950 border border-slate-700/60 rounded-xl text-slate-200 font-bold text-sm transition-all cursor-pointer disabled:opacity-40"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying}
              onClick={handleClear}
              className="py-2.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/60 rounded-xl text-slate-400 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying}
              onClick={() => handleDigitClick('0')}
              className="py-2.5 bg-slate-800/80 hover:bg-slate-700/80 active:bg-amber-600 active:text-slate-950 border border-slate-700/60 rounded-xl text-slate-200 font-bold text-sm transition-all cursor-pointer disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying}
              onClick={handleBackspace}
              className="py-2.5 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/60 rounded-xl text-slate-400 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              ⌫
            </button>
          </div>

          <button
            type="submit"
            disabled={lockoutRemaining > 0 || isVerifying || pin.length < 4}
            className="w-full mt-2 py-3 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" />
            <span>{isVerifying ? 'Verifying PIN...' : isSettingUp || !hasConfiguredPin ? 'Save Master PIN & Enter' : 'Unlock Admin Portal'}</span>
          </button>
        </form>

        {!hasConfiguredPin && !isSettingUp && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSettingUp(true)}
              className="text-xs text-amber-400 hover:underline"
            >
              Set new master PIN now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
