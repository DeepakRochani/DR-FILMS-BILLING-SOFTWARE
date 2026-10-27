import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Receipt, 
  Search, 
  Plus, 
  Filter, 
  Eye, 
  Edit2, 
  Trash2, 
  Share2, 
  CheckCircle, 
  Calendar,
  ArrowUpDown,
  Download,
  RotateCcw,
  RefreshCw,
  CreditCard,
  Ban,
  Tag,
  MessageSquare
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { UndoToast } from '../components/UndoToast';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { MarkAsPaidModal } from '../components/MarkAsPaidModal';
import { CancelBillModal } from '../components/CancelBillModal';
import { BatchRemindersModal } from '../components/BatchRemindersModal';
import { openWhatsAppShare } from '../utils/whatsapp';
import { recalculateInvoicePayments, determineReinstatedStatus } from '../utils/calculations';
import { reconcileAllBillsWithCatalog } from '../utils/catalogSync';
import { scheduleAutoSync, recordPermanentlyDeletedInvoice } from '../utils/googleSheetsSync';
import { getOverdueInvoices } from '../utils/reminderCalculations';

export function InvoicesPage({ onNewInvoice, onViewInvoice, onEditInvoice, initialStatusFilter = 'all', onGoToTrash }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [clientTagFilter, setClientTagFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState('date_desc');
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [markAsPaidInvoice, setMarkAsPaidInvoice] = useState(null);
  const [cancellingInvoice, setCancellingInvoice] = useState(null);
  const [isBatchRemindersOpen, setIsBatchRemindersOpen] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('');

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const sym = settings?.currencySymbol || '₹';

  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  // Client ID -> Tag map
  const customerTagMap = useMemo(() => {
    const map = new Map();
    customers.forEach(c => {
      map.set(Number(c.id), c.tag || 'Regular');
    });
    return map;
  }, [customers]);

  // Available event types (from settings & invoices)
  const availableEventTypes = useMemo(() => {
    const set = new Set();
    (settings?.eventTypes || []).forEach(t => {
      if (typeof t === 'string' && t.trim()) set.add(t.trim());
      else if (t?.name && t.name.trim()) set.add(t.name.trim());
    });
    invoices.forEach(inv => {
      if (inv.eventType && inv.eventType.trim()) set.add(inv.eventType.trim());
    });
    return Array.from(set);
  }, [settings?.eventTypes, invoices]);

  const handleManualSyncCatalog = async () => {
    try {
      const res = await reconcileAllBillsWithCatalog();
      if (res.updatedCount > 0) {
        setSyncFeedback(`Synced with Catalog: Refreshed ${res.updatedCount} bill(s) (${res.updatedInvoiceNumbers.join(', ')})!`);
      } else {
        setSyncFeedback('All bills are already up to date with your catalog.');
      }
      setTimeout(() => setSyncFeedback(''), 4000);
    } catch (e) {
      console.warn('Manual sync catalog error:', e);
    }
  };

  const trashCount = invoices.filter(inv => inv?.isDeleted).length;
  const cancelledCount = invoices.filter(inv => !inv?.isDeleted && inv?.status === 'cancelled').length;
  const overdueCount = useMemo(() => {
    const grace = Number(settings?.reminderGraceDays !== undefined ? settings.reminderGraceDays : settings?.reminderSettings?.graceDays) || 0;
    return getOverdueInvoices(invoices, grace).length;
  }, [invoices, settings]);

  // Filter logic
  const filteredInvoices = invoices.filter((inv) => {
    // 1. Status Filter: Trash vs Cancelled vs Active
    if (statusFilter === 'trash') {
      if (!inv.isDeleted) return false;
    } else if (statusFilter === 'cancelled') {
      if (inv.isDeleted || inv.status !== 'cancelled') return false;
    } else {
      if (inv.isDeleted) return false;
      if (inv.status === 'cancelled') return false;
      if (statusFilter !== 'all' && inv.status !== statusFilter) {
        return false;
      }
    }

    // 2. Search
    const q = search.toLowerCase();
    const invNum = (inv.invoiceNumber || '').toLowerCase();
    const formattedInvNum = formatInvoiceNumber(inv.invoiceNumber).toLowerCase();
    const clientName = (inv.customerSnapshot?.name || '').toLowerCase();
    const clientCompany = (inv.customerSnapshot?.company || '').toLowerCase();
    const clientPhone = (inv.customerSnapshot?.phone || '').toLowerCase();

    const matchesSearch = invNum.includes(q) || formattedInvNum.includes(q) || clientName.includes(q) || clientCompany.includes(q) || clientPhone.includes(q);
    if (!matchesSearch) return false;

    // 3. Date Range
    if (startDate && inv.invoiceDate < startDate) return false;
    if (endDate && inv.invoiceDate > endDate) return false;

    // 4. Event Type Filter
    if (eventTypeFilter !== 'all') {
      const type = (inv.eventType || 'Other').trim();
      if (type !== eventTypeFilter) return false;
    }

    // 5. Client Tag Filter
    if (clientTagFilter !== 'all') {
      const tag = (inv.customerId && customerTagMap.get(Number(inv.customerId))) || inv.customerSnapshot?.tag || 'Regular';
      if (tag !== clientTagFilter) return false;
    }

    return true;
  });

  // Sort logic
  filteredInvoices.sort((a, b) => {
    if (sortField === 'date_desc') {
      return new Date(b.invoiceDate) - new Date(a.invoiceDate);
    }
    if (sortField === 'date_asc') {
      return new Date(a.invoiceDate) - new Date(b.invoiceDate);
    }
    if (sortField === 'amount_desc') {
      return (b.totalAmount || 0) - (a.totalAmount || 0);
    }
    if (sortField === 'amount_asc') {
      return (a.totalAmount || 0) - (b.totalAmount || 0);
    }
    return 0;
  });

  const [undoToast, setUndoToast] = useState(null);

  // Totals for filtered invoices (exclude cancelled and deleted bills)
  const activeFiltered = filteredInvoices.filter(inv => !inv.isDeleted && inv.status !== 'cancelled');
  const totalBilled = activeFiltered.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPending = activeFiltered.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);

  const handleMarkAsPaid = (e, inv) => {
    if (e?.stopPropagation) e.stopPropagation();
    setMarkAsPaidInvoice(inv);
  };

  const handleConfirmMarkAsPaid = async (inv, { method, date, note }) => {
    const previousState = {
      advancePaid: inv.advancePaid || 0,
      balanceDue: inv.balanceDue || 0,
      status: inv.status,
      payments: Array.isArray(inv.payments) ? [...inv.payments] : []
    };

    const activeExistingPayments = (inv.payments || []).filter(p => !p?.isDeleted);
    const existingPaid = activeExistingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalAmount = Number(inv.totalAmount) || 0;
    const remaining = Math.max(0, Math.round((totalAmount - existingPaid) * 100) / 100);

    const newPayment = {
      id: `PAY-${Date.now()}`,
      date: date || new Date().toISOString().split('T')[0],
      amount: remaining > 0 ? remaining : totalAmount,
      method: method || 'Cash',
      note: note || 'Marked as Paid'
    };
    const updatedPayments = [...activeExistingPayments, newPayment];

    await db.invoices.update(inv.id, {
      advancePaid: totalAmount,
      balanceDue: 0,
      status: 'paid',
      payments: updatedPayments,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);

    setMarkAsPaidInvoice(null);
    setUndoToast({
      invoiceId: inv.id,
      previousState,
      message: `Invoice ${formatInvoiceNumber(inv.invoiceNumber)} marked as Paid via ${method || 'Cash'}`
    });
  };

  const handleMarkAsUnpaid = async (e, inv) => {
    e.stopPropagation();
    if (!window.confirm(`Mark invoice ${formatInvoiceNumber(inv.invoiceNumber)} as unpaid? This will remove recorded payments and restore the balance due.`)) return;

    const previousState = {
      advancePaid: inv.advancePaid || 0,
      balanceDue: inv.balanceDue || 0,
      status: inv.status,
      payments: Array.isArray(inv.payments) ? [...inv.payments] : []
    };

    await db.invoices.update(inv.id, {
      advancePaid: 0,
      balanceDue: inv.totalAmount || 0,
      status: 'unpaid',
      payments: [],
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);

    setUndoToast({
      invoiceId: inv.id,
      previousState,
      message: `Invoice ${formatInvoiceNumber(inv.invoiceNumber)} marked as Unpaid`
    });
  };

  const handleSavePayment = async (inv, paymentData, allocations = null) => {
    const paymentList = Array.isArray(allocations) && allocations.length > 0
      ? allocations
      : [{ invoiceId: inv.id, amount: paymentData.amount, invoiceNumber: inv.invoiceNumber }];

    const previousStates = [];

    for (const alloc of paymentList) {
      const bill = await db.invoices.get(Number(alloc.invoiceId));
      if (!bill) continue;

      const existingPayments = Array.isArray(bill.payments) ? bill.payments : [];
      previousStates.push({
        invoiceId: bill.id,
        invoiceNumber: bill.invoiceNumber,
        state: {
          advancePaid: bill.advancePaid || 0,
          balanceDue: bill.balanceDue || 0,
          status: bill.status,
          payments: existingPayments
        }
      });

      const noteText = paymentData.note
        ? paymentData.note
        : (paymentList.length > 1 ? `Allocated from payment of ${formatCurrency(paymentData.amount, sym)}` : '');

      const newPayment = {
        id: `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        date: paymentData.date,
        amount: alloc.amount,
        method: paymentData.method,
        note: noteText
      };

      const updatedPayments = [...existingPayments, newPayment];
      const recalculated = recalculateInvoicePayments(bill, updatedPayments);

      await db.invoices.update(bill.id, {
        ...recalculated,
        updatedAt: new Date().toISOString()
      });
    }

    scheduleAutoSync(500);

    setUndoToast({
      multi: previousStates,
      invoiceId: inv.id,
      previousState: previousStates[0]?.state,
      message: paymentList.length > 1
        ? `Payment of ${formatCurrency(paymentData.amount, sym)} allocated across ${paymentList.length} bills`
        : `Payment of ${formatCurrency(paymentData.amount, sym)} recorded for ${formatInvoiceNumber(inv.invoiceNumber)}`
    });
  };

  const handleUndo = async () => {
    if (undoToast?.multi && Array.isArray(undoToast.multi)) {
      for (const item of undoToast.multi) {
        await db.invoices.update(item.invoiceId, {
          ...item.state,
          updatedAt: new Date().toISOString()
        });
      }
      scheduleAutoSync(500);
      setUndoToast(null);
    } else if (undoToast?.invoiceId && undoToast?.previousState) {
      await db.invoices.update(undoToast.invoiceId, {
        ...undoToast.previousState,
        updatedAt: new Date().toISOString()
      });
      scheduleAutoSync(500);
      setUndoToast(null);
    }
  };

  const handleDelete = async (e, inv) => {
    e.stopPropagation();
    if (window.confirm(`Move invoice ${formatInvoiceNumber(inv.invoiceNumber)} to Trash?\n\nIt will be removed from your dashboard and client balances, and kept in your Google Sheet backup as Deleted.`)) {
      await db.invoices.update(inv.id, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      scheduleAutoSync(500);
      setUndoToast({
        invoiceId: inv.id,
        previousState: { isDeleted: false },
        message: `Invoice ${formatInvoiceNumber(inv.invoiceNumber)} moved to Trash`
      });
    }
  };

  const handleRestore = async (e, inv) => {
    e.stopPropagation();
    await db.invoices.update(inv.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    setUndoToast({
      invoiceId: inv.id,
      previousState: { isDeleted: true },
      message: `Invoice ${formatInvoiceNumber(inv.invoiceNumber)} restored from Trash`
    });
  };

  const handlePermanentDelete = async (e, inv) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete invoice ${formatInvoiceNumber(inv.invoiceNumber)} from this device?\n\nIt will be removed from the app only, and the Google Sheet copy stays as a permanent backup.`
    );
    if (!confirmed) return;

    await recordPermanentlyDeletedInvoice(inv);
    await db.invoices.delete(inv.id);
    scheduleAutoSync(500);
  };

  const handleWhatsApp = (e, inv) => {
    e.stopPropagation();
    openWhatsAppShare(inv, settings);
  };

  const handleReinstate = async (e, inv) => {
    e.stopPropagation();
    if (!window.confirm(`Reinstate bill ${formatInvoiceNumber(inv.invoiceNumber)}? It will be restored to its previous payment status.`)) return;

    const restoredStatus = determineReinstatedStatus(inv);
    const total = inv.totalAmount || 0;
    const paid = (inv.payments || []).filter(p => !p?.isDeleted).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balanceDue = Math.max(0, total - paid);

    const previousState = {
      status: 'cancelled',
      advancePaid: inv.advancePaid || 0,
      balanceDue: inv.balanceDue || 0,
      cancelledAt: inv.cancelledAt,
      cancelReason: inv.cancelReason
    };

    await db.invoices.update(inv.id, {
      status: restoredStatus,
      advancePaid: Math.max(0, paid),
      balanceDue,
      cancelledAt: null,
      cancelReason: null,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);

    setUndoToast({
      invoiceId: inv.id,
      previousState,
      message: `Bill ${formatInvoiceNumber(inv.invoiceNumber)} reinstated as ${restoredStatus.replace('_', ' ')}`
    });
  };

  const statusTabs = [
    { id: 'all', label: 'All Bills' },
    { id: 'unpaid', label: 'Unpaid' },
    { id: 'partially_paid', label: 'Partially Paid' },
    { id: 'paid', label: 'Paid' },
    { id: 'draft', label: 'Draft' },
    { id: 'cancelled', label: `Cancelled${cancelledCount > 0 ? ` (${cancelledCount})` : ''}` },
    { id: 'trash', label: `Trash${trashCount > 0 ? ` (${trashCount})` : ''}` },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-amber-400" />
            <span>Bills & Invoices</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Search, filter, track payments, and share invoices with clients.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setIsBatchRemindersOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 via-amber-600/15 to-amber-700/20 hover:from-amber-500/30 hover:to-amber-600/30 text-amber-300 font-semibold text-xs py-2.5 px-3.5 rounded-xl border border-amber-500/40 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Consolidated WhatsApp Overdue Reminders Hub"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Reminders Hub</span>
            {overdueCount > 0 && (
              <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                {overdueCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleManualSyncCatalog}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 font-medium text-xs py-2.5 px-3.5 rounded-xl border border-slate-700 transition-colors"
            title="Update all bills with the latest Services Catalog rates & names"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Sync with Catalog</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const counterpart = window.location.hostname === 'localhost'
                  ? `http://127.0.0.1:${window.location.port || '5173'}`
                  : `http://localhost:${window.location.port || '5173'}`;
                
                window.dispatchEvent(
                  new CustomEvent('drfilms:sheets-sync', {
                    detail: {
                      type: 'pending',
                      message: `Checking ${counterpart} for previous bills...`
                    }
                  })
                );
                import('../utils/crossOriginSync.js').then(m => m.triggerCounterpartScan());
              }
            }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 font-medium text-xs py-2.5 px-3.5 rounded-xl border border-slate-700 transition-colors"
            title="Scan 127.0.0.1 or localhost if you created bills on another address"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Scan Missing Bills</span>
          </button>

          <button
            type="button"
            onClick={onGoToTrash || (() => setStatusFilter(statusFilter === 'trash' ? 'all' : 'trash'))}
            className={`flex items-center gap-1.5 font-medium text-xs py-2.5 px-3.5 rounded-xl border transition-colors ${
              statusFilter === 'trash'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 border-slate-700'
            }`}
            title="View deleted bills in Trash"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Trash ({trashCount})</span>
          </button>

          <button
            type="button"
            onClick={onNewInvoice}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/15 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Bill</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between animate-fadeIn">
          <span>{syncFeedback}</span>
          <button type="button" onClick={() => setSyncFeedback('')} className="text-amber-400 hover:text-white font-bold ml-2">×</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Invoice #, Client Name, Company, or Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
            />
          </div>

          {/* Date range filters */}
          <div className="flex items-center gap-2 text-xs">
            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5" />
              <input
                type="date"
                title="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input pl-8 pr-2.5 py-2 rounded-xl text-xs font-mono"
              />
            </div>
            <span className="text-slate-500">to</span>
            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5" />
              <input
                type="date"
                title="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input pl-8 pr-2.5 py-2 rounded-xl text-xs font-mono"
              />
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-slate-400 hover:text-amber-400 text-xs px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs & Sorting */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {statusTabs.map((tab) => {
              const isTrash = tab.id === 'trash';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors border flex items-center gap-1.5 ${
                    statusFilter === tab.id
                      ? isTrash
                        ? 'bg-rose-600 text-white border-rose-500 font-semibold shadow-md shadow-rose-900/30'
                        : 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                      : isTrash
                      ? 'bg-rose-950/30 text-rose-300 border-rose-900/50 hover:bg-rose-900/40 hover:text-white'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {isTrash && <Trash2 className="w-3.5 h-3.5" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <span className="text-slate-500 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort:</span>
            </span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="glass-input px-2.5 py-1 rounded-lg text-xs"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="amount_desc">Highest Amount</option>
              <option value="amount_asc">Lowest Amount</option>
            </select>
          </div>
        </div>

        {/* Event Type & Client Tag Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Event Type:</span>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="glass-input px-2.5 py-1 rounded-lg text-xs"
            >
              <option value="all">All Event Types</option>
              {availableEventTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Client Tag:</span>
            <select
              value={clientTagFilter}
              onChange={(e) => setClientTagFilter(e.target.value)}
              className="glass-input px-2.5 py-1 rounded-lg text-xs"
            >
              <option value="all">All Client Tags</option>
              <option value="Regular">Regular</option>
              <option value="VIP">VIP</option>
              <option value="Corporate">Corporate</option>
              <option value="Studio/Partner">Studio / Partner</option>
            </select>
          </div>

          {(eventTypeFilter !== 'all' || clientTagFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setEventTypeFilter('all');
                setClientTagFilter('all');
              }}
              className="text-amber-400 hover:text-amber-300 font-medium text-xs ml-auto cursor-pointer"
            >
              Reset Type & Tag
            </button>
          )}
        </div>
      </div>

      {/* Active Trash Notice Banner */}
      {statusFilter === 'trash' && (
        <div className="p-3.5 bg-rose-950/30 border border-rose-900/50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-200">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Viewing Trash:</strong> These bills are excluded from receivables and reports, and permanently preserved in your Google Sheets backup.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className="text-xs bg-rose-900/40 hover:bg-rose-900/60 text-white font-medium px-3 py-1.5 rounded-lg border border-rose-700/50 transition-colors self-start sm:self-auto shrink-0"
          >
            ← View Active Bills
          </button>
        </div>
      )}

      {/* Quick metrics banner for current filter */}
      <div className="grid grid-cols-3 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-center">
        <div>
          <span className="text-slate-500 block text-[10px] uppercase">
            {statusFilter === 'trash' ? 'Deleted Invoices' : 'Matching Invoices'}
          </span>
          <span className="font-display font-bold text-slate-200 text-sm">{filteredInvoices.length}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase">
            {statusFilter === 'trash' ? 'Trash Total' : 'Total Billed'}
          </span>
          <span className="font-display font-bold text-slate-200 text-sm">{formatCurrency(totalBilled, sym)}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase">
            {statusFilter === 'trash' ? 'Pending (Excluded)' : 'Pending Receivables'}
          </span>
          <span className="font-display font-bold text-amber-400 text-sm">
            {statusFilter === 'trash' ? formatCurrency(0, sym) : formatCurrency(totalPending, sym)}
          </span>
        </div>
      </div>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
          <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-300">
            {statusFilter === 'trash' ? 'Trash is empty' : 'No invoices match your filter'}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {statusFilter === 'trash'
              ? 'Deleted invoices will appear here. They are preserved forever in your Google Sheet backup.'
              : 'Try adjusting your search terms, date ranges, or status tabs.'}
          </p>
          {statusFilter !== 'trash' && (
            <button
              type="button"
              onClick={onNewInvoice}
              className="mt-4 inline-flex items-center gap-2 bg-amber-500 text-slate-950 text-xs font-semibold px-4 py-2 rounded-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Bill</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const clientTag = (inv.customerId && customerTagMap.get(Number(inv.customerId))) || inv.customerSnapshot?.tag || 'Regular';

            return (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv.id)}
                className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  inv.isDeleted
                    ? 'border-rose-900/40 bg-rose-950/10 hover:border-rose-500/40'
                    : 'border-slate-800/90 hover:border-amber-500/40'
                }`}
              >
                {/* Left Details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-100 group-hover:text-amber-400 transition-colors">
                      {formatInvoiceNumber(inv.invoiceNumber)}
                    </span>
                    {inv.isDeleted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Deleted {inv.deletedAt ? `• ${formatDate(inv.deletedAt)}` : ''}
                      </span>
                    ) : (
                      <StatusBadge status={inv.status} size="sm" />
                    )}
                    {inv.eventType && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-slate-700/80">
                        {inv.eventType}
                      </span>
                    )}
                    {inv.eventDate && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Event: {formatDate(inv.eventDate)}
                      </span>
                    )}
                    {!inv.isDeleted && inv.showPreviousBalance && Number(inv.previousBalance) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Previous pending {formatCurrency(inv.previousBalance, sym)}
                      </span>
                    )}
                    <span className="text-slate-500 text-xs">•</span>
                    <span className="text-xs text-slate-400 font-mono">
                      {formatDate(inv.invoiceDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 truncate">
                    <h3 className="font-semibold text-slate-200 text-sm truncate">
                      {inv.customerSnapshot?.name}
                    </h3>
                    {clientTag && clientTag !== 'Regular' && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                        clientTag === 'VIP' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                        clientTag === 'Corporate' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
                        'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      }`}>
                        {clientTag}
                      </span>
                    )}
                    {inv.customerSnapshot?.company && (
                      <span className="text-xs text-slate-400 font-normal truncate">
                        ({inv.customerSnapshot.company})
                      </span>
                    )}
                  </div>

                {/* Services preview */}
                <p className="text-xs text-slate-500 truncate">
                  {(inv.items || []).map(item => `${item.name} (${item.quantity})`).join(', ')}
                </p>

                {/* Partially Paid Progress Bar & Status */}
                {!inv.isDeleted && inv.status === 'partially_paid' && (
                  <div className="pt-2 max-w-sm">
                    <div className="flex items-center justify-between text-xs font-mono font-medium mb-1">
                      <span className="text-emerald-400 font-semibold">
                        Paid {formatCurrency(inv.advancePaid || 0, sym)}
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-amber-400 font-semibold">
                        Due {formatCurrency(inv.balanceDue || 0, sym)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, Math.round(((inv.advancePaid || 0) / (inv.totalAmount || 1)) * 100)))}%`
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Fully Paid Progress Bar & Status */}
                {!inv.isDeleted && inv.status === 'paid' && (
                  <div className="pt-2 max-w-sm">
                    <div className="flex items-center justify-between text-xs font-mono font-medium mb-1">
                      <span className="text-emerald-400 font-semibold">
                        Paid {formatCurrency(inv.totalAmount || inv.advancePaid || 0, sym)}
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-emerald-400 font-semibold text-[11px] font-sans">
                        Fully Settled
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-400 h-1.5 rounded-full w-full transition-all duration-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Totals & Actions */}
              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                <div className="sm:text-right">
                  <span className="font-display font-bold text-base text-slate-100 block">
                    {formatCurrency(inv.totalAmount, sym)}
                  </span>
                  {inv.isDeleted ? (
                    <span className="text-xs font-semibold text-rose-400 block">
                      In Trash
                    </span>
                  ) : inv.status === 'cancelled' ? (
                    <span className="text-xs font-semibold text-slate-400 block">
                      Cancelled {inv.cancelReason ? `(${inv.cancelReason})` : ''}
                    </span>
                  ) : inv.status === 'paid' ? (
                    <span className="text-xs font-semibold text-emerald-400 block">
                      Paid in Full
                    </span>
                  ) : inv.status === 'partially_paid' ? (
                    <span className="text-xs font-semibold text-amber-400 font-mono block">
                      Due: {formatCurrency(inv.balanceDue, sym)}
                    </span>
                  ) : inv.balanceDue > 0 ? (
                    <span className="text-xs font-semibold text-rose-400 font-mono block">
                      Due: {formatCurrency(inv.balanceDue, sym)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 block">
                      Draft
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5">
                  {inv.isDeleted ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleRestore(e, inv)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        title="Restore Bill"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handlePermanentDelete(e, inv)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        title="Delete permanently from app"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete permanently</span>
                      </button>
                    </>
                  ) : inv.status === 'cancelled' ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleReinstate(e, inv)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        title="Reinstate Bill"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reinstate</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, inv)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Move to Trash"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {inv.balanceDue > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaymentModalInvoice(inv);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                          title="Record Payment"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>
                      )}

                      {inv.status === 'paid' ? (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsUnpaid(e, inv)}
                          className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Mark as Unpaid"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsPaid(e, inv)}
                          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Mark as Paid"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleWhatsApp(e, inv)}
                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Share via WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancellingInvoice(inv);
                        }}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Cancel / Void Bill"
                      >
                        <Ban className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditInvoice(inv.id);
                        }}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Bill"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, inv)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete Bill"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
        <RecordPaymentModal
          isOpen={!!paymentModalInvoice}
          onClose={() => setPaymentModalInvoice(null)}
          invoice={paymentModalInvoice}
          currencySymbol={sym}
          onSavePayment={handleSavePayment}
        />
      )}

      {/* Mark as Paid Modal */}
      {markAsPaidInvoice && (
        <MarkAsPaidModal
          isOpen={!!markAsPaidInvoice}
          onClose={() => setMarkAsPaidInvoice(null)}
          invoice={markAsPaidInvoice}
          currencySymbol={sym}
          onConfirm={handleConfirmMarkAsPaid}
        />
      )}

      {/* Cancel Bill Modal */}
      {cancellingInvoice && (
        <CancelBillModal
          isOpen={!!cancellingInvoice}
          onClose={() => setCancellingInvoice(null)}
          invoice={cancellingInvoice}
          currencySymbol={sym}
          onCancelled={() => setCancellingInvoice(null)}
        />
      )}

      {/* Batch Reminders Hub Modal */}
      <BatchRemindersModal
        isOpen={isBatchRemindersOpen}
        onClose={() => setIsBatchRemindersOpen(false)}
        onViewInvoice={onViewInvoice}
      />

      {/* 5-second Undo Toast */}
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={handleUndo}
          onDismiss={() => setUndoToast(null)}
          duration={5}
        />
      )}
    </div>
  );
}
