import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ArrowLeft, 
  Printer, 
  Download, 
  Share2, 
  Edit3, 
  Trash2, 
  CreditCard, 
  CheckCircle2, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  AlertCircle,
  Clapperboard,
  QrCode,
  DollarSign,
  FileText,
  Send,
  MessageSquare,
  X,
  RotateCcw,
  Ban,
  Briefcase,
  Receipt,
  Palette
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber, formatPhoneNumber, UNIT_SHORT } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { MarkAsPaidModal } from '../components/MarkAsPaidModal';
import { UndoToast } from '../components/UndoToast';
import { exportInvoiceToPdf, generateInvoicePdfFile, getInvoicePdfFilename } from '../utils/pdfExport';
import { openWhatsAppShare, generateWhatsAppMessage, shouldOpenWhatsAppWeb, getWhatsAppWebUrl } from '../utils/whatsapp';
import { generateQrDataUrl, generateQrSvgString, buildUpiLink } from '../utils/qrGenerator';
import { getPaymentLabel, recalculateInvoicePayments, determineReinstatedStatus } from '../utils/calculations';
import { scheduleAutoSync, recordPermanentlyDeletedInvoice } from '../utils/googleSheetsSync';
import { CancelBillModal } from '../components/CancelBillModal';
import { RecordRefundModal } from '../components/RecordRefundModal';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { PaymentReceiptModal } from '../components/PaymentReceiptModal';
import { setSharingActive } from '../utils/security';
import { resolveEffectiveCustomer } from '../utils/customerSync';

const ContractsModal = React.lazy(() => import('../components/ContractsModal').then(m => ({ default: m.ContractsModal })));

