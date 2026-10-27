import { db } from '../db/db.js';
import { formatCurrency, formatInvoiceNumber, UNIT_SHORT } from './formatters.js';
import { exportDatabaseJSON, restoreDatabaseData } from '../db/backup.js';

/**
 * Concurrency control & scheduler state
 */
let isSyncing = false;
let syncQueued = false;
let debounceTimer = null;
let retryTimer = null;
let retryAttempt = 0;
let hooksAttached = false;
let isAutoSyncPaused = false;

// Progressive retry delays: 30s, 1m, 5m, then every 15m
const RETRY_DELAYS = [30000, 60000, 300000, 900000];

export function setPauseAutoSync(pause) {
  isAutoSyncPaused = Boolean(pause);
}

/**
 * Helper to dispatch non-blocking toast and status events to the UI
 */
export function dispatchSyncNotification(type, message, details = null) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('drfilms:sheets-sync', {
          detail: { type, message, details, timestamp: new Date().toISOString() }
        })
      );
    }
  } catch (e) {
    console.error('Failed to dispatch sync event:', e);
  }
}

/**
 * Format phone numbers with leading apostrophe so Google Sheets treats them as plain text
 * and preserves leading zeroes and country code (+91)
 */
export function formatPhoneForSheets(phone) {
  if (!phone) return '';
  const clean = String(phone).trim();
  if (!clean) return '';
  return clean.startsWith("'") ? clean : `'${clean}`;
}

/**
 * Build tables and sanitized backup JSON according to specifications:
 * - Invoices: Invoice No, Date, Due Date, Client, Phone, Subtotal, Charges, Discount, Tax, Total, Paid, Balance, Status, Items summary, Notes
 * - Payments: Invoice No, Client, Date, Method, Amount, Note
 * - Clients: Name, Company, Phone, Total Billed, Total Paid, Pending
 * - Services: Name, Category, Unit, Rate
 */
