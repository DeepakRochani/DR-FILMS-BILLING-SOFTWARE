import React, { useState, useEffect } from 'react';
import { Ban, AlertTriangle, ArrowRight, RotateCcw, X, DollarSign } from 'lucide-react';
import { formatCurrency, formatInvoiceNumber } from '../utils/formatters';

const CANCEL_REASONS = [
  'Client cancelled',
  'Duplicate',
  'Wrong details',
  'Other'
];

export function CancelBillModal({ isOpen, onClose, invoice, onConfirmCancel }) {
  const [reason, setReason] = useState('Client cancelled');
  const [note, setNote] = useState('');
  const [recordRefund, setRecordRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('UPI');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [refundNote, setRefundNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const paymentsReceived = Number(invoice?.advancePaid) || 0;

  useEffect(() => {
    if (isOpen && invoice) {
      setReason('Client cancelled');
      setNote('');
      setRecordRefund(false);
      setRefundAmount(paymentsReceived > 0 ? String(paymentsReceived) : '');
      setRefundMethod('UPI');
      setRefundDate(new Date().toISOString().split('T')[0]);
      setRefundNote('Refund due to bill cancellation');
      setIsSubmitting(false);
    }
  }, [isOpen, invoice, paymentsReceived]);

  if (!isOpen || !invoice) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (reason === 'Other' && !note.trim()) {
      alert('Please specify the cancellation reason note.');
      return;
    }

    const fullReason = reason === 'Other' ? (note.trim() ? `Other: ${note.trim()}` : 'Other') : (note.trim() ? `${reason} — ${note.trim()}` : reason);

    let refundPayload = null;
    if (recordRefund && Number(refundAmount) > 0) {
      const amt = Number(refundAmount);
      if (amt > paymentsReceived) {
        alert(`Refund amount cannot exceed total payments received (${formatCurrency(paymentsReceived)})`);
        return;
      }
      refundPayload = {
        amount: amt,
        date: refundDate,
        method: refundMethod,
        note: refundNote.trim() || `Refund for cancelled bill ${formatInvoiceNumber(invoice.invoiceNumber)}`
      };
    }

    setIsSubmitting(true);
    try {
      await onConfirmCancel({
        reason: fullReason,
        refundPayload
      });
      onClose();
    } catch (err) {
      console.error('Error cancelling invoice:', err);
      alert('Failed to cancel invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Ban className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-slate-100">
                Cancel Bill {formatInvoiceNumber(invoice.invoiceNumber)}
              </h3>
              <p className="text-xs text-slate-400">
                Void this invoice without deleting its sequence number or records.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reason Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Cancellation Reason <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            >
              {CANCEL_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Additional note */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              {reason === 'Other' ? 'Please specify note *' : 'Additional Note (Optional)'}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reason === 'Other' ? 'Explain cancellation reason...' : 'Add context or details...'}
              required={reason === 'Other'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Payments Received Warning & Refund Offer */}
          {paymentsReceived > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-200">
                    Payments of {formatCurrency(paymentsReceived)} were received on this bill.
                  </p>
                  <p className="text-slate-300 mt-0.5">
                    Would you like to record a refund to the client?
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={recordRefund}
                  onChange={(e) => setRecordRefund(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 w-4 h-4 bg-slate-900"
                />
                <span className="text-xs font-bold text-amber-300">
                  Record Refund of received payment
                </span>
              </label>

              {recordRefund && (
                <div className="pt-2 border-t border-amber-500/20 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Refund Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        max={paymentsReceived}
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Refund Method
                      </label>
                      <select
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Refund Date
                      </label>
                      <input
                        type="date"
                        value={refundDate}
                        onChange={(e) => setRefundDate(e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Refund Note
                      </label>
                      <input
                        type="text"
                        value={refundNote}
                        onChange={(e) => setRefundNote(e.target.value)}
                        placeholder="e.g. Returned via UPI"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancellation Rules Notice */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Effects of cancellation:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>Excluded from income, client balance, and pending receivables.</li>
              <li>Watermarked as <strong className="text-rose-400">CANCELLED</strong> on the invoice and PDF.</li>
              <li>Number {formatInvoiceNumber(invoice.invoiceNumber)} is preserved and never reused.</li>
              <li>You can reinstate this bill at any time if cancelled by mistake.</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Keep Active
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/20 active:scale-95 disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
