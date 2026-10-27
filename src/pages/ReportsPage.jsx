import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  Receipt, 
  DollarSign, 
  CreditCard, 
  AlertTriangle, 
  RotateCcw, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Users, 
  PieChart, 
  Ban,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { 
  getReportPeriodDates, 
  generateAccountantReport, 
  exportReportToExcel, 
  exportReportToCsv, 
  GST_RATES 
} from '../utils/reportCalculations';

export function ReportsPage() {
  const currentDate = new Date();
  const [periodMode, setPeriodMode] = useState('month'); // 'month' | 'fy' | 'custom' | 'all'
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1-12
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewMode, setViewMode] = useState('billed'); // 'billed' | 'received'
  const [activeTableTab, setActiveTableTab] = useState('invoices'); // 'invoices' | 'payments' | 'gst' | 'services' | 'clients' | 'expenses' | 'cancelled'
  const [isExporting, setIsExporting] = useState(false);

  // Live queries
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const expenses = useLiveQuery(async () => {
    try {
      if (db.expenses) {
        return await db.expenses.toArray();
      }
      return [];
    } catch {
      return [];
    }
  }, []) || [];

  const sym = settings?.currencySymbol || '₹';

  // Compute period information
  const periodInfo = useMemo(() => {
    return getReportPeriodDates(periodMode, selectedYear, selectedMonth, customStart, customEnd);
  }, [periodMode, selectedYear, selectedMonth, customStart, customEnd]);

  // Compute report data
  const reportData = useMemo(() => {
    return generateAccountantReport({
      invoices,
      customers,
      expenses,
      periodInfo,
      viewMode
    });
  }, [invoices, customers, expenses, periodInfo, viewMode]);

  const handleExportExcel = () => {
    try {
      setIsExporting(true);
      exportReportToExcel(reportData, settings);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
      alert('Could not export Excel: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    try {
      exportReportToCsv(reportData, activeTableTab);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Could not export CSV: ' + (err?.message || 'Unknown error'));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate Year options (current - 3 to current + 2)
  const currentYearNum = currentDate.getFullYear();
  const yearOptions = [currentYearNum - 2, currentYearNum - 1, currentYearNum, currentYearNum + 1];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-amber-400" />
              <span>Monthly Report for Accountant</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              Tax & P&L
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Financial turnover, GST output breakdown, payment ledger, business expenses & net profit.
          </p>
        </div>

        {/* Global Export Actions */}
        <div className="flex items-center gap-2 flex-wrap no-print">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            title="Download formatted multi-sheet Excel for your CA / Accountant"
          >
            <Download className="w-4 h-4" />
            <span>Export for Accountant (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Export currently selected table as CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Filter & View Mode Controls Bar */}
      <div className="glass-card p-4 rounded-2xl border border-slate-800/80 space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Period Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Period:</span>
            </span>

            {/* Mode selection buttons */}
            <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setPeriodMode('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodMode === 'month' 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('fy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodMode === 'fy' 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Financial Year
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodMode === 'custom' 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom Range
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodMode === 'all' 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Time
              </button>
            </div>

            {/* Month & Year Selectors */}
            {periodMode === 'month' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="glass-input px-3 py-1.5 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100"
                >
                  {monthNames.map((name, idx) => (
                    <option key={name} value={idx + 1} className="bg-slate-900 text-slate-100">
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="glass-input px-3 py-1.5 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 font-mono"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y} className="bg-slate-900 text-slate-100">
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Financial Year Selector */}
            {periodMode === 'fy' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="glass-input px-3 py-1.5 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 font-mono"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y} className="bg-slate-900 text-slate-100">
                      FY {y}-{String(y + 1).slice(2)} (Apr {y} – Mar {y + 1})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom Range Inputs */}
            {periodMode === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="glass-input px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 font-mono"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="glass-input px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 font-mono"
                />
              </div>
            )}
          </div>

          {/* View Mode Switch (Billed vs Received) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">View:</span>
            <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('billed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'billed'
                    ? 'bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Filter by Invoice Date (Accrual basis: bills generated during this period)"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Billed (Invoice Date)</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('received')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'received'
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Filter by Payment Date (Cash basis: payments received during this period)"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Received (Payment Date)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Informative indicator banner */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
          <span>
            Active Selection: <strong className="text-amber-400">{periodInfo.label}</strong>
            {' • '}
            Mode: <strong className="text-slate-200">{viewMode === 'billed' ? 'Accrual (Invoice Date)' : 'Cash Realized (Payment Date)'}</strong>
          </span>
          <span className="text-slate-500">
            * Cancelled & deleted bills are excluded from revenue & balance calculations.
          </span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Billed */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Total Billed</span>
          <div className="text-base font-bold font-display text-slate-100 mt-1">
            {formatCurrency(reportData.summary.totalBilled, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">{reportData.summary.invoicesCount} active bills</span>
        </div>

        {/* GST Output Collected */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-purple-400 uppercase tracking-wider block font-medium">GST Output</span>
          <div className="text-base font-bold font-display text-purple-300 mt-1">
            {formatCurrency(reportData.summary.gstCollected, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Tax liability</span>
        </div>

        {/* Payments Received */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-medium">Payments In</span>
          <div className="text-base font-bold font-display text-emerald-400 mt-1">
            {formatCurrency(reportData.summary.paymentsReceived, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Cash realized</span>
        </div>

        {/* Pending Receivables */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-medium">Pending Due</span>
          <div className="text-base font-bold font-display text-amber-400 mt-1">
            {formatCurrency(reportData.summary.pendingReceivables, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Outstanding</span>
        </div>

        {/* Refunds */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-rose-400 uppercase tracking-wider block font-medium">Refunds</span>
          <div className="text-base font-bold font-display text-rose-400 mt-1">
            {formatCurrency(reportData.summary.refunds, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Cash refunded</span>
        </div>

        {/* Business Expenses */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-cyan-400 uppercase tracking-wider block font-medium">Expenses</span>
          <div className="text-base font-bold font-display text-cyan-300 mt-1">
            {formatCurrency(reportData.summary.expenses, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Operating costs</span>
        </div>

        {/* Net Profit */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] text-emerald-300 uppercase tracking-wider block font-medium">Net Profit</span>
          <div className={`text-base font-bold font-display mt-1 ${
            reportData.summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {formatCurrency(reportData.summary.netProfit, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Inflow - Exp - Ref</span>
        </div>

        {/* Cancelled Amount (Excluded) */}
        <div className="glass-card p-3 rounded-2xl border border-slate-800/80 bg-slate-900/40">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Cancelled</span>
          <div className="text-base font-bold font-display text-slate-400 line-through mt-1">
            {formatCurrency(reportData.summary.cancelledAmount, sym)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">{reportData.summary.cancelledCount} bills (void)</span>
        </div>
      </div>

      {/* Detail Table Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-800 no-print">
          <button
            type="button"
            onClick={() => setActiveTableTab('invoices')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'invoices'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Invoices ({reportData.invoicesTable.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('payments')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'payments'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Payments Received ({reportData.paymentsTable.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('gst')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'gst'
                ? 'border-purple-400 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            GST Rate Breakdown
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('eventTypes')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'eventTypes'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Income by Event Type
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('services')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'services'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Income by Service
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('clients')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'clients'
                ? 'border-indigo-400 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Income by Client
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('expenses')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'expenses'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Expenses by Category
          </button>

          <button
            type="button"
            onClick={() => setActiveTableTab('cancelled')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTableTab === 'cancelled'
                ? 'border-rose-400 text-rose-400 bg-rose-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cancelled Bills ({reportData.cancelledBillsTable.length})
          </button>
        </div>

        {/* Table 1: Invoices */}
        {activeTableTab === 'invoices' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">All Invoices in Period</h3>
                <p className="text-xs text-slate-400">List of invoices billed during {periodInfo.label}</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Total Billed: <strong className="text-amber-400">{formatCurrency(reportData.summary.totalBilled, sym)}</strong>
              </span>
            </div>

            {reportData.invoicesTable.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No invoices recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-3 text-right">Subtotal</th>
                      <th className="py-3 px-2 text-center">GST %</th>
                      <th className="py-3 px-3 text-right">GST Amt</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-3 text-right">Received</th>
                      <th className="py-3 px-4 text-right">Balance Due</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.invoicesTable.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-amber-400">
                          {formatInvoiceNumber(inv.invoiceNumber)}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {formatDate(inv.date)}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                          {inv.clientName}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {formatCurrency(inv.subtotal, sym)}
                        </td>
                        <td className="py-3 px-2 text-center text-slate-400">
                          {inv.taxRate}%
                        </td>
                        <td className="py-3 px-3 text-right text-purple-300">
                          {formatCurrency(inv.taxAmount, sym)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-100">
                          {formatCurrency(inv.totalAmount, sym)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-400">
                          {formatCurrency(inv.received, sym)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={inv.balance > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                            {formatCurrency(inv.balance, sym)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-sans">
                          <StatusBadge status={inv.status} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Footer */}
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                      <td className="py-3 px-3 text-right text-slate-200">
                        {formatCurrency(reportData.summary.subtotalBilled, sym)}
                      </td>
                      <td className="py-3 px-2"></td>
                      <td className="py-3 px-3 text-right text-purple-300">
                        {formatCurrency(reportData.summary.gstCollected, sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400">
                        {formatCurrency(reportData.summary.totalBilled, sym)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400">
                        {formatCurrency(
                          reportData.invoicesTable.reduce((s, i) => s + i.received, 0),
                          sym
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400">
                        {formatCurrency(reportData.summary.pendingReceivables, sym)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 2: Payments */}
        {activeTableTab === 'payments' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Payments & Refunds Ledger</h3>
                <p className="text-xs text-slate-400">Cash receipts & outgoing refunds in {periodInfo.label}</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Net Cash Inflow: <strong className="text-emerald-400">{formatCurrency(reportData.summary.paymentsReceived - reportData.summary.refunds, sym)}</strong>
              </span>
            </div>

            {reportData.paymentsTable.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No payment receipts or refunds recorded in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-3">Invoice No</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-3">Method</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.paymentsTable.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 text-slate-400">
                          {formatDate(p.date)}
                        </td>
                        <td className="py-3 px-3 font-semibold text-amber-400">
                          {formatInvoiceNumber(p.invoiceNumber)}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-200">
                          {p.clientName}
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {p.method}
                        </td>
                        <td className="py-3 px-3">
                          {p.isRefund ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold font-sans">
                              Refund
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold font-sans">
                              Payment
                            </span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${p.isRefund ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {p.isRefund ? `- ${formatCurrency(Math.abs(p.amount), sym)}` : formatCurrency(p.amount, sym)}
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-sans text-[11px]">
                          {p.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={5} className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total Net Received</td>
                      <td className="py-3 px-4 text-right text-emerald-400">
                        {formatCurrency(reportData.summary.paymentsReceived - reportData.summary.refunds, sym)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 3: GST Summary */}
        {activeTableTab === 'gst' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">GST Output Tax Summary by Rate</h3>
                <p className="text-xs text-slate-400">Taxable turnover and CGST / SGST split for GST filing</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Total GST Liability: <strong className="text-purple-400">{formatCurrency(reportData.summary.gstCollected, sym)}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Rate (%)</th>
                    <th className="py-3 px-3 text-center">Invoices Count</th>
                    <th className="py-3 px-4 text-right">Taxable Turnover</th>
                    <th className="py-3 px-4 text-right">CGST (50%)</th>
                    <th className="py-3 px-4 text-right">SGST (50%)</th>
                    <th className="py-3 px-4 text-right font-bold text-purple-300">Total GST Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {reportData.gstSummary.map((g) => (
                    <tr key={g.rate} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-amber-400 font-sans">
                        {g.rate}% GST
                      </td>
                      <td className="py-3 px-3 text-center text-slate-300">
                        {g.count}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-200">
                        {formatCurrency(g.taxableAmount, sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {formatCurrency(g.cgst, sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {formatCurrency(g.sgst, sym)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-purple-400">
                        {formatCurrency(g.totalGst, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                  <tr>
                    <td className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                    <td className="py-3 px-3 text-center text-slate-300">
                      {reportData.gstSummary.reduce((s, g) => s + g.count, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-100">
                      {formatCurrency(reportData.gstSummary.reduce((s, g) => s + g.taxableAmount, 0), sym)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {formatCurrency(reportData.gstSummary.reduce((s, g) => s + g.cgst, 0), sym)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {formatCurrency(reportData.gstSummary.reduce((s, g) => s + g.sgst, 0), sym)}
                    </td>
                    <td className="py-3 px-4 text-right text-purple-400">
                      {formatCurrency(reportData.summary.gstCollected, sym)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Table: Income by Event Type */}
        {activeTableTab === 'eventTypes' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Income by Event & Shoot Type</h3>
                <p className="text-xs text-slate-400">Revenue, bill count, and outstanding balance by event type</p>
              </div>
            </div>

            {(!reportData.incomeByEventType || reportData.incomeByEventType.length === 0) ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No event type transactions recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-3 text-center">Number of Bills</th>
                      <th className="py-3 px-4 text-right">Total Billed</th>
                      <th className="py-3 px-4 text-right">Total Received</th>
                      <th className="py-3 px-4 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.incomeByEventType.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-sans text-slate-200 font-semibold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span>{e.eventType}</span>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-300">
                          {e.billsCount}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-100">
                          {formatCurrency(e.totalBilled, sym)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400">
                          {formatCurrency(e.totalReceived, sym)}
                        </td>
                        <td className="py-3 px-4 text-right text-amber-400">
                          {formatCurrency(e.balanceDue, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                      <td className="py-3 px-3 text-center text-slate-300">
                        {reportData.incomeByEventType.reduce((sum, e) => sum + e.billsCount, 0)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-100">
                        {formatCurrency(reportData.incomeByEventType.reduce((sum, e) => sum + e.totalBilled, 0), sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-400">
                        {formatCurrency(reportData.incomeByEventType.reduce((sum, e) => sum + e.totalReceived, 0), sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400">
                        {formatCurrency(reportData.incomeByEventType.reduce((sum, e) => sum + e.balanceDue, 0), sym)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 4: Income by Service */}
        {activeTableTab === 'services' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Income by Service</h3>
                <p className="text-xs text-slate-400">Product and service volume breakdown</p>
              </div>
            </div>

            {reportData.incomeByService.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No service items recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Service / Product Name</th>
                      <th className="py-3 px-4 text-center">Total Quantity / Units</th>
                      <th className="py-3 px-4 text-right">Total Billed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.incomeByService.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                          {s.name}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-300">
                          {s.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-400">
                          {formatCurrency(s.totalBilled, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                      <td className="py-3 px-4 text-center text-slate-300">
                        {reportData.incomeByService.reduce((sum, s) => sum + s.quantity, 0)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400">
                        {formatCurrency(reportData.incomeByService.reduce((sum, s) => sum + s.totalBilled, 0), sym)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 5: Income by Client */}
        {activeTableTab === 'clients' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Income by Client</h3>
                <p className="text-xs text-slate-400">Client-wise billed, received, and outstanding receivables</p>
              </div>
            </div>

            {reportData.incomeByClient.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No client transactions recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Client Name</th>
                      <th className="py-3 px-3 text-center">Bills Count</th>
                      <th className="py-3 px-4 text-right">Total Billed</th>
                      <th className="py-3 px-4 text-right">Total Received</th>
                      <th className="py-3 px-4 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.incomeByClient.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                          {c.clientName}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-300">
                          {c.billsCount}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-100">
                          {formatCurrency(c.totalBilled, sym)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400">
                          {formatCurrency(c.totalReceived, sym)}
                        </td>
                        <td className="py-3 px-4 text-right text-amber-400">
                          {formatCurrency(c.balanceDue, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                      <td className="py-3 px-3 text-center text-slate-300">
                        {reportData.incomeByClient.reduce((sum, c) => sum + c.billsCount, 0)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-100">
                        {formatCurrency(reportData.incomeByClient.reduce((sum, c) => sum + c.totalBilled, 0), sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-400">
                        {formatCurrency(reportData.incomeByClient.reduce((sum, c) => sum + c.totalReceived, 0), sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400">
                        {formatCurrency(reportData.incomeByClient.reduce((sum, c) => sum + c.balanceDue, 0), sym)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 6: Expenses by Category */}
        {activeTableTab === 'expenses' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Operating Expenses by Category</h3>
                <p className="text-xs text-slate-400">Expenditures recorded in {periodInfo.label}</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Total Expenses: <strong className="text-cyan-400">{formatCurrency(reportData.summary.expenses, sym)}</strong>
              </span>
            </div>

            {reportData.expensesByCategory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No expenses recorded for this period yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-center">Transactions</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-4 text-right">GST Paid (Input Tax)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.expensesByCategory.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                          {e.category}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-300">
                          {e.count}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-cyan-300">
                          {formatCurrency(e.totalAmount, sym)}
                        </td>
                        <td className="py-3 px-4 text-right text-purple-300">
                          {formatCurrency(e.gstPaid, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                    <tr>
                      <td className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                      <td className="py-3 px-4 text-center text-slate-300">
                        {reportData.expensesByCategory.reduce((sum, e) => sum + e.count, 0)}
                      </td>
                      <td className="py-3 px-4 text-right text-cyan-400">
                        {formatCurrency(reportData.summary.expenses, sym)}
                      </td>
                      <td className="py-3 px-4 text-right text-purple-400">
                        {formatCurrency(reportData.summary.expenseGstPaid, sym)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table 7: Cancelled Bills */}
        {activeTableTab === 'cancelled' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-slate-400" />
                  <span>Cancelled / Voided Bills</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Explicitly excluded from revenue, pending receivables, and tax liability
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Total Voided: <strong className="text-slate-400 line-through">{formatCurrency(reportData.summary.cancelledAmount, sym)}</strong>
              </span>
            </div>

            {reportData.cancelledBillsTable.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No cancelled bills in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Cancelled Date</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Reason for Cancellation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reportData.cancelledBillsTable.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-900/40 transition-colors opacity-80">
                        <td className="py-3 px-4 font-semibold text-slate-400">
                          {formatInvoiceNumber(c.invoiceNumber)}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {formatDate(c.date)}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {formatDate(c.cancelledAt)}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          {c.clientName}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-400 line-through">
                          {formatCurrency(c.amount, sym)}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-400">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px]">
                            {c.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Print-only Accountant Summary Section */}
      <div className="print-only hidden print:block space-y-4 pt-6 border-t border-slate-300 text-slate-900">
        <div className="text-center pb-4 border-b">
          <h2 className="text-xl font-bold">{settings?.businessName || 'DR FILMS'}</h2>
          <p className="text-sm">GSTIN: {settings?.gstin || 'Unregistered'} • Phone: {settings?.phone || '—'}</p>
          <p className="text-sm font-semibold mt-1">MONTHLY ACCOUNTANT REPORT: {periodInfo.label}</p>
        </div>

        <table className="w-full text-xs border border-collapse">
          <tbody>
            <tr className="border-b"><td className="p-2 font-bold">Total Billed:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.totalBilled, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Taxable Subtotal:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.subtotalBilled, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">GST Output Collected:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.gstCollected, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Payments Received:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.paymentsReceived, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Pending Receivables:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.pendingReceivables, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Refunds:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.refunds, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Operating Expenses:</td><td className="p-2 text-right">{formatCurrency(reportData.summary.expenses, sym)}</td></tr>
            <tr className="border-b"><td className="p-2 font-bold">Net Profit:</td><td className="p-2 text-right font-bold">{formatCurrency(reportData.summary.netProfit, sym)}</td></tr>
          </tbody>
        </table>

        {/* Print-only Event Type Breakdown */}
        {reportData.incomeByEventType && reportData.incomeByEventType.length > 0 && (
          <div className="pt-4">
            <h3 className="text-xs font-bold uppercase mb-2">Income & Bills by Event / Shoot Type</h3>
            <table className="w-full text-xs border border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b">
                  <th className="p-1.5 border text-left">Event Type</th>
                  <th className="p-1.5 border text-center">Bills Count</th>
                  <th className="p-1.5 border text-right">Total Billed</th>
                  <th className="p-1.5 border text-right">Total Received</th>
                  <th className="p-1.5 border text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {reportData.incomeByEventType.map((e, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-1.5 border font-semibold">{e.eventType}</td>
                    <td className="p-1.5 border text-center">{e.billsCount}</td>
                    <td className="p-1.5 border text-right">{formatCurrency(e.totalBilled, sym)}</td>
                    <td className="p-1.5 border text-right">{formatCurrency(e.totalReceived, sym)}</td>
                    <td className="p-1.5 border text-right">{formatCurrency(e.balanceDue, sym)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
