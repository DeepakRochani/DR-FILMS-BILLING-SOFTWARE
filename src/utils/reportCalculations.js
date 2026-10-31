import * as XLSX from 'xlsx';
import { formatCurrency, formatDate, formatInvoiceNumber } from './formatters.js';

/**
 * Common GST rates in India
 */
export const GST_RATES = [0, 5, 12, 18, 28];

/**
 * Determine report period dates
 */
export function getReportPeriodDates(mode = 'month', year = new Date().getFullYear(), month = new Date().getMonth() + 1, customStart = '', customEnd = '') {
  if (mode === 'month') {
    const y = Number(year);
    const m = Number(month); // 1-indexed
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthName = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return {
      mode,
      startDate,
      endDate,
      label: monthName,
      slug: `${y}_${String(m).padStart(2, '0')}`
    };
  }

  if (mode === 'fy') {
    const y = Number(year);
    // Indian FY runs from 1st April of year to 31st March of year + 1
    const startDate = `${y}-04-01`;
    const endDate = `${y + 1}-03-31`;
    return {
      mode,
      startDate,
      endDate,
      label: `FY ${y}-${String(y + 1).slice(2)} (Apr ${y} – Mar ${y + 1})`,
      slug: `FY_${y}_${y + 1}`
    };
  }

  if (mode === 'custom') {
    return {
      mode,
      startDate: customStart || '',
      endDate: customEnd || '',
      label: customStart && customEnd 
        ? `${formatDate(customStart)} to ${formatDate(customEnd)}`
        : 'Custom Date Range',
      slug: `Custom_${customStart}_${customEnd}`
    };
  }

  // Fallback All time
  return {
    mode: 'all',
    startDate: '',
    endDate: '',
    label: 'All Time',
    slug: 'All_Time'
  };
}

/**
 * Calculate comprehensive accountant report
 *
 * @param {Object} params
 * @param {Array} params.invoices - all invoices in database
 * @param {Array} params.customers - all clients in database
 * @param {Array} params.expenses - all expenses in database
 * @param {Object} params.periodInfo - result of getReportPeriodDates
 * @param {string} params.viewMode - 'billed' (by invoice date) or 'received' (by payment date)
 */
