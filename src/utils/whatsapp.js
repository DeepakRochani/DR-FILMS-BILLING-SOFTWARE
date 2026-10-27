import { formatCurrency, formatDate, formatInvoiceNumber, numberToWords } from './formatters.js';
import { setSharingActive } from './security.js';
export { removeEmojis } from './reminderCalculations.js';

export const DEFAULT_WHATSAPP_TEMPLATE = `Hello {clientName},

Here is your invoice *{invoiceNumber}* from {businessName}.

Date: {date}
Total Amount: {total}
{paymentLine}Balance Due: {balance}
Due Date: {dueDate}

UPI ID for payment: {upiId}

Thank you,
{businessName}
Phone: {phone}`;

export const DEFAULT_WHATSAPP_PAID_TEMPLATE = `Hello {clientName},

Payment received, thank you for working with {businessName}!

Invoice: *{invoiceNumber}*
Date: {date}
Total Amount: {total}
Payment Received: {total}
Status: Paid in Full

Best regards,
{businessName}
Phone: {phone}`;

/**
 * Generate clean short plain-text WhatsApp message without emojis
 * Keeps *bold* only for the invoice number
 * Uses dynamic payment labels ("Payment Received" for paid, "Amount Paid" for partial, "Advance Paid" for booking advance)
 */
export function generateWhatsAppMessage(invoice, settings) {
  if (!invoice) return '';

  const clientName = invoice.customerSnapshot?.name || 'Client';
  const invoiceNum = formatInvoiceNumber(invoice.invoiceNumber) || 'BILL';
  const date = formatDate(invoice.invoiceDate);
  const businessName = settings?.businessName || 'DR FILMS';
  const phone = settings?.phone || '';

  // Cancelled bills: cancellation notice only, strictly no payment reminder or UPI details
  if (invoice.status === 'cancelled') {
    const reasonText = invoice.cancelReason ? `Reason: ${invoice.cancelReason}\n` : '';
    return `Hello ${clientName},

Please note that invoice *${invoiceNum}* from ${businessName} has been CANCELLED / VOIDED.

Date: ${date}
${reasonText}
This is a cancellation notice for your records. No payment is required.

Thank you,
${businessName}
Phone: ${phone}`;
  }

  const isPaid = invoice.status === 'paid' || (Number(invoice.balanceDue) <= 0 && Number(invoice.totalAmount) > 0);
  const sym = settings?.currencySymbol || '₹';
  const total = formatCurrency(invoice.totalAmount || 0, sym);
  const balance = formatCurrency(invoice.balanceDue !== undefined ? invoice.balanceDue : (invoice.totalAmount || 0), sym);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : '';
  const upiId = (settings?.bankDetails?.upiId || settings?.upiId || '').trim();

  const advancePaidNum = Number(invoice.advancePaid) || 0;
  let paymentLine = '';
  let paidLabel = '';
  let paidAmount = '';

  if (isPaid) {
    paidLabel = 'Payment Received';
    paidAmount = total;
  } else if (invoice.status === 'partially_paid') {
    paidLabel = 'Received';
    paidAmount = formatCurrency(advancePaidNum, sym);
    paymentLine = `Received: ${paidAmount}\n`;
  } else if ((invoice.status === 'unpaid' || invoice.status === 'draft') && advancePaidNum > 0) {
    paidLabel = 'Advance Paid';
    paidAmount = formatCurrency(advancePaidNum, sym);
    paymentLine = `Advance Paid: ${paidAmount}\n`;
  }

  // Choose template: paid vs unpaid
  let template = isPaid
    ? (settings?.whatsappPaidTemplate || DEFAULT_WHATSAPP_PAID_TEMPLATE)
    : (settings?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE);

  let message = template;

  // Ensure bold *only* for invoice number:
  if (message.includes('*{invoiceNumber}*')) {
    message = message.replace(/\{invoiceNumber\}/g, invoiceNum);
  } else {
    message = message.replace(/\{invoiceNumber\}/g, `*${invoiceNum}*`);
  }

  // Cleanly remove Due Date line if invoice has no due date (or toggled off)
  if (!invoice.dueDate) {
    message = message.replace(/Due Date:\s*\{dueDate\}\n?/i, '');
  }

  // Replace remaining placeholders
  message = message
    .replace(/\{clientName\}/g, clientName)
    .replace(/\{total\}/g, total)
    .replace(/\{balance\}/g, balance)
    .replace(/\{dueDate\}/g, dueDate)
    .replace(/\{date\}/g, date)
    .replace(/\{upiId\}/g, upiId)
    .replace(/\{businessName\}/g, businessName)
    .replace(/\{phone\}/g, phone)
    .replace(/\{paidLabel\}/g, paidLabel)
    .replace(/\{paidAmount\}/g, paidAmount)
    .replace(/\{paymentLine\}/g, paymentLine);

  // Handle previous balance breakdown if enabled
  const hasPrevBalance = Boolean(invoice.showPreviousBalance && Number(invoice.previousBalance) > 0);
  const prevBalanceNum = Number(invoice.previousBalance) || 0;
  const thisBillBalanceStr = formatCurrency(invoice.balanceDue || 0, sym);
  const prevPendingStr = formatCurrency(prevBalanceNum, sym);
  const prevInvoicesList = Array.isArray(invoice.previousInvoiceNumbers) && invoice.previousInvoiceNumbers.length > 0
    ? invoice.previousInvoiceNumbers.map(formatInvoiceNumber).join(', ')
    : '';
  const totalPayableNum = (Number(invoice.balanceDue) || 0) + prevBalanceNum;
  const totalPayableStr = formatCurrency(totalPayableNum, sym);

  if (hasPrevBalance && !isPaid) {
    // Show "Total payable now" as main due amount, with breakdown in one short line
    const prevBlock = `Total payable now: ${totalPayableStr}\n(This bill ${thisBillBalanceStr} + Previous ${prevPendingStr}${prevInvoicesList ? ` (${prevInvoicesList})` : ''})`;
    if (message.includes(`Balance Due: ${balance}`)) {
      message = message.replace(`Balance Due: ${balance}`, prevBlock);
    } else if (message.includes('Balance Due:')) {
      message = message.replace(/Balance Due:[^\n]*/, prevBlock);
    }
  }

  // Replace any explicit previous balance template tags
  message = message
    .replace(/\{thisBillBalance\}/g, thisBillBalanceStr)
    .replace(/\{previousPending\}/g, prevPendingStr)
    .replace(/\{previousInvoices\}/g, prevInvoicesList)
    .replace(/\{totalPayable\}/g, totalPayableStr);

  // If upiId is empty, remove empty UPI line cleanly
  if (!upiId) {
    message = message.replace(/UPI ID for payment:\s*\n?/gi, '');
  }

  // Strip any accidental emojis or unwanted replacement characters
  message = message.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{FFFD}]/gu, '');

  return message.trim();
}