export async function prepareSyncPayload(settingsOverride = null, dbOverride = null) {
  const targetDb = dbOverride || db;
  const settingsRecords = await targetDb.settings.toArray();
  const services = await targetDb.services.toArray();
  const customCharges = await targetDb.customCharges.toArray();
  const customers = await targetDb.customers.toArray();
  const invoices = await targetDb.invoices.toArray();
  const hourCalculations = await (targetDb.hourCalculations ? targetDb.hourCalculations.toArray() : Promise.resolve([]));
  const projectsList = await (targetDb.projects ? targetDb.projects.toArray() : Promise.resolve([]));

  const businessProfile = settingsOverride || settingsRecords.find(s => s.key === 'business_profile') || {};
  const prefix = businessProfile.invoicePrefix || 'DRF-';
  const sym = businessProfile.currencySymbol || '₹';

  // Map of registered customers by ID
  const customerMap = new Map();
  customers.forEach(c => {
    if (c.id) customerMap.set(c.id, c);
  });

  // Helper to extract full client details from an invoice snapshot or linked record
  const getInvoiceClient = (inv) => {
    const snap = inv.customerSnapshot || {};
    const linkedCust = (inv.customerId && customerMap.get(inv.customerId)) || null;

    const name = (snap.name || linkedCust?.name || inv.customerName || inv.clientName || inv.customer?.name || '').trim();
    const company = (snap.company || linkedCust?.company || inv.customerCompany || inv.clientCompany || inv.customer?.company || '').trim();
    const phone = (snap.phone || linkedCust?.phone || inv.customerPhone || inv.clientPhone || inv.customer?.phone || '').trim();

    // Display formatted name with company if present (e.g. "Ronak Jain (TASVIRKARR)")
    const displayName = (name && company && company !== name)
      ? `${name} (${company})`
      : (name || company || '');

    return {
      name,
      company,
      displayName,
      phone
    };
  };

  // 1. INVOICES TABLE
  const invoiceHeaders = [
    'Invoice No',
    'Date',
    'Due Date',
    'Client',
    'Phone',
    'Subtotal',
    'Charges',
    'Discount',
    'Tax',
    'Total',
    'Paid',
    'Balance',
    'Status',
    'Record Status',
    'Deleted At',
    'Last Updated',
    'Items summary',
    'Notes',
    'Event Type',
    'Event Date',
    'Last Reminder Date',
    'Reminder Count'
  ];

  const invoiceRows = [];

  invoices.forEach(inv => {
    const invNo = formatInvoiceNumber(inv.invoiceNumber, prefix);
    const date = inv.invoiceDate || '';
    const dueDate = inv.dueDate || '';
    const client = getInvoiceClient(inv);
    const clientName = client.displayName || client.name || '';
    const phone = formatPhoneForSheets(client.phone);
    const subtotal = Number(inv.subtotal) || 0;

    // Charges (positive custom fees)
    const charges = (Array.isArray(inv.charges) ? inv.charges : [])
      .filter(c => c && c.nature !== 'discount')
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    const discount = Number(inv.discount) || 0;
    const tax = Number(inv.taxAmount) || 0;
    const total = Number(inv.totalAmount) || 0;
    const paid = Number(inv.advancePaid) || 0;
    const balance = Number(inv.balanceDue) || 0;
    let status = String(inv.status || 'draft').toUpperCase();
    if (inv.status === 'cancelled') {
      status = 'Cancelled';
    }

    const recordStatus = inv.isDeleted ? 'Deleted' : 'Active';
    const deletedAt = inv.isDeleted ? (inv.deletedAt || inv.updatedAt || '') : '';
    const lastUpdated = inv.cancelledAt || inv.updatedAt || inv.invoiceDate || '';

    // Format each service on its own separate line below the other, displaying Rate, Unit, Qty, Amount matching the bill
    const itemsSummary = (Array.isArray(inv.items) ? inv.items : [])
      .map((i, idx) => {
        const num = idx + 1;
        let fullName = (i.name || 'Service').trim();
        if (i.description && i.description.trim()) {
          fullName += ` (${i.description.trim()})`;
        }
        const rawUnit = (UNIT_SHORT[i.unit] || (i.unit && i.unit !== 'fixed' ? i.unit : '') || '').trim();
        const unitPart = rawUnit ? `Unit: ${rawUnit} | ` : '';
        const ratePart = `Rate: ${formatCurrency(Number(i.rate) || 0, sym)}`;
        const qtyVal = i.quantityLabel || i.quantity || 1;
        const qtyPart = `Qty: ${qtyVal}`;
        const amtPart = `Amount: ${formatCurrency(Number(i.amount) || 0, sym)}`;
        return `${num}. ${fullName} — ${unitPart}${ratePart} | ${qtyPart} | ${amtPart}`;
      })
      .join('\n');

    let notes = inv.notes || '';
    if (inv.status === 'cancelled') {
      const cancelInfo = `[Cancelled: ${inv.cancelReason || 'Cancelled'}${inv.cancelledAt ? ` on ${inv.cancelledAt}` : ''}]`;
      notes = notes ? `${notes} | ${cancelInfo}` : cancelInfo;
    }

    invoiceRows.push([
      invNo,
      date,
      dueDate,
      clientName,
      phone,
      subtotal,
      charges,
      discount,
      tax,
      total,
      paid,
      balance,
      status,
      recordStatus,
      deletedAt,
      lastUpdated,
      itemsSummary,
      notes,
      inv.eventType || '',
      inv.eventDate || '',
      inv.lastReminderDate || '',
      Number(inv.reminderCount) || 0
    ]);
  });

  // Include permanently deleted invoices from settings.permanentlyDeletedBills
  const permanentlyDeletedBills = Array.isArray(businessProfile.permanentlyDeletedBills)
    ? businessProfile.permanentlyDeletedBills
    : [];

  permanentlyDeletedBills.forEach(perm => {
    const invNo = formatInvoiceNumber(perm.invoiceNumber, prefix);
    if (invoiceRows.some(r => r[0] === invNo)) return;

    invoiceRows.push([
      invNo,
      perm.invoiceDate || '',
      '',
      perm.clientName || perm.customerName || '',
      formatPhoneForSheets(perm.phone || ''),
      Number(perm.totalAmount) || 0,
      0,
      0,
      0,
      Number(perm.totalAmount) || 0,
      Number(perm.advancePaid) || 0,
      Number(perm.balanceDue) || 0,
      'DELETED',
      'Deleted permanently',
      perm.deletedAt || perm.permanentlyDeletedAt || '',
      perm.permanentlyDeletedAt || new Date().toISOString(),
      perm.itemsSummary || '—',
      perm.notes || 'Permanently removed from app; backup copy preserved in Google Sheet',
      perm.eventType || '',
      perm.eventDate || '',
      perm.lastReminderDate || '',
      Number(perm.reminderCount) || 0
    ]);
  });

  // 2. BILL ITEMS TABLE (Itemized breakdown of each service/product across all bills)
  const billItemHeaders = [
    'Invoice No',
    'Date',
    'Client',
    '#',
    'Service / Description',
    'Unit',
    'Rate',
    'Qty',
    'Amount'
  ];
  const billItemRows = [];

  invoices.forEach(inv => {
    const invNo = formatInvoiceNumber(inv.invoiceNumber, prefix);
    const date = inv.invoiceDate || '';
    const client = getInvoiceClient(inv);
    const clientName = client.displayName || client.name || '';

    (Array.isArray(inv.items) ? inv.items : []).forEach((item, idx) => {
      const num = idx + 1;
      let fullName = (item.name || 'Service').trim();
      if (item.description && item.description.trim()) {
        fullName += ` (${item.description.trim()})`;
      }
      const unit = (UNIT_SHORT[item.unit] || (item.unit && item.unit !== 'fixed' ? item.unit : '') || '').trim();
      const rate = Number(item.rate) || 0;
      const qty = item.quantityLabel || item.quantity || 1;
      const amount = Number(item.amount) || 0;

      billItemRows.push([
        invNo,
        date,
        clientName,
        num,
        fullName,
        unit,
        rate,
        qty,
        amount
      ]);
    });
  });

  // 3. PAYMENTS TABLE (Keyed by Payment ID with Record Status, Deleted At, Last Updated)
  const paymentHeaders = [
    'Payment ID',
    'Invoice No',
    'Client',
    'Date',
    'Method',
    'Amount',
    'Note',
    'Record Status',
    'Deleted At',
    'Last Updated'
  ];
  const paymentRows = [];

  invoices.forEach(inv => {
    const invNo = formatInvoiceNumber(inv.invoiceNumber, prefix);
    const client = getInvoiceClient(inv);
    const clientName = client.displayName || client.name || '';

    if (Array.isArray(inv.payments) && inv.payments.length > 0) {
      inv.payments.forEach((p, pIdx) => {
        const paymentId = p.id || `PAY-${inv.invoiceNumber}-${pIdx + 1}`;
        const recordStatus = (p.isDeleted || inv.isDeleted) ? 'Deleted' : 'Active';
        const deletedAt = p.isDeleted ? (p.deletedAt || '') : (inv.isDeleted ? (inv.deletedAt || '') : '');
        const lastUpdated = p.updatedAt || inv.updatedAt || '';

        paymentRows.push([
          paymentId,
          invNo,
          clientName,
          p.date || inv.invoiceDate || '',
          p.method || 'Online',
          Number(p.amount) || 0,
          p.note || '',
          recordStatus,
          deletedAt,
          lastUpdated
        ]);
      });
    } else if (Number(inv.advancePaid) > 0) {
      const paymentId = `ADV-${inv.invoiceNumber}`;
      const recordStatus = inv.isDeleted ? 'Deleted' : 'Active';
      const deletedAt = inv.isDeleted ? (inv.deletedAt || '') : '';
      paymentRows.push([
        paymentId,
        invNo,
        clientName,
        inv.invoiceDate || '',
        'Advance',
        Number(inv.advancePaid) || 0,
        'Advance payment',
        recordStatus,
        deletedAt,
        inv.updatedAt || ''
      ]);
    }
  });

  // 4. DELETED BILLS TABLE (Append-only archive tab with Restored At audit trail)
  const deletedBillsHeaders = [
    'Invoice No',
    'Client',
    'Phone',
    'Date',
    'Items summary',
    'Total',
    'Paid',
    'Balance',
    'Deleted At',
    'Restored At',
    'Notes'
  ];
  const deletedBillsRows = [];

  // Invoices currently soft-deleted in app
  invoices.filter(inv => inv.isDeleted).forEach(inv => {
    const invNo = formatInvoiceNumber(inv.invoiceNumber, prefix);
    const client = getInvoiceClient(inv);
    const clientName = client.displayName || client.name || '';
    const phone = formatPhoneForSheets(client.phone);

    const itemsSummary = (Array.isArray(inv.items) ? inv.items : [])
      .map((i, idx) => `${idx + 1}. ${i.name || 'Service'} (${i.quantityLabel || i.quantity || 1}) - ${formatCurrency(Number(i.amount) || 0, sym)}`)
      .join('\n');

    deletedBillsRows.push([
      invNo,
      clientName,
      phone,
      inv.invoiceDate || '',
      itemsSummary,
      Number(inv.totalAmount) || 0,
      Number(inv.advancePaid) || 0,
      Number(inv.balanceDue) || 0,
      inv.deletedAt || inv.updatedAt || '',
      '',
      inv.notes || 'In Trash'
    ]);
  });

  // Invoices that were restored
  invoices.filter(inv => !inv.isDeleted && inv.restoredAt).forEach(inv => {
    const invNo = formatInvoiceNumber(inv.invoiceNumber, prefix);
    const client = getInvoiceClient(inv);
    const clientName = client.displayName || client.name || '';
    const phone = formatPhoneForSheets(client.phone);

    const itemsSummary = (Array.isArray(inv.items) ? inv.items : [])
      .map((i, idx) => `${idx + 1}. ${i.name || 'Service'} (${i.quantityLabel || i.quantity || 1}) - ${formatCurrency(Number(i.amount) || 0, sym)}`)
      .join('\n');

    deletedBillsRows.push([
      invNo,
      clientName,
      phone,
      inv.invoiceDate || '',
      itemsSummary,
      Number(inv.totalAmount) || 0,
      Number(inv.advancePaid) || 0,
      Number(inv.balanceDue) || 0,
      inv.deletedAt || '',
      inv.restoredAt || '',
      'Restored'
    ]);
  });

  // Permanently deleted bills
  permanentlyDeletedBills.forEach(perm => {
    const invNo = formatInvoiceNumber(perm.invoiceNumber, prefix);
    deletedBillsRows.push([
      invNo,
      perm.clientName || perm.customerName || '',
      formatPhoneForSheets(perm.phone || ''),
      perm.invoiceDate || '',
      perm.itemsSummary || '—',
      Number(perm.totalAmount) || 0,
      Number(perm.advancePaid) || 0,
      Number(perm.balanceDue) || 0,
      perm.deletedAt || perm.permanentlyDeletedAt || '',
      '',
      'Deleted permanently from app'
    ]);
  });

  // 5. CLIENTS TABLE (Only active, non-deleted bills count toward client pending balances)
  const clientHeaders = ['Name', 'Company', 'Phone', 'Total Billed', 'Total Paid', 'Pending', 'Tag'];

  // Aggregate clients from registered directory and any invoice snapshots
  const allClientsMap = new Map();

  customers.filter(c => !c.isDeleted).forEach(cust => {
    const key = (cust.phone || cust.name || String(cust.id)).trim().toLowerCase();
    if (key) {
      allClientsMap.set(key, {
        id: cust.id,
        name: cust.name || '',
        company: cust.company || '',
        phone: cust.phone || '',
        tag: cust.tag || 'Regular'
      });
    }
  });

  // Only consider active invoices for client discovery & financial aggregates
  const activeInvoices = invoices.filter(inv => !inv.isDeleted);

  activeInvoices.forEach(inv => {
    const client = getInvoiceClient(inv);
    const key = (client.phone || client.name).trim().toLowerCase();
    if (key && !allClientsMap.has(key)) {
      const snapTag = inv.customerSnapshot?.tag;
      allClientsMap.set(key, {
        id: inv.customerId || null,
        name: client.name || '',
        company: client.company || '',
        phone: client.phone || '',
        tag: snapTag || 'Regular'
      });
    }
  });

  const clientRows = Array.from(allClientsMap.values()).map(cust => {
    const custInvoices = activeInvoices.filter(inv => {
      const client = getInvoiceClient(inv);
      if (cust.id && inv.customerId === cust.id) return true;
      if (cust.phone && client.phone && client.phone.trim() === cust.phone.trim()) return true;
      if (cust.name && client.name && client.name.trim().toLowerCase() === cust.name.trim().toLowerCase()) return true;
      return false;
    });

    const totalBilled = custInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
    const totalPaid = custInvoices.reduce((sum, inv) => sum + (Number(inv.advancePaid) || 0), 0);
    const pending = custInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0);
    const phone = formatPhoneForSheets(cust.phone || '');

    return [
      cust.name || '',
      cust.company || '',
      phone,
      totalBilled,
      totalPaid,
      pending,
      cust.tag || 'Regular'
    ];
  });

  // 6. SERVICES TABLE
  const serviceHeaders = ['Name', 'Category', 'Unit', 'Rate'];
  const serviceRows = services.map(s => [
    s.name || '',
    s.category || '',
    s.unit || '',
    Number(s.rate) || 0
  ]);

  // 7. EXPENSES TABLE (with Archive rules: upsert by ID, deleted rows kept and marked)
  const expenseHeaders = [
    'Expense ID',
    'Date',
    'Category',
    'Payee / Vendor',
    'Payment Method',
    'Amount',
    'GST Paid',
    'Client / Invoice',
    'Recurring',
    'Note',
    'Record Status',
    'Deleted At',
    'Last Updated'
  ];
  const expenseRows = [];
  const expensesList = await (targetDb.expenses ? targetDb.expenses.toArray() : Promise.resolve([]));
  expensesList.forEach(exp => {
    const recordStatus = exp.isDeleted ? 'Deleted' : 'Active';
    const deletedAt = exp.isDeleted ? (exp.deletedAt || '') : '';
    const lastUpdated = exp.updatedAt || exp.createdAt || '';
    const clientLink = exp.clientName || (exp.customerId ? `Client #${exp.customerId}` : '') || '';

    expenseRows.push([
      exp.id,
      exp.date || '',
      exp.category || 'Other',
      exp.payee || '',
      exp.paymentMethod || 'Cash',
      Number(exp.amount) || 0,
      Number(exp.gstPaid) || 0,
      clientLink,
      exp.isRecurring ? 'Yes (Monthly)' : 'No',
      exp.note || '',
      recordStatus,
      deletedAt,
      lastUpdated
    ]);
  });

  // 8. PROJECTS / JOBS TABLE (with Archive rules: upsert by ID, deleted rows kept and marked)
  const projectHeaders = [
    'Project ID',
    'Title',
    'Client',
    'Phone',
    'Invoice No',
    'Event Type',
    'Event Date',
    'Delivery Due Date',
    'Stage',
    'Priority',
    'Progress',
    'Payment Status',
    'Balance Due',
    'Delivered At',
    'Record Status',
    'Deleted At',
    'Last Updated'
  ];
  const projectRows = [];
  projectsList.forEach(proj => {
    const recordStatus = proj.isDeleted ? 'Deleted' : 'Active';
    const deletedAt = proj.isDeleted ? (proj.deletedAt || '') : '';
    const lastUpdated = proj.updatedAt || proj.createdAt || '';

    // Linked client
    const linkedCust = (proj.customerId && customerMap.get(proj.customerId)) || null;
    const clientName = linkedCust?.name || proj.clientSnapshotName || '';
    const clientPhone = formatPhoneForSheets(linkedCust?.phone || proj.clientSnapshotPhone || '');

    // Linked invoice
    const linkedInv = (proj.invoiceId && invoices.find(inv => inv.id === proj.invoiceId)) || null;
    const invNo = linkedInv 
      ? formatInvoiceNumber(linkedInv.invoiceNumber, prefix) 
      : (proj.invoiceNumber ? formatInvoiceNumber(proj.invoiceNumber, prefix) : '');

    // Checklist progress
    const checklist = Array.isArray(proj.checklist) ? proj.checklist : [];
    const completed = checklist.filter(item => item.completed).length;
    const progressStr = checklist.length > 0 
      ? `${Math.round((completed / checklist.length) * 100)}% (${completed}/${checklist.length})` 
      : '0%';

    // Payment status & balance due from linked invoice
    let paymentStatus = 'No Bill';
    let balanceDue = 0;
    if (linkedInv) {
      balanceDue = Number(linkedInv.balanceDue) || 0;
      if (balanceDue <= 0) {
        paymentStatus = 'Paid';
      } else if (Number(linkedInv.advancePaid) > 0) {
        paymentStatus = 'Partially Paid';
      } else {
        paymentStatus = 'Unpaid';
      }
    }

    projectRows.push([
      proj.id,
      proj.title || 'Untitled Project',
      clientName,
      clientPhone,
      invNo,
      proj.eventType || '',
      proj.eventDate || '',
      proj.deliveryDueDate || '',
      proj.stage || 'Booked',
      proj.priority || 'Normal',
      progressStr,
      paymentStatus,
      balanceDue,
      proj.deliveredAt || '',
      recordStatus,
      deletedAt,
      lastUpdated
    ]);
  });

  // 9. SANITIZED BACKUP JSON SNAPSHOT
  // Strip sync secret, strip PIN security profile, and strip logoUrl (too heavy for Sheets text cell)
  const sanitizedSettings = settingsRecords
    .filter(s => s.key !== 'security_profile' && s.key !== 'pin_security')
    .map(s => {
      if (s.key === 'business_profile') {
        const copy = { ...s };
        delete copy.sheetsSyncSecret;
        delete copy.logoUrl; // Exclude logo image to keep payload light
        return copy;
      }
      return s;
    });

  const backupData = {
    app: 'DR FILMS Billing PWA',
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: {
      settings: sanitizedSettings,
      services,
      customCharges,
      customers,
      invoices,
      hourCalculations,
      expenses: expensesList,
      projects: projectsList
    }
  };

  return {
    tables: {
      Invoices: { headers: invoiceHeaders, rows: invoiceRows },
      'Bill Items': { headers: billItemHeaders, rows: billItemRows },
      Payments: { headers: paymentHeaders, rows: paymentRows },
      Clients: { headers: clientHeaders, rows: clientRows },
      Services: { headers: serviceHeaders, rows: serviceRows },
      'Expenses': { headers: expenseHeaders, rows: expenseRows },
      'Projects': { headers: projectHeaders, rows: projectRows },
      'Deleted Bills': { headers: deletedBillsHeaders, rows: deletedBillsRows }
    },
    backupJson: JSON.stringify(backupData)
  };
}