export function generateAccountantReport({ invoices = [], customers = [], expenses = [], periodInfo, viewMode = 'billed' }) {
  const { startDate, endDate } = periodInfo;

  // Build client lookup map
  const clientMap = new Map();
  customers.forEach(c => {
    const name = (c.name || '').trim();
    const company = (c.company || '').trim();
    const displayName = (name && company && company !== name) ? `${name} (${company})` : (name || company || 'Client');
    clientMap.set(Number(c.id), {
      ...c,
      displayName
    });
  });

  const getClientName = (customerId, snapshot) => {
    if (customerId && clientMap.has(Number(customerId))) {
      return clientMap.get(Number(customerId)).displayName;
    }
    if (snapshot && (snapshot.name || snapshot.company)) {
      const sName = (snapshot.name || '').trim();
      const sComp = (snapshot.company || '').trim();
      return (sName && sComp && sComp !== sName) ? `${sName} (${sComp})` : (sName || sComp);
    }
    return 'Unknown Client';
  };

  // Exclude deleted bills
  const nonDeletedInvoices = invoices.filter(inv => !inv.isDeleted);

  // Active vs Cancelled bills
  const activeInvoices = nonDeletedInvoices.filter(inv => inv.status !== 'cancelled');
  const cancelledInvoices = nonDeletedInvoices.filter(inv => inv.status === 'cancelled');

  // Filter invoices for table based on viewMode
  let invoicesInScope = [];
  if (viewMode === 'billed') {
    invoicesInScope = activeInvoices.filter(inv => {
      const d = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
  } else {
    // In 'received' view: bills that received payments in this period
    invoicesInScope = activeInvoices.filter(inv => {
      const payments = (Array.isArray(inv.payments) ? inv.payments : []).filter(p => !p?.isDeleted);
      return payments.some(p => {
        const d = p.date || '';
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      });
    });
  }

  // 1. Invoices Table Rows
  const invoicesTable = invoicesInScope.map(inv => {
    const invDate = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
    const clientName = getClientName(inv.customerId, inv.customerSnapshot);
    const subtotal = Number(inv.subtotal) || 0;
    const taxAmount = Number(inv.taxAmount) || 0;
    const totalAmount = Number(inv.totalAmount) || 0;
    
    // Total received on this invoice (active payments only):
    // in billed view: all active payments recorded on this invoice
    // in received view: active payments made during this period
    const allPayments = (Array.isArray(inv.payments) ? inv.payments : []).filter(p => !p?.isDeleted);
    const relevantPayments = viewMode === 'received'
      ? allPayments.filter(p => (!startDate || p.date >= startDate) && (!endDate || p.date <= endDate))
      : allPayments;
    
    const received = Math.round(relevantPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;
    const balance = Math.max(0, Math.round((totalAmount - received) * 100) / 100);

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: invDate,
      clientName,
      subtotal,
      taxRate: Number(inv.taxPercentage) || 0,
      taxAmount,
      totalAmount,
      received,
      balance,
      status: inv.status
    };
  });

  // 2. Payments Table (Payments received in period)
  const paymentsTable = [];
  let periodPaymentsReceived = 0;
  let periodRefunds = 0;

  activeInvoices.forEach(inv => {
    const clientName = getClientName(inv.customerId, inv.customerSnapshot);
    (Array.isArray(inv.payments) ? inv.payments : []).filter(p => !p?.isDeleted).forEach(p => {
      const pDate = p.date || '';
      if ((!startDate || pDate >= startDate) && (!endDate || pDate <= endDate)) {
        const amt = Number(p.amount) || 0;
        if (amt >= 0) {
          periodPaymentsReceived += amt;
        } else {
          periodRefunds += Math.abs(amt);
        }

        paymentsTable.push({
          id: p.id || `${inv.id}-${pDate}-${amt}`,
          date: pDate,
          invoiceNumber: inv.invoiceNumber,
          clientName,
          method: p.method || 'Cash',
          amount: amt,
          isRefund: amt < 0,
          note: p.note || ''
        });
      }
    });
  });

  paymentsTable.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 3. GST Summary by Rate (0, 5, 12, 18, 28)
  const gstRateMap = new Map();
  GST_RATES.forEach(rate => {
    gstRateMap.set(rate, {
      rate,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalGst: 0,
      count: 0
    });
  });

  // Evaluate GST from bills in scope
  invoicesInScope.forEach(inv => {
    const rate = Number(inv.taxPercentage) || 0;
    const taxable = Number(inv.taxableAmount) || Number(inv.subtotal) || 0;
    const tax = Number(inv.taxAmount) || 0;

    let target = gstRateMap.get(rate);
    if (!target) {
      target = { rate, taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, count: 0 };
      gstRateMap.set(rate, target);
    }

    target.taxableAmount = Math.round((target.taxableAmount + taxable) * 100) / 100;
    target.totalGst = Math.round((target.totalGst + tax) * 100) / 100;
    target.cgst = Math.round((target.cgst + (tax / 2)) * 100) / 100;
    target.sgst = Math.round((target.sgst + (tax / 2)) * 100) / 100;
    target.count += 1;
  });

  const gstSummary = Array.from(gstRateMap.values()).sort((a, b) => a.rate - b.rate);

  // 4. Income by Service
  const serviceMap = new Map();
  invoicesInScope.forEach(inv => {
    (Array.isArray(inv.items) ? inv.items : []).forEach(item => {
      const name = (item.name || 'Custom Item').trim();
      const qty = Number(item.quantity) || 1;
      const amt = Number(item.amount) || 0;

      const current = serviceMap.get(name) || { name, quantity: 0, totalBilled: 0 };
      current.quantity += qty;
      current.totalBilled = Math.round((current.totalBilled + amt) * 100) / 100;
      serviceMap.set(name, current);
    });
  });

  const incomeByService = Array.from(serviceMap.values())
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // 5. Income by Client
  const clientSummaryMap = new Map();
  invoicesInScope.forEach(inv => {
    const clientName = getClientName(inv.customerId, inv.customerSnapshot);
    const total = Number(inv.totalAmount) || 0;
    const allPayments = Array.isArray(inv.payments) ? inv.payments : [];
    const rec = allPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max(0, total - rec);

    const current = clientSummaryMap.get(clientName) || {
      clientName,
      billsCount: 0,
      totalBilled: 0,
      totalReceived: 0,
      balanceDue: 0
    };
    current.billsCount += 1;
    current.totalBilled = Math.round((current.totalBilled + total) * 100) / 100;
    current.totalReceived = Math.round((current.totalReceived + rec) * 100) / 100;
    current.balanceDue = Math.round((current.balanceDue + bal) * 100) / 100;
    clientSummaryMap.set(clientName, current);
  });

  const incomeByClient = Array.from(clientSummaryMap.values())
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // 5b. Income by Event Type
  const eventTypeMap = new Map();
  invoicesInScope.forEach(inv => {
    const eventType = (inv.eventType && inv.eventType.trim()) ? inv.eventType.trim() : 'Other';
    const total = Number(inv.totalAmount) || 0;
    const allPayments = Array.isArray(inv.payments) ? inv.payments : [];
    const rec = allPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max(0, total - rec);

    const current = eventTypeMap.get(eventType) || {
      eventType,
      billsCount: 0,
      totalBilled: 0,
      totalReceived: 0,
      balanceDue: 0
    };
    current.billsCount += 1;
    current.totalBilled = Math.round((current.totalBilled + total) * 100) / 100;
    current.totalReceived = Math.round((current.totalReceived + rec) * 100) / 100;
    current.balanceDue = Math.round((current.balanceDue + bal) * 100) / 100;
    eventTypeMap.set(eventType, current);
  });

  const incomeByEventType = Array.from(eventTypeMap.values())
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // 6. Expenses in period and by category
  const activeExpenses = expenses.filter(exp => {
    if (exp.isDeleted) return false;
    const d = exp.date || '';
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });

  const expenseCategoryMap = new Map();
  let totalExpensesAmount = 0;
  let totalExpenseGstPaid = 0;

  activeExpenses.forEach(exp => {
    const cat = exp.category || 'Other';
    const amt = Number(exp.amount) || 0;
    const gstPaid = Number(exp.gstPaid) || 0;

    totalExpensesAmount += amt;
    totalExpenseGstPaid += gstPaid;

    const current = expenseCategoryMap.get(cat) || {
      category: cat,
      count: 0,
      totalAmount: 0,
      gstPaid: 0
    };
    current.count += 1;
    current.totalAmount = Math.round((current.totalAmount + amt) * 100) / 100;
    current.gstPaid = Math.round((current.gstPaid + gstPaid) * 100) / 100;
    expenseCategoryMap.set(cat, current);
  });

  const expensesByCategory = Array.from(expenseCategoryMap.values())
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // 7. Cancelled Bills in period (Excluded from income totals)
  const cancelledBillsInPeriod = cancelledInvoices.filter(inv => {
    const cancelDate = inv.cancelledAt ? inv.cancelledAt.split('T')[0] : (inv.invoiceDate || '');
    return (!startDate || cancelDate >= startDate) && (!endDate || cancelDate <= endDate);
  });

  const cancelledBillsTable = cancelledBillsInPeriod.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.invoiceDate,
    cancelledAt: inv.cancelledAt ? inv.cancelledAt.split('T')[0] : '—',
    clientName: getClientName(inv.customerId, inv.customerSnapshot),
    amount: Number(inv.totalAmount) || 0,
    reason: inv.cancelReason || 'Cancelled'
  }));

  const cancelledTotalAmount = Math.round(
    cancelledBillsTable.reduce((sum, b) => sum + b.amount, 0) * 100
  ) / 100;

  // 8. Summary KPI Cards
  const totalBilled = Math.round(invoicesTable.reduce((sum, inv) => sum + inv.totalAmount, 0) * 100) / 100;
  const subtotalBilled = Math.round(invoicesTable.reduce((sum, inv) => sum + inv.subtotal, 0) * 100) / 100;
  const gstCollected = Math.round(invoicesTable.reduce((sum, inv) => sum + inv.taxAmount, 0) * 100) / 100;
  const pendingReceivables = Math.round(invoicesTable.reduce((sum, inv) => sum + inv.balance, 0) * 100) / 100;
  
  // Net Profit formula: payments received minus expenses minus refunds
  const netProfit = Math.round((periodPaymentsReceived - totalExpensesAmount - periodRefunds) * 100) / 100;

  return {
    periodInfo,
    viewMode,
    summary: {
      totalBilled,
      subtotalBilled,
      gstCollected,
      paymentsReceived: Math.round(periodPaymentsReceived * 100) / 100,
      pendingReceivables,
      cancelledAmount: cancelledTotalAmount,
      refunds: Math.round(periodRefunds * 100) / 100,
      expenses: Math.round(totalExpensesAmount * 100) / 100,
      expenseGstPaid: Math.round(totalExpenseGstPaid * 100) / 100,
      netProfit,
      invoicesCount: invoicesTable.length,
      cancelledCount: cancelledBillsTable.length
    },
    invoicesTable,
    paymentsTable,
    gstSummary,
    incomeByService,
    incomeByClient,
    incomeByEventType,
    expensesByCategory,
    cancelledBillsTable,
    activeExpenses
  };
}

