import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, 
  Unlock, 
  Sparkles, 
  Delete, 
  Fingerprint, 
  AlertTriangle, 
  RotateCcw, 
  ShieldCheck, 
  ShieldAlert,
  HelpCircle,
  Clapperboard
} from 'lucide-react';
import { 
  verifyPin, 
  getLockoutState, 
  recordFailedAttempt, 
  resetLockoutState, 
  getRemainingLockoutSeconds,
  verifyBiometrics,
  clearSiteDataAndReset,
  recordUserActivity
} from '../utils/security';

export function PinLockScreen({ securityProfile, onUnlock }) {
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(getRemainingLockoutSeconds());
  const [isVerifying, setIsVerifying] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      const remaining = getRemainingLockoutSeconds();
      setLockoutSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Attempt verification when PIN length is reached (4 to 6 digits)
  const handleSubmitPin = useCallback(async (pinToTest) => {
    if (isVerifying || lockoutSeconds > 0) return;
    if (!pinToTest || pinToTest.length < 4) {
      setErrorMessage('Enter your 4 to 6 digit PIN');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const isValid = await verifyPin(pinToTest, securityProfile.salt, securityProfile.pinHash);

      if (isValid) {
        resetLockoutState();
        recordUserActivity();
        onUnlock();
      } else {
        const nextLock = recordFailedAttempt();
        const rem = getRemainingLockoutSeconds();
        if (rem > 0) {
          setLockoutSeconds(rem);
          setErrorMessage(`Incorrect PIN. Locked out for ${rem} seconds.`);
        } else {
          const attemptsLeft = 5 - (nextLock.failedAttempts % 5);
          setErrorMessage(`Incorrect PIN. ${attemptsLeft} attempt(s) remaining before temporary lockout.`);
        }
        setEnteredPin('');
      }
    } catch (err) {
      setErrorMessage('Verification failed. Try again.');
      setEnteredPin('');
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying, lockoutSeconds, securityProfile, onUnlock]);

  const handleDigitPress = (digit) => {
    if (lockoutSeconds > 0 || isVerifying) return;
    if (enteredPin.length >= 6) return;
    const newPin = enteredPin + digit;
    setEnteredPin(newPin);
    setErrorMessage(null);

    // Auto-submit if 6 digits entered
    if (newPin.length === 6) {
      handleSubmitPin(newPin);
    }
  };

  const handleBackspace = () => {
    if (lockoutSeconds > 0 || isVerifying) return;
    setEnteredPin(prev => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (lockoutSeconds > 0 || isVerifying) return;
    setEnteredPin('');
    setErrorMessage(null);
  };

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lockoutSeconds > 0) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === 'Enter') {
        if (enteredPin.length >= 4) {
          handleSubmitPin(enteredPin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enteredPin, lockoutSeconds, handleSubmitPin]);

  // Biometric Unlock Trigger
  const handleBiometricUnlock = async () => {
    if (lockoutSeconds > 0 || !securityProfile?.biometricsEnabled) return;
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const ok = await verifyBiometrics(securityProfile.credentialId);
      if (ok) {
        resetLockoutState();
        recordUserActivity();
        onUnlock();
      } else {
        setErrorMessage('Biometric verification cancelled or not recognized.');
      }
    } catch (err) {
      setErrorMessage('Biometrics unavailable. Enter PIN instead.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-prompt biometrics once on mount if enabled
  useEffect(() => {
    if (securityProfile?.biometricsEnabled && lockoutSeconds === 0) {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 select-none overflow-y-auto min-h-screen">
      {/* Top Header & Branding */}
      <div className="w-full max-w-sm flex flex-col items-center pt-8 text-center space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
          <Clapperboard className="w-8 h-8" />
        </div>
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DR FILMS STUDIO</span>
          </div>
          <h2 className="text-xl font-display font-extrabold text-slate-100">
            Billing Suite Locked
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {lockoutSeconds > 0 
              ? 'Keypad temporarily disabled due to wrong attempts.' 
              : 'Enter your 4 to 6 digit security PIN to continue'}
          </p>
        </div>
      </div>

      {/* Center PIN Display & Numeric Keypad */}
      <div className="w-full max-w-xs flex flex-col items-center space-y-6 my-auto py-4">
        {/* Lockout countdown banner if active */}
        {lockoutSeconds > 0 ? (
          <div className="w-full p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-center space-y-1 animate-pulse">
            <ShieldAlert className="w-6 h-6 text-rose-400 mx-auto" />
            <p className="text-sm font-bold text-rose-300">
              Locked Out: {lockoutSeconds}s
            </p>
            <p className="text-[11px] text-slate-400">
              Keypad will re-enable automatically when countdown ends.
            </p>
          </div>
        ) : (
          <>
            {/* PIN Dots Display */}
            <div className="flex items-center justify-center gap-3 py-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = idx < enteredPin.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      isFilled
                        ? 'bg-amber-400 scale-110 shadow-md shadow-amber-400/50'
                        : 'bg-slate-800 border border-slate-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error or Hint Message */}
            {errorMessage && (
              <p className="text-xs text-rose-400 font-semibold text-center animate-shake px-2">
                {errorMessage}
              </p>
            )}

            {/* Unlock Button for 4-5 digit PINs */}
            {enteredPin.length >= 4 && enteredPin.length < 6 && (
              <button
                type="button"
                onClick={() => handleSubmitPin(enteredPin)}
                disabled={isVerifying}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md shadow-amber-500/20"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>{isVerifying ? 'Verifying...' : 'Unlock Suite'}</span>
              </button>
            )}
          </>
        )}

        {/* 3x4 Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={lockoutSeconds > 0 || isVerifying}
              onClick={() => handleDigitPress(String(digit))}
              className="h-14 sm:h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/90 hover:border-slate-700 text-xl font-display font-bold text-slate-100 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-sm"
            >
              {digit}
            </button>
          ))}

          {/* Bottom Row: Clear / Biometric */}
          {securityProfile?.biometricsEnabled ? (
            <button
              type="button"
              disabled={lockoutSeconds > 0 || isVerifying}
              onClick={handleBiometricUnlock}
              title="Unlock with Fingerprint or Face ID"
              className="h-14 sm:h-16 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <button
              type="button"
              disabled={lockoutSeconds > 0 || isVerifying || enteredPin.length === 0}
              onClick={handleClear}
              className="h-14 sm:h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800/60 text-xs font-semibold text-slate-400 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              Clear
            </button>
          )}

          {/* 0 */}
          <button
            type="button"
            disabled={lockoutSeconds > 0 || isVerifying}
            onClick={() => handleDigitPress('0')}
            className="h-14 sm:h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/90 hover:border-slate-700 text-xl font-display font-bold text-slate-100 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-sm"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            disabled={lockoutSeconds > 0 || isVerifying || enteredPin.length === 0}
            onClick={handleBackspace}
            title="Backspace"
            className="h-14 sm:h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800/60 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Footer Advisory & Recovery */}
      <div className="w-full max-w-sm flex flex-col items-center pb-6 text-center space-y-3">
        <button
          type="button"
          onClick={() => setShowForgotModal(true)}
          className="text-xs text-amber-400/90 hover:text-amber-300 font-semibold underline underline-offset-4 cursor-pointer"
        >
          Forgot PIN?
        </button>

        <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
          PIN lock hides the app screen. Keep your device locked too.
        </p>
      </div>

      {/* Forgot PIN Recovery Explanation Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 border border-slate-800 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Forgot Security PIN?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  DR FILMS PIN Recovery Guidelines
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                For your data security, your PIN is stored exclusively as a <strong>salted cryptographic hash</strong> on this device and can never be decrypted or recovered.
              </p>
              <p>
                The only way to regain access if you have forgotten your PIN is to <strong>clear this browser's site data</strong> and restore your studio bills, clients, and expenses from your Google Sheet cloud backup or a downloaded JSON backup.
              </p>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                💡 <strong>Good news:</strong> If Google Sheets Auto-Backup was enabled, none of your billing history will be lost.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
              >
                Back to Keypad
              </button>

              <button
                type="button"
                onClick={clearSiteDataAndReset}
                className="flex-1 py-2.5 px-4 bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
              >
                Clear Site Data & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