/**
 * Record a tombstone in business_profile for an invoice permanently deleted from the device.
 * Ensures the invoice number is never reused and Google Sheets sync preserves it with status "Deleted permanently".
 */
export async function recordPermanentlyDeletedInvoice(inv) {
  try {
    const profile = await db.settings.get('business_profile');
    if (!profile) return;
    const existing = Array.isArray(profile.permanentlyDeletedBills)
      ? [...profile.permanentlyDeletedBills]
      : [];

    const clientName = inv.customerSnapshot?.name || inv.customerName || '';
    const phone = inv.customerSnapshot?.phone || inv.customerPhone || '';
    const itemsSummary = (Array.isArray(inv.items) ? inv.items : [])
      .map((i, idx) => `${idx + 1}. ${i.name || 'Service'} (${i.quantityLabel || i.quantity || 1}) - ${i.amount || 0}`)
      .join('\n');

    existing.push({
      invoiceNumber: inv.invoiceNumber,
      clientName,
      phone,
      invoiceDate: inv.invoiceDate || '',
      totalAmount: inv.totalAmount || 0,
      advancePaid: inv.advancePaid || 0,
      balanceDue: inv.balanceDue || 0,
      deletedAt: inv.deletedAt || new Date().toISOString(),
      permanentlyDeletedAt: new Date().toISOString(),
      itemsSummary,
      notes: inv.notes || ''
    });

    await db.settings.put({
      ...profile,
      permanentlyDeletedBills: existing
    });
  } catch (err) {
    console.error('Failed to record permanently deleted invoice:', err);
  }
}

