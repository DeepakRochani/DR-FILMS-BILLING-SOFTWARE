import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Trash2, 
  RotateCcw, 
  Receipt, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowLeft, 
  ShieldCheck,
  Calendar,
  Phone,
  Building2,
  ExternalLink,
  Wallet,
  Briefcase
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { scheduleAutoSync, recordPermanentlyDeletedInvoice } from '../utils/googleSheetsSync';
import { STAGE_CONFIG, PRIORITY_CONFIG } from '../utils/projectUtils';

export function TrashPage({ onBack, onViewInvoice, onGoToInvoices }) {
  const [activeSubTab, setActiveSubTab] = useState('invoices'); // 'invoices' | 'customers' | 'expenses' | 'projects'
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const sym = settings?.currencySymbol || '₹';

  // Live queries for deleted items
  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses?.toArray() || [], []) || [];
  const allProjects = useLiveQuery(() => db.projects?.toArray() || [], []) || [];

  const deletedInvoices = allInvoices.filter(inv => Boolean(inv?.isDeleted));
  const deletedCustomers = allCustomers.filter(c => Boolean(c?.isDeleted));
  const deletedExpenses = allExpenses.filter(exp => Boolean(exp?.isDeleted));
  const deletedProjects = allProjects.filter(p => Boolean(p?.isDeleted));

  // Sort newest deleted first
  deletedInvoices.sort((a, b) => new Date(b.deletedAt || b.updatedAt || 0) - new Date(a.deletedAt || a.updatedAt || 0));
  deletedCustomers.sort((a, b) => new Date(b.deletedAt || b.updatedAt || 0) - new Date(a.deletedAt || a.updatedAt || 0));
  deletedExpenses.sort((a, b) => new Date(b.deletedAt || b.updatedAt || b.date || 0) - new Date(a.deletedAt || a.updatedAt || a.date || 0));
  deletedProjects.sort((a, b) => new Date(b.deletedAt || b.updatedAt || 0) - new Date(a.deletedAt || a.updatedAt || 0));

  // Total amount in trash
  const trashTotalAmount = deletedInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);

  // Restore an invoice
  const handleRestoreInvoice = async (e, inv) => {
    e.stopPropagation();
    await db.invoices.update(inv.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    showToast(`Invoice ${formatInvoiceNumber(inv.invoiceNumber)} restored to active bills!`);
  };

  // Permanently delete an invoice
  const handlePermanentDeleteInvoice = async (e, inv) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete invoice ${formatInvoiceNumber(inv.invoiceNumber)} from this device?\n\nIt will be removed from the app only, and the Google Sheet copy stays as a permanent backup.`
    );
    if (!confirmed) return;

    await recordPermanentlyDeletedInvoice(inv);
    await db.invoices.delete(inv.id);
    scheduleAutoSync(500);
    showToast(`Invoice ${formatInvoiceNumber(inv.invoiceNumber)} permanently removed from device.`);
  };

  // Restore a customer
  const handleRestoreCustomer = async (e, cust) => {
    e.stopPropagation();
    await db.customers.update(cust.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    showToast(`Client "${cust.name}" restored to active directory!`);
  };

  // Permanently delete a customer
  const handlePermanentDeleteCustomer = async (e, cust) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete client "${cust.name}" from this device?\n\nHistorical bills referencing this client will retain their snapshot details.`
    );
    if (!confirmed) return;

    await db.customers.delete(cust.id);
    scheduleAutoSync(500);
    showToast(`Client "${cust.name}" permanently deleted.`);
  };

  // Restore an expense
  const handleRestoreExpense = async (e, exp) => {
    e.stopPropagation();
    await db.expenses.update(exp.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    showToast(`Expense of ${formatCurrency(exp.amount || 0, sym)} (${exp.category}) restored!`);
  };

  // Permanently delete an expense
  const handlePermanentDeleteExpense = async (e, exp) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete this expense (${exp.category} - ${formatCurrency(exp.amount || 0, sym)}) from this device?`
    );
    if (!confirmed) return;

    await db.expenses.delete(exp.id);
    scheduleAutoSync(500);
    showToast(`Expense permanently deleted.`);
  };

  // Restore a project
  const handleRestoreProject = async (e, proj) => {
    e.stopPropagation();
    await db.projects.update(proj.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    showToast(`Project "${proj.title}" restored to active tracker!`);
  };

  // Permanently delete a project
  const handlePermanentDeleteProject = async (e, proj) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete project "${proj.title}" from this device?\n\nIt will be removed from the app tracker. Historical bills will retain their records.`
    );
    if (!confirmed) return;

    await db.projects.delete(proj.id);
    scheduleAutoSync(500);
    showToast(`Project "${proj.title}" permanently deleted.`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-500 text-slate-950 px-4 py-2.5 rounded-xl font-semibold shadow-xl shadow-emerald-500/20 text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
                <span>Trash & Recycle Bin</span>
                <span className="text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  {deletedInvoices.length + deletedCustomers.length + deletedExpenses.length + deletedProjects.length} items
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Items moved to Trash are excluded from receivables and reports, and safely preserved in your Google Sheets backup.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onGoToInvoices || onBack}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-2.5 px-4 rounded-xl border border-slate-700 transition-colors"
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>Back to Active Bills</span>
          </button>
        </div>
      </div>

      {/* Security & Backup Notice */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-slate-200 font-semibold">Google Sheets Safe Archive Guarantee</p>
          <p className="text-slate-400">
            Deleting records from DR FILMS never destroys your cloud archives. Deleted bills, projects, and expenses are preserved in your Google Sheet with audit flags.
          </p>
        </div>
      </div>

      {/* Sub-Tabs: Deleted Invoices vs Deleted Clients vs Deleted Expenses vs Deleted Projects */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('invoices')}
          className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium transition-colors border shrink-0 ${
            activeSubTab === 'invoices'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Deleted Bills</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono">
            {deletedInvoices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('customers')}
          className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium transition-colors border shrink-0 ${
            activeSubTab === 'customers'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Deleted Clients</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono">
            {deletedCustomers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('expenses')}
          className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium transition-colors border shrink-0 ${
            activeSubTab === 'expenses'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Deleted Expenses</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono">
            {deletedExpenses.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('projects')}
          className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium transition-colors border shrink-0 ${
            activeSubTab === 'projects'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Deleted Projects</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono">
            {deletedProjects.length}
          </span>
        </button>
      </div>

      {/* INVOICES TRASH VIEW */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-4">
          {deletedInvoices.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
              <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-300">Trash is Empty</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No deleted bills in Trash. When you delete a bill, it moves here and stays safely archived in your Google Sheet.
              </p>
              <button
                type="button"
                onClick={onGoToInvoices || onBack}
                className="mt-4 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-4 py-2 rounded-xl transition-transform active:scale-95"
              >
                <span>View Active Bills</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedInvoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onViewInvoice && onViewInvoice(inv.id)}
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-rose-900/40 bg-rose-950/10 hover:border-rose-500/40 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Left Details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-100 group-hover:text-amber-400 transition-colors">
                        {formatInvoiceNumber(inv.invoiceNumber)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Deleted {inv.deletedAt ? `• ${formatDate(inv.deletedAt)}` : ''}
                      </span>
                      <span className="text-slate-500 text-xs">•</span>
                      <span className="text-xs text-slate-400 font-mono">
                        Date: {formatDate(inv.invoiceDate)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 truncate">
                      <h3 className="font-semibold text-slate-200 text-sm truncate">
                        {inv.customerSnapshot?.name || inv.customerName || 'Client'}
                      </h3>
                      {(inv.customerSnapshot?.company || inv.customerCompany) && (
                        <span className="text-xs text-slate-400 font-normal truncate">
                          ({inv.customerSnapshot?.company || inv.customerCompany})
                        </span>
                      )}
                    </div>

                    {/* Services preview */}
                    <p className="text-xs text-slate-500 truncate">
                      {(inv.items || []).map(item => `${item.name} (${item.quantityLabel || item.quantity || 1})`).join(', ') || 'No line items'}
                    </p>
                  </div>

                  {/* Right Actions & Amount */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-100 text-base sm:text-lg block">
                        {formatCurrency(inv.totalAmount || 0, sym)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 block">
                        Balance: {formatCurrency(inv.balanceDue || 0, sym)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => handleRestoreInvoice(e, inv)}
                        className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold text-xs py-1.5 px-3 rounded-xl transition-colors"
                        title="Restore invoice back to active bills"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePermanentDeleteInvoice(e, inv)}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs py-1.5 px-2.5 rounded-xl transition-colors"
                        title="Permanently delete from this device (Google Sheet copy stays)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CUSTOMERS TRASH VIEW */}
      {activeSubTab === 'customers' && (
        <div className="space-y-4">
          {deletedCustomers.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-300">No Deleted Clients</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No clients are currently in Trash.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedCustomers.map((cust) => (
                <div
                  key={cust.id}
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-rose-900/40 bg-rose-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-200 text-sm">{cust.name}</h3>
                      {cust.company && (
                        <span className="text-xs text-slate-400">({cust.company})</span>
                      )}
                      <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Deleted {cust.deletedAt ? `• ${formatDate(cust.deletedAt)}` : ''}
                      </span>
                    </div>
                    {cust.phone && (
                      <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{cust.phone}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleRestoreCustomer(e, cust)}
                      className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold text-xs py-1.5 px-3 rounded-xl transition-colors"
                      title="Restore client back to active directory"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handlePermanentDeleteCustomer(e, cust)}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs py-1.5 px-2.5 rounded-xl transition-colors"
                      title="Delete permanently from device"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EXPENSES TRASH VIEW */}
      {activeSubTab === 'expenses' && (
        <div className="space-y-4">
          {deletedExpenses.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
              <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-300">No Deleted Expenses</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No expense records are currently in Trash.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-rose-900/40 bg-rose-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700">
                        {exp.category || 'Expense'}
                      </span>
                      <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Deleted {exp.deletedAt ? `• ${formatDate(exp.deletedAt)}` : ''}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Date: {formatDate(exp.date)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-200 text-sm">
                        {exp.payee || 'Expense Record'}
                      </h4>
                      {exp.paymentMethod && (
                        <span className="text-xs text-slate-400 font-mono">
                          via {exp.paymentMethod}
                        </span>
                      )}
                    </div>

                    {exp.note && (
                      <p className="text-xs text-slate-400 italic truncate max-w-md">
                        "{exp.note}"
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="font-mono font-bold text-rose-300 text-base sm:text-lg block">
                        {formatCurrency(exp.amount || 0, sym)}
                      </span>
                      {Number(exp.gstAmount) > 0 && (
                        <span className="text-[10px] font-mono text-slate-500 block">
                          Incl. GST: {formatCurrency(exp.gstAmount, sym)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => handleRestoreExpense(e, exp)}
                        className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold text-xs py-1.5 px-3 rounded-xl transition-colors"
                        title="Restore expense back to active list"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePermanentDeleteExpense(e, exp)}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs py-1.5 px-2.5 rounded-xl transition-colors"
                        title="Delete permanently from device"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROJECTS TRASH VIEW */}
      {activeSubTab === 'projects' && (
        <div className="space-y-4">
          {deletedProjects.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
              <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-300">No Deleted Projects</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No project records are currently in Trash.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedProjects.map((proj) => {
                const clientName = allCustomers.find(c => c.id === proj.customerId)?.name || proj.clientSnapshotName || 'Client';
                const stageConf = STAGE_CONFIG[proj.stage] || STAGE_CONFIG['Booked'];
                const priorityConf = PRIORITY_CONFIG[proj.priority] || PRIORITY_CONFIG['Normal'];

                return (
                  <div
                    key={proj.id}
                    className="glass-card rounded-2xl p-4 sm:p-5 border border-rose-900/40 bg-rose-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stageConf?.color || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                          {stageConf?.label || proj.stage || 'Booked'}
                        </span>
                        {priorityConf && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${priorityConf.color}`}>
                            {priorityConf.label}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          Deleted {proj.deletedAt ? `• ${formatDate(proj.deletedAt)}` : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-200 text-sm">
                          {proj.title || 'Untitled Project'}
                        </h4>
                        <span className="text-xs text-slate-400 font-mono">
                          • {clientName}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                        {proj.eventType && (
                          <span>Type: {proj.eventType}</span>
                        )}
                        {proj.eventDate && (
                          <span>Shoot: {formatDate(proj.eventDate)}</span>
                        )}
                        {proj.deliveryDueDate && (
                          <span>Due: {formatDate(proj.deliveryDueDate)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRestoreProject(e, proj)}
                        className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold text-xs py-1.5 px-3 rounded-xl transition-colors"
                        title="Restore project back to active tracker"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePermanentDeleteProject(e, proj)}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 text-xs py-1.5 px-2.5 rounded-xl transition-colors"
                        title="Delete permanently from device"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
