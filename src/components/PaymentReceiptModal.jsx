import React, { useState, useEffect } from 'react';
import { 
  X, 
  Printer, 
  Download,
  Send,
  MessageSquare,
  Loader2,
  CheckCircle2, 
  Receipt, 
  Building, 
  Calendar, 
  CreditCard, 
  FileText,
  Clapperboard,
  QrCode
} from 'lucide-react';
import { formatCurrency, formatDate, formatInvoiceNumber, numberToWords, formatPhoneNumber } from '../utils/formatters';
import { 
  sendWhatsAppMessage, 
  formatWhatsAppPhone, 
  shouldOpenWhatsAppWeb, 
  generatePaymentReceiptWhatsAppMessage 
} from '../utils/whatsapp';
import { 
  exportInvoiceToPdf, 
  generateInvoicePdfFile, 
  getPaymentReceiptPdfFilename 
} from '../utils/pdfExport';
import DOMPurify from 'dompurify';
import { setSharingActive } from '../utils/security';
import { buildUpiLink, generateQrDataUrl, generateQrSvgString } from '../utils/qrGenerator';

export function PaymentReceiptModal({ 
  isOpen, 
  onClose, 
  invoice, 
  payment, 
  settings, 
  initialAction = null 
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');

  const sym = settings?.currencySymbol || '₹';
  const clientName = invoice?.customerSnapshot?.name || 'Valued Client';
  const clientCompany = invoice?.customerSnapshot?.company || '';
  const clientPhone = invoice?.customerSnapshot?.phone || '';
  const clientEmail = invoice?.customerSnapshot?.email || '';
  const clientAddress = invoice?.customerSnapshot?.address || '';
  const clientGstin = invoice?.customerSnapshot?.gstin || '';

  // Calculate cumulative paid up to this payment (active payments only)
  const allPayments = (Array.isArray(invoice?.payments) ? invoice.payments : []).filter(p => !p?.isDeleted);
  const paymentIndex = payment ? allPayments.findIndex(p => p?.id === payment.id) : -1;
  const formattedInvoiceNum = invoice?.invoiceNumber ? formatInvoiceNumber(invoice.invoiceNumber) : '';
  const receiptNumber = `REC-${formattedInvoiceNum}-P${paymentIndex >= 0 ? paymentIndex + 1 : 1}`;
  const cleanFilename = (invoice && payment) ? getPaymentReceiptPdfFilename(invoice, payment) : 'Receipt.pdf';

  // Cumulative paid up to and including this payment
  let cumulativePaid = 0;
  for (let i = 0; i <= (paymentIndex >= 0 ? paymentIndex : allPayments.length - 1); i++) {
    cumulativePaid += Number(allPayments[i]?.amount || 0);
  }
  const totalAmount = Number(invoice?.totalAmount) || 0;
  const balanceRemaining = Math.max(0, totalAmount - cumulativePaid);

  // Generate UPI QR for remaining balance if > 0
  useEffect(() => {
    let active = true;
    const upiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();
    if (isOpen && invoice && payment && balanceRemaining > 0 && upiId) {
      const upiUrl = buildUpiLink({
        upiId,
        payeeName: settings?.bankDetails?.accountName || settings?.businessName || 'DR FILMS',
        amount: balanceRemaining,
        invoiceNumber: formattedInvoiceNum || 'BILL'
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
        console.warn('Receipt QR generation error:', err);
      });
    } else {
      setQrDataUrl('');
      setQrSvgString('');
    }
    return () => { active = false; };
  }, [isOpen, balanceRemaining, settings?.bankDetails?.upiId, settings?.bankDetails?.accountName, settings?.upiId, settings?.businessName, formattedInvoiceNum]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isExporting || isSharing || !invoice || !payment) return;
    setIsExporting(true);
    setSharingActive(true);
    setFeedbackToast('Generating Receipt PDF...');

    try {
      await exportInvoiceToPdf('printable-payment-receipt', cleanFilename, qrDataUrl, qrSvgString);
      setFeedbackToast('Receipt PDF downloaded successfully.');
      setTimeout(() => setFeedbackToast(''), 4500);
    } catch (err) {
      console.error('Receipt PDF export error:', err);
      window.print();
    } finally {
      setIsExporting(false);
      setTimeout(() => setSharingActive(false), 2000);
    }
  };

  const handleSendPdfWhatsApp = async () => {
    if (isSharing || isExporting || !invoice || !payment) return;
    setIsSharing(true);
    setSharingActive(true);
    setFeedbackToast('Preparing Receipt PDF for client...');

    try {
      const pdfFile = await generateInvoicePdfFile('printable-payment-receipt', cleanFilename, qrDataUrl, qrSvgString);
      const useWeb = shouldOpenWhatsAppWeb(settings);
      const message = generatePaymentReceiptWhatsAppMessage(invoice, payment, settings);

      if (useWeb) {
        setFeedbackToast('Downloading PDF & opening WhatsApp Web...');

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
        setFeedbackToast('Receipt PDF downloaded. In WhatsApp, attach the file via Document (+ icon).');
        setTimeout(() => setFeedbackToast(''), 7000);

        // 3. Open WhatsApp Web
        sendWhatsAppMessage({
          phone: clientPhone,
          text: message,
          forceWeb: true,
          defaultCountryCode: settings?.defaultCountryCode || '91'
        });
        return;
      }

      // Mobile share sheet flow
      const canShare = typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [pdfFile] });

      if (canShare) {
        setFeedbackToast('Opening WhatsApp / Share Sheet...');
        try {
          await navigator.share({
            files: [pdfFile],
            title: `Payment Receipt - ${receiptNumber}`,
            text: message
          });
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.error('Receipt share sheet error:', shareErr);
          }
        }
        setFeedbackToast('');
        return;
      }

      // Mobile fallback if Web Share is unsupported
      const downloadUrl = URL.createObjectURL(pdfFile);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = cleanFilename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      sendWhatsAppMessage({
        phone: clientPhone,
        text: message,
        mode: 'auto',
        defaultCountryCode: settings?.defaultCountryCode || '91'
      });
    } catch (err) {
      console.error('WhatsApp Receipt Share error:', err);
    } finally {
      setIsSharing(false);
      setTimeout(() => setSharingActive(false), 5000);
    }
  };

  const handleWhatsAppTextOnly = () => {
    if (!invoice || !payment) return;
    const message = generatePaymentReceiptWhatsAppMessage(invoice, payment, settings);
    sendWhatsAppMessage({
      phone: clientPhone,
      text: message,
      mode: settings?.whatsappMode || 'auto',
      defaultCountryCode: settings?.defaultCountryCode || '91'
    });
  };

  // Auto trigger if initialAction was specified
  useEffect(() => {
    if (!isOpen || !payment || !invoice) return;
    if (initialAction === 'download') {
      const timer = setTimeout(() => {
        handleDownloadPdf();
      }, 350);
      return () => clearTimeout(timer);
    } else if (initialAction === 'share') {
      const timer = setTimeout(() => {
        handleSendPdfWhatsApp();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialAction, payment?.id, invoice?.id, qrDataUrl]);

  if (!isOpen || !payment || !invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header Controls (Hidden on Print) */}
        <div className="no-print space-y-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Receipt className="w-4 h-4" />
              <span>Official Payment Receipt Voucher</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Download PDF Button */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting || isSharing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download Official Payment Receipt PDF"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isExporting ? 'Downloading...' : 'Download PDF'}</span>
              </button>

              {/* Send PDF on WhatsApp Button */}
              <button
                type="button"
                onClick={handleSendPdfWhatsApp}
                disabled={isExporting || isSharing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send Payment Receipt PDF to Client via WhatsApp"
              >
                {isSharing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-emerald-200" />
                )}
                <span>{isSharing ? 'Preparing...' : 'Send PDF on WhatsApp'}</span>
              </button>

              {/* Small Text Only Button */}
              <button
                type="button"
                onClick={handleWhatsAppTextOnly}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                title="Send WhatsApp text summary without PDF file"
              >
                <MessageSquare className="w-3 h-3 text-emerald-400" />
                <span className="hidden sm:inline">Text only</span>
              </button>

              {/* Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                title="Print Receipt Voucher"
              >
                <Printer className="w-3 h-3 text-amber-400" />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close receipt preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Feedback Toast / Status Banner */}
          {feedbackToast && (
            <div className="py-2 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span className="font-medium">{feedbackToast}</span>
            </div>
          )}
        </div>

        {/* Printable Receipt Paper Container */}
        <div 
          id="printable-payment-receipt"
          className="bg-white text-slate-950 p-6 sm:p-8 rounded-2xl shadow-md border border-slate-200 relative font-sans space-y-4"
        >
          {/* Studio Top Banner */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b-2 border-slate-950">
            <div>
              <div className="flex items-center gap-2.5">
                {settings?.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt={settings.businessName || 'DR FILMS'}
                    className="w-11 h-11 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-950 flex items-center justify-center text-amber-400 font-bold shrink-0">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h2 className="font-display font-black text-xl sm:text-2xl tracking-tight text-slate-950">
                    {settings?.businessName || 'DR FILMS'}
                  </h2>
                  <p className="text-xs text-slate-600 font-medium">
                    {settings?.tagline || 'Creative Studio • Photography • Film Production'}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 space-y-1 mt-2.5">
                {settings?.ownerName && (
                  <p className="font-medium text-slate-800 leading-snug">
                    <span className="text-slate-500">Owner:</span> <strong className="font-bold text-slate-950">{settings.ownerName}</strong>
                  </p>
                )}
                <p className="leading-snug">
                  {settings?.phone && <span>Phone: <strong className="font-semibold text-slate-900">{formatPhoneNumber(settings.phone)}</strong></span>}
                  {settings?.email && <span className="ml-2">• {settings.email}</span>}
                </p>
                {settings?.address && <p className="leading-snug">{settings.address}</p>}
                {settings?.gstin && (
                  <p className="font-bold text-slate-950 tracking-wider leading-snug">
                    GSTIN: {settings.gstin}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end text-right">
              <div className="w-[245px] sm:w-[250px] min-w-[245px] flex flex-col items-center">
                <span
                  id="receipt-header-badge"
                  className="receipt-header-title w-full bg-slate-950 text-amber-400 font-black text-[11px] sm:text-xs py-2 px-2 rounded tracking-wider uppercase text-center block whitespace-nowrap leading-tight"
                >
                  OFFICIAL PAYMENT RECEIPT
                </span>
                
                <div className="w-full mt-2 flex items-center justify-center">
                  {balanceRemaining <= 0 ? (
                    <span className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wide border border-emerald-300 text-center leading-normal">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Bill Fully Settled</span>
                    </span>
                  ) : (
                    <span
                      id="receipt-balance-pending-badge"
                      className="w-full flex items-center justify-center py-2 px-3 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold uppercase tracking-wide border border-amber-300 text-center leading-tight"
                    >
                      Balance Pending: {formatCurrency(balanceRemaining, sym)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 mt-2.5 text-right w-full">
                <p className="text-xs font-extrabold text-slate-900 tabular-nums leading-normal">
                  Receipt No: <span className="font-bold">{receiptNumber}</span>
                </p>
                <p className="text-xs text-slate-600 font-medium tabular-nums leading-normal">
                  Date: <span className="font-bold text-slate-950">{formatDate(payment.date)}</span>
                </p>
                <p className="text-xs text-slate-600 tabular-nums leading-normal">
                  Against Bill: <span className="font-bold text-slate-900">{formattedInvoiceNum}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Client & Received Amount Card */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 block tracking-wider">
                Received With Thanks From:
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-950 block">
                {clientName} {clientCompany ? `(${clientCompany})` : ''}
              </span>
              {clientPhone && (
                <span className="text-xs text-slate-700 tabular-nums block font-medium">
                  Contact: <strong className="font-semibold text-slate-900">{formatPhoneNumber(clientPhone)}</strong>
                </span>
              )}
              {clientEmail && (
                <span className="text-xs text-slate-600 block">
                  Email: {clientEmail}
                </span>
              )}
              {clientAddress && (
                <span className="text-xs text-slate-600 block leading-relaxed max-w-sm">
                  Address: {clientAddress}
                </span>
              )}
              {clientGstin && (
                <span className="text-xs font-semibold text-slate-800 block">
                  GSTIN: {clientGstin}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center text-center bg-emerald-50 sm:bg-emerald-50/80 p-4 sm:p-5 rounded-xl border border-emerald-200/90 shrink-0 min-w-[220px]">
              <span className="text-[10px] uppercase font-extrabold text-emerald-800 block tracking-wider text-center leading-tight">
                Amount Received
              </span>
              <span className="text-2xl sm:text-3xl font-display font-black text-emerald-700 block tabular-nums text-center leading-tight mt-2 mb-4">
                {formatCurrency(payment.amount, sym)}
              </span>
              <div className="flex items-center justify-center mt-1">
                <span className="inline-flex items-center justify-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-white px-4 py-1.5 rounded-full border border-emerald-300 shadow-xs leading-normal">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Payment Credited</span>
                </span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-amber-900 block tracking-wider">Amount in Words:</span>
            <p className="font-semibold text-slate-950 text-xs sm:text-sm italic mt-1 leading-relaxed">
              {numberToWords(payment.amount)}
            </p>
          </div>

          {/* Payment & Shoot Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
            <div className="p-3 rounded-xl border border-slate-200 bg-white min-h-[68px] flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider text-center">Payment Mode</span>
              <span className="text-xs font-bold text-slate-900 mt-1 block capitalize leading-normal text-center">
                {payment.method || 'Direct Payment'}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white min-h-[68px] flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider text-center">Payment Date</span>
              <span className="text-xs font-bold text-slate-900 mt-1 block tabular-nums leading-normal text-center">
                {formatDate(payment.date)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white min-h-[68px] flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider text-center">Event / Shoot</span>
              <span className="text-xs font-bold text-slate-900 mt-1 block break-words leading-normal text-center">
                {invoice.eventType || 'Creative Media'}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white min-h-[68px] flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider text-center">Payment Reference</span>
              <span className="text-xs text-slate-800 mt-1 block break-words leading-normal text-center">
                {payment.note || 'Advance / Installment payment'}
              </span>
            </div>
          </div>

          {/* Bill Payment Statement */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] uppercase font-extrabold text-slate-600 tracking-wider">
                Bill Payment Statement
              </h4>
              <span className="text-[10px] font-bold text-slate-700 pr-1">
                Against Bill: {formattedInvoiceNum}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center p-3 sm:p-4 bg-slate-100/90 rounded-xl border border-slate-200">
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-600 block uppercase font-bold tracking-wider text-center">Total Bill Amount</span>
                <span className="font-display font-black text-slate-950 text-sm sm:text-base tabular-nums mt-1 block text-center">
                  {formatCurrency(totalAmount, sym)}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] text-emerald-800 block uppercase font-bold tracking-wider text-center">Total Paid to Date</span>
                <span className="font-display font-black text-emerald-700 text-sm sm:text-base tabular-nums mt-1 block text-center">
                  {formatCurrency(cumulativePaid, sym)}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className={`text-[10px] block uppercase font-bold tracking-wider text-center ${balanceRemaining > 0 ? 'text-amber-800' : 'text-slate-600'}`}>
                  Remaining Balance
                </span>
                <span className={`font-display font-black text-sm sm:text-base tabular-nums mt-1 block text-center ${balanceRemaining > 0 ? 'text-amber-700' : 'text-slate-950'}`}>
                  {formatCurrency(balanceRemaining, sym)}
                </span>
              </div>
            </div>

            {/* Installment History Table */}
            {allPayments.length > 0 && (
              <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-center text-[11px] border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[9px] font-extrabold tracking-wider">
                      <th className="py-2.5 px-3 text-center align-middle min-w-[120px]">Payment #</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap align-middle">Date</th>
                      <th className="py-2.5 px-3 text-center align-middle">Mode</th>
                      <th className="py-2.5 px-3 text-center align-middle">Reference / Note</th>
                      <th className="py-2.5 px-3 text-center align-middle">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {allPayments.map((p, idx) => {
                      const isThisReceipt = p.id === payment.id;
                      return (
                        <tr key={p.id || idx} className={`align-middle ${isThisReceipt ? 'bg-amber-500/10 font-bold text-slate-950' : 'hover:bg-slate-50/50'}`}>
                          <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-center align-middle">
                            <div className="receipt-badge-container inline-flex items-center justify-center gap-1.5 align-middle text-center">
                              <span className="font-bold tabular-nums">{idx + 1}</span>
                              {isThisReceipt && (
                                <span
                                  id="receipt-current-badge"
                                  className="receipt-badge-highlight inline-block text-[10px] text-amber-950 font-black bg-amber-200 px-2.5 py-1 rounded border border-amber-400 text-center leading-normal align-middle"
                                >
                                  This Receipt
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-center align-middle">{formatDate(p.date)}</td>
                          <td className="py-2.5 px-3 capitalize font-medium text-center align-middle">{p.method || 'Payment'}</td>
                          <td className="py-2.5 px-3 break-words max-w-[200px] text-center align-middle">{p.note || '—'}</td>
                          <td className="py-2.5 px-3 text-center font-black tabular-nums text-emerald-700 whitespace-nowrap align-middle">
                            {formatCurrency(p.amount, sym)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Remaining Balance Payment Options OR Fully Settled Banner */}
          {balanceRemaining > 0 ? (
            <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2.5">
                <span className="text-[10px] uppercase font-extrabold text-slate-700 tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  Payment Options for Remaining Balance ({formatCurrency(balanceRemaining, sym)})
                </span>
                <span className="text-[10px] text-slate-500 font-medium pr-1">Against Bill: {formattedInvoiceNum}</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Bank details */}
                <div className="text-xs space-y-1 text-slate-700 flex-1 w-full sm:w-auto">
                  {(settings?.bankDetails?.accountName || settings?.ownerName) && (
                    <p className="break-words">
                      <span className="text-slate-500 font-medium">A/C Name:</span> <strong className="text-slate-950 font-bold">{settings.bankDetails?.accountName || settings.ownerName}</strong>
                    </p>
                  )}
                  {settings?.bankDetails?.bankName && (
                    <p className="break-words">
                      <span className="text-slate-500 font-medium">Bank:</span> <strong className="text-slate-950 font-bold">{settings.bankDetails.bankName}</strong>
                    </p>
                  )}
                  {settings?.bankDetails?.accountNumber && (
                    <p className="break-words">
                      <span className="text-slate-500 font-medium">A/C No:</span> <strong className="text-slate-950 font-bold tabular-nums">{settings.bankDetails.accountNumber}</strong>
                    </p>
                  )}
                  {settings?.bankDetails?.ifsc && (
                    <p className="break-words">
                      <span className="text-slate-500 font-medium">IFSC:</span> <strong className="text-slate-950 font-bold tracking-wider">{settings.bankDetails.ifsc}</strong>
                    </p>
                  )}
                  {(settings?.bankDetails?.upiId || settings?.upiId) && (
                    <p className="break-words">
                      <span className="text-slate-500 font-medium">UPI ID:</span> <strong className="text-amber-800 font-bold select-all">{settings.bankDetails?.upiId || settings.upiId}</strong>
                    </p>
                  )}
                </div>

                {/* UPI QR Code */}
                {(settings?.bankDetails?.upiId || settings?.upiId) && (
                  <div className="flex flex-col items-center shrink-0 text-center">
                    <div 
                      id="receipt-qr-box" 
                      className="w-[120px] h-[120px] bg-white p-1 rounded-lg border border-slate-300 flex items-center justify-center shadow-sm"
                    >
                      {qrDataUrl ? (
                        <img 
                          id="receipt-upi-qr" 
                          src={qrDataUrl} 
                          alt="UPI QR Code" 
                          className="w-[112px] h-[112px] object-contain block" 
                        />
                      ) : qrSvgString ? (
                        <div 
                          className="w-[112px] h-[112px] flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(qrSvgString) }} 
                        />
                      ) : (
                        <div className="text-[10px] text-slate-400 p-2">Generating QR...</div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col items-center text-center space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-700 block leading-normal text-center">
                        Scan to pay balance
                      </span>
                      <span className="text-xs font-black text-amber-700 tabular-nums block leading-normal text-center">
                        {formatCurrency(balanceRemaining, sym)}
                      </span>
                      <span className="text-[9px] text-slate-500 block leading-normal text-center">
                        GPay • PhonePe • Paytm • BHIM
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">Bill Fully Settled & Cleared</span>
                  <span className="text-[11px] text-emerald-800 block">
                    All payments for Bill {formattedInvoiceNum} have been received in full. Thank you for your business!
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300 shrink-0">
                Zero Balance Due
              </span>
            </div>
          )}

          {/* Authorized Signatory Block */}
          <div className="pt-4 border-t border-slate-200 flex items-end justify-between text-xs mt-auto">
            <div className="text-[10px] text-slate-500 max-w-sm leading-relaxed">
              <p className="font-semibold text-slate-700">Official Computer-Generated Receipt Voucher</p>
              <p>Issued by {settings?.businessName || 'DR FILMS'}. Subject to payment realization.</p>
              <p className="text-slate-400 mt-0.5">Voucher: {receiptNumber} • Bill {formattedInvoiceNum}</p>
            </div>
            <div className="shrink-0 flex flex-col items-center text-center w-48 pr-1">
              <div className="w-full border-b-2 border-slate-950 pb-1 mb-1.5 font-display font-bold text-xs text-slate-900 text-center">
                {settings?.businessName || 'DR FILMS'}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-semibold text-center">
                Authorized Signatory
              </span>
              {settings?.ownerName && (
                <span className="text-[11px] text-slate-800 font-bold block text-center mt-0.5">({settings.ownerName})</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions & Note */}
        <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-1">
          <span className="text-[11px] text-slate-400 text-center sm:text-left">
            Official Studio Voucher • Download PDF to archive or Send PDF on WhatsApp directly to client
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting || isSharing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSendPdfWhatsApp}
              disabled={isExporting || isSharing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