/**
 * Execute simple POST request to Google Apps Script Web App
 * Uses text/plain;charset=utf-8 to avoid CORS preflight options
 */
export async function sendAppsScriptRequest(url, payload, options = {}) {
  if (!url) {
    throw new Error('Google Apps Script Web App URL is missing');
  }

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  };

  if (options.keepalive) {
    fetchOptions.keepalive = true;
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Extract Google Sheet ID from a full spreadsheet URL or clean ID string
 */
export function extractSpreadsheetId(input) {
  if (!input || typeof input !== 'string') return '';
  const clean = input.trim();
  const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]{20,80}$/.test(clean)) {
    return clean;
  }
  return clean;
}

export const DEFAULT_SHEETS_SECRET = 'drfilms_backup_secret_2026';

/**
 * Resolve effective secret key.
 * If user accidentally pasted the Google Apps Script Deployment ID (starts with AKfy or in URL),
 * autocorrect to the expected secret key.
 */
export function resolveSecret(secret, url) {
  const trimmed = (secret || '').trim();
  if (!trimmed) return DEFAULT_SHEETS_SECRET;
  if (trimmed.startsWith('AKfy') || (url && url.includes(trimmed))) {
    return DEFAULT_SHEETS_SECRET;
  }
  return trimmed;
}

