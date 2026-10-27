import { formatInvoiceNumber } from './formatters.js';

/**
 * Calculate totals for an invoice with complete null and undefined safety
 */
export function calculateInvoiceTotals({
  items = [],
  charges = [],
  discountType = 'fixed',
  discountValue = 0,
  taxPercentage = 0,
  advancePaid = 0
} = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeCharges = Array.isArray(charges) ? charges : [];

  // 1. Line items subtotal
  const subtotal = safeItems.reduce((acc, item) => {
    if (!item) return acc;
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const itemAmount = (item.amount !== undefined && item.amount !== null && !isNaN(item.amount) && item.quantityLabel)
      ? Number(item.amount)
      : (qty * rate);
    return acc + itemAmount;
  }, 0);

  // 2. Custom charges & discounts
  let totalCharges = 0;
  let totalCustomDiscounts = 0;

  const evaluatedCharges = safeCharges.map(ch => {
    if (!ch) return { name: '', rate: 0, amount: 0, nature: 'charge', type: 'fixed' };
    const rateVal = Number(ch.rate) || 0;
    let computedAmount = 0;

    if (ch.type === 'percentage') {
      computedAmount = Math.round(((subtotal * rateVal) / 100) * 100) / 100;
    } else {
      computedAmount = rateVal;
    }

    if (ch.nature === 'discount') {
      totalCustomDiscounts += computedAmount;
    } else {
      totalCharges += computedAmount;
    }

    return {
      ...ch,
      amount: computedAmount
    };
  });

  // 3. General discount
  let generalDiscount = 0;
  const discVal = Number(discountValue) || 0;
  if (discountType === 'percentage') {
    generalDiscount = Math.round(((subtotal * discVal) / 100) * 100) / 100;
  } else {
    generalDiscount = discVal;
  }

  const allDiscounts = totalCustomDiscounts + generalDiscount;

  // 4. Taxable amount
  const taxableAmount = Math.max(0, subtotal + totalCharges - allDiscounts);

  // 5. Tax amount
  const taxRate = Number(taxPercentage) || 0;
  const taxAmount = Math.round(((taxableAmount * taxRate) / 100) * 100) / 100;

  // 6. Total amount
  const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

  // 7. Balance due
  const advance = Number(advancePaid) || 0;
  const balanceDue = Math.max(0, Math.round((totalAmount - advance) * 100) / 100);

  return {
    subtotal,
    charges: evaluatedCharges,
    totalCharges,
    totalCustomDiscounts,
    generalDiscount,
    allDiscounts,
    taxableAmount,
    taxPercentage: taxRate,
    taxAmount,
    totalAmount,
    advancePaid: advance,
    balanceDue
  };
}

/**
 * Determine correct payment label based on status and booking advance
 */
export function getPaymentLabel(status, advancePaid = 0) {
  if (status === 'paid') {
    return 'Payment Received';
  }
  if (status === 'partially_paid') {
    return 'Amount Paid';
  }
  return 'Advance Paid';
}

/**
 * Recalculate invoice payment status and balance from payments history array
 */
export function recalculateInvoicePayments(invoice, updatedPayments) {
  const safePayments = Array.isArray(updatedPayments) ? updatedPayments : [];
  const activePayments = safePayments.filter(p => !p?.isDeleted);
  const totalAmount = Number(invoice?.totalAmount) || 0;
  const totalPaid = activePayments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  const roundedPaid = Math.round(totalPaid * 100) / 100;
  const balanceDue = Math.max(0, Math.round((totalAmount - roundedPaid) * 100) / 100);

  let newStatus = 'unpaid';
  if (invoice?.status === 'cancelled') {
    newStatus = 'cancelled';
  } else if (totalAmount > 0 && balanceDue <= 0) {
    newStatus = 'paid';
  } else if (roundedPaid > 0) {
    newStatus = 'partially_paid';
  } else if (invoice?.status === 'draft') {
    newStatus = 'draft';
  }

  return {
    advancePaid: Math.max(0, roundedPaid),
    balanceDue: invoice?.status === 'cancelled' ? 0 : balanceDue,
    status: newStatus,
    payments: safePayments
  };
}

/**
 * Determine status when reinstating a cancelled bill
 */
export function determineReinstatedStatus(invoice) {
  const payments = (Array.isArray(invoice?.payments) ? invoice.payments : []).filter(p => !p?.isDeleted);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  const totalAmount = Number(invoice?.totalAmount) || 0;
  const balanceDue = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);
  if (invoice?.previousStatus === 'draft') return 'draft';
  if (totalAmount > 0 && balanceDue <= 0) return 'paid';
  if (totalPaid > 0) return 'partially_paid';
  return invoice?.previousStatus || 'unpaid';
}

/**
 * Checks whether an invoice is active (not soft-deleted and not cancelled)
 */
export function isBillActive(inv) {
  return Boolean(inv && !inv.isDeleted && inv.status !== 'cancelled');
}

/**
 * Find all other pending bills for the same client created before a given bill.
 * - status: 'unpaid' or 'partially_paid'
 * - excluding 'draft'
 * - excluding soft-deleted bills (isDeleted: true)
 * - balanceDue > 0
 * - excludes current bill if currentInvoiceId is passed
 * - if currentInvoiceDate is provided, only include bills created before it
 */
