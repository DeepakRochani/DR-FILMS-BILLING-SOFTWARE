import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Wallet, 
  Plus, 
  Search, 
  Calendar, 
  Tag, 
  Trash2, 
  Edit3, 
  Repeat, 
  Image as ImageIcon, 
  Check, 
  X, 
  AlertCircle, 
  DollarSign, 
  Download, 
  ExternalLink,
  ChevronDown,
  Layers,
  Settings2,
  Paperclip,
  CheckCircle2
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { Modal } from '../components/Modal';
import { compressReceiptImage } from '../utils/imageCompression';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Equipment',
  'Rent',
  'Salary and Freelancers',
  'Travel',
  'Printing Material',
  'Software and Subscriptions',
  'Marketing',
  'Electricity and Internet',
  'Repair and Maintenance',
  'Other'
];

export const PAYMENT_METHODS = [
  'UPI',
  'Bank Transfer',
  'Cash',
  'Credit Card',
  'Debit Card',
  'Cheque',
  'Other'
];

export const DEFAULT_RECURRING_TEMPLATES = [
  { category: 'Rent', payee: 'Studio Space Rent', amount: 15000, paymentMethod: 'Bank Transfer', gstPaid: 0, note: 'Monthly studio rent' },
  { category: 'Electricity and Internet', payee: 'Internet & Power Utilities', amount: 3500, paymentMethod: 'UPI', gstPaid: 630, note: 'Office high-speed fiber & electric bill' },
  { category: 'Software and Subscriptions', payee: 'Cloud Storage & Creative Suite', amount: 4500, paymentMethod: 'Credit Card', gstPaid: 810, note: 'Adobe CC / Premiere / Backup storage' }
];