/**
 * Clean phone number: remove spaces, +, -, (, ), and leading 0,
 * and add country code from Settings if missing. Returns digits-only string.
 */
export function cleanWhatsAppPhone(rawPhone, defaultCountryCode = '91') {
  if (!rawPhone) return '';
  const cc = String(defaultCountryCode || '91').replace(/\D/g, '') || '91';
  let digits = String(rawPhone).trim().replace(/\D/g, '');

  if (!digits) return '';

  // If starts with country code followed by a leading 0 for the local number (e.g. 9109876543210)
  if (digits.startsWith(cc + '0') && digits.length === cc.length + 11) {
    digits = cc + digits.slice(cc.length + 1);
  }

  // Remove leading zeros if no country code prefix
  digits = digits.replace(/^0+/, '');

  if (!digits) return '';

  // If 10 digits (e.g. standard Indian mobile number), prepend country code
  if (digits.length === 10) {
    return cc + digits;
  }
  // If shorter than 11 digits and does not already start with country code, prepend it
  if (!digits.startsWith(cc) && digits.length < 11) {
    return cc + digits;
  }
  return digits;
}

/**
 * Detect if current browser is running on a mobile device (Android / iOS)
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (typeof window !== 'undefined' ? window.opera : '') || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return Boolean(isMobileUA || isIPadOS);
}

/**
 * Determine whether to use the desktop WhatsApp Web flow
 * Settings mode:
 * - 'auto' (default): Desktop (Mac/Windows) -> WhatsApp Web; Mobile (Android/iOS) -> Share Sheet
 * - 'web': Always use WhatsApp Web
 * - 'share_sheet': Always use Share Sheet
 */
export function shouldOpenWhatsAppWeb(settings) {
  const mode = settings?.whatsappMode || 'auto';
  if (mode === 'web') return true;
  if (mode === 'share_sheet') return false;
  return !isMobileDevice();
}

/**
 * Build WhatsApp Web URL on desktop:
 * https://web.whatsapp.com/send?phone=<91 + client number, digits only>&text=<encodeURIComponent(short message)>
 * (Does not use api.whatsapp.com/send or wa.me, as those open desktop app prompt first)
 */
