import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  CreditCard, 
  QrCode, 
  Copy, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Smartphone,
  Building2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { PLAN_TIERS, activateSubscriptionWithPayment } from '../utils/licenseManager';
import { buildUpiLink, generateQrDataUrl } from '../utils/qrGenerator';

export function SubscriptionCheckoutModal({
  isOpen,
  onClose,
  selectedTier = 'pro',
  onPlanActivated
}) {
  const [activeTier, setActiveTier] = useState(selectedTier);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [upiString, setUpiString] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('upi'); // 'upi' | 'bank'

  // Load business/banking settings for custom payment coordinates if configured
  const settings = useLiveQuery(() => {
    if (!db.settings) return null;
    return db.settings.get('business_profile');
  });

  const payeeUpi = (settings?.bankDetails?.upiId || settings?.upiId || 'drfilms@hdfcbank').trim();
  const payeeName = (settings?.businessName || 'DR FILMS').trim();

  useEffect(() => {
    if (selectedTier) {
      setActiveTier(selectedTier);
    }
  }, [selectedTier]);

  const currentPlan = PLAN_TIERS[activeTier] || PLAN_TIERS.pro;
  const planPrice = currentPlan.price || 0;

  // Generate UPI QR code for the selected subscription amount
  useEffect(() => {
    if (!isOpen) return;

    if (planPrice === 0) {
      setQrDataUrl('');
      setUpiString('');
      return;
    }

    const upiLink = buildUpiLink({
      upiId: payeeUpi,
      payeeName,
      amount: planPrice,
      invoiceNumber: `SUB-${activeTier.toUpperCase()}`
    });

    setUpiString(upiLink);

    generateQrDataUrl(upiLink, { width: 300, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch((err) => {
        console.warn('Could not generate subscription QR code:', err);
        setQrDataUrl('');
      });
  }, [isOpen, activeTier, planPrice, payeeUpi, payeeName]);

  if (!isOpen) return null;

  const handleCopyUpi = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(payeeUpi);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const handleConfirmPayment = async (e) => {
    e?.preventDefault?.();
    setIsActivating(true);
    setStatusMessage(null);

    try {
      const result = await activateSubscriptionWithPayment({
        planTier: activeTier,
        durationDays: currentPlan.durationDays || 365,
        isLifetime: activeTier === 'enterprise',
        paymentMethod: activeTab === 'bank' ? 'BANK_TRANSFER' : 'UPI',
        transactionRef: transactionRef.trim() || 'DIRECT_CONFIRMED',
        amount: planPrice,
        customerName: payeeName,
        allowedFeatures: ['*']
      });

      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: `Payment confirmed! ${currentPlan.name} is now active on your workspace.`
        });
        setTimeout(() => {
          if (onPlanActivated) onPlanActivated(result);
          onClose();
        }, 1200);
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to complete subscription activation.'
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error occurred while activating plan.'
      });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Subscribe & Activate Plan
              </h3>
              <p className="text-xs text-slate-400">
                Select your subscription model and complete payment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Plan Selector Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.keys(PLAN_TIERS).map((key) => {
              const tier = PLAN_TIERS[key];
              const isSelected = activeTier === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTier(key);
                    setStatusMessage(null);
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 text-slate-100 shadow-md shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">
                      {tier.badge}
                    </span>
                    <span className="text-xs font-bold text-slate-100 block mt-0.5">
                      {tier.name}
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-sm font-extrabold text-amber-400 font-mono">
                      {tier.priceFormatted || (tier.price === 0 ? 'Free' : `₹ ${tier.price}`)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {tier.billingPeriod}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Plan Summary Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  {currentPlan.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  {currentPlan.billingPeriod}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentPlan.description}
              </p>
            </div>
            <div className="sm:text-right shrink-0">
              <span className="text-xl font-extrabold text-amber-400 font-mono">
                {currentPlan.priceFormatted}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {activeTier === 'enterprise' ? 'One-time payment' : 'Annual subscription'}
              </span>
            </div>
          </div>

          {/* Payment Method Details */}
          {planPrice > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('upi')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'upi'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Instant UPI QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('bank')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'bank'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Bank Details</span>
                </button>
              </div>

              {activeTab === 'upi' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl w-44 h-44 mx-auto shadow-lg">
                    {qrDataUrl ? (
                      <img 
                        src={qrDataUrl} 
                        alt="UPI Payment QR" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 text-xs text-center p-2">
                        <QrCode className="w-10 h-10 text-slate-400 mb-1" />
                        <span>Generating QR...</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Payee UPI ID
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs font-bold text-amber-300 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 break-all select-all">
                          {payeeUpi}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyUpi}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer shrink-0"
                          title="Copy UPI ID"
                        >
                          {copiedUpi ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Payee Name
                      </span>
                      <span className="text-xs font-bold text-slate-200 block mt-0.5">
                        {payeeName}
                      </span>
                    </div>

                    {upiString && (
                      <a
                        href={upiString}
                        className="inline-flex sm:hidden items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Pay {currentPlan.priceFormatted} in UPI App</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'bank' && (
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Account Name:</span>
                      <strong className="text-slate-200 font-semibold">{settings?.bankDetails?.accountName || payeeName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Bank:</span>
                      <strong className="text-slate-200 font-semibold">{settings?.bankDetails?.bankName || 'HDFC Bank'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Account Number:</span>
                      <strong className="text-slate-200 font-mono">{settings?.bankDetails?.accountNumber || '502000XXXXXXXX'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">IFSC Code:</span>
                      <strong className="text-slate-200 font-mono">{settings?.bankDetails?.ifsc || 'HDFC0000123'}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* UTR Reference Input Form */}
              <form onSubmit={handleConfirmPayment} className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    UPI Transaction ID / UTR / Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. 412389472619 or UPI Ref"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Enter the 12-digit UPI UTR from your payment receipt for instant auto-verification.
                  </p>
                </div>

                {statusMessage && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {statusMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    )}
                    <span>{statusMessage.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isActivating}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  {isActivating ? 'Activating Subscription...' : `Confirm Payment & Activate ${currentPlan.name}`}
                </button>
              </form>
            </div>
          ) : (
            /* Free Trial Confirmation */
            <div className="p-6 bg-slate-950/60 rounded-2xl border border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">
                  Activate 14-Day Free Trial
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Enjoy standard invoicing features with up to 25 bills. No credit card or advance payment required.
                </p>
              </div>

              {statusMessage && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{statusMessage.text}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isActivating}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-md shadow-amber-500/20"
              >
                {isActivating ? 'Starting Trial...' : 'Start Free Trial Now'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubscriptionCheckoutModal;

