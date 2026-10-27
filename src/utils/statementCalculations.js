import { formatCurrency, formatDate, formatInvoiceNumber } from './formatters.js';

/**
 * Determine period start and end dates based on period type
 */
export function getPeriodDates(periodType, customStart = '', customEnd = '') {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (periodType === 'this_month') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const monthName = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      label: `This Month (${monthName})`
    };
  }

  if (periodType === 'last_month') {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const monthName = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      label: `Last Month (${monthName})`
    };
  }

  if (periodType === 'this_fy') {
    // In India: Financial Year is April 1 to March 31
    const fyStartYear = month >= 3 ? year : year - 1;
    const fyEndYear = fyStartYear + 1;
    const start = `${fyStartYear}-04-01`;
    const end = `${fyEndYear}-03-31`;
    return {
      startDate: start,
      endDate: end,
      label: `FY ${fyStartYear}-${String(fyEndYear).slice(2)} (Apr ${fyStartYear} – Mar ${fyEndYear})`
    };
  }

  if (periodType === 'custom') {
    return {
      startDate: customStart || '',
      endDate: customEnd || '',
      label: customStart && customEnd 
        ? `${formatDate(customStart)} to ${formatDate(customEnd)}`
        : 'Custom Period'
    };
  }

  // Default: All Time
  return {
    startDate: null,
    endDate: null,
    label: 'All Time'
  };
}

/**
 * Calculate client statement:
 * - Opening balance carried in at period start (billed before - received before on active bills)
 * - Chronological ledger of bills and payments/refunds in period
 * - Running balance per entry
 * - Totals: total billed, total received, closing balance due
 * - Excludes cancelled and deleted bills (with cancelled list for footer note)
 */
export function calculateClientStatement(client, allInvoices = [], periodType = 'all', customStart = '', customEnd = '') {
  if (!client) {
    return {
      openingBalance: 0,
      entries: [],
      totalBilled: 0,
      totalReceived: 0,
      closingBalance: 0,
      cancelledBills: [],
      periodInfo: getPeriodDates(periodType, customStart, customEnd)
    };
  }

  const periodInfo = getPeriodDates(periodType, customStart, customEnd);
  const { startDate, endDate } = periodInfo;

  // Filter invoices for this client, excluding soft-deleted bills
  const clientInvoices = allInvoices.filter(inv => 
    Number(inv.customerId) === Number(client.id) && !inv.isDeleted
  );

  const activeInvoices = clientInvoices.filter(inv => inv.status !== 'cancelled');
  const cancelledInvoices = clientInvoices.filter(inv => inv.status === 'cancelled');

  // 1. Calculate Opening Balance before period start
  let openingBilled = 0;
  let openingReceived = 0;

  if (startDate) {
    activeInvoices.forEach(inv => {
      const invDate = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
      if (invDate && invDate < startDate) {
        openingBilled += Number(inv.totalAmount) || 0;
      }

      // Payments made before period start on active invoices (active payments only)
      (Array.isArray(inv.payments) ? inv.payments : []).filter(p => !p?.isDeleted).forEach(p => {
        const pDate = p.date || '';
        if (pDate && pDate < startDate) {
          openingReceived += Number(p.amount) || 0;
        }
      });
    });
  }

  const openingBalance = Math.round((openingBilled - openingReceived) * 100) / 100;

  // 2. Build period ledger entries
  const entries = [];

  activeInvoices.forEach(inv => {
    const invDate = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
    const inPeriod = (!startDate || invDate >= startDate) && (!endDate || invDate <= endDate);

    if (inPeriod) {
      const itemsDesc = (Array.isArray(inv.items) ? inv.items : [])
        .map(i => i.name)
        .filter(Boolean)
        .join(', ');

      entries.push({
        id: `INV-${inv.id}`,
        type: 'invoice',
        date: invDate,
        invoiceNumber: inv.invoiceNumber,
        description: itemsDesc ? `Invoice: ${itemsDesc}` : 'Invoice',
        billed: Number(inv.totalAmount) || 0,
        received: 0,
        invoiceId: inv.id
      });
    }

    // Payments / Refunds on this invoice in the period (active payments only)
    (Array.isArray(inv.payments) ? inv.payments : []).filter(p => !p?.isDeleted).forEach(p => {
      const pDate = p.date || '';
      const pInPeriod = (!startDate || pDate >= startDate) && (!endDate || pDate <= endDate);

      if (pInPeriod) {
        const amt = Number(p.amount) || 0;
        const isRefund = amt < 0;
        const details = [p.method || 'Cash', p.note].filter(Boolean).join(' - ');

        entries.push({
          id: `PAY-${p.id || p.date}-${Math.random()}`,
          type: isRefund ? 'refund' : 'payment',
          date: pDate,
          invoiceNumber: inv.invoiceNumber,
          description: isRefund ? `Refund (${details})` : `Payment Received (${details})`,
          billed: 0,
          received: amt, // Negative if refund
          invoiceId: inv.id,
          paymentId: p.id
        });
      }
    });
  });

  // Sort chronologically (invoices first if same date)
  entries.sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.type === 'invoice' ? -1 : 1;
  });

  // 3. Compute Running Balance
  let running = openingBalance;
  const ledger = entries.map(e => {
    running = Math.round((running + e.billed - e.received) * 100) / 100;
    return {
      ...e,
      runningBalance: running
    };
  });

  const totalBilled = Math.round(ledger.reduce((sum, e) => sum + e.billed, 0) * 100) / 100;
  const totalReceived = Math.round(ledger.reduce((sum, e) => sum + e.received, 0) * 100) / 100;
  const closingBalance = Math.round((openingBalance + totalBilled - totalReceived) * 100) / 100;

  // 4. Cancelled bills note list
  const cancelledBills = cancelledInvoices.map(inv => ({
    invoiceNumber: inv.invoiceNumber,
    date: inv.invoiceDate,
    cancelledAt: inv.cancelledAt ? inv.cancelledAt.split('T')[0] : '',
    reason: inv.cancelReason || 'Cancelled',
    amount: inv.totalAmount || 0
  }));

  return {
    openingBalance,
    entries: ledger,
    totalBilled,
    totalReceived,
    closingBalance: Math.max(0, closingBalance), // closing balance due
    rawClosingBalance: closingBalance,
    cancelledBills,
    periodInfo
  };
}