/**
 * Export full multi-sheet Excel (.xlsx) for accountant
 */
export function exportReportToExcel(reportData, settings = {}) {
  const wb = XLSX.utils.book_new();
  const businessName = settings?.businessName || 'DR FILMS';
  const gstin = settings?.gstin || 'Unregistered';
  const periodLabel = reportData.periodInfo.label;
  const viewModeLabel = reportData.viewMode === 'billed' ? 'Billed Date View (Accrual)' : 'Received Date View (Cash)';

  // Helper to append a sheet with column widths
  const addSheet = (sheetName, dataAoa, colWidths = []) => {
    const ws = XLSX.utils.aoa_to_sheet(dataAoa);
    if (colWidths.length > 0) {
      ws['!cols'] = colWidths.map(w => ({ wch: w }));
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  // Sheet 1: Summary Dashboard
  const summaryAoa = [
    [businessName, '', 'ACCOUNTANT REPORT SUMMARY'],
    ['GSTIN:', gstin, 'Period:', periodLabel],
    ['View Mode:', viewModeLabel, 'Generated At:', new Date().toLocaleString()],
    [],
    ['KEY FINANCIAL METRICS', 'AMOUNT (INR)'],
    ['Total Billed (Active Invoices)', reportData.summary.totalBilled],
    ['Taxable Subtotal', reportData.summary.subtotalBilled],
    ['GST Collected', reportData.summary.gstCollected],
    ['Payments Received (Cash Inflow)', reportData.summary.paymentsReceived],
    ['Pending Receivables (Outstanding)', reportData.summary.pendingReceivables],
    ['Refunds Given', reportData.summary.refunds],
    ['Total Business Expenses', reportData.summary.expenses],
    ['GST Input Tax on Expenses', reportData.summary.expenseGstPaid],
    ['Net Profit (Payments - Expenses - Refunds)', reportData.summary.netProfit],
    ['Cancelled Invoices Amount (Excluded)', reportData.summary.cancelledAmount],
    [],
    ['Notes:', 'Cancelled and soft-deleted bills are completely excluded from gross income and receivables.']
  ];
  addSheet('Summary', summaryAoa, [35, 25, 25, 25]);

  // Sheet 2: Invoices
  const invHeaders = ['Invoice No', 'Date', 'Client Name', 'Subtotal', 'GST Rate %', 'GST Amount', 'Total Amount', 'Received', 'Balance Due', 'Status'];
  const invRows = reportData.invoicesTable.map(inv => [
    formatInvoiceNumber(inv.invoiceNumber),
    inv.date,
    inv.clientName,
    inv.subtotal,
    inv.taxRate,
    inv.taxAmount,
    inv.totalAmount,
    inv.received,
    inv.balance,
    inv.status
  ]);

  // Excel formula row for Invoices
  const invLastRow = invRows.length + 1; // 1-indexed, header is row 1
  if (invRows.length > 0) {
    invRows.push([
      'TOTAL',
      '',
      '',
      { t: 'n', f: `SUM(D2:D${invLastRow})` },
      '',
      { t: 'n', f: `SUM(F2:F${invLastRow})` },
      { t: 'n', f: `SUM(G2:G${invLastRow})` },
      { t: 'n', f: `SUM(H2:H${invLastRow})` },
      { t: 'n', f: `SUM(I2:I${invLastRow})` },
      ''
    ]);
  }
  addSheet('Invoices', [invHeaders, ...invRows], [15, 12, 30, 14, 12, 14, 16, 14, 14, 15]);

  // Sheet 3: Payments Received
  const payHeaders = ['Date', 'Invoice No', 'Client Name', 'Method', 'Type', 'Amount', 'Note'];
  const payRows = reportData.paymentsTable.map(p => [
    p.date,
    formatInvoiceNumber(p.invoiceNumber),
    p.clientName,
    p.method,
    p.isRefund ? 'REFUND' : 'RECEIPT',
    p.amount,
    p.note
  ]);
  const payLastRow = payRows.length + 1;
  if (payRows.length > 0) {
    payRows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      { t: 'n', f: `SUM(F2:F${payLastRow})` },
      ''
    ]);
  }
  addSheet('Payments', [payHeaders, ...payRows], [12, 15, 30, 15, 12, 16, 25]);

  // Sheet 4: GST Summary
  const gstHeaders = ['GST Rate %', 'Invoices Count', 'Taxable Turnover', 'CGST', 'SGST', 'IGST', 'Total GST Output'];
  const gstRows = reportData.gstSummary.map(g => [
    `${g.rate}%`,
    g.count,
    g.taxableAmount,
    g.cgst,
    g.sgst,
    g.igst,
    g.totalGst
  ]);
  const gstLastRow = gstRows.length + 1;
  if (gstRows.length > 0) {
    gstRows.push([
      'TOTAL',
      { t: 'n', f: `SUM(B2:B${gstLastRow})` },
      { t: 'n', f: `SUM(C2:C${gstLastRow})` },
      { t: 'n', f: `SUM(D2:D${gstLastRow})` },
      { t: 'n', f: `SUM(E2:E${gstLastRow})` },
      { t: 'n', f: `SUM(F2:F${gstLastRow})` },
      { t: 'n', f: `SUM(G2:G${gstLastRow})` }
    ]);
  }
  addSheet('GST Summary', [gstHeaders, ...gstRows], [12, 16, 20, 15, 15, 15, 20]);

  // Sheet 5: Income by Service
  const srvHeaders = ['Service Description', 'Units / Qty', 'Total Billed Amount'];
  const srvRows = reportData.incomeByService.map(s => [
    s.name,
    s.quantity,
    s.totalBilled
  ]);
  const srvLastRow = srvRows.length + 1;
  if (srvRows.length > 0) {
    srvRows.push([
      'TOTAL',
      { t: 'n', f: `SUM(B2:B${srvLastRow})` },
      { t: 'n', f: `SUM(C2:C${srvLastRow})` }
    ]);
  }
  addSheet('Income by Service', [srvHeaders, ...srvRows], [35, 15, 22]);

  // Sheet 6: Income by Client
  const cliHeaders = ['Client Name', 'Bills Count', 'Total Billed', 'Total Received', 'Balance Due'];
  const cliRows = reportData.incomeByClient.map(c => [
    c.clientName,
    c.billsCount,
    c.totalBilled,
    c.totalReceived,
    c.balanceDue
  ]);
  const cliLastRow = cliRows.length + 1;
  if (cliRows.length > 0) {
    cliRows.push([
      'TOTAL',
      { t: 'n', f: `SUM(B2:B${cliLastRow})` },
      { t: 'n', f: `SUM(C2:C${cliLastRow})` },
      { t: 'n', f: `SUM(D2:D${cliLastRow})` },
      { t: 'n', f: `SUM(E2:E${cliLastRow})` }
    ]);
  }
  addSheet('Income by Client', [cliHeaders, ...cliRows], [35, 14, 18, 18, 18]);

  // Sheet 6b: Income by Event Type
  const evtHeaders = ['Event Type', 'Bills Count', 'Total Billed', 'Total Received', 'Balance Due'];
  const evtRows = (reportData.incomeByEventType || []).map(e => [
    e.eventType,
    e.billsCount,
    e.totalBilled,
    e.totalReceived,
    e.balanceDue
  ]);
  const evtLastRow = evtRows.length + 1;
  if (evtRows.length > 0) {
    evtRows.push([
      'TOTAL',
      { t: 'n', f: `SUM(B2:B${evtLastRow})` },
      { t: 'n', f: `SUM(C2:C${evtLastRow})` },
      { t: 'n', f: `SUM(D2:D${evtLastRow})` },
      { t: 'n', f: `SUM(E2:E${evtLastRow})` }
    ]);
  }
  addSheet('Income by Event Type', [evtHeaders, ...evtRows], [25, 14, 18, 18, 18]);

  // Sheet 7: Expenses by Category
  const expHeaders = ['Category', 'Transactions Count', 'Amount', 'GST Paid'];
  const expRows = reportData.expensesByCategory.map(e => [
    e.category,
    e.count,
    e.totalAmount,
    e.gstPaid
  ]);
  const expLastRow = expRows.length + 1;
  if (expRows.length > 0) {
    expRows.push([
      'TOTAL',
      { t: 'n', f: `SUM(B2:B${expLastRow})` },
      { t: 'n', f: `SUM(C2:C${expLastRow})` },
      { t: 'n', f: `SUM(D2:D${expLastRow})` }
    ]);
  }
  addSheet('Expenses by Category', [expHeaders, ...expRows], [30, 20, 18, 18]);

  // Sheet 8: Cancelled Invoices
  const canHeaders = ['Invoice No', 'Date', 'Cancelled Date', 'Client Name', 'Amount', 'Cancel Reason'];
  const canRows = reportData.cancelledBillsTable.map(c => [
    formatInvoiceNumber(c.invoiceNumber),
    c.date,
    c.cancelledAt,
    c.clientName,
    c.amount,
    c.reason
  ]);
  const canLastRow = canRows.length + 1;
  if (canRows.length > 0) {
    canRows.push([
      'TOTAL',
      '',
      '',
      '',
      { t: 'n', f: `SUM(E2:E${canLastRow})` },
      ''
    ]);
  }
  addSheet('Cancelled Bills', [canHeaders, ...canRows], [15, 12, 16, 30, 16, 25]);

  // Download File
  const filename = `DR_FILMS_Accountant_Report_${reportData.periodInfo.slug}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

/**
 * Export active table to CSV
 */
export function exportReportToCsv(reportData, tableType = 'invoices') {
  let headers = [];
  let rows = [];

  if (tableType === 'invoices') {
    headers = ['Invoice No', 'Date', 'Client Name', 'Subtotal', 'GST Rate %', 'GST Amount', 'Total Amount', 'Received', 'Balance Due', 'Status'];
    rows = reportData.invoicesTable.map(inv => [
      formatInvoiceNumber(inv.invoiceNumber),
      inv.date,
      `"${inv.clientName.replace(/"/g, '""')}"`,
      inv.subtotal,
      inv.taxRate,
      inv.taxAmount,
      inv.totalAmount,
      inv.received,
      inv.balance,
      inv.status
    ]);
  } else if (tableType === 'payments') {
    headers = ['Date', 'Invoice No', 'Client Name', 'Method', 'Type', 'Amount', 'Note'];
    rows = reportData.paymentsTable.map(p => [
      p.date,
      formatInvoiceNumber(p.invoiceNumber),
      `"${p.clientName.replace(/"/g, '""')}"`,
      p.method,
      p.isRefund ? 'REFUND' : 'RECEIPT',
      p.amount,
      `"${p.note.replace(/"/g, '""')}"`
    ]);
  } else if (tableType === 'gst') {
    headers = ['GST Rate %', 'Invoices Count', 'Taxable Turnover', 'CGST', 'SGST', 'IGST', 'Total GST Output'];
    rows = reportData.gstSummary.map(g => [
      `${g.rate}%`,
      g.count,
      g.taxableAmount,
      g.cgst,
      g.sgst,
      g.igst,
      g.totalGst
    ]);
  } else if (tableType === 'eventTypes') {
    headers = ['Event Type', 'Bills Count', 'Total Billed', 'Total Received', 'Balance Due'];
    rows = (reportData.incomeByEventType || []).map(e => [
      `"${e.eventType.replace(/"/g, '""')}"`,
      e.billsCount,
      e.totalBilled,
      e.totalReceived,
      e.balanceDue
    ]);
  } else if (tableType === 'services') {
    headers = ['Service Description', 'Units / Qty', 'Total Billed Amount'];
    rows = (reportData.incomeByService || []).map(s => [
      `"${s.name.replace(/"/g, '""')}"`,
      s.quantity,
      s.totalBilled
    ]);
  } else if (tableType === 'clients') {
    headers = ['Client Name', 'Bills Count', 'Total Billed', 'Total Received', 'Balance Due'];
    rows = (reportData.incomeByClient || []).map(c => [
      `"${c.clientName.replace(/"/g, '""')}"`,
      c.billsCount,
      c.totalBilled,
      c.totalReceived,
      c.balanceDue
    ]);
  } else if (tableType === 'expenses') {
    headers = ['Category', 'Transactions Count', 'Amount', 'GST Paid'];
    rows = (reportData.expensesByCategory || []).map(e => [
      `"${e.category.replace(/"/g, '""')}"`,
      e.count,
      e.totalAmount,
      e.gstPaid
    ]);
  } else if (tableType === 'cancelled') {
    headers = ['Invoice No', 'Date', 'Cancelled Date', 'Client Name', 'Amount', 'Cancel Reason'];
    rows = (reportData.cancelledBillsTable || []).map(c => [
      formatInvoiceNumber(c.invoiceNumber),
      c.date,
      c.cancelledAt,
      `"${c.clientName.replace(/"/g, '""')}"`,
      c.amount,
      `"${c.reason.replace(/"/g, '""')}"`
    ]);
  }

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DR_FILMS_${tableType}_${reportData.periodInfo.slug}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
