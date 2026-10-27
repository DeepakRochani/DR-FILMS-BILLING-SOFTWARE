import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  Mail, 
  Building2, 
  MapPin, 
  Edit2, 
  Trash2, 
  Receipt, 
  ArrowRight,
  ExternalLink,
  History,
  FileText,
  Tag,
  BellOff,
  Lock
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { ClientStatementModal } from '../components/ClientStatementModal';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

const CLIENT_TAG_STYLES = {
  'VIP': 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-sm shadow-amber-500/10',
  'Corporate': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'Studio/Partner': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Regular': 'bg-slate-800/80 text-slate-300 border-slate-700/80'
};

export function CustomersPage({ onViewInvoice, onNewInvoiceForCustomer, onGoToTrash }) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);

  const [tagFilter, setTagFilter] = useState('all');

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    notes: '',
    tag: 'Regular',
    privateNote: '',
    dontRemind: false
  });

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const sym = settings?.currencySymbol || '₹';

  // Live queries
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) || [];

  // Filter out soft-deleted records for active client directory
  const customers = allCustomers.filter(c => !c?.isDeleted);
  const invoices = allInvoices.filter(inv => !inv?.isDeleted);
  const deletedCustomerCount = allCustomers.filter(c => Boolean(c?.isDeleted)).length;

  // Group invoice stats by customer
  const customerStats = customers.reduce((acc, c) => {
    const custInvoices = invoices.filter(inv => Number(inv.customerId) === Number(c.id));
    const totalBilled = custInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
    const pendingInvoices = custInvoices.filter(inv =>
      inv.status !== 'draft' &&
      (inv.status === 'unpaid' || inv.status === 'partially_paid') &&
      (Number(inv.balanceDue) || 0) > 0
    );
    const totalPending = pendingInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0);

    let oldestUnpaidDate = null;
    if (pendingInvoices.length > 0) {
      const sortedPending = [...pendingInvoices].sort((a, b) => {
        const timeA = new Date(a.invoiceDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.invoiceDate || b.createdAt || 0).getTime();
        return timeA - timeB;
      });
      oldestUnpaidDate = sortedPending[0].invoiceDate || sortedPending[0].createdAt || null;
    }

    acc[c.id] = {
      count: custInvoices.length,
      totalBilled,
      balanceDue: totalPending,
      totalPending,
      oldestUnpaidDate,
      pendingCount: pendingInvoices.length,
      invoices: custInvoices
    };
    return acc;
  }, {});

  const filteredCustomers = customers.filter(c => {
    if (tagFilter !== 'all') {
      const clientTag = c.tag || 'Regular';
      if (clientTag !== tagFilter) return false;
    }
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.privateNote && c.privateNote.toLowerCase().includes(q));
  });

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      gstin: '',
      notes: '',
      tag: 'Regular',
      privateNote: '',
      dontRemind: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (c) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      company: c.company || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      gstin: c.gstin || '',
      notes: c.notes || '',
      tag: c.tag || 'Regular',
      privateNote: c.privateNote || c.notes || '',
      dontRemind: Boolean(c.dontRemind)
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const payload = {
      name: formData.name.trim(),
      company: formData.company.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      gstin: formData.gstin.trim(),
      notes: formData.privateNote.trim() || formData.notes.trim(),
      privateNote: formData.privateNote.trim(),
      tag: formData.tag || 'Regular',
      dontRemind: Boolean(formData.dontRemind)
    };

    if (editingCustomer) {
      await db.customers.update(editingCustomer.id, {
        ...payload,
        updatedAt: new Date().toISOString()
      });
    } else {
      await db.customers.add({
        ...payload,
        createdAt: new Date().toISOString()
      });
    }

    scheduleAutoSync(500);
    setIsModalOpen(false);
  };

  const handleDelete = async (id, name) => {
    const count = customerStats[id]?.count || 0;
    const msg = count > 0 
      ? `"${name}" has ${count} existing invoice(s). Move client to Trash? Historical invoices will retain client details.`
      : `Move client "${name}" to Trash?`;

    if (window.confirm(msg)) {
      await db.customers.update(id, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      scheduleAutoSync(500);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-400" />
            <span>Clients & Directory</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Maintain customer profiles, contact info, and track billing history.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {deletedCustomerCount > 0 && onGoToTrash && (
            <button
              type="button"
              onClick={onGoToTrash}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 font-medium text-xs py-2.5 px-3.5 rounded-xl border border-slate-700 transition-colors"
              title="View deleted clients in Trash"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Trash ({deletedCustomerCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/15 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Search and Tag Filter Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search clients by name, company, phone, email, or private note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {['all', 'Regular', 'VIP', 'Corporate', 'Studio/Partner'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTagFilter(t)}
                className={`text-xs px-3 py-2 rounded-xl font-medium whitespace-nowrap transition-colors border ${
                  tagFilter === t
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {t === 'all' ? 'All Clients' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customers List */}
      {filteredCustomers.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-300">No clients found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search || tagFilter !== 'all' ? 'Try clearing your filters or search query.' : 'Add your first creative client to start generating bills.'}
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold px-4 py-2 rounded-xl border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Client</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((c) => {
            const stats = customerStats[c.id] || { count: 0, totalBilled: 0, balanceDue: 0, invoices: [] };
            const clientTag = c.tag || 'Regular';

            return (
              <div
                key={c.id}
                className="glass-card rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-100 text-base truncate">
                          {c.name}
                        </h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CLIENT_TAG_STYLES[clientTag] || CLIENT_TAG_STYLES.Regular}`}>
                          {clientTag}
                        </span>
                        {c.dontRemind && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20" title="Payment reminders muted for this client">
                            <BellOff className="w-2.5 h-2.5" />
                            <span>Muted</span>
                          </span>
                        )}
                      </div>
                      {c.company && (
                        <p className="text-xs text-amber-400/90 font-medium flex items-center gap-1 mt-0.5 truncate">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span>{c.company}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="Edit Client"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="space-y-1.5 mt-3 text-xs text-slate-400">
                    {c.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-mono">{c.phone}</span>
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </p>
                    )}
                    {c.address && (
                      <p className="flex items-start gap-2 line-clamp-1 text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span>{c.address}</span>
                      </p>
                    )}
                  </div>

                  {/* Private note preview */}
                  {(c.privateNote || c.notes) && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400/80 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-semibold text-amber-400/90 block">Private Note</span>
                        <p className="text-slate-300 italic line-clamp-2 mt-0.5">{c.privateNote || c.notes}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Financial Summary & Actions */}
                <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Total Billed</span>
                      <span className="font-display font-semibold text-slate-200">
                        {formatCurrency(stats.totalBilled, sym)}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Total Pending</span>
                      <span className={`font-display font-semibold ${stats.totalPending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatCurrency(stats.totalPending, sym)}
                      </span>
                      {stats.oldestUnpaidDate && (
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                          Oldest: {formatDate(stats.oldestUnpaidDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryCustomer({ ...c, stats })}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    >
                      <History className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bills ({stats.count})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStatementCustomer(c)}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                      title="View & Download Client Statement"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      <span>Statement</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNewInvoiceForCustomer(c)}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 transition-colors"
                      title="New Bill for this client"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Bill</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Client Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Edit Client Profile' : 'Add New Client'}
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Client Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Aarav Sharma"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Company / Brand Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Apex Media Productions"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number (for WhatsApp)
              </label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="client@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                GSTIN / Tax ID
              </label>
              <input
                type="text"
                placeholder="27AABCA5566K1ZV"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Billing Address
              </label>
              <input
                type="text"
                placeholder="City, State, Zip"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Client Tag
              </label>
              <select
                value={formData.tag}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
              >
                <option value="Regular" className="bg-slate-900 text-slate-100">Regular</option>
                <option value="VIP" className="bg-slate-900 text-amber-300 font-semibold">VIP Client</option>
                <option value="Corporate" className="bg-slate-900 text-sky-300">Corporate</option>
                <option value="Studio/Partner" className="bg-slate-900 text-purple-300">Studio / Partner</option>
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="relative flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.dontRemind}
                  onChange={(e) => setFormData({ ...formData, dontRemind: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="select-none flex items-center gap-1.5 font-medium">
                  <BellOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Don't remind this client</span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Private Note (Internal Studio Only)</span>
              </label>
              <span className="text-[10px] text-slate-500">Never shown on bills or to client</span>
            </div>
            <textarea
              rows="2"
              placeholder="e.g. Prefers cinematic color LUTs, direct WhatsApp reminder only, discount approved by owner."
              value={formData.privateNote}
              onChange={(e) => setFormData({ ...formData, privateNote: e.target.value, notes: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-transform active:scale-95"
            >
              {editingCustomer ? 'Update Client' : 'Save Client'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Client Bill History Modal */}
      {historyCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setHistoryCustomer(null)}
          title={`Bill History — ${historyCustomer.name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            {/* Header statistics banner */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Invoices</span>
                <span className="font-display font-bold text-base text-slate-200">
                  {historyCustomer.stats.count}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Billed</span>
                <span className="font-display font-bold text-base text-slate-200">
                  {formatCurrency(historyCustomer.stats.totalBilled, sym)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Pending</span>
                <span className={`font-display font-bold text-base ${historyCustomer.stats.totalPending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {formatCurrency(historyCustomer.stats.totalPending, sym)}
                </span>
                {historyCustomer.stats.oldestUnpaidDate && (
                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                    Oldest: {formatDate(historyCustomer.stats.oldestUnpaidDate)}
                  </span>
                )}
              </div>
            </div>

            {/* Invoices list */}
            {historyCustomer.stats.invoices.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-500">
                No invoices recorded for this client yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {historyCustomer.stats.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-slate-200">
                          {formatInvoiceNumber(inv.invoiceNumber)}
                        </span>
                        <StatusBadge status={inv.status} size="sm" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Date: {formatDate(inv.invoiceDate)} {inv.dueDate ? `• Due: ${formatDate(inv.dueDate)}` : ''}
                      </p>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <span className="font-display font-bold text-sm text-slate-100 block">
                          {formatCurrency(inv.totalAmount, sym)}
                        </span>
                        {inv.balanceDue > 0 ? (
                          <span className="text-[11px] text-amber-400 font-medium">
                            Due: {formatCurrency(inv.balanceDue, sym)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-medium">
                            Paid in Full
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setHistoryCustomer(null);
                          onViewInvoice(inv.id);
                        }}
                        className="p-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 rounded-lg transition-colors"
                        title="View & Print Bill"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStatementCustomer(historyCustomer)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Statement</span>
              </button>

              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Client Statement Modal */}
      {statementCustomer && (
        <ClientStatementModal
          isOpen={!!statementCustomer}
          onClose={() => setStatementCustomer(null)}
          client={statementCustomer}
          allInvoices={allInvoices}
          settings={settings}
        />
      )}
    </div>
  );
}
