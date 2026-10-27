import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  Share2, 
  X, 
  Calendar, 
  Building, 
  Phone, 
  Mail, 
  CheckCircle2, 
  AlertCircle,
  QrCode
} from 'lucide-react';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters.js';
import { 
  calculateClientStatement, 
  generateStatementWhatsAppMessage,
  getStatementWhatsAppWebUrl 
} from '../utils/statementCalculations.js';
import { buildUpiLink, generateQrDataUrl, generateQrSvgString } from '../utils/qrGenerator.js';
import { buildInvoicePdf, exportInvoiceToPdf, generateInvoicePdfFile } from '../utils/pdfExport.js';
import { shouldOpenWhatsAppWeb } from '../utils/whatsapp.js';
import { setSharingActive } from '../utils/security.js';

export function ClientStatementModal({ isOpen, onClose, client, allInvoices = [], settings }) {
  if (!isOpen || !client) return null;

  const [periodType, setPeriodType] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [downloadToast, setDownloadToast] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');

  const sym = settings?.currencySymbol || '₹';
  const businessName = settings?.businessName || 'DR FILMS';

  const statement = calculateClientStatement(client, allInvoices, periodType, customStart, customEnd);
  const closingBalance = statement.closingBalance;

  // Generate UPI QR for closing balance if > 0
  useEffect(() => {
    let active = true;
    const upiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();
    if (closingBalance > 0 && upiId) {
      const upiUrl = buildUpiLink({
        upiId,
        payeeName: businessName,
        amount: closingBalance,
        invoiceNumber: `STMT-${client.name || 'CLIENT'}`.slice(0, 30)
      });

      Promise.all([
        generateQrDataUrl(upiUrl, { width: 300 }),
        generateQrSvgString(upiUrl, { width: 300 })
      ]).then(([dataUrl, svg]) => {
        if (active) {
          setQrDataUrl(dataUrl);
          setQrSvgString(svg);
        }
      }).catch(err => {
        console.warn('Statement QR error:', err);
      });
    } else {
      setQrDataUrl('');
      setQrSvgString('');
    }
    return () => { active = false; };
  }, [closingBalance, settings?.bankDetails?.upiId, settings?.upiId, businessName, client.name]);

  const cleanFilename = `Statement_${(client.name || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_')}_${statement.periodInfo.startDate || 'All'}.pdf`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isExporting || isSharing) return;
    setIsExporting(true);
    setShareFeedback('Generating Statement PDF...');

    try {
      await exportInvoiceToPdf('statement-paper', cleanFilename, qrDataUrl, qrSvgString);
    } catch (err) {
      console.error('Statement PDF error:', err);
      window.print();
    } finally {
      setShareFeedback('');
      setIsExporting(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (isSharing || isExporting) return;
    setIsSharing(true);
    setSharingActive(true);
    setShareFeedback('Preparing Statement PDF...');

    try {
      const pdfFile = await generateInvoicePdfFile('statement-paper', cleanFilename, qrDataUrl, qrSvgString);
      const useWeb = shouldOpenWhatsAppWeb(settings);

      if (useWeb) {
        setShareFeedback('Downloading PDF & opening WhatsApp Web...');
        
        // 1. Download PDF file
        const downloadUrl = URL.createObjectURL(pdfFile);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = cleanFilename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        // 2. Show toast instruction
        setDownloadToast('Statement downloaded. In WhatsApp, attach the file via Document (+ icon).');
        setTimeout(() => setDownloadToast(''), 6000);

        // 3. Open WhatsApp Web
        const webUrl = getStatementWhatsAppWebUrl(client, statement, settings);
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => setShareFeedback(''), 3000);
        return;
      }

      // Mobile share sheet
      const canShare = typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [pdfFile] });

      const textMsg = generateStatementWhatsAppMessage(client, statement, settings);

      if (canShare) {
        await navigator.share({
          files: [pdfFile],
          title: `Statement of Account - ${client.name}`,
          text: textMsg
        });
      } else {
        const webUrl = getStatementWhatsAppWebUrl(client, statement, settings);
        window.open(webUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('WhatsApp Statement Share error:', err);
      }
    } finally {
      setShareFeedback('');
      setIsSharing(false);
      setTimeout(() => setSharingActive(false), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">
        
        {/* Modal Controls Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-display font-bold text-slate-100">
                  Client Statement of Account
                </h3>
                <p className="text-xs text-slate-400">
                  {client.name} {client.company ? `(${client.company})` : ''} • {statement.periodInfo.label}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting || isSharing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>{isExporting ? 'Exporting...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-sky-400" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsAppShare}
              disabled={isSharing || isExporting}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{isSharing ? 'Sharing...' : 'Send on WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors ml-1"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback / Toast notifications */}
        {shareFeedback && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-300 font-medium text-center">
            {shareFeedback}
          </div>
        )}
        {downloadToast && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 text-xs text-emerald-300 font-medium text-center">
            {downloadToast}
          </div>
        )}

        {/* Period Selector Tabs */}
        <div className="p-3 sm:px-6 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Period:</span>
          </span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_fy', label: 'This Financial Year' },
            { id: 'custom', label: 'Custom Dates' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriodType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                periodType === tab.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {periodType === 'custom' && (
            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto mt-2 sm:mt-0">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg"
              />
            </div>
          )}
        </div>

        {/* Statement Paper Container (Scrollable Preview) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950/60 flex justify-center">
          
          {/* THE STATEMENT PAPER */}
          <div 
            id="statement-paper" 
            className="w-full max-w-[800px] bg-white text-slate-900 rounded-xl p-6 sm:p-10 shadow-xl border border-slate-200 print:border-none print:shadow-none print:m-0 print:p-6"
            style={{ minHeight: '1000px' }}
          >
            {/* Business Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b-2 border-slate-900 gap-4">
              <div>
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt={businessName} className="h-12 w-auto object-contain mb-2" />
                ) : (
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase font-display">
                    {businessName}
                  </h1>
                )}
                {settings?.address && (
                  <p className="text-xs text-slate-600 max-w-sm whitespace-pre-line mt-1">
                    {settings.address}
                  </p>
                )}
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  {settings?.ownerName && <p>Owner: <span className="font-semibold text-slate-900">{settings.ownerName}</span></p>}
                  {settings?.phone && <p>Phone: <span className="font-medium text-slate-900">{settings.phone}</span></p>}
                  {settings?.email && <p>Email: <span className="font-medium text-slate-900">{settings.email}</span></p>}
                  {settings?.gstin && <p>GSTIN: <span className="tracking-wider font-semibold text-slate-900">{settings.gstin}</span></p>}
                </div>
              </div>

              <div className="sm:text-right">
                <span className="inline-block bg-slate-900 text-amber-400 font-bold px-3 py-1 rounded text-xs uppercase tracking-wider mb-2">
                  Statement of Account
                </span>
                <p className="text-xs text-slate-500">Date Issued</p>
                <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatDate(new Date().toISOString().split('T')[0])}</p>
                <p className="text-xs text-slate-500 mt-2">Statement Period</p>
                <p className="text-xs font-bold text-slate-800">{statement.periodInfo.label}</p>
              </div>
            </div>

            {/* Client Information */}
            <div className="py-4 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Statement For</p>
                <h2 className="text-base font-bold text-slate-900">{client.name}</h2>
                {client.company && <p className="text-xs font-medium text-slate-700">{client.company}</p>}
                {client.phone && <p className="text-xs text-slate-600 mt-0.5 tabular-nums">Phone: {client.phone}</p>}
                {client.email && <p className="text-xs text-slate-600">Email: {client.email}</p>}
                {client.address && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{client.address}</p>}
                {client.gstin && <p className="text-xs tracking-wider font-semibold text-slate-700 mt-0.5">GSTIN: {client.gstin}</p>}
              </div>

              <div className="flex sm:justify-end items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-right w-full sm:w-auto">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Closing Balance Due</span>
                  <span className={`text-xl font-black font-display tabular-nums ${closingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(closingBalance, sym)}
                  </span>
                  {closingBalance === 0 && (
                    <span className="block text-[10px] text-emerald-600 font-semibold mt-0.5">
                      ✓ All Dues Settled
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-5 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Opening Balance</span>
                <span className="text-sm font-bold text-slate-900 font-display tabular-nums">
                  {formatCurrency(statement.openingBalance, sym)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Billed</span>
                <span className="text-sm font-bold text-slate-900 font-display tabular-nums">
                  {formatCurrency(statement.totalBilled, sym)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Received</span>
                <span className="text-sm font-bold text-emerald-700 font-display tabular-nums">
                  {formatCurrency(statement.totalReceived, sym)}
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5">
                <span className="text-[10px] text-amber-800 uppercase font-bold block">Closing Balance</span>
                <span className="text-sm font-black text-amber-900 font-display tabular-nums">
                  {formatCurrency(closingBalance, sym)}
                </span>
              </div>
            </div>

            {/* Statement Ledger Table */}
            <div className="mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800">
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px]">Date</th>
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px]">Invoice No</th>
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px]">Description</th>
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px] text-right">Billed</th>
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px] text-right">Received</th>
                    <th className="py-2.5 px-2 font-bold uppercase text-[10px] text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* Opening Balance Row */}
                  <tr className="bg-slate-50/80 font-medium">
                    <td className="py-2 px-2 text-slate-500">—</td>
                    <td className="py-2 px-2 text-slate-500">—</td>
                    <td className="py-2 px-2 text-slate-700 font-semibold italic">Opening Balance Carried In</td>
                    <td className="py-2 px-2 text-right text-slate-400">—</td>
                    <td className="py-2 px-2 text-right text-slate-400">—</td>
                    <td className="py-2 px-2 text-right font-bold text-slate-900 tabular-nums">
                      {formatCurrency(statement.openingBalance, sym)}
                    </td>
                  </tr>

                  {/* Period Transactions */}
                  {statement.entries.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400 italic">
                        No transactions recorded for this client during the selected period.
                      </td>
                    </tr>
                  ) : (
                    statement.entries.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2 tabular-nums whitespace-nowrap text-slate-600">
                          {formatDate(entry.date)}
                        </td>
                        <td className="py-2 px-2 tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatInvoiceNumber(entry.invoiceNumber)}
                        </td>
                        <td className="py-2 px-2 text-slate-800 max-w-xs truncate">
                          {entry.description}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-900 font-medium whitespace-nowrap">
                          {entry.billed > 0 ? formatCurrency(entry.billed, sym) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-medium whitespace-nowrap">
                          {entry.received !== 0 ? (
                            entry.received < 0 ? (
                              <span className="text-amber-700 font-semibold">
                                -{formatCurrency(Math.abs(entry.received), sym)}
                              </span>
                            ) : (
                              <span className="text-emerald-700">
                                {formatCurrency(entry.received, sym)}
                              </span>
                            )
                          ) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(entry.runningBalance, sym)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                    <td colSpan="3" className="py-2.5 px-2 uppercase text-[11px]">
                      Totals for Period
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {formatCurrency(statement.totalBilled, sym)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-emerald-700">
                      {formatCurrency(statement.totalReceived, sym)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-display font-black text-amber-900 text-sm">
                      {formatCurrency(closingBalance, sym)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Cancelled Bills Note */}
            {statement.cancelledBills.length > 0 && (
              <div className="mt-4 p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Note: </span>
                Cancelled bills excluded from financial totals: {statement.cancelledBills.map(b => (
                  `${formatInvoiceNumber(b.invoiceNumber)} (${b.reason}${b.date ? ` on ${formatDate(b.date)}` : ''})`
                )).join(', ')}.
              </div>
            )}

            {/* Payment & Bank Details Section */}
            <div className="mt-6 pt-4 border-t-2 border-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Bank Payment Details</p>
                <div className="text-xs text-slate-700 space-y-0.5">
                  {(settings?.bankDetails?.accountName || settings?.accountName) && <p>Account Name: <span className="font-medium text-slate-900">{settings.bankDetails?.accountName || settings.accountName}</span></p>}
                  {(settings?.bankDetails?.bankName || settings?.bankName) && <p>Bank Name: <span className="font-medium text-slate-900">{settings.bankDetails?.bankName || settings.bankName}</span></p>}
                  {(settings?.bankDetails?.accountNumber || settings?.accountNumber) && <p>Account Number: <span className="tabular-nums font-bold text-slate-900">{settings.bankDetails?.accountNumber || settings.accountNumber}</span></p>}
                  {(settings?.bankDetails?.ifsc || settings?.ifscCode) && <p>IFSC Code: <span className="tracking-wider font-bold text-slate-900">{settings.bankDetails?.ifsc || settings.ifscCode}</span></p>}
                  {(settings?.bankDetails?.upiId || settings?.upiId) && <p className="break-all">UPI ID: <span className="font-semibold text-amber-800 select-all">{settings.bankDetails?.upiId || settings.upiId}</span></p>}
                </div>
              </div>

              <div className="flex sm:justify-end">
                {closingBalance > 0 && qrDataUrl ? (
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div 
                      id="statement-qr-box" 
                      className="w-[120px] h-[120px] bg-white border border-slate-300 rounded-lg p-1.5 flex items-center justify-center shrink-0"
                    >
                      <img 
                        id="statement-upi-qr" 
                        src={qrDataUrl} 
                        alt="Scan UPI QR" 
                        className="w-[105px] h-[105px] object-contain block mx-auto"
                      />
                    </div>
                    <div className="text-[11px] text-slate-600 max-w-[130px]">
                      <span className="font-bold text-slate-900 block text-xs">Scan & Pay</span>
                      <span>Scan using GPay, PhonePe, Paytm or BHIM to pay closing balance</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                    <span className="text-emerald-700 font-bold text-xs flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Account in Good Standing</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      No outstanding payment due for this client.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
              This is a computer-generated statement from {businessName}. Thank you for your business.
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
