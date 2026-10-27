import React, { useState, useRef } from 'react';
import { 
  ShieldAlert, 
  Key, 
  MessageCircle, 
  Phone, 
  Mail, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Lock, 
  Sparkles,
  QrCode,
  ClipboardPaste,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { activateWithLicenseKey } from '../utils/licenseManager';

export function SubscriptionLockoutScreen({ 
  subscriptionConfig, 
  subscriptionStatus, 
  onAdminLoginRequested,
  onSubscriptionRenewed 
}) {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const fileInputRef = useRef(null);

  const studioName = subscriptionConfig?.clientStudioName || 'Studio Billing';
  const planName = subscriptionStatus?.planName || 'Studio License';
  const reason = subscriptionStatus?.reason || 'Your software subscription period has ended. Please renew to continue using the billing studio.';
  
  const envWhatsapp = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_WHATSAPP;
  const envPhone = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_PHONE;
  const envEmail = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_EMAIL;

  const supportPhone = envPhone || subscriptionConfig?.contactPhone || '+91 98765 43210';
  const supportEmail = envEmail || subscriptionConfig?.contactEmail || 'contact@drfilms.studio';
  const rawWhatsapp = (envWhatsapp || subscriptionConfig?.supportWhatsapp || '919876543210').replace(/[^0-9]/g, '');

  const whatsappMessage = encodeURIComponent(
    `Hello, I would like to renew the billing software license for "${studioName}". Please provide renewal options and my activation key.`
  );
  const whatsappUrl = `https://wa.me/${rawWhatsapp}?text=${whatsappMessage}`;

  const isClockTampered = subscriptionStatus?.lockReasonCode === 'CLOCK_TAMPERED';
  const isSignatureInvalid = subscriptionStatus?.lockReasonCode === 'INVALID_SIGNATURE';

  const handleActivate = async (e) => {
    e?.preventDefault();
    const clean = licenseKeyInput.trim();
    if (!clean) {
      setErrorMessage('Please enter your license key.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsActivating(true);

    try {
      const result = await activateWithLicenseKey(clean);
      if (result.success) {
        setSuccessMessage(`License successfully activated! Plan: ${result.planName}. Valid until: ${result.expiryDate}`);
        setTimeout(() => {
          if (onSubscriptionRenewed) {
            onSubscriptionRenewed();
          } else {
            window.location.reload();
          }
        }, 1200);
      } else {
        setErrorMessage(result.error || 'Invalid license key.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to activate license.');
    } finally {
      setIsActivating(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('DRF-')) {
          setLicenseKeyInput(text.trim());
          setErrorMessage('');
        } else if (text) {
          setLicenseKeyInput(text.trim());
        }
      }
    } catch {
      setErrorMessage('Clipboard access blocked. Please paste the key manually into the input box.');
    }
  };

  const handleRecheckClock = () => {
    if (onSubscriptionRenewed) {
      onSubscriptionRenewed();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-xl bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 animate-fadeIn">
        
        {/* Header Icon & Studio Title */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-bold tracking-wide uppercase">
            {isClockTampered ? 'Security Warning' : 'Subscription Notice'}
          </div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            {studioName}
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {reason}
          </p>
        </div>

        {/* Clock Rollback Warning */}
        {isClockTampered && (
          <div className="bg-rose-950/60 border border-rose-700/50 rounded-2xl p-4 text-xs text-rose-200 space-y-3">
            <div className="flex items-center gap-2 font-bold text-rose-400">
              <Clock className="w-4 h-4" />
              <span>System Clock Rollback Detected</span>
            </div>
            <p className="text-rose-300/90 text-[11px] leading-relaxed">
              Your device system clock is set backwards relative to previously recorded activity. To prevent tampering, software access is paused until the correct internet time is restored.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleRecheckClock}
                className="px-3.5 py-2 rounded-xl bg-rose-900/90 hover:bg-rose-800 text-rose-100 font-bold text-xs border border-rose-700 transition-all flex items-center gap-2 shadow cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-check Clock & Resume</span>
              </button>
            </div>
          </div>
        )}

        {/* Signature Tamper Warning */}
        {isSignatureInvalid && (
          <div className="bg-rose-950/60 border border-rose-700/50 rounded-2xl p-4 text-xs text-rose-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-400">
              <AlertCircle className="w-4 h-4" />
              <span>Cryptographic Signature Verification Failed</span>
            </div>
            <p className="text-rose-300/90 text-[11px] leading-relaxed">
              The license key could not be verified by the embedded ECDSA public key. Ensure the key was not altered or truncated.
            </p>
          </div>
        )}

        {/* License Status Card */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Current Plan:</span>
            <span className="font-semibold text-amber-400">{planName}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Expiration Status:</span>
            <span className="font-mono text-slate-200">{subscriptionStatus?.formattedExpiry || 'Expired'}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Data Preservation:</span>
            <span className="text-emerald-400 font-medium">Safe & Preserved in Local Database</span>
          </div>
        </div>

        {/* Activation Key Form */}
        <form onSubmit={handleActivate} className="space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Enter Signed License Activation Key</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <QrCode className="w-3 h-3 text-amber-400" />
                <span>Scan QR</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value.trim())}
              placeholder="DRF-payload.signature"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={isActivating || !licenseKeyInput.trim()}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isActivating ? 'Verifying...' : 'Activate'}</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}
        </form>

        {/* Support & Contact Action */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-900/30 cursor-pointer active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Renew via WhatsApp</span>
            </a>

            {onAdminLoginRequested && (
              <button
                type="button"
                onClick={onAdminLoginRequested}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-all cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Master Admin Override PIN</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" /> {supportPhone}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" /> {supportEmail}
            </span>
          </div>
        </div>
      </div>

      {/* Optional QR Scanner Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 mb-2">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-100">License QR Code Scanner</h3>
              <p className="text-xs text-slate-400">
                You can copy and paste the license key text directly, or upload a license QR image.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-3">
              <p className="text-xs text-slate-300">
                To activate using a QR code received via WhatsApp or email, select the image file:
              </p>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setErrorMessage('QR image uploaded. Please verify the key text in the activation box.');
                    setShowQrModal(false);
                  }
                }}
                className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