/**
 * Test Connection (action 'ping')
 */
export async function testGoogleSheetsConnection(url, secret, sheetId = null) {
  try {
    if (!url || !url.trim()) {
      return { success: false, error: 'Please enter your Google Apps Script Web App URL.' };
    }
    if (url.includes('@')) {
      return { 
        success: false, 
        error: 'You entered an email address. Google Sheets requires the Web App URL generated by Apps Script (starts with https://script.google.com/macros/s/.../exec).' 
      };
    }
    if (url.includes('docs.google.com/spreadsheets')) {
      return { 
        success: false, 
        error: 'You entered the spreadsheet link as the Web App URL. In that spreadsheet, open Extensions > Apps Script, deploy as Web App, and paste that generated Web App URL here.' 
      };
    }
    if (!url.trim().startsWith('http')) {
      return {
        success: false,
        error: 'The Web App URL must begin with https://script.google.com/macros/s/.../exec'
      };
    }

    let effectiveSecret = resolveSecret(secret, url);

    const payload = {
      secret: effectiveSecret,
      action: 'ping'
    };

    const cleanSheetId = extractSpreadsheetId(sheetId);
    if (cleanSheetId) {
      payload.sheetId = cleanSheetId;
    }

    let res = await sendAppsScriptRequest(url.trim(), payload);

    // Fallback: If custom secret gave unauthorized, retry with default secret
    if ((!res || res.success === false) && res?.error?.toLowerCase().includes('secret') && effectiveSecret !== DEFAULT_SHEETS_SECRET) {
      payload.secret = DEFAULT_SHEETS_SECRET;
      const retryRes = await sendAppsScriptRequest(url.trim(), payload);
      if (retryRes && retryRes.success) {
        res = retryRes;
        effectiveSecret = DEFAULT_SHEETS_SECRET;
      }
    }

    if (!res || res.success === false) {
      return { success: false, error: res?.error || 'Connection rejected by Google Sheet' };
    }

    // Save connected sheet metadata and effective secret if it was auto-corrected
    try {
      const current = await db.settings.get('business_profile');
      if (current) {
        const updates = {
          sheetsConnectedSheetName: res.sheetName || '',
          sheetsConnectedSheetId: res.sheetId || cleanSheetId || '',
          sheetsConnectedSheetUrl: res.sheetUrl || ''
        };
        if (effectiveSecret !== secret) {
          updates.sheetsSyncSecret = effectiveSecret;
        }
        await db.settings.update('business_profile', updates);
      }
    } catch (e) {}

    return { 
      success: true, 
      message: res.message || 'Connected to Google Sheet successfully!', 
      sheetName: res.sheetName,
      sheetId: res.sheetId,
      sheetUrl: res.sheetUrl
    };
  } catch (err) {
    return { success: false, error: err.message || 'Network error reaching Google Apps Script' };
  }
}

