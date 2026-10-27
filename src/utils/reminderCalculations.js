import { formatCurrency, formatDate, formatInvoiceNumber } from './formatters.js';
import { DEFAULT_REMINDER_SETTINGS } from '../db/seedData.js';

/**
 * Calculate days overdue for an invoice
 * Compares due date (or invoice date) against reference date (defaults to now)
 * Returns positive integer for overdue, 0 or negative if not yet overdue
 */
export function calculateDaysOverdue(dueDate, invoiceDate, refDate = new Date()) {
  const targetDateStr = dueDate || invoiceDate;
  if (!targetDateStr) return 0;

  const due = new Date(targetDateStr);
  if (isNaN(due.getTime())) return 0;

  // Reset time portions for pure date comparison
  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);

  const d = new Date(due);
  d.setHours(0, 0, 0, 0);

  const diffMs = ref.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days until due for upcoming invoices
 * Returns 0 if due today, 1 if due tomorrow, etc.
 */
export function calculateDaysUntilDue(dueDate, invoiceDate, refDate = new Date()) {
  const days = -calculateDaysOverdue(dueDate, invoiceDate, refDate);
  return days === 0 ? 0 : days;
}

/**
 * Check if an invoice is currently snoozed
 */
export function isSnoozed(invoice, refDate = new Date()) {
  if (!invoice?.snoozedUntil) return false;
  const snoozeDate = new Date(invoice.snoozedUntil);
  if (isNaN(snoozeDate.getTime())) return false;
  return snoozeDate.getTime() > refDate.getTime();
}

/**
 * Check if a reminder was sent recently (within given days, default 3)
 */
export function isRecentlyReminded(lastReminderDate, withinDays = 3, refDate = new Date()) {
  if (!lastReminderDate) return false;
  const lastDate = new Date(lastReminderDate);
  if (isNaN(lastDate.getTime())) return false;

  const diffMs = refDate.getTime() - lastDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < withinDays;
}

/**
 * Select default reminder tone based on days overdue
 * Friendly: 1–7 days
 * Neutral: 8–30 days
 * Firm: >30 days
 */
export function selectReminderTone(daysOverdue) {
  if (daysOverdue <= 7) return 'friendly';
  if (daysOverdue <= 30) return 'neutral';
  return 'firm';
}

/**
 * Filter invoices that are actively overdue (respects grace days and snoozes)
 */
export function getOverdueInvoices(invoices = [], graceDays = 0, refDate = new Date()) {
  return invoices.filter(inv => {
    if (!inv || inv.isDeleted) return false;
    if (inv.status === 'cancelled' || inv.status === 'draft' || inv.status === 'paid') return false;
    if (Number(inv.balanceDue || 0) <= 0) return false;
    if (isSnoozed(inv, refDate)) return false;

    const daysOverdue = calculateDaysOverdue(inv.dueDate, inv.invoiceDate, refDate);
    return daysOverdue > graceDays;
  });
}

/**
 * Filter invoices due in the next N days (default 3 days)
 */
export function getUpcomingDueInvoices(invoices = [], daysAhead = 3, refDate = new Date()) {
  return invoices.filter(inv => {
    if (!inv || inv.isDeleted) return false;
    if (inv.status === 'cancelled' || inv.status === 'draft' || inv.status === 'paid') return false;
    if (Number(inv.balanceDue || 0) <= 0) return false;
    if (isSnoozed(inv, refDate)) return false;

    const daysUntil = calculateDaysUntilDue(inv.dueDate, inv.invoiceDate, refDate);
    return daysUntil >= 0 && daysUntil <= daysAhead;
  });
}

/**
 * Group overdue invoices by client so that clients with multiple overdue bills
 * get a single consolidated reminder.
 * Groups are sorted oldest overdue first (max days overdue descending).
 */
