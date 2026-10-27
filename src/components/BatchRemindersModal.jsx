import React, { useState, useMemo } from 'react';
import { 
  X, 
  MessageSquare, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Search, 
  Filter, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BellOff,
  Bell,
  Sparkles,
  Phone
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { 
  getOverdueInvoices, 
  groupInvoicesByClient, 
  generateReminderMessage, 
  selectReminderTone, 
  isRecentlyReminded 
} from '../utils/reminderCalculations';
import { sendWhatsAppMessage } from '../utils/whatsapp';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

export function BatchRemindersModal({ isOpen, onClose, onViewInvoice }) {
  if (!isOpen) return null;

  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.get('business_profile')) || {};

  const sym = settings?.currencySymbol || '₹';
  const graceDays = Number(settings?.reminderGraceDays !== undefined ? settings.reminderGraceDays : settings?.reminderSettings?.graceDays) || 0;

  // Global tone preset
  const [globalTone, setGlobalTone] = useState('auto'); // 'auto' | 'friendly' | 'neutral' | 'firm'
  const [clientTones, setClientTones] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'needs_reminder' | 'reminded_today'
  const [expandedClients, setExpandedClients] = useState({});
  const [copiedClientId, setCopiedClientId] = useState(null);
  const [recentlySent, setRecentlySent] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Compute overdue invoices and grouped clients
  const { overdueInvoices, groupedClients } = useMemo(() => {
    const overdue = getOverdueInvoices(invoices, graceDays);
    const grouped = groupInvoicesByClient(overdue, customers);
    return { overdueInvoices: overdue, groupedClients: grouped };
  }, [invoices, customers, graceDays]);

  // Overall totals
  const totalOverdueAmount = useMemo(() => {
    return overdueInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0);
  }, [overdueInvoices]);

  const remindedTodayCount = useMemo(() => {
    return groupedClients.filter(g => isRecentlyReminded(g.lastReminderDate, 1) || recentlySent[g.groupKey]).length;
  }, [groupedClients, recentlySent]);

  // Helper to determine active tone for a client
  const getClientTone = (group) => {
    if (clientTones[group.groupKey]) return clientTones[group.groupKey];
    if (globalTone !== 'auto') return globalTone;
    return selectReminderTone(group.maxDaysOverdue);
  };

  // Helper to generate message for a client group
  const getMessageForClient = (group) => {
    const tone = getClientTone(group);
    return generateReminderMessage({
      clientName: group.clientName,
      invoiceNumbers: group.invoices.map(i => i.invoiceNumber),
      totalAmount: group.totalPayable,
      dueDate: group.oldestDueDate,
      daysOverdue: group.maxDaysOverdue,
      tone,
      settings
    });
  };

  // Filtered clients
  const filteredClients = useMemo(() => {
    return groupedClients.filter(group => {
      // 1. Tab filter
      const isRemindedToday = isRecentlyReminded(group.lastReminderDate, 1) || recentlySent[group.groupKey];
      if (activeFilter === 'needs_reminder' && isRemindedToday) return false;
      if (activeFilter === 'reminded_today' && !isRemindedToday) return false;

      // 2. Search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = (group.clientName || '').toLowerCase().includes(q);
      const phoneMatch = (group.clientPhone || '').toLowerCase().includes(q);
      const invoiceMatch = group.invoices.some(inv => 
        (inv.invoiceNumber || '').toLowerCase().includes(q) ||
        formatInvoiceNumber(inv.invoiceNumber).toLowerCase().includes(q)
      );
      return nameMatch || phoneMatch || invoiceMatch;
    });
  }, [groupedClients, activeFilter, searchQuery, recentlySent]);

  // Toggle client expanded
  const toggleExpand = (groupKey) => {
    setExpandedClients(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Handle single client reminder send
  const handleSendReminder = async (group) => {
    if (!group.clientPhone) {
      alert(`No phone number available for ${group.clientName}. Please update client profile in Clients.`);
      return;
    }

    const message = getMessageForClient(group);
    const sent = sendWhatsAppMessage({
      phone: group.clientPhone,
      text: message
    });

    if (sent) {
      // Record reminder in Dexie for all invoices of this client
      const now = new Date().toISOString();
      for (const inv of group.invoices) {
        if (inv.id) {
          await db.invoices.update(inv.id, {
            lastReminderDate: now,
            reminderCount: (Number(inv.reminderCount) || 0) + 1,
            updatedAt: now
          });
        }
      }

      setRecentlySent(prev => ({ ...prev, [group.groupKey]: true }));
      scheduleAutoSync(1000);
    }
  };

  // Copy message text
  const handleCopyMessage = (group) => {
    const text = getMessageForClient(group);
    navigator.clipboard.writeText(text);
    setCopiedClientId(group.groupKey);
    setTimeout(() => setCopiedClientId(null), 2500);
  };

  // Mute / Unmute
  const handleToggleMute = async (group) => {
    const nextMuted = !group.isMuted;
    if (group.clientId) {
      await db.customers.update(Number(group.clientId), {
        dontRemind: nextMuted,
        updatedAt: new Date().toISOString()
      });
    }
    for (const inv of group.invoices) {
      if (inv.id) {
        const snapshot = { ...(inv.customerSnapshot || {}), dontRemind: nextMuted };
        await db.invoices.update(inv.id, { customerSnapshot: snapshot });
      }
    }
    scheduleAutoSync(500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-900/90">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-lg sm:text-xl text-slate-100">
                  WhatsApp Overdue Reminders Hub
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  1-Click Batch
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Consolidated balance follow-ups sorted oldest first • Zero-emoji formal notices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/50 border-b border-slate-800/80 text-xs">
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block uppercase font-medium tracking-wider">Total Overdue</span>
            <span className="text-base sm:text-lg font-bold font-mono text-rose-400 mt-0.5 block">
              {formatCurrency(totalOverdueAmount, sym)}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block uppercase font-medium tracking-wider">Overdue Clients</span>
            <span className="text-base sm:text-lg font-bold font-mono text-amber-400 mt-0.5 block">
              {groupedClients.length}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block uppercase font-medium tracking-wider">Overdue Bills</span>
            <span className="text-base sm:text-lg font-bold font-mono text-slate-200 mt-0.5 block">
              {overdueInvoices.length}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80">
            <span className="text-slate-400 text-[11px] block uppercase font-medium tracking-wider">Reminded Today</span>
            <span className="text-base sm:text-lg font-bold font-mono text-emerald-400 mt-0.5 block">
              {remindedTodayCount} of {groupedClients.length}
            </span>
          </div>
        </div>

        {/* Global Controls & Filters */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tone Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-2xl border border-slate-800 shrink-0">
            <span className="text-[11px] font-medium text-slate-400 px-2">Tone:</span>
            {[
              { id: 'auto', label: 'Auto (By Days)' },
              { id: 'friendly', label: 'Friendly' },
              { id: 'neutral', label: 'Standard' },
              { id: 'firm', label: 'Urgent' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setGlobalTone(t.id)}
                className={`text-xs px-2.5 py-1 rounded-xl font-medium transition-all ${
                  globalTone === t.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search & Tabs */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search client, bill #..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="flex items-center bg-slate-950/70 p-1 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-xl font-medium transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-slate-800 text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({groupedClients.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('needs_reminder')}
                className={`text-xs px-2.5 py-1 rounded-xl font-medium transition-colors ${
                  activeFilter === 'needs_reminder'
                    ? 'bg-slate-800 text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pending ({groupedClients.length - remindedTodayCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('reminded_today')}
                className={`text-xs px-2.5 py-1 rounded-xl font-medium transition-colors ${
                  activeFilter === 'reminded_today'
                    ? 'bg-slate-800 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Done ({remindedTodayCount})
              </button>
            </div>
          </div>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
          {filteredClients.length === 0 ? (
            <div className="text-center py-16 px-4 bg-slate-950/30 rounded-3xl border border-dashed border-slate-800">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-200">No overdue clients match this view</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {activeFilter === 'needs_reminder'
                  ? 'All clients with overdue balances have already been followed up today!'
                  : 'All client accounts are clear, or no bills match your current search.'}
              </p>
            </div>
          ) : (
            filteredClients.map((group) => {
              const isRemindedToday = isRecentlyReminded(group.lastReminderDate, 1) || recentlySent[group.groupKey];
              const isExpanded = expandedClients[group.groupKey];
              const clientTone = getClientTone(group);
              const message = getMessageForClient(group);
              const isCopied = copiedClientId === group.groupKey;

              return (
                <div
                  key={group.groupKey}
                  className={`rounded-2xl border transition-all ${
                    isRemindedToday
                      ? 'bg-slate-900/40 border-slate-800/80 opacity-90'
                      : 'bg-slate-900/90 border-slate-800 hover:border-amber-500/40 shadow-lg'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    {/* Left: Client Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-display font-bold text-base text-slate-100">
                          {group.clientName}
                        </h4>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {group.clientTag || 'Client'}
                        </span>
                        {group.isMuted && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <BellOff className="w-3 h-3" /> Muted
                          </span>
                        )}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          group.maxDaysOverdue > 30
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : group.maxDaysOverdue > 7
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
                        }`}>
                          {group.maxDaysOverdue} days overdue
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                        {group.clientPhone ? (
                          <span className="flex items-center gap-1 text-slate-300 font-mono">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            {group.clientPhone}
                          </span>
                        ) : (
                          <span className="text-rose-400">No phone on file</span>
                        )}
                        <span>•</span>
                        <span>{group.invoices.length} bill{group.invoices.length === 1 ? '' : 's'}:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {group.invoices.map(inv => (
                            <button
                              key={inv.id}
                              type="button"
                              onClick={() => {
                                if (onViewInvoice) {
                                  onClose();
                                  onViewInvoice(inv.id);
                                }
                              }}
                              className="text-amber-400 hover:text-amber-300 font-mono underline text-[11px]"
                            >
                              {formatInvoiceNumber(inv.invoiceNumber)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Amount & Status */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-left md:text-right">
                        <span className="text-slate-400 text-[11px] uppercase tracking-wider block">Balance Due</span>
                        <span className="text-lg font-bold font-mono text-amber-400">
                          {formatCurrency(group.totalPayable, sym)}
                        </span>
                      </div>

                      {/* Reminder status pill */}
                      <div className="text-left md:text-right min-w-[120px]">
                        {isRemindedToday ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Reminded Today</span>
                          </span>
                        ) : group.lastReminderDate ? (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            Reminded {Math.floor((new Date() - new Date(group.lastReminderDate)) / (1000 * 60 * 60 * 24))}d ago
                          </span>
                        ) : (
                          <span className="text-xs text-amber-500/80 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Not reminded yet
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-stretch md:self-auto justify-end shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleExpand(group.groupKey)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        title={isExpanded ? 'Hide message preview' : 'Preview & customize message'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(group)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        title="Copy message to clipboard"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendReminder(group)}
                        className={`flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer ${
                          isRemindedToday
                            ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isRemindedToday ? 'Send Again' : 'Send WhatsApp'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Message Preview Accordion */}
                  {isExpanded && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0 border-t border-slate-800/80 mt-3 pt-3 bg-slate-950/40 rounded-b-2xl animate-fadeIn">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
                        <span className="text-slate-400 font-medium">WhatsApp Message Preview:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Tone for this client:</span>
                          {['friendly', 'neutral', 'firm'].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setClientTones(prev => ({ ...prev, [group.groupKey]: t }))}
                              className={`text-[11px] px-2 py-0.5 rounded-lg capitalize font-medium ${
                                clientTone === t
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed selection:bg-amber-500/30">
                        {message}
                      </pre>

                      <div className="flex items-center justify-between gap-3 mt-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleMute(group)}
                          className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
                        >
                          {group.isMuted ? <Bell className="w-3 h-3 text-amber-400" /> : <BellOff className="w-3 h-3 text-slate-500" />}
                          <span>{group.isMuted ? 'Unmute reminders' : 'Mute reminders for this client'}</span>
                        </button>
                        <span className="text-[11px] text-slate-500">
                          {group.reminderCount > 0 ? `Sent ${group.reminderCount} time(s) previously` : 'Never reminded previously'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Clicking "Send WhatsApp" opens WhatsApp with the drafted message and auto-logs timestamp & count in your local records.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-5 rounded-xl border border-slate-700 transition-colors"
          >
            Close Hub
          </button>
        </div>
      </div>
    </div>
  );
}
