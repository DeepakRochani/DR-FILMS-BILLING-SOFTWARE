import React from 'react';
import { 
  X, 
  Printer, 
  Share2, 
  FileText, 
  Calendar, 
  Building, 
  Phone, 
  Mail, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Clapperboard,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { sendWhatsAppMessage } from '../utils/whatsapp';

export function QuoteViewModal({ isOpen, onClose, quote, settings, onConvertToInvoice }) {
  if (!isOpen || !quote) return null;

  const sym = settings?.currencySymbol || '₹';
  const clientName = quote.customerSnapshot?.name || 'Valued Client';
  const clientPhone = quote.customerSnapshot?.phone || '';
  const clientCompany = quote.customerSnapshot?.company || '';
  const isDirect = Boolean(quote.isDirectClient);
  const isWedding = Boolean(quote?.eventType && quote.eventType.toLowerCase().includes('wedding'));

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const itemsSummary = (quote.items || [])
      .map((it, idx) => {
        if (isWedding) {
          return `${idx + 1}. ${it.description} — Rate: ${formatCurrency(it.rate, sym)}`;
        }
        return `${idx + 1}. ${it.description} (Qty: ${it.quantity} ${it.unit || ''}) — ${formatCurrency(it.amount, sym)}`;
      })
      .join('\n');

    const message = `Hello ${clientName},

Greetings from ${settings?.businessName || 'DR FILMS'}!

Here is the formal production quotation *${formatInvoiceNumber(quote.quoteNumber)}* for your upcoming ${quote.eventType || 'production shoot'}.

ESTIMATE SUMMARY:
Quote No: ${formatInvoiceNumber(quote.quoteNumber)}
Date: ${formatDate(quote.quoteDate)}
Validity: Valid until ${quote.expiryDate ? formatDate(quote.expiryDate) : '15 days'}
Event / Shoot: ${quote.eventType || 'Media Production'}${quote.eventDate ? ` (${formatDate(quote.eventDate)})` : ''}

KEY DELIVERABLES:
${itemsSummary || 'Standard Media Production Package'}

Total Estimated Investment: ${formatCurrency(quote.totalAmount, sym)}

Please review the proposal. We would love to capture your special project. Feel free to contact us with any questions or customizations.

Warm regards,
${settings?.businessName || 'DR FILMS'}
Phone: ${settings?.phone || ''}
${settings?.email ? `Email: ${settings.email}` : ''}`;

    sendWhatsAppMessage({
      phone: clientPhone,
      text: message,
      mode: settings?.whatsappMode || 'auto',
      defaultCountryCode: settings?.defaultCountryCode || '91'
    });
  };

  const isExpired = quote.expiryDate && new Date(quote.expiryDate) < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-4 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Top Header Actions (Hidden when printing) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-slate-100 text-sm tabular-nums">
                  {formatInvoiceNumber(quote.quoteNumber)}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  quote.status === 'converted' 
                    ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                    : quote.status === 'accepted'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : isExpired
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}>
                  {quote.status === 'converted' ? 'Converted to Invoice' : isExpired ? 'Expired' : (quote.status || 'Draft')}
                </span>
              </div>
              <p className="text-xs text-slate-400">Formal Production Proposal & Cost Estimate</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quote.status !== 'converted' && onConvertToInvoice && (
              <button
                type="button"
                onClick={() => onConvertToInvoice(quote)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                title="Convert this Estimate directly into an active Invoice"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Convert to Invoice</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              title="Print Estimate"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Share Quote on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Estimate Paper Container */}
        <div 
          id="quote-paper"
          className="bg-white text-slate-900 rounded-2xl shadow-xl p-6 sm:p-10 border border-slate-200 font-sans print:p-0 print:border-none print:shadow-none print:m-0"
        >
          {/* Top Gold Accent Line */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 rounded-full mb-6" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6 border-b-2 border-slate-900">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt={settings.businessName} className="w-12 h-12 object-contain rounded-lg" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-amber-400 font-bold">
                    <Clapperboard className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h1 className="font-display font-extrabold text-2xl tracking-tight text-slate-950">
                    {settings?.businessName || 'DR FILMS'}
                  </h1>
                  <p className="text-xs font-medium text-slate-600">
                    {settings?.tagline || 'Creative Services & Film Studio'}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-0.5 pt-1">
                {settings?.ownerName && (
                  <p className="font-medium text-slate-800">
                    <span className="text-slate-500">Owner:</span> <strong className="font-semibold text-slate-900">{settings.ownerName}</strong>
                  </p>
                )}
                {settings?.address && <p>{settings.address}</p>}
                <p>
                  {settings?.phone && <span>Phone: {settings.phone}</span>}
                  {settings?.email && <span className="ml-2">• {settings.email}</span>}
                </p>
                {settings?.gstin && (
                  <p className="font-semibold text-slate-800 tracking-wider">GSTIN: {settings.gstin}</p>
                )}
              </div>
            </div>

            <div className="sm:text-right space-y-1 shrink-0">
              <div className="inline-block bg-slate-950 text-amber-400 font-display font-bold text-xs uppercase px-3 py-1 rounded tracking-widest mb-1 shadow-sm">
                FORMAL ESTIMATE / QUOTATION
              </div>
              <div className="text-xl font-display font-black text-slate-950 tracking-tight tabular-nums">
                #{formatInvoiceNumber(quote.quoteNumber)}
              </div>
              <div className="text-xs text-slate-600 space-y-0.5">
                <p>
                  <span className="font-medium text-slate-500">Date:</span>{' '}
                  <span className="font-semibold text-slate-800">{formatDate(quote.quoteDate)}</span>
                </p>
                <p>
                  <span className="font-medium text-slate-500">Valid Until:</span>{' '}
                  <span className="font-semibold text-slate-800">{quote.expiryDate ? formatDate(quote.expiryDate) : '15 days from issue'}</span>
                </p>
                {quote.eventType && (
                  <p>
                    <span className="font-medium text-slate-500">Event:</span>{' '}
                    <span className="font-semibold text-slate-800">{quote.eventType}</span>
                  </p>
                )}
                {quote.eventDate && (
                  <p>
                    <span className="font-medium text-slate-500">Shoot Date:</span>{' '}
                    <span className="font-semibold text-slate-800">{formatDate(quote.eventDate)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Client & Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                PREPARED FOR:
              </span>
              <h3 className="font-display font-bold text-base text-slate-900">
                {clientName}
              </h3>
              {clientCompany && (
                <p className="text-xs font-medium text-slate-700 mt-0.5">{clientCompany}</p>
              )}
              {clientPhone && (
                <p className="text-xs text-slate-600 mt-0.5">Phone: {clientPhone}</p>
              )}
              {quote.customerSnapshot?.email && (
                <p className="text-xs text-slate-600 mt-0.5">Email: {quote.customerSnapshot.email}</p>
              )}
              {quote.customerSnapshot?.address && (
                <p className="text-xs text-slate-600 mt-0.5">{quote.customerSnapshot.address}</p>
              )}
            </div>

            <div className="sm:text-right flex flex-col sm:items-end justify-center">
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 inline-block text-left w-full sm:w-auto">
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                  ESTIMATED TOTAL INVESTMENT
                </span>
                <div className="font-display font-extrabold text-2xl text-slate-950 tabular-nums mt-0.5">
                  {formatCurrency(quote.totalAmount, sym)}
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Includes all listed production services, deliverables & licensing
                </p>
              </div>
            </div>
          </div>

          {/* Services Table */}
          <div className="py-6">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 text-slate-800 uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="py-2.5 pr-2 w-8">#</th>
                  <th className="py-2.5 px-2">Scope of Services & Deliverables</th>
                  {!isWedding && <th className="py-2.5 px-2 text-center w-20">Unit</th>}
                  <th className={`py-2.5 px-2 text-right ${isWedding ? 'w-28' : 'w-24'}`}>Rate</th>
                  {!isWedding && <th className="py-2.5 px-2 text-center w-16">Qty</th>}
                  <th className={`py-2.5 pl-2 text-right ${isWedding ? 'w-32' : 'w-28'}`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {(quote.items || []).map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3 pr-2 text-slate-400 text-[11px] tabular-nums font-semibold">{idx + 1}</td>
                    <td className="py-3 px-2">
                      <div className="font-semibold text-slate-900">{item.description}</div>
                      {item.notes && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.notes}</div>
                      )}
                    </td>
                    {!isWedding && <td className="py-3 px-2 text-center text-slate-500">{item.unit || 'unit'}</td>}
                    <td className="py-3 px-2 text-right tabular-nums font-medium">{formatCurrency(item.rate, sym)}</td>
                    {!isWedding && <td className="py-3 px-2 text-center font-semibold tabular-nums">{item.quantity}</td>}
                    <td className="py-3 pl-2 text-right font-display font-bold text-slate-900 tabular-nums">
                      {formatCurrency(item.amount, sym)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Notes Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
            <div className="space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                TERMS & BOOKING CONDITIONS
              </span>
              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                <li>30% advance deposit confirms dates on the studio production schedule.</li>
                <li>Balance payable upon final delivery of master files and media assets.</li>
                <li>Quotation valid for 15 days from issue date.</li>
                <li>Includes up to 2 complimentary revision rounds on draft video edits.</li>
              </ul>
              {quote.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                  <span className="font-semibold block text-slate-900 mb-0.5">Custom Shoot Note:</span>
                  {quote.notes}
                </div>
              )}
            </div>

            <div className="sm:text-right space-y-2">
              <div className="flex justify-between sm:justify-end gap-6 text-xs text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(quote.subtotal || quote.totalAmount, sym)}
                </span>
              </div>
              {(quote.charges || []).map((ch, cIdx) => (
                <div key={cIdx} className="flex justify-between sm:justify-end gap-6 text-xs text-slate-600">
                  <span>{ch.name} ({ch.rate}%):</span>
                  <span className={`font-semibold tabular-nums ${ch.nature === 'discount' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {ch.nature === 'discount' ? '-' : '+'}{formatCurrency(ch.amount, sym)}
                  </span>
                </div>
              ))}
              {quote.taxAmount > 0 && (
                <div className="flex justify-between sm:justify-end gap-6 text-xs text-slate-600">
                  <span>GST ({quote.taxRate || 18}%):</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(quote.taxAmount, sym)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t-2 border-slate-900 flex justify-between sm:justify-end gap-6 text-sm font-bold text-slate-950">
                <span>Total Estimated Investment:</span>
                <span className="font-display text-base font-extrabold text-slate-950 tabular-nums">
                  {formatCurrency(quote.totalAmount, sym)}
                </span>
              </div>
            </div>
          </div>

          {/* Dual Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-12 mt-6 border-t border-slate-200">
            <div>
              <div className="h-14 border-b border-slate-300 w-44" />
              <p className="text-xs font-bold text-slate-900 mt-1 uppercase">Client Acceptance Signature</p>
              <p className="text-[10px] text-slate-500">Date:</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <div className="h-14 border-b border-slate-300 w-44" />
              <p className="text-xs font-bold text-slate-900 mt-1 uppercase">For {settings?.businessName || 'DR FILMS'}</p>
              <p className="text-[10px] text-slate-500">Authorized Signatory</p>
              {settings?.ownerName && <p className="text-[10px] text-slate-600 font-medium">({settings.ownerName})</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
