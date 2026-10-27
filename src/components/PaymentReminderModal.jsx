import React, { useState, useEffect } from 'react';
import { 
  X, 
  MessageSquare, 
  AlertTriangle, 
  Clock, 
  BellOff, 
  Bell, 
  Send, 
  Calendar,
  CheckCircle2,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { cleanWhatsAppPhone, shouldOpenWhatsAppWeb } from '../utils/whatsapp';
import { 
  selectReminderTone, 
  isRecentlyReminded, 
  generateReminderMessage,
  removeEmojis
} from '../utils/reminderCalculations';
import { triggerAutoUpdateBackup } from '../utils/googleSheetsSync';

export function PaymentReminderModal({
  isOpen,
  onClose,
  clientGroup,
  settings,
  onReminderSent
}) {
  if (!isOpen || !clientGroup) return null;

  const sym = settings?.currencySymbol || '₹';
  const invoices = clientGroup.invoices || [];
  const maxDays = clientGroup.maxDaysOverdue || 0;

  // Initial tone preselection
  const initialTone = selectReminderTone(maxDays);
  const [selectedTone, setSelectedTone] = useState(initialTone);
  const [customText, setCustomText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [customSnoozeDays, setCustomSnoozeDays] = useState(3);
  const [isMuted, setIsMuted] = useState(Boolean(clientGroup.isMuted));
  const [isSaving, setIsSaving] = useState(false);

  // Check 3-day spam warning
  const recentlyReminded = isRecentlyReminded(clientGroup.lastReminderDate, 3);
  const lastRemindedDaysAgo = clientGroup.lastReminderDate 
    ? Math.floor((new Date() - new Date(clientGroup.lastReminderDate)) / (1000 * 60 * 60 * 24))
    : null;

  // Generate default message when tone changes (unless manually edited)
  useEffect(() => {
    const msg = generateReminderMessage({
      clientName: clientGroup.clientName,
      invoiceNumbers: invoices.map(i => i.invoiceNumber),
      totalAmount: clientGroup.totalPayable,
      dueDate: clientGroup.oldestDueDate,
      daysOverdue: maxDays,
      tone: selectedTone,
      settings
    });
    setCustomText(msg);
  }, [selectedTone, clientGroup, settings]);

  // Toggle client mute state
  const handleToggleMute = async () => {
    try {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);

      if (clientGroup.clientId) {
        await db.customers.update(Number(clientGroup.clientId), {
          dontRemind: nextMuted,
          updatedAt: new Date().toISOString()
        });
      }

      // Also update customer snapshot in Dexie invoices
      for (const inv of invoices) {
        if (inv.id) {
          const snapshot = { ...(inv.customerSnapshot || {}), dontRemind: nextMuted };
          await db.invoices.update(inv.id, { customerSnapshot: snapshot });
        }
      }
      triggerAutoUpdateBackup();
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  };

  // Snooze action
  const handleSnooze = async (days) => {
    setIsSaving(true);
    try {
      const snoozeUntil = new Date(Date.now() + days * 86400000).toISOString();
      for (const inv of invoices) {
        if (inv.id) {
          await db.invoices.update(inv.id, {
            snoozedUntil: snoozeUntil,
            updatedAt: new Date().toISOString()
          });
        }
      }
      triggerAutoUpdateBackup();
      if (onReminderSent) onReminderSent();
      onClose();
    } catch (err) {
      console.error('Failed to snooze invoices:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Send via WhatsApp
  const handleSendWhatsApp = async () => {
    setIsSaving(true);
    try {
      const cleanPhone = cleanWhatsAppPhone(clientGroup.clientPhone, settings?.defaultCountryCode || '91');
      const finalMsg = removeEmojis(customText).trim();
      const encodedMsg = encodeURIComponent(finalMsg);

      const useWeb = shouldOpenWhatsAppWeb(settings);
      const url = useWeb
        ? (cleanPhone
            ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
            : `https://web.whatsapp.com/send?text=${encodedMsg}`)
        : (cleanPhone
            ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
            : `https://api.whatsapp.com/send?text=${encodedMsg}`);

      // Open WhatsApp window
      window.open(url, '_blank', 'noopener,noreferrer');

      // Update Dexie database records for all invoices in this reminder
      const nowIso = new Date().toISOString();
      for (const inv of invoices) {
        if (inv.id) {
          const prevHistory = Array.isArray(inv.reminderHistory) ? inv.reminderHistory : [];
          const updatedHistory = [
            ...prevHistory,
            {
              date: nowIso,
              tone: selectedTone,
              sentBy: 'Owner',
              amountReminded: clientGroup.totalPayable
            }
          ];

          await db.invoices.update(inv.id, {
            lastReminderDate: nowIso,
            reminderCount: (Number(inv.reminderCount) || 0) + 1,
            reminderHistory: updatedHistory,
            updatedAt: nowIso
          });
        }
      }

      // Sync updated columns to Google Sheets immediately
      triggerAutoUpdateBackup();

      if (onReminderSent) onReminderSent();
      onClose();
    } catch (err) {
      console.error('Failed to record reminder:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="glass-card w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  Payment Reminder
                </h3>
                {clientGroup.clientTag && clientGroup.clientTag !== 'Regular' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {clientGroup.clientTag}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {clientGroup.clientName} {clientGroup.clientPhone ? `• ${clientGroup.clientPhone}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Muted Warning if client is muted */}
          {isMuted && (
            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 text-amber-300">
              <div className="flex items-center gap-2">
                <BellOff className="w-4 h-4 shrink-0 text-amber-400" />
                <span className="text-xs font-medium">
                  Reminders are muted for this client. You can still send a one-off reminder or unmute.
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-[11px] font-semibold underline hover:text-amber-200 shrink-0"
              >
                Unmute
              </button>
            </div>
          )}

          {/* 3-Day Anti-Spam Warning */}
          {recentlyReminded && (
            <div className="p-3.5 bg-rose-950/30 border border-rose-500/40 rounded-2xl flex items-start gap-3 text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-bold text-rose-200">
                  Sent recently ({lastRemindedDaysAgo === 0 ? 'Earlier today' : `${lastRemindedDaysAgo} day(s) ago`})
                </p>
                <p className="text-[11px] text-rose-300/90 mt-0.5">
                  A payment reminder was already shared with this client on {formatDate(clientGroup.lastReminderDate)}. Sending again too quickly may annoy the client.
                </p>
              </div>
            </div>
          )}

          {/* Consolidated Invoices Summary */}
          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
              <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                {invoices.length > 1 ? `${invoices.length} Overdue Bills Grouped` : 'Overdue Bill'}
              </span>
              <span className="text-rose-400 font-mono font-bold">
                {maxDays} days overdue
              </span>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-200 font-bold">
                      {formatInvoiceNumber(inv.invoiceNumber)}
                    </span>
                    <span className="text-slate-500 text-[11px] font-sans">
                      Due: {formatDate(inv.dueDate || inv.invoiceDate)}
                    </span>
                  </div>
                  <span className="text-amber-400 font-bold">
                    {formatCurrency(inv.balanceDue, sym)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-sm">
              <span className="font-bold text-slate-200">Total Payable Now</span>
              <span className="font-display font-black text-amber-400 text-base">
                {formatCurrency(clientGroup.totalPayable, sym)}
              </span>
            </div>
          </div>

          {/* Tone Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Message Tone
              </label>
              <span className="text-[11px] text-slate-500">
                Auto-selected: {selectReminderTone(maxDays)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'friendly', label: 'Friendly', desc: '1–7 days overdue' },
                { id: 'neutral', label: 'Neutral', desc: '8–30 days overdue' },
                { id: 'firm', label: 'Firm', desc: '30+ days overdue' }
              ].map((tone) => {
                const isSelected = selectedTone === tone.id;
                return (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => {
                      setSelectedTone(tone.id);
                      setIsEditingText(false);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{tone.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {tone.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message Preview & Manual Editing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                WhatsApp Message Preview (Zero Emojis)
              </label>
              <button
                type="button"
                onClick={() => setIsEditingText(!isEditingText)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium"
              >
                {isEditingText ? 'Lock Preview' : 'Edit Text'}
              </button>
            </div>

            <textarea
              rows={6}
              value={customText}
              onChange={(e) => setCustomText(removeEmojis(e.target.value))}
              readOnly={!isEditingText}
              className={`w-full p-3.5 rounded-2xl text-xs font-mono border transition-colors ${
                isEditingText 
                  ? 'bg-slate-950 border-amber-500/50 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500' 
                  : 'bg-slate-950/70 border-slate-800 text-slate-300'
              }`}
            />
          </div>

          {/* Snooze Options Drawer */}
          {showSnoozeOptions && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Snooze Reminders</span>
                </span>
                <span className="text-[11px] text-slate-500">Hide from overdue list</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[3, 7, 14].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleSnooze(days)}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-amber-400 text-xs font-medium transition-colors"
                  >
                    {days} days
                  </button>
                ))}

                <div className="flex items-center gap-1.5 ml-auto">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={customSnoozeDays}
                    onChange={(e) => setCustomSnoozeDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-center font-mono"
                  />
                  <span className="text-slate-500 text-[11px]">days</span>
                  <button
                    type="button"
                    onClick={() => handleSnooze(customSnoozeDays)}
                    disabled={isSaving}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-medium hover:bg-amber-500/30"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Snooze</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                isMuted
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-slate-300'
              }`}
              title={isMuted ? 'Reminders currently muted' : 'Mute reminders for this client'}
            >
              {isMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span>{isMuted ? 'Muted' : 'Mute Client'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send on WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