/**
 * Generate client statement WhatsApp message text
 */
export function generateStatementWhatsAppMessage(client, statementData, settings) {
  const businessName = settings?.businessName || 'DR FILMS';
  const sym = settings?.currencySymbol || '₹';
  const phone = settings?.phone || '';
  const clientName = client?.name || 'Client';
  const periodLabel = statementData?.periodInfo?.label || 'Statement';
  const balanceStr = formatCurrency(statementData?.closingBalance || 0, sym);
  const upiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();

  const upiLine = statementData?.closingBalance > 0 && upiId
    ? `\nUPI ID for payment: ${upiId}`
    : '';

  return `Hello ${clientName},

Here is your Statement of Account for ${periodLabel} from ${businessName}.

Period: ${periodLabel}
Opening Balance: ${formatCurrency(statementData?.openingBalance || 0, sym)}
Total Billed: ${formatCurrency(statementData?.totalBilled || 0, sym)}
Total Received: ${formatCurrency(statementData?.totalReceived || 0, sym)}
Closing Balance Due: ${balanceStr}${upiLine}

Please find the detailed statement attached.

Thank you,
${businessName}${phone ? `\nPhone: ${phone}` : ''}`;
}

import { cleanWhatsAppPhone } from './whatsapp.js';

export function getStatementWhatsAppWebUrl(client, statementData, settings) {
  const text = generateStatementWhatsAppMessage(client, statementData, settings);
  const rawPhone = client?.phone || '';
  const cc = settings?.defaultCountryCode || '91';
  const phoneDigits = cleanWhatsAppPhone(rawPhone, cc);
  const encodedText = encodeURIComponent(text);

  if (phoneDigits) {
    return `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodedText}`;
  }
  return `https://web.whatsapp.com/send?text=${encodedText}`;
}
