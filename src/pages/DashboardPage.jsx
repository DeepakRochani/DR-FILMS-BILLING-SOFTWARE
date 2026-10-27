import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  TrendingUp, 
  TrendingDown,
  Clock, 
  Receipt, 
  Plus, 
  ArrowUpRight, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Share2,
  Calendar,
  Sparkles,
  DollarSign,
  CloudOff,
  RefreshCw,
  FileSpreadsheet,
  Trash2,
  Wallet,
  ArrowDownRight,
  BarChart3,
  Percent,
  Briefcase,
  BellOff,
  Bell,
  MessageSquare,
  AlertTriangle,
  CalendarClock,
  Send
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { openWhatsAppShare, shouldOpenWhatsAppWeb } from '../utils/whatsapp';
import { triggerManualSync, triggerAutoUpdateBackup } from '../utils/googleSheetsSync';
import { PaymentReminderModal } from '../components/PaymentReminderModal';
import { BatchRemindersModal } from '../components/BatchRemindersModal';
import { 
  getOverdueInvoices, 
  getUpcomingDueInvoices, 
  groupInvoicesByClient, 
  calculateDaysOverdue, 
  calculateDaysUntilDue,
  isRecentlyReminded 
} from '../utils/reminderCalculations';

export function DashboardPage({ 
  onNewInvoice, 
  onViewInvoice, 
  onGoToInvoices, 
  onGoToClients, 
  onGoToSettings, 
  onGoToTrash,
  onGoToExpenses,
  onGoToProjects
}) {
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers?.toArray() || [], []) || [];
  const services = useLiveQuery(() => db.services.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses?.toArray() || [], []) || [];
  const projects = useLiveQuery(() => db.projects?.toArray() || [], []) || [];

  const sym = settings?.currencySymbol || '₹';

  // 1. Month definitions
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const curMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  // 2. Active records filtering (Cancelled and Deleted bills excluded from income/receivables)
  const activeInvoices = invoices.filter(inv => !inv?.isDeleted && inv.status !== 'cancelled');
  const cancelledInvoices = invoices.filter(inv => !inv?.isDeleted && inv.status === 'cancelled');
  const deletedInvoicesCount = invoices.filter(inv => Boolean(inv?.isDeleted)).length;
  const activeExpenses = expenses.filter(e => !e?.isDeleted);

  // 3. This Month Income (Received) & Refunds
  let thisMonthReceived = 0;
  let thisMonthRefunds = 0;
  let totalBilledAllTime = 0;
  let totalPendingReceivables = 0;
  let unpaidInvoicesCount = 0;

  // Track service revenue
  const serviceRevenueMap = {};

  activeInvoices.forEach((inv) => {
    totalBilledAllTime += (Number(inv.totalAmount) || 0);

    // Pending receivables
    if (inv.balanceDue > 0) {
      totalPendingReceivables += Number(inv.balanceDue) || 0;
      unpaidInvoicesCount += 1;
    }

    // Payments on this invoice (active payments only)
    if (Array.isArray(inv.payments) && inv.payments.length > 0) {
      inv.payments.filter(p => !p?.isDeleted).forEach(p => {
        if ((p.date || '').startsWith(curMonthPrefix)) {
          const amt = Number(p.amount) || 0;
          if (amt >= 0) {
            thisMonthReceived += amt;
          } else {
            thisMonthRefunds += Math.abs(amt);
          }
        }
      });
    } else if (inv.advancePaid > 0 && (inv.invoiceDate || '').startsWith(curMonthPrefix)) {
      thisMonthReceived += Number(inv.advancePaid) || 0;
    }

    // Aggregate service breakdown
    (inv.items || []).forEach((item) => {
      const name = item.name || 'Custom Service';
      const amt = Number(item.amount) || 0;
      serviceRevenueMap[name] = (serviceRevenueMap[name] || 0) + amt;
    });
  });

  // 4. This Month Expenses
  let thisMonthExpenses = 0;
  let thisMonthExpenseCount = 0;
  activeExpenses.forEach(exp => {
    if ((exp.date || '').startsWith(curMonthPrefix)) {
      thisMonthExpenses += Number(exp.amount) || 0;
      thisMonthExpenseCount += 1;
    }
  });

  // 5. This Month Net Profit
  // Net profit = payments received minus expenses minus refunds
  const thisMonthNetProfit = Math.round((thisMonthReceived - thisMonthExpenses - thisMonthRefunds) * 100) / 100;
  const netReceivedInflow = Math.max(0, thisMonthReceived - thisMonthRefunds);
  const profitMarginPercent = netReceivedInflow > 0 
    ? Math.round((thisMonthNetProfit / netReceivedInflow) * 100)
    : 0;

  // 6. 6-Month Income vs Expense Trend
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'short' });
    const fullLabel = d.toLocaleString('default', { month: 'short', year: 'numeric' });

    let mReceived = 0;
    let mRefunds = 0;

    activeInvoices.forEach(inv => {
      if (Array.isArray(inv.payments) && inv.payments.length > 0) {
        inv.payments.filter(p => !p?.isDeleted).forEach(p => {
          if ((p.date || '').startsWith(prefix)) {
            const amt = Number(p.amount) || 0;
            if (amt >= 0) mReceived += amt;
            else mRefunds += Math.abs(amt);
          }
        });
      } else if (inv.advancePaid > 0 && (inv.invoiceDate || '').startsWith(prefix)) {
        mReceived += Number(inv.advancePaid) || 0;
      }
    });

    const netIncome = Math.max(0, mReceived - mRefunds);

    let mExpenses = 0;
    activeExpenses.forEach(e => {
      if ((e.date || '').startsWith(prefix)) {
        mExpenses += Number(e.amount) || 0;
      }
    });

    const mProfit = Math.round((mReceived - mExpenses - mRefunds) * 100) / 100;

    last6Months.push({
      key: prefix,
      label,
      fullLabel,
      income: netIncome,
      expenses: mExpenses,
      profit: mProfit
    });
  }

  const maxChartVal = Math.max(
    ...last6Months.map(m => Math.max(m.income, m.expenses)),
    1000
  );

  // 7. Client Profitability (Job Costing)
  const invoiceClientMap = new Map();
  invoices.forEach(inv => {
    if (inv.id && inv.customerId) {
      invoiceClientMap.set(Number(inv.id), Number(inv.customerId));
    }
  });

  const clientExpenseMap = new Map();
  activeExpenses.forEach(exp => {
    let cId = exp.clientId ? Number(exp.clientId) : null;
    if (!cId && exp.invoiceId) {
      cId = invoiceClientMap.get(Number(exp.invoiceId)) || null;
    }
    if (cId) {
      const cur = clientExpenseMap.get(cId) || { totalExpenses: 0, count: 0 };
      cur.totalExpenses += Number(exp.amount) || 0;
      cur.count += 1;
      clientExpenseMap.set(cId, cur);
    }
  });

  const clientProfitabilityList = [];
  customers.forEach(cust => {
    const expData = clientExpenseMap.get(Number(cust.id));
    if (expData && expData.totalExpenses > 0) {
      const custInvoices = activeInvoices.filter(inv => Number(inv.customerId) === Number(cust.id));
      let custReceived = 0;
      let custRefunds = 0;
      let custBilled = 0;

      custInvoices.forEach(inv => {
        custBilled += Number(inv.totalAmount) || 0;
        if (Array.isArray(inv.payments) && inv.payments.length > 0) {
          inv.payments.filter(p => !p?.isDeleted).forEach(p => {
            const amt = Number(p.amount) || 0;
            if (amt >= 0) custReceived += amt;
            else custRefunds += Math.abs(amt);
          });
        } else if (inv.advancePaid > 0) {
          custReceived += Number(inv.advancePaid) || 0;
        }
      });

      const netCustReceived = Math.max(0, custReceived - custRefunds);
      const custExpenses = expData.totalExpenses;
      const profit = Math.round((netCustReceived - custExpenses) * 100) / 100;
      const margin = netCustReceived > 0 
        ? ((profit / netCustReceived) * 100).toFixed(1)
        : (profit >= 0 ? '100' : '-100');

      clientProfitabilityList.push({
        id: cust.id,
        name: cust.name,
        company: cust.company,
        billed: custBilled,
        received: netCustReceived,
        expenses: custExpenses,
        expenseCount: expData.count,
        profit,
        margin: Number(margin)
      });
    }
  });

  clientProfitabilityList.sort((a, b) => b.received - a.received);

  // 8. Top services sorted by total revenue
  const topServices = Object.entries(serviceRevenueMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const maxServiceRevenue = topServices[0]?.amount || 1;

  // 8b. Top event types this year
  const eventTypesThisYearMap = {};
  activeInvoices.forEach(inv => {
    const d = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
    if (d && d.startsWith(String(currentYear))) {
      const type = (inv.eventType && inv.eventType.trim()) ? inv.eventType.trim() : 'Other';
      if (!eventTypesThisYearMap[type]) {
        eventTypesThisYearMap[type] = { name: type, amount: 0, count: 0 };
      }
      eventTypesThisYearMap[type].amount += (Number(inv.totalAmount) || 0);
      eventTypesThisYearMap[type].count += 1;
    }
  });
  const topEventTypesThisYear = Object.values(eventTypesThisYearMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const maxEventTypeRevenue = topEventTypesThisYear[0]?.amount || 1;

  // 9. Recent 5 active invoices
  const recentInvoices = [...activeInvoices]
    .sort((a, b) => new Date(b.createdAt || b.invoiceDate) - new Date(a.createdAt || a.invoiceDate))
    .slice(0, 5);

  // 10. Payment Reminders & Overdue Invoices
  const graceDays = Number(settings?.reminderGraceDays !== undefined ? settings.reminderGraceDays : settings?.reminderSettings?.graceDays) || 0;
  const overdueInvoices = getOverdueInvoices(invoices, graceDays);
  const groupedOverdueClients = groupInvoicesByClient(overdueInvoices, customers);
  const totalOverdueAmount = groupedOverdueClients.reduce((sum, g) => sum + g.totalPayable, 0);
  const upcomingDueInvoices = getUpcomingDueInvoices(invoices, 3);

  // 11. Project Deliveries This Week (Feature 3)
  const startOfWeek = new Date();
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);

  const deliveriesThisWeek = projects.filter(p => {
    if (p.isDeleted || p.stage === 'Delivered') return false;
    if (!p.deliveryDueDate) return false;
    const d = new Date(p.deliveryDueDate);
    return d >= startOfWeek && d <= endOfWeek;
  }).sort((a, b) => new Date(a.deliveryDueDate) - new Date(b.deliveryDueDate));

  const [selectedReminderGroup, setSelectedReminderGroup] = useState(null);
  const [isBatchRemindersOpen, setIsBatchRemindersOpen] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);

  // Quick snooze from dashboard
  const handleQuickSnooze = async (group, days = 3) => {
    const snoozeUntil = new Date(Date.now() + days * 86400000).toISOString();
    for (const inv of group.invoices) {
      if (inv.id) {
        await db.invoices.update(inv.id, {
          snoozedUntil: snoozeUntil,
          updatedAt: new Date().toISOString()
        });
      }
    }
    triggerAutoUpdateBackup();
  };

  // Courtesy upcoming reminder handler
  const handleUpcomingReminder = (inv) => {
    const custId = inv.customerId ? Number(inv.customerId) : null;
    const clientRecord = custId ? customers.find(c => Number(c.id) === custId) : null;
    setSelectedReminderGroup({
      groupKey: `upcoming_${inv.id}`,
      clientId: custId,
      clientName: clientRecord?.name || inv.customerSnapshot?.name || 'Valued Client',
      clientPhone: clientRecord?.phone || inv.customerSnapshot?.phone || '',
      clientTag: clientRecord?.tag || inv.customerSnapshot?.tag || 'Regular',
      isMuted: Boolean(clientRecord?.dontRemind || inv.customerSnapshot?.dontRemind),
      invoices: [inv],
      totalPayable: Number(inv.balanceDue) || 0,
      maxDaysOverdue: 0,
      oldestDueDate: inv.dueDate || inv.invoiceDate,
      lastReminderDate: inv.lastReminderDate || null,
      reminderCount: inv.reminderCount || 0
    });
  };

  // 7-day Google Sheets sync overdue calculation
  const isBackupConfigured = Boolean(settings?.sheetsBackupEnabled && settings?.sheetsWebAppUrl && settings?.sheetsSyncSecret);
  let isSyncOverdue = false;
  let overdueDays = null;

  if (isBackupConfigured) {
    if (!settings.sheetsLastSyncedAt) {
      isSyncOverdue = true;
      overdueDays = null;
    } else {
      const lastSyncTime = new Date(settings.sheetsLastSyncedAt).getTime();
      const diffMs = Date.now() - lastSyncTime;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days >= 7) {
        isSyncOverdue = true;
        overdueDays = days;
      }
    }
  }

  const handleQuickSync = async () => {
    setIsQuickSyncing(true);
    const res = await triggerManualSync();
    setIsQuickSyncing(false);
    if (res.success) {
      alert('Google Sheet synchronized successfully!');
    } else {
      alert(`Sync failed: ${res.error || res.reason || 'Check connection'}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 p-6 sm:p-8 border border-slate-800 shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{settings?.businessName || 'DR FILMS'} Studio Suite</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-100 tracking-tight">
              Business Overview & Financials
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Track creative cashflow, monitor expenses and net profits, manage pending receivables, and review job-costing profitability.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onGoToExpenses && (
              <button
                type="button"
                onClick={onGoToExpenses}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-2xl border border-slate-700 transition-colors text-sm"
              >
                <Wallet className="w-4 h-4 text-rose-400" />
                <span>Expenses</span>
              </button>
            )}
            <button
              type="button"
              onClick={onNewInvoice}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* 7-day Overdue Google Sheets Sync Banner */}
      {isSyncOverdue && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <CloudOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-300">
                  Google Sheets Backup Overdue
                </h4>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {overdueDays !== null ? `${overdueDays} Days Ago` : 'Never Synced'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {overdueDays !== null
                  ? `Your last successful Google Sheets backup was ${overdueDays} days ago (${new Date(settings.sheetsLastSyncedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}). Sync now to keep your cloud spreadsheet up to date.`
                  : 'Google Sheets Backup is enabled, but your bills and clients have not been synchronized yet. Click below to create your cloud backup.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={handleQuickSync}
              disabled={isQuickSyncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isQuickSyncing ? 'animate-spin' : ''}`} />
              <span>{isQuickSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            {onGoToSettings && (
              <button
                type="button"
                onClick={onGoToSettings}
                className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
              >
                Settings
              </button>
            )}
          </div>
        </div>
      )}

      {/* Small Amber Banner when any bill is overdue */}
      {overdueInvoices.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-slate-900 border border-amber-500/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-300">
                  {overdueInvoices.length} Overdue {overdueInvoices.length === 1 ? 'Bill' : 'Bills'} Require Payment Follow-up
                </h4>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {formatCurrency(totalOverdueAmount, sym)} Total Due
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {groupedOverdueClients.length} client{groupedOverdueClients.length === 1 ? ' has' : 's have'} outstanding balances past due. Review grouped reminders below to share one-click friendly, neutral, or firm notices via WhatsApp.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => setIsBatchRemindersOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Reminders Hub (1-Click)</span>
            </button>
          </div>
        </div>
      )}

      {/* CORE FINANCIAL METRICS: Income (Received), Expenses, Net Profit, Pending Receivables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: This Month Income (Received) */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              This Month Income
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-display font-black text-emerald-400">
              {formatCurrency(thisMonthReceived, sym)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Received in {currentMonthName}</span>
              {thisMonthRefunds > 0 && (
                <span className="text-[11px] text-amber-400 font-mono">
                  -{formatCurrency(thisMonthRefunds, sym)} ref
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: This Month Expenses */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              This Month Expenses
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-display font-black text-rose-400">
              {formatCurrency(thisMonthExpenses, sym)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Across {thisMonthExpenseCount} recorded expenditures
            </p>
          </div>
        </div>

        {/* Card 3: This Month Net Profit */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              This Month Net Profit
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              thisMonthNetProfit >= 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'
            }`}>
              {thisMonthNetProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div>
            <div className={`text-2xl font-display font-black ${
              thisMonthNetProfit >= 0 ? 'text-slate-100' : 'text-rose-400'
            }`}>
              {formatCurrency(thisMonthNetProfit, sym)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Received minus expenses</span>
              {netReceivedInflow > 0 && (
                <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  thisMonthNetProfit >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {profitMarginPercent}% margin
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Card 4: Pending Receivables */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pending Payments
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-display font-black text-amber-400">
              {formatCurrency(totalPendingReceivables, sym)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Across {unpaidInvoicesCount} unpaid or partial bills
            </p>
          </div>
        </div>
      </div>

      {/* SECONDARY LIFETIME SUMMARY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80 text-xs">
        <div className="px-3 py-1.5 border-r border-slate-800/80">
          <span className="text-slate-500 block text-[11px]">Lifetime Invoiced</span>
          <span className="font-mono font-bold text-slate-200 text-sm">
            {formatCurrency(totalBilledAllTime, sym)}
          </span>
        </div>
        <div className="px-3 py-1.5 border-r border-slate-800/80">
          <span className="text-slate-500 block text-[11px]">Active Bills</span>
          <span className="font-mono font-bold text-slate-200 text-sm">
            {activeInvoices.length} ({activeInvoices.filter(i => i.status === 'paid').length} settled)
          </span>
        </div>
        <div className="px-3 py-1.5 border-r border-slate-800/80">
          <span className="text-slate-500 block text-[11px]">Cancelled Bills</span>
          <span className="font-mono font-bold text-slate-400 text-sm">
            {cancelledInvoices.length} void
          </span>
        </div>
        <div className="px-3 py-1.5 flex items-center justify-between">
          <div>
            <span className="text-slate-500 block text-[11px]">Trash / Archived</span>
            <span className="font-mono font-bold text-rose-300 text-sm">
              {deletedInvoicesCount} bills
            </span>
          </div>
          {deletedInvoicesCount > 0 && onGoToTrash && (
            <button
              type="button"
              onClick={onGoToTrash}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold hover:underline flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Trash</span>
            </button>
          )}
        </div>
      </div>

      {/* 6-MONTH INCOME VS EXPENSE TREND CHART */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>6-Month Financial Trend: Income vs Expenses</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparing payments received in each month against operating expenses
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-400 inline-block" />
              <span className="text-slate-300">Income (Received)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-rose-600 to-rose-400 inline-block" />
              <span className="text-slate-300">Expenses</span>
            </div>
          </div>
        </div>

        {/* Bar Chart Container */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-6 gap-2 sm:gap-4 h-48 sm:h-56 items-end border-b border-slate-800 pb-3">
            {last6Months.map((m) => {
              const incomeHeight = Math.max(4, Math.round((m.income / maxChartVal) * 100));
              const expenseHeight = Math.max(4, Math.round((m.expenses / maxChartVal) * 100));

              return (
                <div key={m.key} className="flex flex-col items-center h-full justify-end group">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -translate-y-28 bg-slate-900 border border-slate-700 p-2 rounded-xl shadow-2xl text-[11px] pointer-events-none z-30 space-y-1 font-mono whitespace-nowrap">
                    <p className="font-bold text-slate-200">{m.fullLabel}</p>
                    <p className="text-emerald-400">Income: {formatCurrency(m.income, sym)}</p>
                    <p className="text-rose-400">Expenses: {formatCurrency(m.expenses, sym)}</p>
                    <p className={m.profit >= 0 ? 'text-amber-300 font-bold' : 'text-rose-300 font-bold'}>
                      Net: {m.profit >= 0 ? '+' : ''}{formatCurrency(m.profit, sym)}
                    </p>
                  </div>

                  {/* Dual Bar Pair */}
                  <div className="flex items-end justify-center gap-1 sm:gap-2 w-full max-w-[50px] h-full">
                    {/* Income Bar */}
                    <div className="w-1/2 flex flex-col justify-end items-center h-full">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 hover:brightness-110 transition-all duration-300 shadow-sm shadow-emerald-500/20"
                        style={{ height: `${incomeHeight}%` }}
                        title={`Income: ${formatCurrency(m.income, sym)}`}
                      />
                    </div>

                    {/* Expense Bar */}
                    <div className="w-1/2 flex flex-col justify-end items-center h-full">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-rose-600 to-rose-400 hover:brightness-110 transition-all duration-300 shadow-sm shadow-rose-500/20"
                        style={{ height: `${expenseHeight}%` }}
                        title={`Expenses: ${formatCurrency(m.expenses, sym)}`}
                      />
                    </div>
                  </div>

                  {/* Month Label */}
                  <div className="text-center mt-2.5 space-y-0.5">
                    <span className="block text-xs font-semibold text-slate-300">
                      {m.label}
                    </span>
                    <span className={`block text-[10px] font-mono font-bold ${
                      m.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {m.profit >= 0 ? '+' : ''}{formatCurrency(m.profit, sym)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CLIENT JOB COSTING & PROFITABILITY SECTION */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-400" />
              <span>Profit per Client (Job Costing)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Net profit and margins for clients with linked project and production expenses
            </p>
          </div>
          {onGoToExpenses && (
            <button
              type="button"
              onClick={onGoToExpenses}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Manage Expenses
            </button>
          )}
        </div>

        {clientProfitabilityList.length === 0 ? (
          <div className="text-center py-8 bg-slate-900/40 rounded-xl border border-slate-800/80 p-4">
            <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-semibold">No Client-Linked Expenses Yet</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
              Link equipment rentals, freelancer payments, or travel to a client or bill when recording an expense to see profitability and net margin per client here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3 text-right">Revenue Received</th>
                  <th className="py-2.5 px-3 text-right">Linked Expenses</th>
                  <th className="py-2.5 px-3 text-right">Net Profit</th>
                  <th className="py-2.5 px-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {clientProfitabilityList.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-sans">
                      <span className="font-semibold text-slate-200 block">{c.name}</span>
                      {c.company && (
                        <span className="text-[11px] text-slate-500 block">{c.company}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-200">
                      {formatCurrency(c.received, sym)}
                    </td>
                    <td className="py-3 px-3 text-right text-rose-400">
                      {formatCurrency(c.expenses, sym)}
                      <span className="text-[10px] text-slate-500 font-sans block">
                        {c.expenseCount} record(s)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold">
                      <span className={c.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {c.profit >= 0 ? '+' : ''}{formatCurrency(c.profit, sym)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.margin >= 30 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : c.margin >= 0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {c.margin}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION: OVERDUE PAYMENTS & UPCOMING DUES */}
      <div id="overdue-payments-card" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overdue Payments Card (Grouped by Client, Oldest First) - 2 Cols */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Overdue Payments</span>
                    {groupedOverdueClients.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                        {groupedOverdueClients.length} clients
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sorted oldest first • Consolidated into 1 reminder per client
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              {totalOverdueAmount > 0 && (
                <div className="sm:text-right">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Total Overdue</span>
                  <span className="text-sm font-mono font-bold text-rose-400">
                    {formatCurrency(totalOverdueAmount, sym)}
                  </span>
                </div>
              )}
              {groupedOverdueClients.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBatchRemindersOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                  title="Open 1-Click WhatsApp Reminders Hub"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>1-Click Hub</span>
                </button>
              )}
            </div>
          </div>

          {groupedOverdueClients.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="text-xs text-slate-200 font-semibold">No Overdue Bills</p>
              <p className="text-[11px] text-slate-500">
                All client accounts are clear or within grace periods.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {groupedOverdueClients.map((group) => {
                const recentlyReminded = isRecentlyReminded(group.lastReminderDate, 3);
                const daysAgo = group.lastReminderDate
                  ? Math.floor((new Date() - new Date(group.lastReminderDate)) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <div
                    key={group.groupKey}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-100 text-sm">
                          {group.clientName}
                        </span>
                        {group.clientTag && group.clientTag !== 'Regular' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-slate-800 text-amber-300 border-slate-700">
                            {group.clientTag}
                          </span>
                        )}
                        {group.isMuted && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                            <BellOff className="w-3 h-3" />
                            <span>Muted</span>
                          </span>
                        )}
                        <span className="text-[11px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          {group.maxDaysOverdue}d overdue
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-slate-300">
                          {group.invoices.length > 1
                            ? `${group.invoices.length} bills (${group.invoices.map(i => formatInvoiceNumber(i.invoiceNumber)).join(', ')})`
                            : formatInvoiceNumber(group.invoices[0]?.invoiceNumber)}
                        </span>
                        <span>•</span>
                        <span>Oldest due: {formatDate(group.oldestDueDate)}</span>
                        <span>•</span>
                        {group.lastReminderDate ? (
                          <span className={recentlyReminded ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                            Reminded {daysAgo === 0 ? 'today' : `${daysAgo}d ago`} ({group.reminderCount}x)
                          </span>
                        ) : (
                          <span className="text-slate-500">Not reminded yet</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase text-slate-500 block">Payable Now</span>
                        <span className="font-mono font-black text-amber-400 text-sm block">
                          {formatCurrency(group.totalPayable, sym)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickSnooze(group, 3)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                          title="Snooze for 3 days"
                        >
                          Snooze 3d
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedReminderGroup(group)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Send Reminder</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Due in Next 3 Days Section (1 Col) */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span>Due in Next 3 Days</span>
              </h3>
              {upcomingDueInvoices.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  {upcomingDueInvoices.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Send a gentle courtesy reminder before overdue
            </p>

            {upcomingDueInvoices.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 mt-4 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p>No bills due in the next 3 days.</p>
              </div>
            ) : (
              <div className="space-y-2.5 mt-4 max-h-72 overflow-y-auto pr-1">
                {upcomingDueInvoices.map((inv) => {
                  const daysUntil = calculateDaysUntilDue(inv.dueDate, inv.invoiceDate);
                  const dueLabel = daysUntil === 0 ? 'Due Today' : (daysUntil === 1 ? 'Due Tomorrow' : `Due in ${daysUntil} days`);

                  return (
                    <div
                      key={inv.id}
                      className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200 block truncate">
                          {inv.customerSnapshot?.name}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>{formatInvoiceNumber(inv.invoiceNumber)}</span>
                          <span>•</span>
                          <span className={daysUntil === 0 ? 'text-rose-400 font-bold' : 'text-amber-400 font-medium'}>
                            {dueLabel}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-slate-200 block">
                          {formatCurrency(inv.balanceDue, sym)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpcomingReminder(inv)}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-medium mt-0.5 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Courtesy Note</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle Grid: Top Services, Top Event Types & Deliveries This Week */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Services by Revenue (1 Col) */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Top Services</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Highest revenue deliverables
              </p>
            </div>
          </div>

          {topServices.length === 0 ? (
            <p className="text-center py-10 text-xs text-slate-500">
              No service revenue data available yet.
            </p>
          ) : (
            <div className="space-y-4 pt-2">
              {topServices.map((svc, idx) => {
                const percent = Math.round((svc.amount / maxServiceRevenue) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200 truncate pr-2">
                        {svc.name}
                      </span>
                      <span className="font-mono font-bold text-amber-400 shrink-0">
                        {formatCurrency(svc.amount, sym)}
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Event Types This Year (1 Col) */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Top Event Types</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Revenue by shoot category ({currentYear})
              </p>
            </div>
          </div>

          {topEventTypesThisYear.length === 0 ? (
            <p className="text-center py-10 text-xs text-slate-500">
              No bills with event types in {currentYear}.
            </p>
          ) : (
            <div className="space-y-4 pt-2">
              {topEventTypesThisYear.map((evt, idx) => {
                const percent = Math.round((evt.amount / maxEventTypeRevenue) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200 truncate pr-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="truncate">{evt.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({evt.count})</span>
                      </span>
                      <span className="font-mono font-bold text-amber-400 shrink-0">
                        {formatCurrency(evt.amount, sym)}
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Deliveries This Week (1 Col - Feature 3) */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span>Deliveries This Week</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Shoots needing final delivery
              </p>
            </div>
            {onGoToProjects && (
              <button
                type="button"
                onClick={onGoToProjects}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
              >
                View All
              </button>
            )}
          </div>

          {deliveriesThisWeek.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="text-slate-300 font-medium">All caught up!</p>
              <p>No deliverables due this week.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {deliveriesThisWeek.map((proj) => {
                const daysUntil = calculateDaysUntilDue(proj.deliveryDueDate, null);
                const isOverdue = daysUntil < 0;
                const isToday = daysUntil === 0;

                return (
                  <div
                    key={proj.id}
                    onClick={() => onGoToProjects && onGoToProjects(proj.id)}
                    className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs hover:border-amber-500/40 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-200 block truncate">
                        {proj.title}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span className="text-amber-300/90 font-sans">{proj.clientName || 'Client'}</span>
                        <span>•</span>
                        <span className={isOverdue ? 'text-rose-400 font-bold' : isToday ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                          {isOverdue ? `${Math.abs(daysUntil)}d late` : isToday ? 'Due Today' : `Due in ${daysUntil}d`}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                        {proj.stage}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Recent Invoices</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest billing records generated in your studio
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToInvoices}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
          >
            <span>View All Bills</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentInvoices.length === 0 ? (
          <p className="text-center py-10 text-xs text-slate-500">
            No invoices generated yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv.id)}
                className="py-3 flex items-center justify-between gap-4 hover:bg-slate-800/40 px-2 rounded-xl cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-200">
                      {formatInvoiceNumber(inv.invoiceNumber)}
                    </span>
                    <StatusBadge status={inv.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {inv.customerSnapshot?.name} {inv.customerSnapshot?.company ? `• ${inv.customerSnapshot.company}` : ''}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-display font-bold text-sm text-slate-100 block">
                    {formatCurrency(inv.totalAmount, sym)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatDate(inv.invoiceDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Reminder Modal */}
      {selectedReminderGroup && (
        <PaymentReminderModal
          isOpen={!!selectedReminderGroup}
          onClose={() => setSelectedReminderGroup(null)}
          clientGroup={selectedReminderGroup}
          settings={settings}
          onReminderSent={() => setSelectedReminderGroup(null)}
        />
      )}

      {/* Batch Reminders Hub Modal */}
      <BatchRemindersModal
        isOpen={isBatchRemindersOpen}
        onClose={() => setIsBatchRemindersOpen(false)}
        onViewInvoice={onViewInvoice}
      />
    </div>
  );
}
