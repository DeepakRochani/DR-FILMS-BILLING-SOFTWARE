/**
 * Duration parsing, calculation, formatting and rounding utilities for DR FILMS Hour Calculator
 */

/**
 * Normalizes minutes >= 60 by converting extra minutes into hours.
 * e.g. hours: 0, minutes: 75 -> { hours: 1, minutes: 15, totalMinutes: 75 }
 */
export function normalizeHoursMinutes(hours = 0, minutes = 0) {
  const safeH = Math.max(0, parseInt(hours, 10) || 0);
  const safeM = Math.max(0, parseInt(minutes, 10) || 0);
  const totalM = safeH * 60 + safeM;
  const normalizedH = Math.floor(totalM / 60);
  const normalizedM = totalM % 60;
  return {
    hours: normalizedH,
    minutes: normalizedM,
    totalMinutes: totalM
  };
}

/**
 * Parse flexible user input strings into { hours, minutes, totalMinutes }
 * 
 * Supported formats:
 * - "39" -> 39 min (0h 39m)
 * - "39m", "39 min", "39mins", "39m" -> 39 min (0h 39m)
 * - "1:15" -> 1 hr 15 min (1h 15m)
 * - "1h 15m", "1 hr 15 min", "1hour 15minutes", "1h15m" -> 1h 15m
 * - "2.05" -> 2 hr 05 min (typed on numpad, 2h 5m)
 * - "2.5" -> 2h 30m (decimal hours 2.5 hr)
 * - "75" or "75m" -> auto-converts to 1h 15m
 * - "1:75" -> auto-converts to 2h 15m
 */
export function parseDurationInput(input) {
  if (input === null || input === undefined) {
    return { hours: 0, minutes: 0, totalMinutes: 0 };
  }

  const raw = String(input).trim().toLowerCase();
  if (!raw) {
    return { hours: 0, minutes: 0, totalMinutes: 0 };
  }

  // 1. Check for Colon notation: "1:15", "0:45", "1:15:30"
  if (raw.includes(':')) {
    const parts = raw.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return normalizeHoursMinutes(h, m);
  }

  // 2. Check for explicit words: hours & minutes
  // e.g. "1h 15m", "1 hr 15 min", "1hr 15m", "1 hour 15 minutes"
  const hasHourWord = /(?:h|hr|hrs|hour|hours)/i.test(raw);
  const hasMinWord = /(?:m|min|mins|minute|minutes)/i.test(raw);

  if (hasHourWord || hasMinWord) {
    const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i);
    const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/i);

    let h = 0;
    let m = 0;

    if (hourMatch) {
      const parsedH = parseFloat(hourMatch[1]) || 0;
      // If hour is decimal like 1.5h, take 1 hr and add 0.5 * 60 min
      h += Math.floor(parsedH);
      m += Math.round((parsedH - Math.floor(parsedH)) * 60);
    }

    if (minMatch) {
      m += Math.round(parseFloat(minMatch[1]) || 0);
    }

    // If neither matched specifically but user typed e.g. "39 min"
    if (!hourMatch && !minMatch) {
      const numOnly = parseInt(raw.replace(/[^\d]/g, ''), 10) || 0;
      if (hasHourWord && !hasMinWord) {
        h = numOnly;
      } else {
        m = numOnly;
      }
    }

    return normalizeHoursMinutes(h, m);
  }

  // 3. Check for Dot notation on numpad: "2.05", "1.15", "2.5"
  if (raw.includes('.')) {
    const parts = raw.split('.');
    const h = parseInt(parts[0], 10) || 0;
    const decimals = parts[1] || '';

    // If 2 digits and starts with 0 (e.g. .05 -> 5 min), or .15 -> 15 min
    // In video editing timecode, 2.05 means 2 hours 05 minutes.
    if (decimals.length === 2) {
      const m = parseInt(decimals, 10) || 0;
      return normalizeHoursMinutes(h, m);
    } else if (decimals.length === 1) {
      // Single digit e.g. 2.5 means 2.5 hours = 2 hr 30 min
      const fraction = parseFloat(`0.${decimals}`) || 0;
      const m = Math.round(fraction * 60);
      return normalizeHoursMinutes(h, m);
    } else {
      // More than 2 digits: treat as decimal hours
      const decHours = parseFloat(raw) || 0;
      const hoursPart = Math.floor(decHours);
      const minsPart = Math.round((decHours - hoursPart) * 60);
      return normalizeHoursMinutes(hoursPart, minsPart);
    }
  }

  // 4. Plain numeric value without units: e.g. "39" or "75"
  // If user types pure number in the box, treat as minutes
  const numeric = parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (!isNaN(numeric)) {
    return normalizeHoursMinutes(0, numeric);
  }

  return { hours: 0, minutes: 0, totalMinutes: 0 };
}

/**
 * Format hours and minutes into clean human-readable text
 * e.g. 3 hr 59 min, 1 hr 15 min, 39 min, 4 hr 00 min
 */
export function formatDuration(totalMinutes) {
  const safeM = Math.max(0, parseInt(totalMinutes, 10) || 0);
  const h = Math.floor(safeM / 60);
  const m = safeM % 60;

  if (h === 0) {
    return `${m} min`;
  }
  if (m === 0) {
    return `${h} hr 00 min`;
  }
  const formattedM = m < 10 ? `0${m}` : `${m}`;
  return `${h} hr ${formattedM} min`;
}

