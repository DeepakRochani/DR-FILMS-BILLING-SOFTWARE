import React, { useState, useEffect } from 'react';
import { RotateCcw, X, AlertCircle } from 'lucide-react';
import { formatCurrency, formatInvoiceNumber } from '../utils/formatters';

export function RecordRefundModal({ isOpen, onClose, invoice, onRecordRefund }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('UPI');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute total active positive payments minus previous refunds
  const payments = Array.isArray(invoice?.payments) ? invoice.payments.filter(p => !p?.isDeleted) : [];
  const netPaid = payments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  const maxRefundable = Math.max(0, netPaid > 0 ? netPaid : (Number(invoice?.advancePaid) || 0));

  useEffect(() => {
    if (isOpen && invoice) {
      setAmount(maxRefundable > 0 ? String(maxRefundable) : '');
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('UPI');
      setNote('Refund to client');
      setIsSubmitting(false);
    }
  }, [isOpen, invoice, maxRefundable]);

  if (!isOpen || !invoice) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      alert('Please enter a valid refund amount.');
      return;
    }
    if (numAmt > maxRefundable) {
      alert(`Refund cannot exceed refundable payments of ${formatCurrency(maxRefundable)}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onRecordRefund({
        amount: numAmt,
        date,
        method,
        note: note.trim() || `Refund for bill ${formatInvoiceNumber(invoice.invoiceNumber)}`
      });
      onClose();
    } catch (err) {
      console.error('Error recording refund:', err);
      alert('Failed to record refund: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-slate-100">
                Record Refund
              </h3>
              <p className="text-xs text-slate-400">
                {formatInvoiceNumber(invoice.invoiceNumber)} • Available: {formatCurrency(maxRefundable)}
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
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Refund Amount (₹) <span className="text-amber-400">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              max={maxRefundable}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Refund Date <span className="text-amber-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Payment Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Refund Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Return of advance via GPay"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400">
            Refunds appear as negative entries in payment history and are factored into monthly reports.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Recording...' : 'Record Refund'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
