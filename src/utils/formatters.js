export const UNIT_LABELS = {
  per_hour: 'per hour',
  per_day: 'per day',
  per_photo: 'per photo',
  per_video: 'per video',
  per_page: 'per page',
  per_piece: 'per piece',
  fixed: 'fixed'
};

export const UNIT_SHORT = {
  per_hour: '/ hr',
  per_day: '/ day',
  per_photo: '/ photo',
  per_video: '/ video',
  per_page: '/ pg',
  per_piece: '/ pc',
  fixed: 'flat'
};

export const CATEGORY_LABELS = {
  video_editing: 'Video Editing',
  photo_editing: 'Photo Editing',
  photography: 'Photography',
  videography: 'Videography',
  printing: 'Printing',
  other: 'Other'
};

export const CATEGORY_COLORS = {
  video_editing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  photo_editing: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  photography: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  videography: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  printing: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  other: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
};

export function formatCurrency(amount, symbol = '₹') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `${symbol}0.00`;
  }
  const numeric = Number(amount);
  // Format with commas and 2 decimals
  const formatted = numeric.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol} ${formatted}`;
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
}

export function getStatusDetails(status) {
  switch (status) {
    case 'paid':
      return {
        label: 'Paid',
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        badge: 'bg-emerald-500'
      };
    case 'partially_paid':
      return {
        label: 'Partially Paid',
        bg: 'bg-amber-500/15',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        badge: 'bg-amber-500'
      };
    case 'unpaid':
      return {
        label: 'Unpaid',
        bg: 'bg-rose-500/15',
        text: 'text-rose-400',
        border: 'border-rose-500/30',
        badge: 'bg-rose-500'
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        bg: 'bg-slate-700/40',
        text: 'text-slate-300',
        border: 'border-slate-600/50',
        badge: 'bg-slate-400'
      };
    case 'draft':
    default:
      return {
        label: 'Draft',
        bg: 'bg-slate-500/15',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
        badge: 'bg-slate-500'
      };
  }
}

/**
 * Format invoice number by padding numeric portion to at least 4 digits
 * E.g. "DRF-2" -> "DRF-0002", "DRF-0002" -> "DRF-0002", "INV-1" -> "INV-0001"
 * Leaves existing saved invoice database records unchanged.
 */
export function formatInvoiceNumber(invNum) {
  if (!invNum) return '';
  const str = String(invNum).trim();
  const match = str.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = match[2];
    if (num.length < 4) {
      return `${prefix}${num.padStart(4, '0')}`;
    }
  }
  return str;
}

/**
 * Convert numerical amount to Indian currency words
 * E.g. 2400 -> "Two Thousand Four Hundred Rupees Only"
 */
export function numberToWords(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Zero Rupees Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return a[n];
    const tens = b[Math.floor(n / 10)];
    const units = a[n % 10];
    return units ? `${tens} ${units}` : tens;
  }

  function convertThreeDigits(n) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundreds > 0) {
      res += `${a[hundreds]} Hundred`;
      if (rest > 0) res += ' ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  let str = '';
  let n = num;

  const crores = Math.floor(n / 10000000);
  n %= 10000000;
  const lakhs = Math.floor(n / 100000);
  n %= 100000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const remaining = n;

  if (crores > 0) {
    str += `${convertTwoDigits(crores)} Crore `;
  }
  if (lakhs > 0) {
    str += `${convertTwoDigits(lakhs)} Lakh `;
  }
  if (thousands > 0) {
    str += `${convertTwoDigits(thousands)} Thousand `;
  }
  if (remaining > 0) {
    str += convertThreeDigits(remaining);
  }

  return `${str.trim()} Rupees Only`;
}

/**
 * Format phone numbers cleanly for print / display
 * e.g. "+917046106858" -> "+91 70461 06858"
 * e.g. "8511833721" -> "85118 33721"
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = String(phone).trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (cleaned.startsWith('+91')) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return cleaned;
}