/**
 * Fetch backup snapshot from Google Sheet (action 'getBackup')
 */
export async function fetchGoogleSheetBackup(url, secret, sheetId = null) {
  try {
    if (!url) {
      return { success: false, error: 'Missing Web App URL' };
    }

    let effectiveSecret = resolveSecret(secret, url);

    const payload = {
      secret: effectiveSecret,
      action: 'getBackup'
    };

    const cleanSheetId = extractSpreadsheetId(sheetId);
    if (cleanSheetId) {
      payload.sheetId = cleanSheetId;
    }

    let res = await sendAppsScriptRequest(url.trim(), payload);
    if ((!res || !res.success) && res?.error?.toLowerCase().includes('secret') && effectiveSecret !== DEFAULT_SHEETS_SECRET) {
      payload.secret = DEFAULT_SHEETS_SECRET;
      const retryRes = await sendAppsScriptRequest(url.trim(), payload);
      if (retryRes && retryRes.success) {
        res = retryRes;
      }
    }

    if (!res || !res.success || !res.backupJson) {
      return { success: false, error: res?.error || 'No backup found in Google Sheet' };
    }

    let parsedBackup;
    try {
      parsedBackup = JSON.parse(res.backupJson);
    } catch (e) {
      return { success: false, error: 'Malformed backup data stored in Google Sheet' };
    }

    const invoices = parsedBackup.data?.invoices || [];
    const customers = parsedBackup.data?.customers || [];
    const services = parsedBackup.data?.services || [];

    return {
      success: true,
      sheetName: res.sheetName,
      sheetId: res.sheetId,
      sheetUrl: res.sheetUrl,
      backupData: parsedBackup,
      backupTime: parsedBackup.exportDate || null,
      counts: {
        invoices: invoices.length,
        customers: customers.length,
        services: services.length
      }
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to download backup from Google Sheet' };
  }
}

/**
 * Perform Google Sheets Sync (action 'syncAll')
 * Handles concurrency lock, offline detection, retry backoff, and non-blocking notifications
 */
export async function performGoogleSheetsSync(options = {}) {
  const { force = false } = options;

  // Retrieve current settings
  const settings = await db.settings.get('business_profile');
  if (!settings) return { success: false, reason: 'no_settings' };

  if (!settings.sheetsBackupEnabled && !force) {
    return { success: false, reason: 'disabled' };
  }

  const url = settings.sheetsWebAppUrl?.trim();
  let effectiveSecret = resolveSecret(settings.sheetsSyncSecret, url);
  const targetSheetId = extractSpreadsheetId(settings.sheetsSpreadsheetId || '');

  if (!url) {
    return { success: false, reason: 'unconfigured' };
  }

  if (url.includes('@') || url.includes('docs.google.com/spreadsheets') || !url.startsWith('http')) {
    const err = 'Invalid Web App URL format. Must start with https://script.google.com/macros/s/.../exec';
    await updateSyncStatus('error', err);
    dispatchSyncNotification('error', err);
    return { success: false, error: err };
  }

  // Check offline state
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await updateSyncStatus('pending', 'Offline - changes pending sync when reconnected');
    dispatchSyncNotification('pending', 'Sync pending (offline). Will sync when connection is restored.');
    return { success: false, reason: 'offline' };
  }

  // Concurrency Lock: if already syncing, queue another sync after completion
  if (isSyncing) {
    syncQueued = true;
    if (options.keepalive) {
      try {
        prepareSyncPayload(settings).then(({ tables, backupJson }) => {
          sendAppsScriptRequest(url, {
            secret: effectiveSecret,
            action: 'syncAll',
            tables,
            backupJson,
            ...(targetSheetId ? { sheetId: targetSheetId } : {})
          }, { keepalive: true }).catch(() => {});
        }).catch(() => {});
      } catch (e) {}
    }
    return { success: false, reason: 'queued' };
  }

  isSyncing = true;
  await updateSyncStatus('syncing', null);
  dispatchSyncNotification('syncing', 'Syncing data to Google Sheet...');

  try {
    const { tables, backupJson } = await prepareSyncPayload(settings);

    const payload = {
      secret: effectiveSecret,
      action: 'syncAll',
      tables,
      backupJson
    };

    if (targetSheetId) {
      payload.sheetId = targetSheetId;
    }

    let res = await sendAppsScriptRequest(url, payload, { keepalive: Boolean(options.keepalive) });

    // Fallback: If secret failed, retry with default secret
    if ((!res || res.success === false) && res?.error?.toLowerCase().includes('secret') && effectiveSecret !== DEFAULT_SHEETS_SECRET) {
      payload.secret = DEFAULT_SHEETS_SECRET;
      const retryRes = await sendAppsScriptRequest(url, payload, { keepalive: Boolean(options.keepalive) });
      if (retryRes && retryRes.success) {
        res = retryRes;
        effectiveSecret = DEFAULT_SHEETS_SECRET;
        try {
          await db.settings.update('business_profile', { sheetsSyncSecret: DEFAULT_SHEETS_SECRET });
        } catch (e) {}
      }
    }

    if (!res || res.success === false) {
      throw new Error(res?.error || 'Google Apps Script failed to save tables');
    }

    // Sync succeeded!
    hasPendingChanges = false;
    const syncedAt = new Date().toISOString();
    await updateSyncStatus('synced', null, syncedAt, {
      sheetName: res.sheetName,
      sheetId: res.sheetId,
      sheetUrl: res.sheetUrl
    });

    retryAttempt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    const toastMsg = res.sheetName 
      ? `Google Sheet backup completed for "${res.sheetName}"!`
      : 'Google Sheet backup completed successfully!';

    dispatchSyncNotification('synced', toastMsg, { 
      syncedAt, 
      sheetName: res.sheetName,
      sheetId: res.sheetId,
      sheetUrl: res.sheetUrl 
    });
    isSyncing = false;

    // If another change occurred during sync, process it now
    if (syncQueued) {
      syncQueued = false;
      setTimeout(() => performGoogleSheetsSync(), 1000);
    }

    return { 
      success: true, 
      syncedAt,
      sheetName: res.sheetName,
      sheetId: res.sheetId,
      sheetUrl: res.sheetUrl
    };
  } catch (err) {
    console.error('Google Sheets sync error:', err);
    isSyncing = false;

    const errMsg = err.message || 'Unknown sync error';
    await updateSyncStatus('pending', errMsg);

    // Small non-blocking toast notification
    dispatchSyncNotification('error', `Google Sheet sync failed: ${errMsg}`);

    // Schedule progressive retry: 30s, 1m, 5m, then 15m
    const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
    retryAttempt++;

    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      performGoogleSheetsSync();
    }, delay);

    // If sync was queued during failure, keep queue flag
    if (syncQueued) {
      syncQueued = false;
    }

    return { success: false, error: errMsg, nextRetryIn: delay };
  }
}

