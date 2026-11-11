import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, AlertCircle, X, KeyRound, CheckCircle2, Delete, RotateCcw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { verifyPin, hashPin, generateSalt, getRemainingLockoutSeconds, recordFailedAttempt, resetLockoutState } from '../utils/security';
import { logAuditEvent, AUDIT_CATEGORIES } from '../utils/auditLogger';

// Admin Auth Scope Identifier (evaluated in-memory in AdminApp)
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
  const [activeSetupStep, setActiveSetupStep] = useState('first'); // 'first' | 'confirm'
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setError('');
      setIsVerifying(false);
      setActiveSetupStep('first');
      const remaining = getRemainingLockoutSeconds();
      setLockoutRemaining(remaining);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    let timer;
    if (lockoutRemaining > 0) {
      timer = setInterval(() => {
        setLockoutRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setError('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleDigitClick = (digit) => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setError('');
    if (isSettingUp && activeSetupStep === 'confirm') {
      if (confirmPin.length < 6) {
        setConfirmPin(prev => prev + digit);
      }
    } else {
      if (pin.length < 6) {
        setPin(prev => prev + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setError('');
    if (isSettingUp && activeSetupStep === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1));
    } else {
      setPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (lockoutRemaining > 0 || isVerifying) return;
    setError('');
    if (isSettingUp && activeSetupStep === 'confirm') {
      setConfirmPin('');
    } else {
      setPin('');
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (lockoutRemaining > 0 || isVerifying) return;

    const targetPin = isSettingUp && activeSetupStep === 'confirm' ? confirmPin : pin;

    if (!targetPin || targetPin.length < 4) {
      setError('Please enter a 4 to 6 digit Master PIN.');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // 1. If first time setup without any PIN
      if (!hasConfiguredPin || isSettingUp) {
        if (activeSetupStep === 'first') {
          setActiveSetupStep('confirm');
          setIsVerifying(false);
          return;
        }

        if (pin !== confirmPin) {
          setError('PIN confirmation does not match. Please re-enter.');
          setConfirmPin('');
          setActiveSetupStep('first');
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

  const currentEnteredPin = isSettingUp && activeSetupStep === 'confirm' ? confirmPin : pin;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-96 h-96 bg-amber-500/10 rounded-full blur-3xl opacity-60 animate-pulse" />
      </div>

      <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl max-w-sm w-full p-6 sm:p-7 shadow-2xl relative backdrop-blur-2xl animate-scaleIn">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
          title="Return to Billing Studio"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 flex items-center justify-center mx-auto mb-3.5 shadow-xl shadow-amber-500/15">
            <ShieldCheck className="w-8 h-8 text-amber-400 drop-shadow" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-300 uppercase tracking-widest mb-1.5">
            DR FILMS Control Portal
          </div>
          <h3 className="text-xl font-bold text-slate-100 font-display tracking-tight">
            {isSettingUp || !hasConfiguredPin
              ? activeSetupStep === 'confirm' ? 'Confirm Master PIN' : 'Create Master PIN'
              : 'Admin Security Verification'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            {isSettingUp || !hasConfiguredPin
              ? activeSetupStep === 'confirm'
                ? 'Re-enter your 4 to 6 digit Master PIN to confirm setup'
                : 'Create a Master PIN to protect the commercial licensing and customer directory'
              : 'Enter Master Admin PIN to open the User Control and Website Panel'}
          </p>
        </div>

        {/* Error / Lockout Banner */}
        {lockoutRemaining > 0 ? (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-center gap-2.5 shadow-inner">
            <Lock className="w-4 h-4 shrink-0 text-rose-400" />
            <div className="flex-1">
              <span className="font-semibold block">Access Temporarily Locked</span>
              <span className="text-[11px] text-rose-400/90">Try again in {lockoutRemaining} seconds</span>
            </div>
          </div>
        ) : error ? (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-center gap-2.5 shadow-inner">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="font-medium text-[11px] leading-tight">{error}</span>
          </div>
        ) : null}

        {/* Visual PIN Dots Indicator */}
        <div className="mb-6 flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const isFilled = index < currentEnteredPin.length;
              return (
                <div
                  key={index}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-amber-400 border-amber-400 shadow-md shadow-amber-400/50 scale-125'
                      : 'border-2 border-slate-700 bg-slate-950/60'
                  }`}
                />
              );
            })}
          </div>
          <span className="text-[10px] text-slate-500 font-mono tracking-wider mt-1">
            {currentEnteredPin.length > 0 ? `${currentEnteredPin.length} / 6 digits entered` : '4 to 6 digits required'}
          </span>
        </div>

        {/* Hidden Accessible Input for Physical Keyboard / Autofocus */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={currentEnteredPin}
            disabled={lockoutRemaining > 0 || isVerifying}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              if (isSettingUp && activeSetupStep === 'confirm') {
                setConfirmPin(val);
              } else {
                setPin(val);
              }
            }}
            className="sr-only"
            autoFocus
          />

          {/* Ergonomic Tactile Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={lockoutRemaining > 0 || isVerifying}
                onClick={() => handleDigitClick(String(digit))}
                className="py-3 bg-slate-800/70 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 active:scale-95 border border-slate-700/60 hover:border-amber-500/30 rounded-2xl text-slate-100 font-bold text-lg transition-all duration-150 cursor-pointer disabled:opacity-40 shadow-sm"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying || currentEnteredPin.length === 0}
              onClick={handleClear}
              className="py-3 bg-slate-800/40 hover:bg-slate-700/60 active:scale-95 border border-slate-700/50 rounded-2xl text-slate-400 hover:text-slate-200 font-semibold text-xs tracking-wider uppercase transition-all duration-150 cursor-pointer disabled:opacity-30"
              title="Clear entered digits"
            >
              Clear
            </button>

            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying}
              onClick={() => handleDigitClick('0')}
              className="py-3 bg-slate-800/70 hover:bg-slate-700/80 active:bg-amber-500 active:text-slate-950 active:scale-95 border border-slate-700/60 hover:border-amber-500/30 rounded-2xl text-slate-100 font-bold text-lg transition-all duration-150 cursor-pointer disabled:opacity-40 shadow-sm"
            >
              0
            </button>

            <button
              type="button"
              disabled={lockoutRemaining > 0 || isVerifying || currentEnteredPin.length === 0}
              onClick={handleBackspace}
              className="py-3 bg-slate-800/40 hover:bg-slate-700/60 active:scale-95 border border-slate-700/50 rounded-2xl text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-30"
              title="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={lockoutRemaining > 0 || isVerifying || currentEnteredPin.length < 4}
            className="w-full mt-3 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 active:scale-98 text-slate-950 font-extrabold text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <KeyRound className="w-4 h-4" />
            <span>
              {isVerifying
                ? 'Verifying Security PIN...'
                : isSettingUp || !hasConfiguredPin
                ? activeSetupStep === 'first'
                  ? 'Continue to Confirm'
                  : 'Save Master PIN and Enter'
                : 'Unlock Admin Portal'}
            </span>
          </button>
        </form>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-xs">
          {!hasConfiguredPin && !isSettingUp ? (
            <button
              type="button"
              onClick={() => setIsSettingUp(true)}
              className="text-amber-400 hover:text-amber-300 transition cursor-pointer font-medium mx-auto"
            >
              First time setup: Set new Master PIN
            </button>
          ) : isSettingUp ? (
            <button
              type="button"
              onClick={() => {
                setIsSettingUp(false);
                setActiveSetupStep('first');
                setPin('');
                setConfirmPin('');
              }}
              className="text-slate-400 hover:text-slate-200 transition cursor-pointer mx-auto flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Back to standard unlock</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition cursor-pointer mx-auto"
            >
              Return to DR FILMS Billing Studio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