export function ExpensesPage() {
  const currentDate = new Date();
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'Equipment',
    amount: '',
    gstPaid: '',
    payee: '',
    paymentMethod: 'UPI',
    note: '',
    customerId: '',
    invoiceId: '',
    isRecurring: false,
    receiptPhoto: null
  });

  const [receiptUploading, setReceiptUploading] = useState(false);
  const [newCustomCategory, setNewCustomCategory] = useState('');

  // Live queries
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const categoriesSetting = useLiveQuery(() => db.settings.get('expense_categories'));
  const recurringTemplatesSetting = useLiveQuery(() => db.settings.get('recurring_expense_templates'));
  const rawExpenses = useLiveQuery(async () => {
    try {
      if (db.expenses) {
        return await db.expenses.toArray();
      }
      return [];
    } catch {
      return [];
    }
  }, []) || [];

  const customers = useLiveQuery(async () => {
    const list = await db.customers.toArray();
    return list.filter(c => !c.isDeleted);
  }, []) || [];

  const invoices = useLiveQuery(async () => {
    const list = await db.invoices.toArray();
    return list.filter(inv => !inv.isDeleted && inv.status !== 'cancelled');
  }, []) || [];

  const sym = settings?.currencySymbol || '₹';

  // Resolved categories list
  const categories = useMemo(() => {
    return categoriesSetting?.items && Array.isArray(categoriesSetting.items) && categoriesSetting.items.length > 0
      ? categoriesSetting.items
      : DEFAULT_EXPENSE_CATEGORIES;
  }, [categoriesSetting]);

  // Recurring templates list
  const recurringTemplates = useMemo(() => {
    return recurringTemplatesSetting?.items && Array.isArray(recurringTemplatesSetting.items)
      ? recurringTemplatesSetting.items
      : DEFAULT_RECURRING_TEMPLATES;
  }, [recurringTemplatesSetting]);

  // Active (non-deleted) expenses
  const activeExpenses = useMemo(() => {
    return rawExpenses.filter(e => !e.isDeleted);
  }, [rawExpenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return activeExpenses.filter(exp => {
      // Month filter
      if (selectedMonth && exp.date) {
        if (!exp.date.startsWith(selectedMonth)) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && exp.category !== selectedCategory) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPayee = (exp.payee || '').toLowerCase().includes(q);
        const matchesCategory = (exp.category || '').toLowerCase().includes(q);
        const matchesNote = (exp.note || '').toLowerCase().includes(q);
        const matchesMethod = (exp.paymentMethod || '').toLowerCase().includes(q);
        if (!matchesPayee && !matchesCategory && !matchesNote && !matchesMethod) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeExpenses, selectedMonth, selectedCategory, searchQuery]);

  // Monthly totals
  const monthlyTotals = useMemo(() => {
    let total = 0;
    let gstTotal = 0;
    filteredExpenses.forEach(e => {
      total += (Number(e.amount) || 0);
      gstTotal += (Number(e.gstPaid) || 0);
    });
    return {
      total: Math.round(total * 100) / 100,
      gstTotal: Math.round(gstTotal * 100) / 100,
      count: filteredExpenses.length
    };
  }, [filteredExpenses]);

  // Client lookup
  const clientMap = useMemo(() => {
    const map = new Map();
    customers.forEach(c => map.set(c.id, c.name || c.company || 'Client'));
    return map;
  }, [customers]);

  // Invoice lookup
  const invoiceMap = useMemo(() => {
    const map = new Map();
    invoices.forEach(inv => map.set(inv.id, inv.invoiceNumber));
    return map;
  }, [invoices]);

  // Open modal for new expense
  const handleOpenNew = () => {
    setEditingExpense(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: categories[0] || 'Equipment',
      amount: '',
      gstPaid: '',
      payee: '',
      paymentMethod: 'UPI',
      note: '',
      customerId: '',
      invoiceId: '',
      isRecurring: false,
      receiptPhoto: null
    });
    setIsExpenseModalOpen(true);
  };

  // Open modal for editing expense
  const handleOpenEdit = (exp) => {
    setEditingExpense(exp);
    setFormData({
      date: exp.date || new Date().toISOString().split('T')[0],
      category: exp.category || 'Equipment',
      amount: exp.amount || '',
      gstPaid: exp.gstPaid || '',
      payee: exp.payee || '',
      paymentMethod: exp.paymentMethod || 'UPI',
      note: exp.note || '',
      customerId: exp.customerId ? String(exp.customerId) : '',
      invoiceId: exp.invoiceId ? String(exp.invoiceId) : '',
      isRecurring: Boolean(exp.isRecurring),
      receiptPhoto: exp.receiptPhoto || null
    });
    setIsExpenseModalOpen(true);
  };

  // Handle Receipt Photo upload
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setReceiptUploading(true);
      const compressed = await compressReceiptImage(file, 800, 0.8);
      setFormData(prev => ({
        ...prev,
        receiptPhoto: compressed.dataUrl
      }));
    } catch (err) {
      console.error('Failed to compress receipt image:', err);
      alert('Could not process receipt image: ' + err.message);
    } finally {
      setReceiptUploading(false);
    }
  };

  // Submit expense
  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!formData.amount || Number(formData.amount) <= 0) {
      alert('Please enter a valid expense amount');
      return;
    }

    const payload = {
      date: formData.date,
      category: formData.category,
      amount: Math.round(Number(formData.amount) * 100) / 100,
      gstPaid: formData.gstPaid ? Math.round(Number(formData.gstPaid) * 100) / 100 : 0,
      payee: (formData.payee || '').trim(),
      paymentMethod: formData.paymentMethod,
      note: (formData.note || '').trim(),
      customerId: formData.customerId ? Number(formData.customerId) : null,
      invoiceId: formData.invoiceId ? Number(formData.invoiceId) : null,
      clientName: formData.customerId ? clientMap.get(Number(formData.customerId)) || '' : '',
      isRecurring: Boolean(formData.isRecurring),
      receiptPhoto: formData.receiptPhoto,
      isDeleted: false,
      updatedAt: new Date().toISOString()
    };

    if (editingExpense) {
      await db.expenses.update(editingExpense.id, payload);
    } else {
      payload.createdAt = new Date().toISOString();
      await db.expenses.add(payload);
    }

    scheduleAutoSync(500);
    setIsExpenseModalOpen(false);
  };

  // Soft Delete expense (moves to Trash)
  const handleDeleteExpense = async (exp) => {
    if (!window.confirm(`Move expense of ${formatCurrency(exp.amount, sym)} to Trash?`)) {
      return;
    }

    await db.expenses.update(exp.id, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    scheduleAutoSync(500);
  };

  // State for Recurring Confirmation Modal
  const [recurringSelections, setRecurringSelections] = useState([]);

  const handleOpenRecurringModal = () => {
    // Check which recurring expenses already exist for selectedMonth
    const targetMonth = selectedMonth || currentMonthStr;
    const existingInMonth = activeExpenses.filter(e => e.date && e.date.startsWith(targetMonth) && e.isRecurring);

    const initial = recurringTemplates.map((t, idx) => {
      const alreadyAdded = existingInMonth.some(e => e.payee === t.payee && e.category === t.category);
      return {
        id: idx,
        category: t.category,
        payee: t.payee,
        amount: t.amount,
        paymentMethod: t.paymentMethod || 'UPI',
        gstPaid: t.gstPaid || 0,
        note: t.note || '',
        selected: !alreadyAdded,
        alreadyAdded
      };
    });

    setRecurringSelections(initial);
    setIsRecurringModalOpen(true);
  };

  // Confirm and insert recurring expenses
  const handleConfirmRecurring = async () => {
    const targetMonth = selectedMonth || currentMonthStr;
    const dateToUse = `${targetMonth}-01`;
    const toCreate = recurringSelections.filter(s => s.selected);

    if (toCreate.length === 0) {
      alert('No recurring expenses selected to create.');
      return;
    }

    const now = new Date().toISOString();
    const records = toCreate.map(item => ({
      date: dateToUse,
      category: item.category,
      amount: Math.round(Number(item.amount) * 100) / 100,
      gstPaid: Math.round(Number(item.gstPaid || 0) * 100) / 100,
      payee: item.payee,
      paymentMethod: item.paymentMethod,
      note: item.note ? `${item.note} (${targetMonth})` : `Monthly recurring (${targetMonth})`,
      isRecurring: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    }));

    await db.expenses.bulkAdd(records);
    scheduleAutoSync(500);
    setIsRecurringModalOpen(false);
  };

  // Add custom category
  const handleAddCategory = async () => {
    const trimmed = newCustomCategory.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      alert('Category already exists');
      return;
    }

    const updated = [...categories, trimmed];
    await db.settings.put({
      key: 'expense_categories',
      items: updated
    });
    setNewCustomCategory('');
  };

  // Delete category
  const handleDeleteCategory = async (catToDelete) => {
    if (categories.length <= 1) {
      alert('You must have at least one category.');
      return;
    }
    if (!window.confirm(`Remove category "${catToDelete}" from available options? Existing expenses will retain it.`)) {
      return;
    }
    const updated = categories.filter(c => c !== catToDelete);
    await db.settings.put({
      key: 'expense_categories',
      items: updated
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display text-slate-100 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-amber-400" />
              <span>Business Expenses</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
              Job Costing & P&L
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Track operational spending, equipment purchases, recurring rent/software, and receipt photos.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleOpenRecurringModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Review and add this month's recurring expenses (rent, internet, software)"
          >
            <Repeat className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Recurring</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCategoriesModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Edit default expense categories"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Categories</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 rounded-2xl border border-slate-800/80 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search payee, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500"
            />
          </div>

          {/* Month Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full glass-input px-3 py-2 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100 font-mono"
            />
            {selectedMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth('')}
                className="text-[11px] text-slate-500 hover:text-slate-300 whitespace-nowrap"
              >
                All
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full glass-input px-3 py-2 rounded-xl text-xs bg-slate-900 border-slate-700 text-slate-100"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Monthly Total Summary Banner */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Filtered Total</span>
              <span className="font-display font-bold text-sm text-cyan-300">
                {formatCurrency(monthlyTotals.total, sym)}
              </span>
            </div>
            {monthlyTotals.gstTotal > 0 && (
              <div className="text-right">
                <span className="text-[10px] text-purple-400 uppercase tracking-wider block">GST Paid</span>
                <span className="font-mono text-xs text-purple-300">
                  {formatCurrency(monthlyTotals.gstTotal, sym)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Wallet className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">No expenses found matching the selected filters.</p>
            <button
              type="button"
              onClick={handleOpenNew}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Record First Expense
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Payee / Vendor</th>
                  <th className="py-3 px-3">Method</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-3 text-right">GST Paid</th>
                  <th className="py-3 px-4">Job / Client</th>
                  <th className="py-3 px-3 text-center">Receipt</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatDate(exp.date)}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                        {exp.category}
                      </span>
                      {exp.isRecurring && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold" title="Recurring Monthly Expense">
                          Recurring
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                      <div>{exp.payee || '—'}</div>
                      {exp.note && (
                        <div className="text-[11px] text-slate-400 font-normal">{exp.note}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans">
                      {exp.paymentMethod || 'Cash'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-cyan-300">
                      {formatCurrency(exp.amount, sym)}
                    </td>
                    <td className="py-3 px-3 text-right text-purple-300">
                      {exp.gstPaid ? formatCurrency(exp.gstPaid, sym) : '—'}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-400 text-[11px]">
                      {exp.customerId ? (
                        <span className="text-amber-400/90 font-medium">
                          {clientMap.get(exp.customerId) || `Client #${exp.customerId}`}
                        </span>
                      ) : exp.invoiceId ? (
                        <span className="text-sky-400 font-mono">
                          {formatInvoiceNumber(invoiceMap.get(exp.invoiceId) || exp.invoiceId)}
                        </span>
                      ) : (
                        <span className="text-slate-600">General</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {exp.receiptPhoto ? (
                        <button
                          type="button"
                          onClick={() => setViewingReceipt(exp)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors inline-flex items-center gap-1"
                          title="View Receipt Photo"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Photo</span>
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px]">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(exp)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Expense"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp)}
                          className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                          title="Move to Trash"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 font-mono font-bold text-slate-100 border-t-2 border-slate-700">
                <tr>
                  <td colSpan={4} className="py-3 px-4 font-sans uppercase text-[11px] text-slate-400">Total</td>
                  <td className="py-3 px-4 text-right text-cyan-400">
                    {formatCurrency(monthlyTotals.total, sym)}
                  </td>
                  <td className="py-3 px-3 text-right text-purple-400">
                    {formatCurrency(monthlyTotals.gstTotal, sym)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={editingExpense ? 'Edit Expense Record' : 'Record Business Expense'}
      >
        <form onSubmit={handleSubmitExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Category *
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs bg-slate-900 text-slate-100"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Amount ({sym}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm font-mono font-bold text-cyan-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                GST Paid ({sym}) (Optional Input Tax)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.gstPaid}
                onChange={(e) => setFormData({ ...formData, gstPaid: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs font-mono text-purple-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Vendor / Payee Name
              </label>
              <input
                type="text"
                placeholder="e.g. Sony Center, Landlord, Freelance Editor"
                value={formData.payee}
                onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs bg-slate-900 text-slate-100"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Job Costing Link to Client or Invoice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Link to Client (Job Costing)
              </label>
              <select
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs bg-slate-900 text-slate-100"
              >
                <option value="">None (General Overhead)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Link to Specific Bill (Optional)
              </label>
              <select
                value={formData.invoiceId}
                onChange={(e) => setFormData({ ...formData, invoiceId: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs bg-slate-900 text-slate-100"
              >
                <option value="">None</option>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {formatInvoiceNumber(inv.invoiceNumber)} — {formatDate(inv.invoiceDate)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Note / Description
            </label>
            <input
              type="text"
              placeholder="e.g. Memory cards and battery replacement for wedding shoot"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-xs"
            />
          </div>

          {/* Receipt Photo Upload */}
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                <span>Receipt Photo (Stored compressed, max 800px)</span>
              </span>
              {formData.receiptPhoto && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptPhoto: null }))}
                  className="text-[11px] text-rose-400 hover:text-rose-300"
                >
                  Remove Photo
                </button>
              )}
            </div>

            {formData.receiptPhoto ? (
              <div className="flex items-center gap-3">
                <img
                  src={formData.receiptPhoto}
                  alt="Receipt Preview"
                  className="w-16 h-16 object-cover rounded-lg border border-slate-700"
                />
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Compressed receipt attached</span>
                </span>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                disabled={receiptUploading}
                className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
            )}
            {receiptUploading && (
              <p className="text-[10px] text-amber-400 animate-pulse">Compressing receipt image to 800px...</p>
            )}
          </div>

          {/* Recurring Expense Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
            />
            <span className="text-xs text-slate-300 font-medium">
              Mark as Monthly Recurring Expense template
            </span>
          </label>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              {editingExpense ? 'Save Changes' : 'Record Expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal for Recurring Expenses */}
      <Modal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        title="Add This Month's Recurring Expenses"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            Review and confirm the recurring operational expenditures for <strong className="text-amber-400">{selectedMonth || currentMonthStr}</strong>. Entries will only be created upon your explicit confirmation.
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {recurringSelections.map((item, idx) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-colors ${
                  item.selected ? 'bg-slate-900/90 border-amber-500/30' : 'bg-slate-900/40 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => {
                      const updated = [...recurringSelections];
                      updated[idx].selected = e.target.checked;
                      setRecurringSelections(updated);
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                  />

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{item.payee}</span>
                      <span className="text-xs font-bold font-mono text-cyan-300">
                        {formatCurrency(item.amount, sym)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{item.category}</span>
                      <span>• {item.paymentMethod}</span>
                      {item.gstPaid > 0 && <span>• GST: {formatCurrency(item.gstPaid, sym)}</span>}
                    </div>

                    {item.alreadyAdded && (
                      <span className="inline-block mt-1 text-[10px] text-amber-400">
                        * Already recorded once this month
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              Selected Total: <strong className="text-cyan-300">
                {formatCurrency(
                  recurringSelections.filter(s => s.selected).reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
                  sym
                )}
              </strong>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRecurringModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRecurring}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Confirm & Create ({recurringSelections.filter(s => s.selected).length})
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Categories Management Modal */}
      <Modal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        title="Manage Expense Categories"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add new category..."
              value={newCustomCategory}
              onChange={(e) => setNewCustomCategory(e.target.value)}
              className="flex-1 glass-input px-3.5 py-2 rounded-xl text-xs"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
            >
              Add
            </button>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {categories.map((cat) => (
              <div
                key={cat}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs"
              >
                <span className="text-slate-200">{cat}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Remove category"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsCategoriesModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Receipt Photo Viewer Modal */}
      {viewingReceipt && (
        <Modal
          isOpen={!!viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          title={`Receipt: ${viewingReceipt.payee || viewingReceipt.category} (${formatDate(viewingReceipt.date)})`}
        >
          <div className="space-y-4">
            <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center">
              <img
                src={viewingReceipt.receiptPhoto}
                alt="Receipt"
                className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono font-bold text-cyan-300">
                Amount: {formatCurrency(viewingReceipt.amount, sym)}
              </span>

              <a
                href={viewingReceipt.receiptPhoto}
                download={`Receipt-${viewingReceipt.date}-${viewingReceipt.id}.jpg`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Photo</span>
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