export function getWhatsAppWebUrl(invoice, settings) {
  const text = generateWhatsAppMessage(invoice, settings);
  const rawPhone = invoice?.customerSnapshot?.phone || '';
  const cc = settings?.defaultCountryCode || '91';
  const phoneDigits = cleanWhatsAppPhone(rawPhone, cc);
  const encodedText = encodeURIComponent(text);

  if (phoneDigits) {
    return `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodedText}`;
  }
  return `https://web.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Build the final WhatsApp Web or App URL
 */
export function getWhatsAppShareUrl(invoice, settings, options = {}) {
  const useWeb = options.forceWeb !== undefined ? options.forceWeb : shouldOpenWhatsAppWeb(settings);
  if (useWeb) {
    return getWhatsAppWebUrl(invoice, settings);
  }

  const text = generateWhatsAppMessage(invoice, settings);
  const rawPhone = invoice?.customerSnapshot?.phone || '';
  const cc = settings?.defaultCountryCode || '91';
  const phoneDigits = cleanWhatsAppPhone(rawPhone, cc);
  const encodedText = encodeURIComponent(text);

  return phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Open WhatsApp chat in a new tab with clean phone number & prefilled message
 */
export function openWhatsAppShare(invoice, settings, options = {}) {
  setSharingActive(true);
  try {
    const url = getWhatsAppShareUrl(invoice, settings, options);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } finally {
    // Keep sharing guard active for 5 seconds while browser switches tab/app to WhatsApp
    setTimeout(() => {
      setSharingActive(false);
    }, 5000);
  }
}

/**
 * Format / clean phone number for WhatsApp
 */
export const formatWhatsAppPhone = cleanWhatsAppPhone;

/**
 * Generic helper to send any custom plain-text WhatsApp message to a phone number.
 * Respects desktop WhatsApp Web vs mobile routing, phone cleaning, and sharing security guards.
 */
export function sendWhatsAppMessage({ phone, text, mode = 'auto', defaultCountryCode = '91', forceWeb }) {
  setSharingActive(true);
  try {
    const cc = defaultCountryCode || '91';
    const phoneDigits = cleanWhatsAppPhone(phone, cc);
    const encodedText = encodeURIComponent((text || '').trim());

    const isWeb = forceWeb !== undefined 
      ? forceWeb 
      : (mode === 'web' ? true : mode === 'share_sheet' ? false : !isMobileDevice());

    let url = '';
    if (isWeb) {
      url = phoneDigits
        ? `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodedText}`
        : `https://web.whatsapp.com/send?text=${encodedText}`;
    } else {
      url = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodedText}`
        : `https://api.whatsapp.com/send?text=${encodedText}`;
    }

    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } finally {
    setTimeout(() => {
      setSharingActive(false);
    }, 5000);
  }
}

/**
 * Generate official payment receipt WhatsApp message (zero emoji, professional format)
 */
export function generatePaymentReceiptWhatsAppMessage(invoice, payment, settings) {
  if (!invoice || !payment) return '';
  const clientName = invoice.customerSnapshot?.name || 'Valued Client';
  const sym = settings?.currencySymbol || '₹';
  const businessName = settings?.businessName || 'DR FILMS';
  const phone = settings?.phone || '';

  const allPayments = (Array.isArray(invoice.payments) ? invoice.payments : []).filter(p => !p?.isDeleted);
  const paymentIndex = allPayments.findIndex(p => p.id === payment.id);
  const formattedInvoiceNum = formatInvoiceNumber(invoice.invoiceNumber);
  const receiptNumber = `REC-${formattedInvoiceNum}-P${paymentIndex >= 0 ? paymentIndex + 1 : 1}`;

  let cumulativePaid = 0;
  for (let i = 0; i <= (paymentIndex >= 0 ? paymentIndex : allPayments.length - 1); i++) {
    cumulativePaid += Number(allPayments[i]?.amount || 0);
  }
  const totalAmount = Number(invoice.totalAmount) || 0;
  const balanceRemaining = Math.max(0, totalAmount - cumulativePaid);

  return `Hello ${clientName},

Thank you for your payment! Here is your official payment receipt from ${businessName}.

RECEIPT DETAILS:
Receipt No: ${receiptNumber}
Date: ${formatDate(payment.date)}
Against Bill: *${formattedInvoiceNum}*
Amount Received: ${formatCurrency(payment.amount, sym)} (${numberToWords(payment.amount)})
Payment Mode: ${payment.method || 'Direct Payment'}${payment.note ? `\nPayment Reference: ${payment.note}` : ''}

ACCOUNT SUMMARY:
Total Invoice Amount: ${formatCurrency(totalAmount, sym)}
Total Paid to Date: ${formatCurrency(cumulativePaid, sym)}
Balance Remaining: ${formatCurrency(balanceRemaining, sym)}

Thank you for your business!
${businessName}${phone ? `\nPhone: ${phone}` : ''}`;
}