export function groupInvoicesByClient(overdueInvoices = [], customers = []) {
  const customerMap = new Map();
  customers.forEach(c => {
    if (c?.id) customerMap.set(Number(c.id), c);
  });

  const groupMap = new Map();

  overdueInvoices.forEach(inv => {
    const custId = inv.customerId ? Number(inv.customerId) : null;
    const clientRecord = custId ? customerMap.get(custId) : null;
    const clientName = clientRecord?.name || inv.customerSnapshot?.name || 'Valued Client';
    const clientPhone = clientRecord?.phone || inv.customerSnapshot?.phone || '';
    const clientTag = clientRecord?.tag || inv.customerSnapshot?.tag || 'Regular';
    const isMuted = Boolean(clientRecord?.dontRemind || inv.customerSnapshot?.dontRemind);

    // Group key: customerId if available, otherwise phone or name
    const groupKey = custId ? `cust_${custId}` : (clientPhone ? `phone_${clientPhone}` : `name_${clientName}`);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        clientId: custId,
        clientName,
        clientPhone,
        clientTag,
        isMuted,
        invoices: [],
        totalPayable: 0,
        maxDaysOverdue: 0,
        oldestDueDate: null,
        lastReminderDate: null,
        reminderCount: 0
      });
    }

    const group = groupMap.get(groupKey);
    group.invoices.push(inv);
    group.totalPayable += (Number(inv.balanceDue) || 0);

    const days = calculateDaysOverdue(inv.dueDate, inv.invoiceDate);
    if (days > group.maxDaysOverdue) {
      group.maxDaysOverdue = days;
    }

    const dStr = inv.dueDate || inv.invoiceDate;
    if (!group.oldestDueDate || (dStr && new Date(dStr) < new Date(group.oldestDueDate))) {
      group.oldestDueDate = dStr;
    }

    if (inv.lastReminderDate) {
      if (!group.lastReminderDate || new Date(inv.lastReminderDate) > new Date(group.lastReminderDate)) {
        group.lastReminderDate = inv.lastReminderDate;
      }
    }

    group.reminderCount = Math.max(group.reminderCount, Number(inv.reminderCount) || 0);
  });

  // Convert to array and sort: oldest overdue first (highest maxDaysOverdue descending)
  const result = Array.from(groupMap.values());
  result.sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);
  return result;
}

/**
 * Remove any emojis from message text (strict requirement: zero emojis in reminders)
 */
export function removeEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{FFFD}]/gu, '');
}

/**
 * Generate a payment reminder WhatsApp message
 * Supports friendly, neutral, firm, and upcoming tones
 * Replaces placeholders: {clientName}, {invoiceNumber}, {amount}, {dueDate}, {daysOverdue}, {daysUntilDue}, {upiId}, {businessName}
 */
export function generateReminderMessage({
  clientName,
  invoiceNumbers,
  totalAmount,
  dueDate,
  daysOverdue,
  daysUntilDue = 0,
  tone = 'friendly',
  settings = {},
  customTemplate = null
}) {
  const sym = settings?.currencySymbol || '₹';
  const businessName = settings?.businessName || 'DR FILMS';
  const upiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();
  const phone = (settings?.phone || '').trim();

  const templates = {
    ...DEFAULT_REMINDER_SETTINGS.templates,
    ...(settings?.reminderTemplates || settings?.reminderSettings?.templates || {})
  };

  let template = customTemplate || templates[tone] || templates.friendly;

  const invNumbersStr = Array.isArray(invoiceNumbers)
    ? invoiceNumbers.map(n => formatInvoiceNumber(n)).join(', ')
    : formatInvoiceNumber(invoiceNumbers) || 'BILL';

  const formattedAmount = formatCurrency(totalAmount, sym);
  const formattedDueDate = dueDate ? formatDate(dueDate) : 'due date';

  // 1. Sanitize any template that already has a currency symbol prefixed to {amount}
  // to avoid double symbols like ₹₹ 16,995.00
  let cleanTemplate = template.replace(/(?:[₹$€£]|Rs\.?)\s*\{amount\}/gi, '{amount}');

  // 2. If UPI ID is empty, remove the UPI payment line cleanly
  if (!upiId) {
    cleanTemplate = cleanTemplate
      .replace(/^[ \t]*(?:Pay via UPI|UPI ID for payment|UPI ID|Please settle the account via UPI)[^\n]*\{upiId\}[^\n]*\n?/gim, '')
      .replace(/^[ \t]*Payment Details:\s*\n(?=[ \t]*(?:Kindly|Please|Thank|Best|Regards))/gim, '')
      .replace(/\{upiId\}/g, '');
  }

  let msg = cleanTemplate
    .replace(/\{clientName\}/g, clientName || 'Client')
    .replace(/\{invoiceNumber\}/g, invNumbersStr)
    .replace(/\{amount\}/g, formattedAmount)
    .replace(/\{dueDate\}/g, formattedDueDate)
    .replace(/\{daysOverdue\}/g, String(Math.max(0, daysOverdue || 0)))
    .replace(/\{daysUntilDue\}/g, String(Math.max(0, daysUntilDue || 0)))
    .replace(/\{upiId\}/g, upiId)
    .replace(/\{businessName\}/g, businessName)
    .replace(/\{phone\}/g, phone);

  // 3. Collapse any accidental duplicate currency symbols (e.g. ₹₹ -> ₹)
  msg = msg.replace(/([₹$€£])\s*\1+/g, '$1');

  // 4. Clean up any trailing empty lines (max 2 consecutive newlines)
  msg = msg.replace(/\n{3,}/g, '\n\n');

  return removeEmojis(msg).trim();
}
