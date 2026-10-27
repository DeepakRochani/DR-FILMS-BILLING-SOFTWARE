import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileText, 
  Plus, 
  Search, 
  Sparkles, 
  Printer, 
  Share2, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Calendar,
  Building
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { sendWhatsAppMessage } from '../utils/whatsapp';
import { QuoteViewModal } from '../components/QuoteViewModal';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

export function QuotesPage({ onNewQuote, onEditQuote, onViewInvoice }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'draft' | 'sent' | 'accepted' | 'converted'
  const [selectedQuoteForView, setSelectedQuoteForView] = useState(null);

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const rawQuotes = useLiveQuery(() => db.quotes ? db.quotes.toArray() : [], []) || [];

  const sym = settings?.currencySymbol || '₹';

  // Active (non-deleted) quotes
  const activeQuotes = useMemo(() => {
    return rawQuotes.filter(q => !q.isDeleted);
  }, [rawQuotes]);

  // Statistics
  const stats = useMemo(() => {
    const total = activeQuotes.length;
    let convertedCount = 0;
    let convertedValue = 0;
    let pendingCount = 0;
    let pendingValue = 0;
    let totalPipelineValue = 0;

    activeQuotes.forEach(q => {
      const val = Number(q.totalAmount) || 0;
      totalPipelineValue += val;
      if (q.status === 'converted') {
        convertedCount++;
        convertedValue += val;
      } else if (q.status === 'sent' || q.status === 'accepted' || q.status === 'draft') {
        pendingCount++;
        pendingValue += val;
      }
    });

    return {
      total,
      convertedCount,
      convertedValue,
      pendingCount,
      pendingValue,
      totalPipelineValue
    };
  }, [activeQuotes]);

  // Filter & Search
  const filteredQuotes = useMemo(() => {
    return activeQuotes.filter(q => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'converted' && q.status !== 'converted') return false;
        if (statusFilter === 'sent' && q.status !== 'sent') return false;
        if (statusFilter === 'draft' && q.status !== 'draft') return false;
        if (statusFilter === 'accepted' && q.status !== 'accepted') return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const clientName = (q.customerSnapshot?.name || '').toLowerCase();
        const quoteNum = (q.quoteNumber || '').toLowerCase();
        const evType = (q.eventType || '').toLowerCase();
        if (!clientName.includes(query) && !quoteNum.includes(query) && !evType.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [activeQuotes, statusFilter, searchQuery]);

  // 1-Click Convert to Invoice
  const handleConvertToInvoice = async (quote) => {
    if (!window.confirm(`Convert Estimate ${formatInvoiceNumber(quote.quoteNumber)} into an active Tax Invoice?`)) {
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const prefix = settings?.invoicePrefix || 'DRF-';
      
      // Compute next invoice sequence
      const existingInvoices = await db.invoices.toArray();
      const maxSeq = existingInvoices.reduce((max, inv) => {
        const match = String(inv.invoiceNumber || '').match(/(\d+)$/);
        const seq = match ? parseInt(match[1], 10) : 0;
        return seq > max ? seq : max;
      }, 0);
      const nextSeq = maxSeq + 1;
      const invoiceNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

      const newInvoice = {
        invoiceNumber,
        customerId: quote.customerId || null,
        isDirectClient: Boolean(quote.isDirectClient),
        customerSnapshot: quote.customerSnapshot || {},
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: quote.eventDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        eventType: quote.eventType || 'Wedding',
        eventDate: quote.eventDate || null,
        items: quote.items || [],
        charges: quote.charges || [],
        subtotal: quote.subtotal || quote.totalAmount,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: quote.totalAmount,
        advancePaid: 0,
        balanceDue: quote.totalAmount,
        status: 'unpaid',
        payments: [],
        notes: quote.notes ? `Converted from Quote ${formatInvoiceNumber(quote.quoteNumber)}. ${quote.notes}` : `Converted from Quote ${formatInvoiceNumber(quote.quoteNumber)}`,
        terms: settings?.defaultTerms || '',
        convertedFromQuoteId: quote.id,
        isDeleted: false,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const newInvoiceId = await db.invoices.add(newInvoice);

      // Update quote status to converted
      await db.quotes.update(quote.id, {
        status: 'converted',
        convertedInvoiceId: newInvoiceId,
        convertedAt: nowIso,
        updatedAt: nowIso
      });

      scheduleAutoSync(500);

      if (selectedQuoteForView) {
        setSelectedQuoteForView(null);
      }

      if (onViewInvoice) {
        onViewInvoice(newInvoiceId);
      }
    } catch (err) {
      console.error('Failed to convert quote to invoice:', err);
      alert('Error converting quote to invoice.');
    }
  };

  // WhatsApp Share Quick
  const handleShareWhatsApp = (quote) => {
    const clientName = quote.customerSnapshot?.name || 'Client';
    const clientPhone = quote.customerSnapshot?.phone || '';
    const message = `Hello ${clientName},

Greetings from ${settings?.businessName || 'DR FILMS'}!

Here is your production estimate *${formatInvoiceNumber(quote.quoteNumber)}* for ${quote.eventType || 'production services'}.

Estimated Total Investment: ${formatCurrency(quote.totalAmount, sym)}
Valid Until: ${quote.expiryDate ? formatDate(quote.expiryDate) : '15 days'}

Please review the proposal. We look forward to capturing your shoot!
${settings?.businessName || 'DR FILMS'}
Phone: ${settings?.phone || ''}`;

    sendWhatsAppMessage({
      phone: clientPhone,
      text: message,
      mode: settings?.whatsappMode || 'auto',
      defaultCountryCode: settings?.defaultCountryCode || '91'
    });
  };

  // Delete Quote
  const handleDeleteQuote = async (quote) => {
    if (!window.confirm(`Delete Estimate ${formatInvoiceNumber(quote.quoteNumber)}?`)) return;
    await db.quotes.update(quote.id, {
      isDeleted: true,
      deletedAt: new Date().toISOString()
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* View Modal */}
      <QuoteViewModal
        isOpen={Boolean(selectedQuoteForView)}
        onClose={() => setSelectedQuoteForView(null)}
        quote={selectedQuoteForView}
        settings={settings}
        onConvertToInvoice={handleConvertToInvoice}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
                <span>Quotations & Estimates</span>
                <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                  {stats.total} Total
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Draft client cost estimates, track proposals, and convert into invoices with 1 click
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewQuote}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Create New Estimate</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
          <span className="text-xs text-slate-400 block font-medium">Pipeline Value</span>
          <div className="text-xl sm:text-2xl font-display font-bold text-slate-100 mt-1 font-mono">
            {formatCurrency(stats.totalPipelineValue, sym)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Across all proposals</span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
          <span className="text-xs text-slate-400 block font-medium">Pending / Active</span>
          <div className="text-xl sm:text-2xl font-display font-bold text-amber-400 mt-1 font-mono">
            {formatCurrency(stats.pendingValue, sym)}
          </div>
          <span className="text-[11px] text-amber-500/80 mt-1 block">{stats.pendingCount} active estimates</span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
          <span className="text-xs text-slate-400 block font-medium">Converted to Invoices</span>
          <div className="text-xl sm:text-2xl font-display font-bold text-purple-400 mt-1 font-mono">
            {formatCurrency(stats.convertedValue, sym)}
          </div>
          <span className="text-[11px] text-purple-400/80 mt-1 block">{stats.convertedCount} converted bookings</span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
          <span className="text-xs text-slate-400 block font-medium">Conversion Rate</span>
          <div className="text-xl sm:text-2xl font-display font-bold text-emerald-400 mt-1 font-mono">
            {stats.total > 0 ? `${Math.round((stats.convertedCount / stats.total) * 100)}%` : '0%'}
          </div>
          <span className="text-[11px] text-emerald-500/80 mt-1 block">Proposal success rate</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['all', 'draft', 'sent', 'converted'].map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                statusFilter === tab
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'all' ? 'All Estimates' : tab}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by client or quote #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Estimates Table */}
      {filteredQuotes.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-3xl border border-slate-800/60 space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="font-display font-bold text-slate-300 text-base">No estimates found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery ? 'No estimates match your search criteria.' : 'Create your first quotation to present elegant production proposals to clients.'}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={onNewQuote}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Estimate</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold bg-slate-950/60">
                  <th className="py-3 px-4">Quote No.</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Event & Shoot</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Estimate Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredQuotes.map(q => {
                  const isExpired = q.expiryDate && new Date(q.expiryDate) < new Date(new Date().setHours(0, 0, 0, 0));
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        {formatInvoiceNumber(q.quoteNumber)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{q.customerSnapshot?.name}</span>
                          {q.isDirectClient && (
                            <span className="text-[9px] bg-slate-800 text-slate-300 border border-slate-700 px-1 py-0.2 rounded">
                              Direct
                            </span>
                          )}
                        </div>
                        {q.customerSnapshot?.phone && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {q.customerSnapshot.phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">{q.eventType || 'Media Production'}</div>
                        {q.items && q.items.length > 0 && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {q.items[0]?.description} {q.items.length > 1 ? `+${q.items.length - 1} more` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        <div>Issue: <span className="text-slate-300 font-mono">{formatDate(q.quoteDate)}</span></div>
                        {q.expiryDate && (
                          <div className={`text-[11px] ${isExpired ? 'text-rose-400 font-medium' : 'text-slate-500'}`}>
                            Valid: <span className="font-mono">{formatDate(q.expiryDate)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-100 text-sm">
                        {formatCurrency(q.totalAmount, sym)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          q.status === 'converted'
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            : q.status === 'accepted'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : isExpired
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}>
                          {q.status === 'converted' ? 'Converted' : isExpired ? 'Expired' : (q.status || 'Draft')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {q.status !== 'converted' ? (
                            <button
                              type="button"
                              onClick={() => handleConvertToInvoice(q)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-all cursor-pointer"
                              title="1-Click Convert to Invoice"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              <span>Convert</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => q.convertedInvoiceId && onViewInvoice && onViewInvoice(q.convertedInvoiceId)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[11px] font-bold transition-all cursor-pointer"
                              title="View Converted Invoice"
                            >
                              <ArrowRight className="w-3 h-3 text-purple-400" />
                              <span>View Bill</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedQuoteForView(q)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                            title="View / Print Proposal"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(q)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Share Quote on WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditQuote(q.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                            title="Edit Estimate"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteQuote(q)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete Estimate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
