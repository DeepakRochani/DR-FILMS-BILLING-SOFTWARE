import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Modal } from './Modal';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { allocatePaymentToBills } from '../utils/calculations';
import { CreditCard, AlertCircle, CheckCircle2, Split, Clock, Check } from 'lucide-react';

export function RecordPaymentModal({
  isOpen,
  onClose,
  invoice,
  currencySymbol = '₹',
  onSavePayment
}) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [applyToMode, setApplyToMode] = useState('oldest_first'); // 'oldest_first' | 'this_bill' | 'manual'
  const [manualAllocations, setManualAllocations] = useState({});

  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) || [];

  // Find all pending bills for this client (unpaid or partially paid, excluding drafts)
  const clientPendingBills = useMemo(() => {
    if (!invoice?.customerId || !Array.isArray(allInvoices)) return [];
    const bills = allInvoices.filter(inv => {
      if (inv?.isDeleted) return false;
      if (Number(inv.customerId) !== Number(invoice.customerId)) return false;
      if (inv.status === 'draft') return false;
      if (inv.status !== 'unpaid' && inv.status !== 'partially_paid') return false;
      const bal = Number(inv.balanceDue) || 0;
      return bal > 0;
    });

    // Ensure current invoice is included if it has an active balance
    const exists = bills.some(b => Number(b.id) === Number(invoice.id));
    if (!exists && Number(invoice.balanceDue) > 0 && invoice.status !== 'draft') {
      bills.push(invoice);
    }

    // Sort oldest first
    bills.sort((a, b) => {
      const timeA = new Date(a.invoiceDate || a.createdAt || 0).getTime();
      const timeB = new Date(b.invoiceDate || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    return bills;
  }, [allInvoices, invoice]);

  const hasMultipleBills = clientPendingBills.length > 1;
  const currentBillBalance = Number(invoice?.balanceDue) || 0;
  const totalClientPending = clientPendingBills.reduce((sum, b) => sum + (Number(b.balanceDue) || 0), 0);

  // Reset and prefill fields when modal opens
  useEffect(() => {
    if (isOpen && invoice) {
      const hasPrev = Boolean(invoice.showPreviousBalance && Number(invoice.previousBalance) > 0);
      const initialAmt = hasPrev
        ? (Number(invoice.balanceDue) || 0) + Number(invoice.previousBalance)
        : (Number(invoice.balanceDue) > 0 ? invoice.balanceDue : invoice.totalAmount || 0);
      setAmount(initialAmt > 0 ? String(initialAmt) : '');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setMethod('Cash');
      setNote('');
      setApplyToMode('oldest_first');
      setManualAllocations({});
    }
  }, [isOpen, invoice]);

  if (!invoice) return null;

  const numAmount = Number(amount) || 0;
  const maxAllowed = hasMultipleBills ? totalClientPending : currentBillBalance;

  // Validation
  let validationError = '';
  if (!amount || isNaN(numAmount) || numAmount < 1) {
    validationError = `Amount must be at least ${currencySymbol} 1.00`;
  } else if (numAmount > maxAllowed) {
    validationError = hasMultipleBills
      ? `Amount cannot exceed total client pending of ${formatCurrency(maxAllowed, currencySymbol)}`
      : `Amount cannot exceed the balance due of ${formatCurrency(currentBillBalance, currencySymbol)}`;
  }

  // Calculate allocation preview
  const allocationResult = useMemo(() => {
    if (numAmount <= 0) return { allocations: [], remainingUnallocated: 0 };
    return allocatePaymentToBills({
      bills: clientPendingBills,
      targetBillId: invoice.id,
      totalAmount: numAmount,
      mode: hasMultipleBills ? applyToMode : 'this_bill',
      manualAllocations
    });
  }, [clientPendingBills, invoice.id, numAmount, hasMultipleBills, applyToMode, manualAllocations]);

  if (applyToMode === 'manual' && hasMultipleBills) {
    const allocatedSum = Object.values(manualAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (Math.abs(allocatedSum - numAmount) > 0.01) {
      validationError = `Manual bill allocations (${formatCurrency(allocatedSum, currencySymbol)}) must match total amount entered (${formatCurrency(numAmount, currencySymbol)})`;
    }
  }

  const isSubmitDisabled = !!validationError;

  const handleQuick50 = () => {
    const half = Math.round((currentBillBalance * 0.5) * 100) / 100;
    setAmount(String(half));
    if (applyToMode === 'manual') setManualAllocations({});
  };

  const handleQuickCurrent = () => {
    setAmount(String(currentBillBalance));
    if (applyToMode === 'manual') setManualAllocations({});
  };

  const handleQuickAllPending = () => {
    setAmount(String(totalClientPending));
    if (applyToMode === 'manual') setManualAllocations({});
  };

  const handleManualBillChange = (billId, val) => {
    const updated = { ...manualAllocations, [billId]: Number(val) || 0 };
    setManualAllocations(updated);
    const sum = Object.values(updated).reduce((s, v) => s + (Number(v) || 0), 0);
    setAmount(String(sum));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    onSavePayment(
      invoice,
      {
        amount: numAmount,
        date: paymentDate || new Date().toISOString().split('T')[0],
        method,
        note: note.trim()
      },
      allocationResult.allocations
    );
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Payment for ${formatInvoiceNumber(invoice.invoiceNumber)}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Outstanding Balance Banner */}
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">This Bill Balance:</span>
            <span className="font-display font-bold text-base text-amber-400 font-mono">
              {formatCurrency(currentBillBalance, currencySymbol)}
            </span>
          </div>

          {hasMultipleBills && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-slate-400">
              <span>Total Client Pending ({clientPendingBills.length} bills):</span>
              <span className="font-mono font-bold text-slate-200">
                {formatCurrency(totalClientPending, currencySymbol)}
              </span>
            </div>
          )}
        </div>

        {/* Apply To Choice (Only shown if client has multiple pending bills) */}
        {hasMultipleBills && (
          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2 text-xs">
            <label className="block text-xs font-semibold text-slate-300">
              Apply Payment To:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setApplyToMode('oldest_first')}
                className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  applyToMode === 'oldest_first'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">Oldest First</div>
                <div className="text-[10px] opacity-75 font-normal">Automatic</div>
              </button>

              <button
                type="button"
                onClick={() => setApplyToMode('this_bill')}
                className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  applyToMode === 'this_bill'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">This Bill First</div>
                <div className="text-[10px] opacity-75 font-normal">Spill to oldest</div>
              </button>

              <button
                type="button"
                onClick={() => setApplyToMode('manual')}
                className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  applyToMode === 'manual'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">Choose Bills</div>
                <div className="text-[10px] opacity-75 font-normal">Manual entry</div>
              </button>
            </div>
          </div>
        )}

        {/* Manual Distribution Inputs */}
        {hasMultipleBills && applyToMode === 'manual' && (
          <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-slate-300 block">Allocate Amount Per Bill:</span>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {clientPendingBills.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-slate-200 block">{formatInvoiceNumber(b.invoiceNumber)}</span>
                    <span className="text-[10px] text-slate-400">
                      Due: {formatCurrency(b.balanceDue, currencySymbol)} ({formatDate(b.invoiceDate || b.createdAt)})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-slate-500 font-mono text-xs">{currencySymbol}</span>
                    <input
                      type="number"
                      min="0"
                      max={b.balanceDue}
                      step="any"
                      placeholder="0.00"
                      value={manualAllocations[b.id] ?? ''}
                      onChange={(e) => handleManualBillChange(b.id, e.target.value)}
                      className="w-24 glass-input px-2 py-1 rounded-lg text-xs font-mono font-semibold text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Amount Input with Quick Buttons */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Amount Received ({currencySymbol}) *
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleQuick50}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors cursor-pointer"
                title="Pay 50% of this bill"
              >
                50%
              </button>
              <button
                type="button"
                onClick={handleQuickCurrent}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                title="Pay this bill's full balance"
              >
                This Bill
              </button>
              {hasMultipleBills && (
                <button
                  type="button"
                  onClick={handleQuickAllPending}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                  title="Pay total pending across all client bills"
                >
                  All Pending ({formatCurrency(totalClientPending, currencySymbol)})
                </button>
              )}
            </div>
          </div>

          <input
            type="number"
            min="1"
            max={maxAllowed}
            step="any"
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (applyToMode === 'manual') setManualAllocations({});
            }}
            placeholder="0.00"
            className="w-full glass-input px-3.5 py-2.5 rounded-xl text-base font-mono font-bold text-emerald-400 placeholder:text-slate-600"
            autoFocus
          />

          {/* Validation Feedback */}
          {validationError && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{validationError}</span>
            </p>
          )}
        </div>

        {/* Allocation Preview Banner */}
        {hasMultipleBills && allocationResult.allocations.length > 0 && (
          <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-xs space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Payment Distribution Preview:
            </span>
            {allocationResult.allocations.map(alloc => {
              const b = clientPendingBills.find(item => Number(item.id) === Number(alloc.invoiceId));
              const newBal = Math.max(0, (Number(b?.balanceDue) || 0) - alloc.amount);
              return (
                <div key={alloc.invoiceId} className="flex justify-between items-center text-slate-300">
                  <span>
                    <strong className="text-slate-100">{formatInvoiceNumber(alloc.invoiceNumber)}</strong>
                    {newBal === 0 ? (
                      <span className="text-emerald-400 font-semibold ml-1.5 text-[10px]">(Paid in full)</span>
                    ) : (
                      <span className="text-amber-400 text-[10px] ml-1.5">(Due: {formatCurrency(newBal, currencySymbol)})</span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">+{formatCurrency(alloc.amount, currencySymbol)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Payment Date */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Payment Date *
          </label>
          <input
            type="date"
            required
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full glass-input px-3.5 py-2 rounded-xl text-xs font-mono"
          />
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Payment Method *
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full glass-input px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer"
          >
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>

        {/* Optional Note */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Note (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Advance for shoot"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full glass-input px-3.5 py-2 rounded-xl text-xs placeholder:text-slate-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Confirm Payment</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