export function getClientPreviousPendingBills(allInvoices = [], customerId, currentInvoiceId = null, currentInvoiceDate = null) {
  if (!customerId || !Array.isArray(allInvoices)) {
    return {
      previousBalance: 0,
      previousInvoiceNumbers: [],
      previousInvoices: []
    };
  }

  const cid = Number(customerId);
  const targetId = currentInvoiceId ? Number(currentInvoiceId) : null;
  const targetDate = currentInvoiceDate ? new Date(currentInvoiceDate).getTime() : null;

  const pending = allInvoices.filter(inv => {
    if (!inv || Number(inv.customerId) !== cid) return false;
    // Skip soft-deleted and cancelled bills completely
    if (inv.isDeleted || inv.status === 'cancelled') return false;
    if (targetId && Number(inv.id) === targetId) return false;
    if (inv.status === 'draft') return false;
    if (inv.status !== 'unpaid' && inv.status !== 'partially_paid') return false;
    const bal = Number(inv.balanceDue) || 0;
    if (bal <= 0) return false;

    // If an existing bill is being viewed/edited with an invoiceDate, only count bills created before it
    if (targetDate) {
      const invTime = new Date(inv.invoiceDate || inv.createdAt || 0).getTime();
      if (invTime > targetDate) return false;
      // If dates are identical, use id if available
      if (invTime === targetDate && targetId && Number(inv.id) > targetId) return false;
    }
    return true;
  });

  // Sort by date ascending (oldest first)
  pending.sort((a, b) => {
    const timeA = new Date(a.invoiceDate || a.createdAt || 0).getTime();
    const timeB = new Date(b.invoiceDate || b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  const previousBalance = pending.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0);
  const roundedPreviousBalance = Math.round(previousBalance * 100) / 100;
  const previousInvoiceNumbers = pending.map(inv => formatInvoiceNumber(inv.invoiceNumber)).filter(Boolean);

  return {
    previousBalance: roundedPreviousBalance,
    previousInvoiceNumbers,
    previousInvoices: pending
  };
}

/**
 * Allocate payment amount across one or multiple bills.
 * Modes:
 * - 'this_bill': allocates to target bill first, and if amount exceeds its balance, allocates remaining to next oldest bills.
 * - 'oldest_first': sorts pending bills oldest first and allocates amount in chronological order.
 * - 'manual': applies amounts from manualAllocations map ({ [invoiceId]: amount }).
 */
export function allocatePaymentToBills({
  bills = [],
  targetBillId = null,
  totalAmount = 0,
  mode = 'oldest_first',
  manualAllocations = {}
}) {
  const amountToAllocate = Number(totalAmount) || 0;
  // Filter out any soft-deleted or cancelled bills
  const activeBills = (Array.isArray(bills) ? bills : []).filter(b => b && !b.isDeleted && b.status !== 'cancelled');
  if (amountToAllocate <= 0 || activeBills.length === 0) {
    return { allocations: [], remainingUnallocated: amountToAllocate };
  }

  // Clone and sort bills oldest first
  const sortedBills = [...activeBills].sort((a, b) => {
    const timeA = new Date(a.invoiceDate || a.createdAt || 0).getTime();
    const timeB = new Date(b.invoiceDate || b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  const allocations = [];
  let remaining = Math.round(amountToAllocate * 100) / 100;

  if (mode === 'manual') {
    for (const bill of bills) {
      const specified = Number(manualAllocations[bill.id]) || 0;
      if (specified > 0) {
        const bal = Number(bill.balanceDue) || 0;
        const alloc = Math.min(specified, remaining, bal);
        if (alloc > 0) {
          allocations.push({
            invoiceId: bill.id,
            invoiceNumber: bill.invoiceNumber,
            amount: Math.round(alloc * 100) / 100
          });
          remaining = Math.round((remaining - alloc) * 100) / 100;
        }
      }
    }
    return { allocations, remainingUnallocated: remaining };
  }

  if (mode === 'this_bill' && targetBillId) {
    // 1. Allocate to target bill up to its balance
    const target = sortedBills.find(b => Number(b.id) === Number(targetBillId));
    if (target) {
      const targetBal = Number(target.balanceDue) || 0;
      const alloc = Math.min(remaining, targetBal);
      if (alloc > 0) {
        allocations.push({
          invoiceId: target.id,
          invoiceNumber: target.invoiceNumber,
          amount: Math.round(alloc * 100) / 100
        });
        remaining = Math.round((remaining - alloc) * 100) / 100;
      }
    }
    // 2. If excess remaining, allocate to next oldest pending bills
    if (remaining > 0) {
      for (const bill of sortedBills) {
        if (remaining <= 0) break;
        if (Number(bill.id) === Number(targetBillId)) continue;
        const bal = Number(bill.balanceDue) || 0;
        if (bal <= 0) continue;
        const alloc = Math.min(remaining, bal);
        if (alloc > 0) {
          allocations.push({
            invoiceId: bill.id,
            invoiceNumber: bill.invoiceNumber,
            amount: Math.round(alloc * 100) / 100
          });
          remaining = Math.round((remaining - alloc) * 100) / 100;
        }
      }
    }
    return { allocations, remainingUnallocated: remaining };
  }

  // Default: 'oldest_first'
  for (const bill of sortedBills) {
    if (remaining <= 0) break;
    const bal = Number(bill.balanceDue) || 0;
    if (bal <= 0) continue;
    const alloc = Math.min(remaining, bal);
    if (alloc > 0) {
      allocations.push({
        invoiceId: bill.id,
        invoiceNumber: bill.invoiceNumber,
        amount: Math.round(alloc * 100) / 100
      });
      remaining = Math.round((remaining - alloc) * 100) / 100;
    }
  }

  return { allocations, remainingUnallocated: remaining };
}