export function InvoiceViewPage({ invoiceId, onBack, onEdit, onGoToProjects }) {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [receiptInitialAction, setReceiptInitialAction] = useState(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const isSharingRef = useRef(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [downloadToast, setDownloadToast] = useState('');
  const [undoToast, setUndoToast] = useState(null);

  const invoice = useLiveQuery(() => db.invoices.get(Number(invoiceId)), [invoiceId]);
  const settings = useLiveQuery(() => db.settings.get('business_profile'));

  const invoiceTheme = selectedTheme || invoice?.theme || settings?.invoiceTheme || 'cinematic';

  const handleThemeChange = async (theme) => {
    setSelectedTheme(theme);
    if (invoice?.id) {
      await db.invoices.update(invoice.id, { theme });
    }
    await db.settings.update('business_profile', { invoiceTheme: theme });
  };
  const linkedProject = useLiveQuery(
    () => db.projects?.where('invoiceId').equals(Number(invoiceId)).filter(p => !p.isDeleted).first(),
    [invoiceId]
  );
  const customers = useLiveQuery(() => db.customers?.toArray() || [], []) || [];
  const allInvoices = useLiveQuery(() => db.invoices?.toArray() || [], []) || [];

  const activeCustomer = useMemo(() => {
    return resolveEffectiveCustomer(invoice, customers);
  }, [invoice, customers]);

  const effectiveInvoice = useMemo(() => {
    if (!invoice) return null;
    return {
      ...invoice,
      customerSnapshot: activeCustomer || invoice.customerSnapshot
    };
  }, [invoice, activeCustomer]);

  useEffect(() => {
    if (invoice && activeCustomer && invoice.customerId) {
      const snap = invoice.customerSnapshot || {};
      const needsUpdate =
        snap.name !== activeCustomer.name ||
        (snap.company || '') !== (activeCustomer.company || '') ||
        (snap.phone || '') !== (activeCustomer.phone || '') ||
        (snap.email || '') !== (activeCustomer.email || '') ||
        (snap.address || '') !== (activeCustomer.address || '') ||
        (snap.gstin || '') !== (activeCustomer.gstin || '');

      if (needsUpdate) {
        db.invoices.update(invoice.id, {
          customerSnapshot: {
            ...snap,
            name: activeCustomer.name,
            company: activeCustomer.company || '',
            phone: activeCustomer.phone || '',
            email: activeCustomer.email || '',
            address: activeCustomer.address || '',
            gstin: activeCustomer.gstin || '',
            tag: activeCustomer.tag || 'Regular'
          },
          updatedAt: new Date().toISOString()
        }).catch(err => console.warn('Customer snapshot auto-sync notice:', err));
      }
    }
  }, [invoice?.id, activeCustomer]);

  const sym = settings?.currencySymbol || '₹';
  const isWedding = Boolean(
    invoice?.eventType && invoice.eventType.toLowerCase().includes('wedding')
  );

  const displayPaymentTerms = useMemo(() => {
    if (!invoice?.paymentTerms) return '';
    if (isWedding) {
      return invoice.paymentTerms
        .replace(/payment\s+due\s+within\s+\d+\s+days(\s+of\s+invoice\s+date)?\.?\s*/gi, '')
        .trim();
    }
    return invoice.paymentTerms;
  }, [invoice?.paymentTerms, isWedding]);

  const hasPreviousBalance = Boolean(
    invoice?.showPreviousBalance && Number(invoice?.previousBalance) > 0 && invoice?.status !== 'paid' && invoice?.status !== 'cancelled'
  );
  const totalPayableNow = hasPreviousBalance
    ? (Number(invoice?.balanceDue) || 0) + Number(invoice?.previousBalance)
    : (Number(invoice?.balanceDue) || 0);
  const qrAmount = hasPreviousBalance ? totalPayableNow : invoice?.balanceDue;

  // Only show QR if there is a balance due (hide on fully paid or cancelled bills)
  const hasQrNeeded = Boolean(
    invoice &&
    invoice.status !== 'cancelled' &&
    invoice.status !== 'paid' &&
    (Number(invoice.balanceDue) > 0 || totalPayableNow > 0) &&
    (settings?.bankDetails?.upiId || settings?.upiId)
  );

  // Buttons are only enabled when QR is ready (or not needed)
  const isQrReady = !hasQrNeeded || (!isQrLoading && Boolean(qrDataUrl && qrDataUrl.length > 0));

  // Generate UPI QR Code with current balance due (or total payable now if previous balance shown)
  useEffect(() => {
    let isCancelled = false;

    if (!hasQrNeeded) {
      setQrDataUrl('');
      setQrSvgString('');
      setIsQrLoading(false);
      return;
    }

    const generateQr = async () => {
      setIsQrLoading(true);
      try {
        const activeUpiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();
        const upiUrl = buildUpiLink({
          upiId: activeUpiId,
          payeeName: settings?.bankDetails?.accountName || settings?.businessName || 'DR FILMS',
          amount: qrAmount,
          invoiceNumber: invoice.invoiceNumber
        });

        // Generate data URL (400px PNG, margin 1, pure black on white)
        const url = await generateQrDataUrl(upiUrl, { width: 400, margin: 1 });
        const svg = await generateQrSvgString(upiUrl, { width: 120 });

        if (!isCancelled) {
          setQrDataUrl(url);
          setQrSvgString(svg);
        }
      } catch (err) {
        console.error('Failed to generate UPI QR code:', err);
      } finally {
        if (!isCancelled) {
          setIsQrLoading(false);
        }
      }
    };

    generateQr();

    return () => {
      isCancelled = true;
    };
  }, [
    invoice?.balanceDue,
    invoice?.status,
    invoice?.invoiceNumber,
    invoice?.showPreviousBalance,
    invoice?.previousBalance,
    totalPayableNow,
    hasPreviousBalance,
    settings?.bankDetails?.upiId,
    settings?.bankDetails?.accountName,
    settings?.businessName,
    hasQrNeeded
  ]);

  /**
   * Diagnostic & safety helper to ensure QR data URL is generated and awaited right before PDF creation
   */
  const ensureQrDataUrl = async () => {
    if (!hasQrNeeded) {
      console.log('[DR FILMS PDF] QR code not needed (balance due is 0 or invoice paid).');
      return '';
    }
    let currentQr = qrDataUrl;
    if (!currentQr || currentQr.length === 0) {
      console.warn('[DR FILMS PDF] QR data URL is empty or undefined right before PDF generation. Generating and awaiting it now...');
      const activeUpiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();
      const upiUrl = buildUpiLink({
        upiId: activeUpiId,
        payeeName: settings?.bankDetails?.accountName || settings?.businessName || 'DR FILMS',
        amount: qrAmount,
        invoiceNumber: invoice?.invoiceNumber
      });
      currentQr = await generateQrDataUrl(upiUrl, { width: 400, margin: 1 });
      if (currentQr) {
        setQrDataUrl(currentQr);
      }
    }
    console.log('[DR FILMS PDF] QR data URL length right before PDF generation:', currentQr ? currentQr.length : 0);

    // Await document.getElementById('upi-qr').decode()
    const upiQrImg = document.getElementById('upi-qr');
    if (upiQrImg && typeof upiQrImg.decode === 'function') {
      try {
        await upiQrImg.decode();
      } catch (_) {}
    }

    return currentQr;
  };

  if (!invoice) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-slate-400">Loading invoice or bill not found...</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Invoices</span>
        </button>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isExporting || isSharing || !isQrReady) return;
    setIsExporting(true);
    setShareFeedback('Generating PDF...');
    const targetInvoice = effectiveInvoice || invoice;
    const filename = getInvoicePdfFilename(targetInvoice);

    try {
      const activeQrDataUrl = await ensureQrDataUrl();
      console.log('[DR FILMS PDF] QR Data URL length ready for download PDF:', activeQrDataUrl ? activeQrDataUrl.length : 0);

      // Await live upi-qr image decode before generating PDF
      const upiQrImg = document.getElementById('upi-qr');
      if (upiQrImg && typeof upiQrImg.decode === 'function') {
        try {
          await upiQrImg.decode();
        } catch (_) {}
      } else if (activeQrDataUrl && typeof Image !== 'undefined') {
        const preloadImg = new Image();
        preloadImg.src = activeQrDataUrl;
        if (typeof preloadImg.decode === 'function') {
          await preloadImg.decode().catch(() => {});
        }
      }

      await exportInvoiceToPdf('invoice-paper', filename, activeQrDataUrl, qrSvgString);
    } catch (err) {
      console.error('Download PDF error:', err);
    } finally {
      setShareFeedback('');
      setIsExporting(false);
    }
  };

  const handleWhatsAppTextOnly = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    openWhatsAppShare(effectiveInvoice || invoice, settings);
  };

  const handleSendOnWhatsApp = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Diagnostic logging for Issue A
    console.log('[DR FILMS SHARE] handleSendOnWhatsApp invoked at:', new Date().toISOString(), {
      isSharingRef: isSharingRef.current,
      isSharing,
      isExporting,
      isQrReady,
      hasQrNeeded
    });
    console.trace('[DR FILMS SHARE] Trace at start of share handler');

    // Synchronous guard against double-clicks, repeat taps, or re-invocations
    if (isSharingRef.current || isSharing || isExporting || !isQrReady) {
      console.warn('[DR FILMS SHARE] Invocation blocked by isSharing lock or pending QR readiness.');
      return;
    }
    isSharingRef.current = true;
    setIsSharing(true);
    setSharingActive(true);
    setShareFeedback('Preparing PDF...');

    const targetInvoice = effectiveInvoice || invoice;
    const filename = getInvoicePdfFilename(targetInvoice);
    const shortMessage = generateWhatsAppMessage(targetInvoice, settings);

    try {
      const activeQrDataUrl = await ensureQrDataUrl();
      console.log('[DR FILMS PDF] QR Data URL length ready for WhatsApp share:', activeQrDataUrl ? activeQrDataUrl.length : 0);

      // Await live upi-qr image decode before generating PDF
      const upiQrImg = document.getElementById('upi-qr');
      if (upiQrImg && typeof upiQrImg.decode === 'function') {
        try {
          await upiQrImg.decode();
        } catch (_) {}
      } else if (activeQrDataUrl && typeof Image !== 'undefined') {
        const preloadImg = new Image();
        preloadImg.src = activeQrDataUrl;
        if (typeof preloadImg.decode === 'function') {
          await preloadImg.decode().catch(() => {});
        }
      }

      // Generate exactly ONE single PDF File object from rendered invoice-paper using unified builder
      const pdfFile = await generateInvoicePdfFile('invoice-paper', filename, activeQrDataUrl, qrSvgString);

      // Check if WhatsApp Web flow should be used (desktop Mac/Windows, or forced via Settings)
      const useWeb = shouldOpenWhatsAppWeb(settings);

      if (useWeb) {
        console.log('[DR FILMS SHARE] Running desktop WhatsApp Web flow.');
        setShareFeedback('Downloading PDF & opening WhatsApp Web...');

        // 1. Download PDF blob automatically with filename DRF-0001_ClientName.pdf
        const downloadUrl = URL.createObjectURL(pdfFile);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        // 2. Show toast for 6 seconds: "PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file."
        setDownloadToast('PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file.');
        setTimeout(() => setDownloadToast(''), 6000);

        // 3. Open in a new tab: https://web.whatsapp.com/send?phone=<91 + client number, digits only>&text=<encodeURIComponent(short message)>
        const webUrl = getWhatsAppWebUrl(targetInvoice || invoice, settings) || getWhatsAppWebUrl(invoice, settings);
        window.open(webUrl, '_blank', 'noopener,noreferrer');

        setTimeout(() => setShareFeedback(''), 3000);
        return;
      }

      // Mobile (Android/iOS) or Always Share Sheet flow:
      const canShare = typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [pdfFile] });

      if (canShare) {
        console.log('[DR FILMS SHARE] Inside navigator.share() block on mobile. File to share:', pdfFile.name, {
          fileArray: [pdfFile],
          fileCount: [pdfFile].length,
          shortMessage
        });
        console.trace('[DR FILMS SHARE] Trace inside navigator.share() block');

        setShareFeedback('Opening WhatsApp / Share Sheet...');
        try {
          // Exactly ONE File is passed: navigator.share({ files: [file], text: shortMessage })
          await navigator.share({
            files: [pdfFile],
            text: shortMessage
          });
          console.log('[DR FILMS SHARE] navigator.share completed successfully.');
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            console.log('[DR FILMS SHARE] User cancelled share sheet (AbortError ignored).');
          } else {
            console.error('[DR FILMS SHARE] navigator.share encountered error:', shareErr);
          }
        }
        setShareFeedback('');
        return;
      }

      // Mobile fallback if navigator.share fails or is unsupported:
      console.log('[DR FILMS SHARE] Mobile fallback: downloading PDF and opening WhatsApp.');
      const downloadUrl = URL.createObjectURL(pdfFile);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      setDownloadToast('PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file.');
      setTimeout(() => setDownloadToast(''), 6000);

      openWhatsAppShare(targetInvoice, settings);
      setTimeout(() => setShareFeedback(''), 3000);
    } catch (err) {
      console.error('[DR FILMS SHARE] Share handler error:', err);
      setShareFeedback('Failed to generate or share PDF');
      setTimeout(() => setShareFeedback(''), 3000);
    } finally {
      isSharingRef.current = false;
      setIsSharing(false);
      setTimeout(() => setSharingActive(false), 5000);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Move invoice ${formatInvoiceNumber(invoice.invoiceNumber)} to Trash?\n\nIt will be hidden from reports and totals, and safely archived in Google Sheets.`)) {
      await db.invoices.update(invoice.id, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      scheduleAutoSync(500);
      onBack();
    }
  };

  const handleRestore = async () => {
    await db.invoices.update(invoice.id, {
      isDeleted: false,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    setUndoToast({
      invoiceId: invoice.id,
      previousState: { isDeleted: true },
      message: `Invoice ${formatInvoiceNumber(invoice.invoiceNumber)} restored from Trash`
    });
  };

  const handleReinstate = async () => {
    if (!window.confirm(`Reinstate bill ${formatInvoiceNumber(invoice.invoiceNumber)}? It will be restored to active status.`)) return;
    const newStatus = determineReinstatedStatus(invoice);
    const prevStatus = invoice.status;
    const prevCancelledAt = invoice.cancelledAt;
    const prevCancelReason = invoice.cancelReason;

    await db.invoices.update(invoice.id, {
      status: newStatus,
      cancelledAt: null,
      cancelReason: null,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    setUndoToast({
      invoiceId: invoice.id,
      previousState: { status: prevStatus, cancelledAt: prevCancelledAt, cancelReason: prevCancelReason },
      message: `Bill ${formatInvoiceNumber(invoice.invoiceNumber)} reinstated`
    });
  };

  const handlePermanentDelete = async () => {
    const confirmed = window.confirm(
      `Permanently delete invoice ${formatInvoiceNumber(invoice.invoiceNumber)} from this device?\n\nIt will be removed from the app only, and the Google Sheet copy stays as a permanent backup.`
    );
    if (!confirmed) return;

    await recordPermanentlyDeletedInvoice(invoice);
    await db.invoices.delete(invoice.id);
    scheduleAutoSync(500);
    onBack();
  };

  const handleMarkAsPaid = () => {
    setIsMarkAsPaidOpen(true);
  };

  const handleConfirmMarkAsPaid = async (inv, { method, date, note }) => {
    const target = inv || invoice;
    const previousState = {
      advancePaid: target.advancePaid || 0,
      balanceDue: target.balanceDue || 0,
      status: target.status,
      payments: Array.isArray(target.payments) ? [...target.payments] : []
    };

    const activeExistingPayments = (target.payments || []).filter(p => !p?.isDeleted);
    const existingPaid = activeExistingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalAmount = Number(target.totalAmount) || 0;
    const remaining = Math.max(0, Math.round((totalAmount - existingPaid) * 100) / 100);

    const newPayment = {
      id: `PAY-${Date.now()}`,
      date: date || new Date().toISOString().split('T')[0],
      amount: remaining > 0 ? remaining : totalAmount,
      method: method || 'Cash',
      note: note || 'Marked as Paid'
    };

    const updatedPayments = [...activeExistingPayments, newPayment];

    await db.invoices.update(target.id, {
      advancePaid: totalAmount,
      balanceDue: 0,
      status: 'paid',
      payments: updatedPayments,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);

    setIsMarkAsPaidOpen(false);
    setUndoToast({
      invoiceId: target.id,
      previousState,
      message: `Invoice ${formatInvoiceNumber(target.invoiceNumber)} marked as Paid via ${method || 'Cash'}`
    });
  };

  const handleMarkAsUnpaid = async () => {
    if (!window.confirm(`Mark invoice ${formatInvoiceNumber(invoice.invoiceNumber)} as unpaid? This will remove recorded payments and restore the balance due.`)) return;

    const previousState = {
      advancePaid: invoice.advancePaid || 0,
      balanceDue: invoice.balanceDue || 0,
      status: invoice.status,
      payments: Array.isArray(invoice.payments) ? [...invoice.payments] : []
    };

    await db.invoices.update(invoice.id, {
      advancePaid: 0,
      balanceDue: invoice.totalAmount || 0,
      status: 'unpaid',
      payments: [],
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);

    setUndoToast({
      invoiceId: invoice.id,
      previousState,
      message: `Invoice ${formatInvoiceNumber(invoice.invoiceNumber)} marked as Unpaid`
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

  const handleDeletePayment = async (paymentId) => {
    const p = (invoice.payments || []).find(item => item.id === paymentId);
    if (!p) return;
    if (!window.confirm(`Delete payment of ${formatCurrency(p?.amount || 0, sym)} recorded on ${p?.date}? The invoice balance and status will be recalculated.`)) {
      return;
    }

    const updatedPayments = (invoice.payments || []).filter(item => item.id !== paymentId);
    const recalculated = recalculateInvoicePayments(invoice, updatedPayments);

    await db.invoices.update(invoice.id, {
      ...recalculated,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
  };

  const handleRestorePayment = async (paymentId) => {
    const updatedPayments = (invoice.payments || []).map(item => {
      if (item.id === paymentId) {
        return {
          ...item,
          isDeleted: false,
          restoredAt: new Date().toISOString()
        };
      }
      return item;
    });
    const recalculated = recalculateInvoicePayments(invoice, updatedPayments);

    await db.invoices.update(invoice.id, {
      ...recalculated,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
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

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Action Toolbar (Never Printed) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Back to Invoices"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-base text-slate-100 tabular-nums">
                {formatInvoiceNumber(invoice.invoiceNumber)}
              </span>
              {invoice.isDeleted ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  In Trash
                </span>
              ) : (
                <StatusBadge status={invoice.status} size="sm" />
              )}
            </div>
            <p className="text-xs text-slate-400">
              Client: {activeCustomer?.name || invoice.customerSnapshot?.name}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {invoice.isDeleted ? (
            <>
              <button
                type="button"
                onClick={handleRestore}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold py-2 px-3.5 rounded-xl shadow-sm transition-colors cursor-pointer"
                title="Restore this bill"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Bill</span>
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow-sm transition-colors cursor-pointer"
                title="Delete permanently from app (stays in Google Sheet)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete permanently</span>
              </button>
            </>
          ) : (
            <>
              {invoice.status === 'cancelled' ? (
                <>
                  <button
                    type="button"
                    onClick={handleReinstate}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold py-2 px-3.5 rounded-xl shadow-sm transition-colors cursor-pointer"
                    title="Reinstate this cancelled bill"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reinstate Bill</span>
                  </button>

                  {((invoice.advancePaid || 0) > 0 || (invoice.payments || []).some(p => !p?.isDeleted && p.amount > 0)) && (
                    <button
                      type="button"
                      onClick={() => setIsRefundModalOpen(true)}
                      className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold py-2 px-3 rounded-xl border border-rose-500/30 transition-colors"
                      title="Record Refund for this bill"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Record Refund</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isSharing || isExporting}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download Offline PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isExporting ? 'Generating...' : 'PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors"
                    title="Print Invoice"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Invoice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  {invoice.status === 'paid' ? (
                    <button
                      type="button"
                      onClick={handleMarkAsUnpaid}
                      className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold py-2 px-3 rounded-xl border border-rose-500/30 transition-colors"
                      title="Mark invoice as Unpaid"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Mark as Unpaid</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMarkAsPaid}
                      className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold py-2 px-3 rounded-xl border border-emerald-500/30 transition-colors"
                      title="Mark invoice as Paid"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark as Paid</span>
                    </button>
                  )}

                  {invoice.balanceDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold py-2 px-3 rounded-xl border border-emerald-500/30 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Record Payment</span>
                    </button>
                  )}

                  {/* Send on WhatsApp Button */}
                  <button
                    type="button"
                    onClick={handleSendOnWhatsApp}
                    disabled={isSharing || isExporting || !isQrReady}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow-sm transition-colors border border-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Send PDF invoice with summary on WhatsApp"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-200" />
                    <span>{isSharing ? 'Sending...' : 'Send on WhatsApp'}</span>
                  </button>

                  {/* Small Text Only Button */}
                  <button
                    type="button"
                    onClick={handleWhatsAppTextOnly}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2 px-2.5 rounded-xl border border-slate-700 transition-colors"
                    title="Send invoice text summary on WhatsApp without PDF attachment"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Text only</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isSharing || isExporting || !isQrReady}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download Offline PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isExporting ? 'Generating...' : 'PDF'}</span>
                  </button>

                  {linkedProject ? (
                    <button
                      type="button"
                      onClick={() => onGoToProjects && onGoToProjects(linkedProject.id)}
                      className="flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-semibold py-2 px-3 rounded-xl border border-purple-500/30 transition-colors"
                      title="View linked project / job"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                      <span>Job: {linkedProject.stage}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsProjectModalOpen(true)}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors"
                      title="Create linked production job for this bill"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                      <span>Create Job</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsContractModalOpen(true)}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors cursor-pointer"
                    title="Generate Shoot Booking Agreement / Production Contract"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Agreement</span>
                  </button>

                  {/* PDF Style & Theme Switcher */}
                  <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-sm">
                    <Palette className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-0.5" />
                    <button
                      type="button"
                      onClick={() => handleThemeChange('cinematic')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        invoiceTheme === 'cinematic'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Cinematic Studio Theme (Obsidian & Amber Gold)"
                    >
                      Cinematic
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('corporate')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        invoiceTheme === 'corporate'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Corporate Formal Theme (Clean Blue & Slate)"
                    >
                      Corporate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('minimal')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        invoiceTheme === 'minimal'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Minimalist Modern Theme (Refined Monochrome)"
                    >
                      Minimal
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700 transition-colors"
                    title="Print Invoice"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEdit(invoice.id)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    title="Edit Invoice"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-colors"
                    title="Cancel / Void Bill"
                  >
                    <Ban className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Invoice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {shareFeedback && (
          <div className="w-full mt-2 py-2 px-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span className="font-medium">{shareFeedback}</span>
          </div>
        )}
      </div>

      {/* Cancelled Notice Banner */}
      {invoice.status === 'cancelled' && !invoice.isDeleted && (
        <div className="glass-card bg-slate-900/90 border border-slate-700 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-300">
          <div className="flex items-center gap-3">
            <Ban className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                <span>This bill is CANCELLED</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Void
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Reason: <strong className="text-slate-200">{invoice.cancelReason || 'Cancelled'}</strong>
                {invoice.cancelledAt && ` • Cancelled on ${formatDate(invoice.cancelledAt)}`}
                {'. Excluded from income, receivables, client balances, and payment allocations.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReinstate}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reinstate Bill</span>
            </button>
            {((invoice.advancePaid || 0) > 0 || (invoice.payments || []).some(p => !p?.isDeleted && p.amount > 0)) && (
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(true)}
                className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Record Refund</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trash Warning Banner */}
      {invoice.isDeleted && (
        <div className="glass-card bg-rose-950/30 border border-rose-500/40 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-sm">This invoice is in Trash</p>
              <p className="text-xs text-rose-300/80">
                Deleted {invoice.deletedAt ? formatDate(invoice.deletedAt) : ''}. It does not count towards totals, client balances, or pending receivables. It is safely archived in Google Sheets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestore}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
            <button
              type="button"
              onClick={handlePermanentDelete}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete permanently</span>
            </button>
          </div>
        </div>
      )}

      {/* Invoice Document Paper */}
      <div
        id="invoice-paper"
        className={`relative overflow-hidden bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-10 lg:p-12 border border-slate-200 transition-all font-sans print:p-0 print:border-none print:shadow-none invoice-theme-${invoiceTheme}`}
      >
        {/* Top Style Accent Bar */}
        {invoiceTheme === 'cinematic' && (
          <div className="pdf-accent-bar h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 rounded-full mb-6" />
        )}
        {invoiceTheme === 'corporate' && (
          <div className="pdf-accent-bar h-2 w-full bg-slate-900 rounded-full mb-6" />
        )}
        {invoiceTheme === 'minimal' && (
          <div className="pdf-accent-bar h-0.5 w-full bg-slate-200 mb-6" />
        )}
        {/* PAID stamp badge */}
        {invoice.status === 'paid' && (
          <div className="absolute top-6 right-6 sm:top-10 sm:right-12 pointer-events-none select-none z-10">
            <div className="paid-stamp px-5 py-1.5 sm:px-7 sm:py-2 bg-emerald-50/80 backdrop-blur-[1px] shadow-sm flex flex-col items-center">
              <span className="text-2xl sm:text-4xl font-black">PAID</span>
              <span className="text-[9px] sm:text-[10px] tracking-widest font-bold -mt-0.5 text-emerald-800">
                PAYMENT RECEIVED
              </span>
            </div>
          </div>
        )}

        {/* CANCELLED stamp / watermark */}
        {invoice.status === 'cancelled' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center select-none z-20 overflow-hidden">
            <div className="transform -rotate-12 border-8 border-rose-600/35 text-rose-600/35 font-black text-6xl sm:text-8xl tracking-widest px-8 py-3 uppercase rounded-3xl">
              CANCELLED
            </div>
          </div>
        )}

        {/* Document Header */}
        <div className="pdf-header-block pb-5 border-b-2 border-slate-900">
          <div className="pdf-row-flex flex flex-col sm:flex-row justify-between items-start gap-6">
            {/* Business Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                {settings?.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt={settings.businessName}
                    className="w-12 h-12 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-amber-400 font-bold">
                    <Clapperboard className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h1 className="font-display font-extrabold text-2xl tracking-tight text-slate-950">
                    {settings?.businessName || 'DR FILMS'}
                  </h1>
                  <p className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {settings?.tagline || 'Creative Services & Film Studio'}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-700 space-y-0.5 pt-0.5 font-normal">
                {settings?.ownerName && (
                  <p className="font-medium text-slate-800">
                    <span className="text-slate-600">Owner:</span> <strong className="font-bold text-slate-950">{settings.ownerName}</strong>
                  </p>
                )}
                <p className="font-medium text-slate-800">
                  {settings?.phone && <span>Phone: <strong className="font-bold text-slate-950">{formatPhoneNumber(settings.phone)}</strong></span>}
                  {settings?.email && <span className="ml-2">• {settings.email}</span>}
                </p>
                {settings?.address && <p className="font-medium text-slate-800">{settings.address}</p>}
                {settings?.gstin && (
                  <p className="font-bold text-slate-950 tracking-wider text-xs">
                    GSTIN: {settings.gstin}
                  </p>
                )}
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="pdf-text-right sm:text-right space-y-1.5 shrink-0">
              <div className="inline-block bg-slate-950 text-white font-sans font-black text-xs uppercase px-3.5 py-1.5 rounded-md tracking-wider mb-1 shadow-none">
                TAX INVOICE
              </div>
              <div className="text-2xl font-display font-black text-slate-950 tracking-tight tabular-nums">
                #{formatInvoiceNumber(invoice.invoiceNumber)}
              </div>
            </div>
          </div>

          {/* Single Row Below Firm Mobile Number: Date, Due Date, Event Type, Event Date, Status */}
          <div className="pdf-meta-row mt-3.5 pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-slate-800">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Date:</span>
                <span className="font-bold text-slate-950 tabular-nums">{formatDate(invoice.invoiceDate)}</span>
              </div>

              {invoice.dueDate && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Due Date:</span>
                  <span className="font-bold text-slate-950 tabular-nums">{formatDate(invoice.dueDate)}</span>
                </div>
              )}

              {invoice.eventType && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Event:</span>
                  <span className="font-bold text-slate-950">{invoice.eventType}</span>
                </div>
              )}

              {invoice.eventDate && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Event Date:</span>
                  <span className="font-bold text-slate-950 tabular-nums">{formatDate(invoice.eventDate)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Status:</span>
              <span className={`inline-block px-3 py-0.5 rounded-md font-black uppercase text-[10px] tracking-wider border shadow-none ${
                invoice.status === 'cancelled' ? 'bg-slate-200 text-slate-800 border-slate-300' :
                invoice.status === 'paid' ? 'bg-emerald-600 text-white border-emerald-600' :
                invoice.status === 'partially_paid' ? 'bg-amber-400 text-slate-950 border-amber-500' : 'bg-rose-600 text-white border-rose-600'
              }`}>
                {invoice.status === 'cancelled' ? 'CANCELLED' : invoice.status?.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Cancellation Notice on Paper */}
        {invoice.status === 'cancelled' && (
          <div className="my-4 p-3.5 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-800">
            <span className="font-bold text-slate-950 uppercase text-[10px] tracking-wider block">
              BILL CANCELLED / VOID
            </span>
            <p className="text-slate-700 mt-0.5">
              Reason: <strong className="text-slate-950">{invoice.cancelReason || 'Cancelled'}</strong>
              {invoice.cancelledAt && ` • Date: ${formatDate(invoice.cancelledAt)}`}
            </p>
          </div>
        )}

        {/* Billed To Section */}
        <div className="pdf-grid-2col py-6 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              BILLED TO:
            </h4>
            <div className="space-y-1">
              <p className="font-black text-base text-slate-950">
                {activeCustomer?.name || invoice.customerSnapshot?.name}
              </p>
              {(activeCustomer?.company || invoice.customerSnapshot?.company) && (
                <p className="font-semibold text-slate-800">
                  {activeCustomer?.company || invoice.customerSnapshot.company}
                </p>
              )}
              {(activeCustomer?.phone || invoice.customerSnapshot?.phone) && (
                <p className="text-slate-800 font-medium tabular-nums">
                  Phone: {formatPhoneNumber(activeCustomer?.phone || invoice.customerSnapshot.phone)}
                </p>
              )}
              {(activeCustomer?.email || invoice.customerSnapshot?.email) && (
                <p className="text-slate-700 font-medium">
                  Email: {activeCustomer?.email || invoice.customerSnapshot.email}
                </p>
              )}
              {(activeCustomer?.address || invoice.customerSnapshot?.address) && (
                <p className="text-slate-700 mt-1 max-w-sm leading-relaxed">
                  {activeCustomer?.address || invoice.customerSnapshot.address}
                </p>
              )}
              {(activeCustomer?.gstin || invoice.customerSnapshot?.gstin) && (
                <p className="text-slate-950 font-bold tracking-wider mt-1">
                  GSTIN / Tax ID: {activeCustomer?.gstin || invoice.customerSnapshot.gstin}
                </p>
              )}
            </div>
          </div>

          {/* Quick Payment Status Box */}
          <div className="pdf-text-right sm:text-right flex flex-col sm:items-end justify-center">
            <div className={`pdf-status-box p-4 rounded-xl border inline-block text-left w-full sm:w-auto min-w-[230px] ${
              invoice.status === 'cancelled'
                ? 'bg-slate-100 border-slate-300'
                : invoice.status === 'paid'
                ? 'bg-emerald-50/80 border-emerald-300'
                : hasPreviousBalance
                  ? 'bg-amber-50/70 border-amber-300'
                  : 'bg-slate-50 border-slate-300'
            }`}>
              <span className={`text-[10px] uppercase font-extrabold block tracking-wider ${
                invoice.status === 'cancelled'
                  ? 'text-slate-600'
                  : invoice.status === 'paid'
                  ? 'text-emerald-800'
                  : hasPreviousBalance
                    ? 'text-amber-900'
                    : 'text-slate-700'
              }`}>
                {invoice.status === 'cancelled'
                  ? 'BILL STATUS'
                  : invoice.status === 'paid'
                  ? 'PAYMENT STATUS'
                  : hasPreviousBalance
                    ? 'TOTAL PAYABLE NOW'
                    : 'BALANCE DUE'}
              </span>
              <div className={`font-display font-black text-2xl tabular-nums mt-0.5 ${
                invoice.status === 'cancelled'
                  ? 'text-slate-700'
                  : invoice.status === 'paid' 
                  ? 'text-emerald-800' 
                  : 'text-slate-950'
              }`}>
                {invoice.status === 'cancelled'
                  ? 'CANCELLED'
                  : invoice.status === 'paid' 
                  ? 'PAID IN FULL' 
                  : hasPreviousBalance
                    ? formatCurrency(totalPayableNow, sym)
                    : formatCurrency(invoice.balanceDue, sym)}
              </div>
              <p className="text-[11px] text-slate-700 font-medium mt-1">
                {invoice.status === 'cancelled'
                  ? (invoice.advancePaid > 0 ? `Paid: ${formatCurrency(invoice.advancePaid, sym)} (Refund may be due)` : 'Bill is void')
                  : invoice.status === 'paid'
                  ? `Payment Received: ${formatCurrency(invoice.advancePaid || invoice.totalAmount, sym)}`
                  : hasPreviousBalance
                    ? `This bill ${formatCurrency(invoice.balanceDue, sym)} + Previous ${formatCurrency(invoice.previousBalance, sym)}`
                    : invoice.status === 'partially_paid'
                      ? `Amount Paid: ${formatCurrency(invoice.advancePaid, sym)} • Total: ${formatCurrency(invoice.totalAmount, sym)}`
                      : invoice.advancePaid > 0
                        ? `Advance Paid: ${formatCurrency(invoice.advancePaid, sym)} • Total: ${formatCurrency(invoice.totalAmount, sym)}`
                        : `Total Bill: ${formatCurrency(invoice.totalAmount, sym)}`}
              </p>
            </div>
          </div>
        </div>

        {/* Services & Line Items Table */}
        <div className="pdf-table-container py-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-slate-50/80 text-slate-900 uppercase text-[11px] tracking-wider font-extrabold">
                <th className="py-2.5 pr-2 pl-2 w-10 text-slate-800">#</th>
                <th className="py-2.5 px-3">Service / Description</th>
                {!isWedding && <th className="py-2.5 px-2 text-center w-20">Unit</th>}
                <th className={`py-2.5 px-3 text-right ${isWedding ? 'w-32' : 'w-28'}`}>Rate</th>
                {!isWedding && <th className="py-2.5 px-2 text-center w-16">Qty</th>}
                <th className={`py-2.5 pl-3 pr-4 text-right ${isWedding ? 'w-36' : 'w-32'}`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {(invoice.items || []).map((item, idx) => (
                <tr key={item.id || idx} className="break-inside-avoid">
                  <td className="py-3.5 pr-2 pl-2 text-slate-600 font-bold text-xs tabular-nums">{idx + 1}</td>
                  <td className="py-3.5 px-3 font-medium">
                    <span className="text-slate-950 font-bold text-sm block">{item.name}</span>
                    {item.description && (
                      <span className="text-slate-700 text-xs block mt-0.5 font-normal leading-relaxed">{item.description}</span>
                    )}
                  </td>
                  {!isWedding && (
                    <td className="py-3.5 px-2 text-center text-slate-700 font-medium text-xs">
                      {UNIT_SHORT[item.unit] || item.unit}
                    </td>
                  )}
                  <td className={`py-3.5 px-3 text-right font-semibold text-slate-900 text-xs tabular-nums ${isWedding ? 'w-32' : 'w-28'}`}>
                    {formatCurrency(item.rate, sym)}
                  </td>
                  {!isWedding && (
                    <td className="py-3.5 px-2 text-center font-bold text-slate-900 text-xs tabular-nums">
                      {item.quantityLabel || item.quantity}
                    </td>
                  )}
                  <td className={`py-3.5 pl-3 pr-4 text-right font-display font-black text-slate-950 text-sm tabular-nums ${isWedding ? 'w-36' : 'w-32'}`}>
                    {formatCurrency(item.amount, sym)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Breakdown & Bank / QR Code Block */}
        <div className="pdf-grid-12col pt-5 border-t-2 border-slate-900 grid grid-cols-1 md:grid-cols-12 gap-8 break-inside-avoid">
          {/* Left Column (Banking & UPI QR Card) */}
          <div className="pdf-col-7 md:col-span-7 text-xs">
            {/* Payment Details Box */}
            <div className="pdf-payment-card p-4 bg-slate-50/90 rounded-xl border border-slate-300">
              <h5 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-950 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                <span>PAYMENT METHODS & BANK TRANSFER</span>
              </h5>

              <div className="pdf-row-flex flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="flex-1 min-w-0 space-y-1 text-xs text-slate-900">
                  {settings?.bankDetails?.bankName && (
                    <p className="break-words"><span className="text-slate-600 font-sans font-medium">Bank:</span> <strong className="text-slate-950 font-bold">{settings.bankDetails.bankName}</strong></p>
                  )}
                  {settings?.bankDetails?.accountName && (
                    <p className="break-words"><span className="text-slate-600 font-sans font-medium">A/C Name:</span> <strong className="text-slate-950 font-bold">{settings.bankDetails.accountName}</strong></p>
                  )}
                  {settings?.bankDetails?.accountNumber && (
                    <p className="break-words"><span className="text-slate-600 font-sans font-medium">A/C No:</span> <strong className="text-slate-950 font-bold tabular-nums">{settings.bankDetails.accountNumber}</strong></p>
                  )}
                  {settings?.bankDetails?.ifsc && (
                    <p className="break-words"><span className="text-slate-600 font-sans font-medium">IFSC Code:</span> <strong className="text-slate-950 font-bold tracking-wider">{settings.bankDetails.ifsc}</strong></p>
                  )}
                </div>

                {/* QR Code Block: only show if there is a balance due; hide completely on fully paid bills */}
                {hasQrNeeded && qrDataUrl ? (
                  <div
                    className="text-center shrink-0 self-center"
                    id="invoice-qr-block"
                    style={{ overflow: 'visible', transform: 'none', filter: 'none' }}
                  >
                    <div
                      id="invoice-qr-box"
                      className="bg-white border-2 border-slate-300 rounded-xl shadow-none"
                      style={{
                        width: '140px',
                        height: '140px',
                        minWidth: '140px',
                        minHeight: '140px',
                        maxWidth: '140px',
                        maxHeight: '140px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        backgroundColor: '#ffffff',
                        overflow: 'visible',
                        transform: 'none',
                        animation: 'none',
                        filter: 'none',
                        opacity: 1
                      }}
                    >
                      <img
                        id="upi-qr"
                        src={qrDataUrl}
                        alt="UPI Payment QR"
                        width="120"
                        height="120"
                        style={{
                          display: 'block',
                          margin: 'auto',
                          width: 120,
                          height: 120,
                          opacity: 1,
                          filter: 'none'
                        }}
                      />
                    </div>
                    <span
                      className="block text-[10px] text-slate-700 font-bold mt-1.5 uppercase tracking-wide"
                      style={{ opacity: 1, filter: 'none' }}
                    >
                      Scan to Pay via UPI
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Dedicated Full-Width UPI ID Strip (Never overlaps or hides under QR code in PDF) */}
              {(settings?.bankDetails?.upiId || settings?.upiId) && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-sans font-medium">UPI ID:</span>{' '}
                    <span className="text-emerald-800 font-bold font-mono tracking-tight select-all text-xs break-all">
                      {settings?.bankDetails?.upiId || settings?.upiId}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Accepted via all UPI apps (GPay, PhonePe, Paytm, BHIM)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Totals Calculation) */}
          <div className="pdf-col-5 md:col-span-5 space-y-1.5 text-xs">
            <div className="flex justify-between py-1 text-slate-700 font-medium">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(invoice.subtotal, sym)}</span>
            </div>

            {/* Custom charges breakdown */}
            {(invoice.charges || []).map((ch, i) => {
              const isDiscount = ch.nature === 'discount';
              return (
                <div key={i} className="flex justify-between py-0.5 text-slate-800 font-medium">
                  <span className="truncate pr-2">
                    {ch.name} {isDiscount ? '(-)' : '(+)'}:
                  </span>
                  <span className={`font-bold tabular-nums ${isDiscount ? 'text-emerald-700' : 'text-slate-950'}`}>
                    {isDiscount ? '-' : '+'}{formatCurrency(ch.amount, sym)}
                  </span>
                </div>
              );
            })}

            {/* General Discount */}
            {invoice.discountValue > 0 && (
              <div className="flex justify-between py-0.5 text-emerald-800 font-medium">
                <span>Discount ({invoice.discountType === 'percentage' ? `${invoice.discountValue}%` : 'Flat'}):</span>
                <span className="font-bold tabular-nums">-{formatCurrency(invoice.discount, sym)}</span>
              </div>
            )}

            {/* Tax */}
            {invoice.taxPercentage > 0 && (
              <div className="flex justify-between py-1 border-t border-slate-200 text-slate-800 font-medium">
                <span>{settings?.taxLabel || 'GST'} ({invoice.taxPercentage}%):</span>
                <span className="font-bold tabular-nums">+{formatCurrency(invoice.taxAmount, sym)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-bold text-slate-950">
              <span>Total Amount:</span>
              <span className="font-display font-black text-base tabular-nums">
                {formatCurrency(invoice.totalAmount, sym)}
              </span>
            </div>

            {/* Payment Received / Amount Paid / Advance Paid */}
            {(invoice.status === 'paid' || (invoice.advancePaid || 0) > 0) && (
              <div className="flex justify-between py-1 text-emerald-800 font-semibold">
                <span>{getPaymentLabel(invoice.status, invoice.advancePaid)}:</span>
                <span className="font-bold tabular-nums">
                  -{formatCurrency(invoice.advancePaid || (invoice.status === 'paid' ? invoice.totalAmount : 0), sym)}
                </span>
              </div>
            )}

            {/* Payment Breakdown (Clear readable text for print and PDF) */}
            {Array.isArray(invoice.payments) && invoice.payments.filter(p => !p?.isDeleted).length > 0 && (
              <div className="py-2 px-3 bg-slate-100/90 rounded-lg border border-slate-300 text-xs space-y-1.5 my-1.5">
                <span className="font-extrabold text-slate-900 uppercase tracking-wider block text-[10px]">
                  Payments Received:
                </span>
                {invoice.payments.filter(p => !p?.isDeleted).map((p, idx) => (
                  <div key={p.id || idx} className="flex justify-between items-center text-slate-950 text-[11px] font-semibold leading-normal">
                    <span className="pr-2 leading-normal">
                      • {formatDate(p.date)} ({p.method || 'Payment'}){p.note ? ` - ${p.note}` : ''}:
                    </span>
                    <span className="font-bold text-emerald-800 shrink-0 tabular-nums">
                      +{formatCurrency(p.amount, sym)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* When Previous Balance is shown: "This bill balance" then "Previous pending (list invoice numbers)" */}
            {hasPreviousBalance && invoice.status !== 'paid' && (
              <>
                <div className="flex justify-between py-1 text-slate-800 font-semibold border-t border-slate-200">
                  <span>This bill balance:</span>
                  <span className="font-bold text-slate-950 tabular-nums">
                    {formatCurrency(invoice.balanceDue, sym)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-amber-800 font-semibold">
                  <span>
                    Previous pending
                    {Array.isArray(invoice.previousInvoiceNumbers) && invoice.previousInvoiceNumbers.length > 0 && (
                      <span className="text-[10px] text-slate-600 font-medium ml-1">
                        ({invoice.previousInvoiceNumbers.map(formatInvoiceNumber).join(', ')})
                      </span>
                    )}:
                  </span>
                  <span className="font-bold text-amber-900 tabular-nums">
                    {formatCurrency(invoice.previousBalance, sym)}
                  </span>
                </div>
              </>
            )}

            {/* Highlighted bar: Cancelled, Paid, Previous Balance, or Balance Due */}
            <div className={`flex justify-between py-3 px-4 rounded-xl font-bold text-sm items-baseline ${
              invoice.status === 'cancelled'
                ? 'bg-slate-700 text-white'
                : invoice.status === 'paid'
                ? 'bg-emerald-900 text-white'
                : 'bg-slate-950 text-white shadow-sm'
            }`}>
              <span className={`uppercase text-[11px] tracking-wider ${
                invoice.status === 'cancelled'
                  ? 'text-slate-200'
                  : invoice.status === 'paid'
                  ? 'text-emerald-200'
                  : 'text-amber-400'
              }`}>
                {invoice.status === 'cancelled'
                  ? 'Balance Due (Cancelled):'
                  : invoice.status === 'paid'
                  ? 'Balance Due:'
                  : hasPreviousBalance
                    ? 'TOTAL PAYABLE NOW:'
                    : 'Balance Due:'}
              </span>
              <span className={`font-display font-black text-lg tabular-nums ${
                invoice.status === 'cancelled'
                  ? 'text-slate-200'
                  : invoice.status === 'paid'
                  ? 'text-emerald-200'
                  : 'text-amber-400'
              }`}>
                {invoice.status === 'cancelled'
                  ? formatCurrency(0, sym)
                  : invoice.status === 'paid'
                  ? `${formatCurrency(0, sym)} (PAID)`
                  : hasPreviousBalance
                    ? formatCurrency(totalPayableNow, sym)
                    : formatCurrency(invoice.balanceDue, sym)}
              </span>
            </div>
          </div>
        </div>

        {/* Terms and Notes: Full-width balanced footer strip */}
        {(displayPaymentTerms || invoice.notes) && (
          <div className="pdf-terms-block mt-4 pt-3 border-t border-slate-200/90 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700 break-inside-avoid">
            {displayPaymentTerms && (
              <div>
                <span className="font-bold text-[10px] uppercase tracking-wider text-slate-700 block mb-0.5">
                  Terms & Conditions:
                </span>
                <p className="text-slate-600 text-xs leading-relaxed">{displayPaymentTerms}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <span className="font-bold text-[10px] uppercase tracking-wider text-slate-700 block mb-0.5">
                  Production Notes:
                </span>
                <p className="text-slate-600 text-xs leading-relaxed">{invoice.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Signature & Footer */}
        <div className="pdf-row-flex pdf-footer-row pt-5 mt-5 border-t-2 border-slate-900 flex flex-col sm:flex-row justify-between items-end gap-6 text-xs text-slate-700 break-inside-avoid">
          <div>
            <p className="font-black text-slate-950 text-sm">{settings?.businessName || 'DR FILMS'}</p>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Thank you for your business & creative collaboration!</p>
          </div>

          <div className="pdf-text-right text-center sm:text-right">
            <div className="pdf-signature-line h-10 w-48 border-b-2 border-slate-800 mx-auto sm:ml-auto" />
            <p className="text-xs font-bold text-slate-950 mt-1.5 uppercase tracking-wider">
              Authorized Signatory
            </p>
            {settings?.ownerName && (
              <p className="text-[11px] text-slate-700 font-semibold mt-0.5">({settings.ownerName})</p>
            )}
          </div>
        </div>
      </div>

      {/* Payments Received Table (Never Printed) */}
      <div className="no-print bg-slate-900/90 backdrop-blur-md p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <h3 className="font-display font-bold text-base text-slate-100">
              Payments Received
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">Total Paid:</span>
            <span className="font-display font-bold text-emerald-400 text-sm tabular-nums">
              {formatCurrency(invoice.advancePaid || (invoice.status === 'paid' ? invoice.totalAmount : 0), sym)}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">Balance:</span>
            <span className="font-display font-bold text-amber-400 text-sm tabular-nums">
              {formatCurrency(invoice.balanceDue || 0, sym)}
            </span>
            {Array.isArray(invoice.payments) && invoice.payments.some(p => !p.isDeleted && Number(p.amount) > 0) && (
              <button
                type="button"
                onClick={() => {
                  const latest = [...invoice.payments].reverse().find(p => !p.isDeleted && Number(p.amount) > 0);
                  if (latest) {
                    setReceiptPayment(latest);
                    setReceiptInitialAction(null);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors cursor-pointer ml-1"
                title="Download & Send Latest Payment Receipt PDF"
              >
                <Receipt className="w-3.5 h-3.5 text-amber-400" />
                <span>Receipt (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {Array.isArray(invoice.payments) && invoice.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Note</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center min-w-[140px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {invoice.payments.map((pmt, pIdx) => (
                  <tr key={pmt.id || pIdx} className={`hover:bg-slate-800/40 transition-colors ${pmt.isDeleted ? 'opacity-60 bg-rose-950/10' : ''}`}>
                    <td className="py-3 px-3 tabular-nums text-slate-300">
                      {formatDate(pmt.date)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${pmt.amount < 0 ? 'bg-amber-950/40 text-amber-300 border-amber-700/50' : 'bg-slate-800 text-slate-200 border-slate-700'}`}>
                          {pmt.amount < 0 ? 'Refund' : (pmt.method || 'Payment')}
                        </span>
                        {pmt.isDeleted && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Deleted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {pmt.note || '—'}
                    </td>
                    <td className={`py-3 px-3 text-right font-display font-bold tabular-nums ${pmt.isDeleted ? 'line-through text-slate-500' : pmt.amount < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {pmt.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(pmt.amount), sym)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!pmt.isDeleted && Number(pmt.amount) > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptPayment(pmt);
                                setReceiptInitialAction(null);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Open Payment Receipt Voucher Preview"
                            >
                              <Receipt className="w-3 h-3" />
                              <span>Receipt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptPayment(pmt);
                                setReceiptInitialAction('download');
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 transition-colors cursor-pointer"
                              title="Download Payment Receipt PDF"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptPayment(pmt);
                                setReceiptInitialAction('share');
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 border border-slate-700 transition-colors cursor-pointer"
                              title="Send Payment Receipt PDF to Client via WhatsApp"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {pmt.isDeleted ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRestorePayment(pmt.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                              title="Restore this payment record"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(pmt.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Permanently remove payment record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(pmt.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Delete this payment record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 text-xs">
            No payments recorded yet. Click &quot;Record Payment&quot; or &quot;Mark as Paid&quot; above to log payments.
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        invoice={invoice}
        currencySymbol={sym}
        onSavePayment={handleSavePayment}
      />

      {/* Mark as Paid Modal */}
      <MarkAsPaidModal
        isOpen={isMarkAsPaidOpen}
        onClose={() => setIsMarkAsPaidOpen(false)}
        invoice={invoice}
        currencySymbol={sym}
        onConfirm={handleConfirmMarkAsPaid}
      />

      {/* Cancel Bill Modal */}
      <CancelBillModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        invoice={invoice}
        currencySymbol={sym}
        onCancelled={() => {}}
      />

      {/* Record Refund Modal */}
      <RecordRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        invoice={invoice}
        currencySymbol={sym}
        onRefundRecorded={() => {}}
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

      {/* PDF Downloaded Toast */}
      {downloadToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-950/95 text-emerald-200 border border-emerald-500/40 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Download className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{downloadToast}</span>
          <button
            type="button"
            onClick={() => setDownloadToast('')}
            className="p-1 rounded-lg text-emerald-400 hover:text-emerald-200 hover:bg-emerald-900/50"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Project Form Modal */}
      <ProjectFormModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        prefilledInvoice={invoice}
        customers={customers}
        invoices={allInvoices}
        settings={settings}
        onSaved={(savedProj) => {
          setIsProjectModalOpen(false);
          if (onGoToProjects) {
            onGoToProjects(savedProj.id);
          }
        }}
      />

      {/* Payment Receipt Voucher Modal */}
      {receiptPayment && (
        <PaymentReceiptModal
          isOpen={Boolean(receiptPayment)}
          onClose={() => {
            setReceiptPayment(null);
            setReceiptInitialAction(null);
          }}
          invoice={effectiveInvoice || invoice}
          payment={receiptPayment}
          settings={settings}
          initialAction={receiptInitialAction}
        />
      )}

      {/* Shoot Contract / Service Agreement Modal */}
      {isContractModalOpen && (
        <React.Suspense fallback={null}>
          <ContractsModal
            isOpen={isContractModalOpen}
            onClose={() => setIsContractModalOpen(false)}
            invoice={effectiveInvoice || invoice}
            project={linkedProject}
            settings={settings}
          />
        </React.Suspense>
      )}
    </div>
  );
}