/**
 * Update sync status fields and connected sheet metadata in IndexedDB settings
 */
async function updateSyncStatus(status, errorMsg = null, syncedAt = null, meta = {}) {
  try {
    const current = await db.settings.get('business_profile');
    if (!current) return;

    cachedLastSyncStatus = status;
    if (syncedAt) cachedLastSyncedAt = syncedAt;
    if (meta.sheetName) cachedConnectedSheetName = meta.sheetName;

    const updateObj = {
      sheetsLastSyncStatus: status,
      sheetsLastSyncError: errorMsg
    };
    if (syncedAt) {
      updateObj.sheetsLastSyncedAt = syncedAt;
    }
    if (meta.sheetName) updateObj.sheetsConnectedSheetName = meta.sheetName;
    if (meta.sheetId) updateObj.sheetsConnectedSheetId = meta.sheetId;
    if (meta.sheetUrl) updateObj.sheetsConnectedSheetUrl = meta.sheetUrl;

    await db.settings.update('business_profile', updateObj);
  } catch (e) {
    console.warn('Could not update sync status in IndexedDB:', e);
  }
}

let hasPendingChanges = false;
let isFirstSyncTriggered = false;
let appCloseListenerAttached = false;
let cachedBackupConfigured = false;
let cachedLastSyncStatus = null;
let cachedLastSyncedAt = null;
let cachedConnectedSheetName = '';

/**
 * Check if the window should block closing because backup is not yet complete.
 * "if not then not close"
 */
export function shouldBlockCloseSync() {
  if (!cachedBackupConfigured) return false;

  // If sync is actively in flight, debounce timer waiting, changes pending, or last sync was not 'synced':
  if (isSyncing || hasPendingChanges || debounceTimer !== null || cachedLastSyncStatus !== 'synced') {
    return true;
  }
  return false;
}

/**
 * Dedicated function to perform full backup before closing the billing app.
 * Awaits completion, checks result, and allows or blocks closing accordingly.
 * "if i close a billing app then first update backup then close the window if not then not close"
 */
export async function performCloseWithBackup() {
  const settings = await db.settings.get('business_profile');
  if (!settings || !settings.sheetsBackupEnabled || !settings.sheetsWebAppUrl) {
    return {
      success: true,
      unconfigured: true,
      message: 'Google Sheets cloud backup is not configured or disabled in Settings.'
    };
  }

  // Clear debounce timer so sync executes immediately
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Force immediate sync
  const res = await performGoogleSheetsSync({ force: true, reason: 'user_close_app' });
  return res;
}

/**
 * Retrieve current synchronization state for UI components
 */