/**
 * Format a part row duration e.g. "39 min", "1 hr 15 min", "2 hr 05 min"
 */
export function formatPartDuration(hours, minutes) {
  const { hours: h, minutes: m } = normalizeHoursMinutes(hours, minutes);
  if (h === 0) {
    return `${m} min`;
  }
  const formattedM = m < 10 ? `0${m}` : `${m}`;
  return `${h} hr ${formattedM} min`;
}

/**
 * Calculate billed minutes based on selected rounding option and minimum billable time
 * 
 * Rounding options:
 * - 'exact': exact minutes
 * - 'ceil_15': round up to nearest 15 minutes
 * - 'ceil_30': round up to nearest 30 minutes
 * - 'ceil_60': round up to full hour (60 minutes)
 */
export function calculateBilledMinutes(totalMinutes, roundingMode = 'exact', minBillableMinutes = 0) {
  const safeTotal = Math.max(0, parseInt(totalMinutes, 10) || 0);
  if (safeTotal === 0) return 0;

  let rounded = safeTotal;
  switch (roundingMode) {
    case 'ceil_15':
      rounded = Math.ceil(safeTotal / 15) * 15;
      break;
    case 'ceil_30':
      rounded = Math.ceil(safeTotal / 30) * 30;
      break;
    case 'ceil_60':
      rounded = Math.ceil(safeTotal / 60) * 60;
      break;
    case 'exact':
    default:
      rounded = safeTotal;
      break;
  }

  const minM = Math.max(0, parseInt(minBillableMinutes, 10) || 0);
  if (minM > 0 && rounded < minM) {
    rounded = minM;
  }

  return rounded;
}

/**
 * Calculate amount from minutes and hourly rate
 * amount = minutes / 60 * rate, rounded to 2 decimals
 */
export function calculateDurationAmount(minutes, hourlyRate) {
  const safeM = Math.max(0, Number(minutes) || 0);
  const safeRate = Math.max(0, Number(hourlyRate) || 0);
  const amount = (safeM / 60) * safeRate;
  return Math.round(amount * 100) / 100;
}

/**
 * Generate breakdown string for bill line item description:
 * e.g. "Haldi 39 min, Wedding 1 hr 15 min, Reception 2 hr 05 min"
 */
export function generateBreakdownDescription(rows = []) {
  const validRows = rows.filter(r => (Number(r.hours) || 0) > 0 || (Number(r.minutes) || 0) > 0);
  if (validRows.length === 0) return '';

  return validRows
    .map(r => {
      const partName = (r.name || '').trim();
      const dur = formatPartDuration(r.hours, r.minutes);
      return partName ? `${partName} ${dur}` : dur;
    })
    .join(', ');
}

/**
 * Generate plain text summary formatted for WhatsApp or clipboard
 */
export function generateWhatsAppSummary({
  title = '',
  clientName = '',
  serviceName = 'Video Editing',
  rate = 0,
  rows = [],
  totalMinutes = 0,
  billedMinutes = 0,
  amount = 0,
  roundingMode = 'exact',
  businessProfile = null
}) {
  const currencySymbol = businessProfile?.currencySymbol || '₹';
  const bizName = businessProfile?.businessName || 'DR FILMS';
  const phone = businessProfile?.phone || '';

  const origDuration = formatDuration(totalMinutes);
  const billedDuration = formatDuration(billedMinutes);

  const roundingLabels = {
    exact: 'Exact minutes',
    ceil_15: 'Round up to nearest 15 min',
    ceil_30: 'Round up to nearest 30 min',
    ceil_60: 'Round up to full hour'
  };

  const lines = [
    `*${bizName.toUpperCase()} — HOUR CALCULATION*`,
    title ? `Title: *${title}*` : '',
    clientName ? `Client: *${clientName}*` : '',
    `Service: ${serviceName}`,
    `Rate: ${currencySymbol}${Number(rate).toLocaleString('en-IN')}/hr`,
    '',
    '*Parts Breakdown:*'
  ].filter(Boolean);

  const validRows = rows.filter(r => (Number(r.hours) || 0) > 0 || (Number(r.minutes) || 0) > 0);
  validRows.forEach((r, idx) => {
    const name = (r.name || `Part ${idx + 1}`).trim();
    const dur = formatPartDuration(r.hours, r.minutes);
    const partM = (Number(r.hours) || 0) * 60 + (Number(r.minutes) || 0);
    const partAmt = calculateDurationAmount(partM, rate);
    lines.push(`• ${name}: ${dur} (${currencySymbol}${partAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`);
  });

  lines.push('');
  lines.push(`Total Duration: *${origDuration}* (${totalMinutes} min / ${(totalMinutes / 60).toFixed(2)} hr)`);
  if (billedMinutes !== totalMinutes) {
    lines.push(`Billing Option: ${roundingLabels[roundingMode] || roundingMode} (*${billedDuration}*)`);
  }
  lines.push(`*Total Payable: ${currencySymbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*`);
  lines.push('');
  lines.push(`Thank you,`);
  lines.push(`${bizName}`);
  if (phone) lines.push(`Phone: ${phone}`);

  return lines.join('\n');
}
