import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { formatCurrency, formatInvoiceNumber } from '../utils/formatters';
import { 
  CheckCircle2, 
  Banknote, 
  QrCode, 
  Building2, 
  Receipt, 
  Calendar, 
  FileText 
} from 'lucide-react';

const PAYMENT_METHODS = [
  { id: 'Cash', label: 'Cash', icon: Banknote, description: 'Physical cash received' },
  { id: 'UPI', label: 'UPI', icon: QrCode, description: 'GPay, PhonePe, Paytm, etc.' },
  { id: 'Bank Transfer', label: 'Bank Transfer', icon: Building2, description: 'NEFT, RTGS, IMPS' },
  { id: 'Cheque', label: 'Cheque', icon: Receipt, description: 'Bank cheque deposit' }
];

export function MarkAsPaidModal({
  isOpen,
  onClose,
  invoice,
  currencySymbol = '₹',
  onConfirm
}) {
  const [method, setMethod] = useState('Cash');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen && invoice) {
      setMethod('Cash');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('Full payment received');
    }
  }, [isOpen, invoice]);

  if (!invoice) return null;

  const remaining = (invoice.balanceDue !== undefined && invoice.balanceDue > 0)
    ? invoice.balanceDue
    : (invoice.totalAmount || 0);

  const clientName = invoice.customerSnapshot?.name || invoice.clientName || 'Client';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (typeof onConfirm === 'function') {
      onConfirm(invoice, {
        method,
        date: date || new Date().toISOString().split('T')[0],
        note: note.trim() || 'Marked as Paid'
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark as Paid"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bill Summary Banner */}
        <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">
              Invoice {formatInvoiceNumber(invoice.invoiceNumber)}
            </span>
            <span className="text-slate-400 truncate max-w-[180px]">
              {clientName}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
            <span className="text-xs text-slate-400 font-medium">
              Full Settlement Amount:
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {formatCurrency(remaining, currencySymbol)}
            </span>
          </div>
        </div>

        {/* Payment Mode Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Select Payment Mode *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((item) => {
              const Icon = item.icon;
              const isSelected = method === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMethod(item.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
                    )}
                  </div>
                  <div>
                    <span className={`text-xs font-bold block ${isSelected ? 'text-emerald-300' : 'text-slate-200'}`}>
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Payment Date *</span>
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
          />
        </div>

        {/* Optional Note / Reference */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Note / Reference (Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. UPI ref, Cheque no., or final settlement"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full glass-input px-3 py-2 rounded-xl text-xs"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Mark as Paid ({method})</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