export function getSyncState() {
  return {
    isSyncing,
    hasPendingChanges: Boolean(hasPendingChanges || debounceTimer !== null),
    cachedBackupConfigured,
    cachedLastSyncStatus,
    cachedLastSyncedAt,
    cachedConnectedSheetName,
    shouldBlockClose: shouldBlockCloseSync()
  };
}

/**
 * Schedule auto-sync when bills or billing data change.
 * Event-driven: Only triggers on data modifications, never polls on a periodic timer.
 * Debounces rapid edits (e.g. 1000ms, or scheduleAutoSync(5000) for legacy 5s compatibility).
 */
export function scheduleAutoSync(delay = 1000) {
  if (typeof window === 'undefined' || isAutoSyncPaused) return;

  hasPendingChanges = true;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // scheduleAutoSync(5000) compatibility fallback
  const effectiveDelay = typeof delay === 'number' ? delay : 1000;

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    try {
      await performGoogleSheetsSync();
    } catch (e) {
      console.warn('Auto sync error:', e);
    }
  }, effectiveDelay);
}

export const triggerAutoUpdateBackup = scheduleAutoSync;

/**
 * Flush any pending or scheduled sync immediately when the app is closing or hidden
 */
export function flushSyncOnClose() {
  if (typeof window === 'undefined' || isAutoSyncPaused) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  try {
    performGoogleSheetsSync({ keepalive: true, reason: 'app_close' });
  } catch (e) {
    console.warn('Flush on close error:', e);
  }
}

/**
 * Trigger immediate manual sync (e.g. for "Sync now" button)
 */
export async function triggerManualSync() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return await performGoogleSheetsSync({ force: true });
}

/**
 * Initialize Dexie hooks, app open/close triggers, and browser online listener for automatic synchronization.
 * Event-driven: Triggers on bill changes, new bill generation, database updates, app open, and app close.
 * Does NOT run any periodic 1-15 second polling timer.
 */
export function initGoogleSheetsSync() {
  if (typeof window === 'undefined') return;

  // Pre-cache settings for synchronous beforeunload evaluation
  db.settings.get('business_profile').then(settings => {
    if (settings) {
      cachedBackupConfigured = Boolean(settings.sheetsBackupEnabled && settings.sheetsWebAppUrl);
      cachedLastSyncStatus = settings.sheetsLastSyncStatus || null;
      cachedLastSyncedAt = settings.sheetsLastSyncedAt || null;
      cachedConnectedSheetName = settings.sheetsConnectedSheetName || '';
    }
  }).catch(() => {});

  // 1. Hook database changes once: bills, clients, services, charges, hours
  if (!hooksAttached) {
    hooksAttached = true;

    const triggerHook = () => {
      if (!isAutoSyncPaused) {
        hasPendingChanges = true;
        // Event-driven update trigger whenever data changes in the app:
        // scheduleAutoSync(5000) is kept for backwards compatibility, but fires with fast 1000ms debounce
        scheduleAutoSync(1000);
      }
    };

    // Attach to core data tables: invoices, customers, services, customCharges, hourCalculations
    if (db.invoices) {
      db.invoices.hook('creating', triggerHook);
      db.invoices.hook('updating', triggerHook);
      db.invoices.hook('deleting', triggerHook);
    }

    if (db.customers) {
      db.customers.hook('creating', triggerHook);
      db.customers.hook('updating', triggerHook);
      db.customers.hook('deleting', triggerHook);
    }

    if (db.services) {
      db.services.hook('creating', triggerHook);
      db.services.hook('updating', triggerHook);
      db.services.hook('deleting', triggerHook);
    }

    if (db.customCharges) {
      db.customCharges.hook('creating', triggerHook);
      db.customCharges.hook('updating', triggerHook);
      db.customCharges.hook('deleting', triggerHook);
    }

    if (db.hourCalculations) {
      db.hourCalculations.hook('creating', triggerHook);
      db.hourCalculations.hook('updating', triggerHook);
      db.hourCalculations.hook('deleting', triggerHook);
    }
  }

  // 2. Online/Offline events
  window.addEventListener('online', () => {
    dispatchSyncNotification('info', 'Internet connection restored. Checking Google Sheets sync...');
    performGoogleSheetsSync({ reason: 'online' });
  });

  window.addEventListener('offline', () => {
    updateSyncStatus('pending', 'Offline - network disconnected');
  });

  // 3. App Open / Launch: Trigger the first update backup immediately
  if (!isFirstSyncTriggered) {
    isFirstSyncTriggered = true;
    setTimeout(() => {
      performGoogleSheetsSync({ reason: 'app_open' });
    }, 200);
  }

  // 4. App Close / Hide lifecycle: Trigger backup update on app close
  // "if i close a billing app then first update backup then close the window if not then not close"
  if (!appCloseListenerAttached) {
    appCloseListenerAttached = true;

    const handleBeforeUnload = (e) => {
      // 1. Immediately flush latest state with keepalive: true
      flushSyncOnClose();

      // 2. If backup is not complete or unverified: Block window close and prompt user!
      if (shouldBlockCloseSync()) {
        e.preventDefault();
        e.returnValue = 'Google Sheets backup must be updated before closing! Please stay on page until backup completes so no billing data is lost.';
        // In the background, trigger immediate forced sync so that while the dialog is visible or user stays, backup finishes!
        performGoogleSheetsSync({ force: true, keepalive: true }).catch(() => {});
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', () => flushSyncOnClose());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushSyncOnClose();
      } else if (document.visibilityState === 'visible' && hasPendingChanges) {
        scheduleAutoSync(500);
      }
    });
  }
}
