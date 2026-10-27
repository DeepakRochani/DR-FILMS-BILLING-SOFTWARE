import { DEFAULT_PROJECT_STAGES, DEFAULT_PROJECT_CHECKLIST } from '../db/seedData.js';
import { formatDate } from './formatters.js';
import { removeEmojis } from './reminderCalculations.js';

export const PROJECT_STAGES = DEFAULT_PROJECT_STAGES;
export const PROJECT_PRIORITIES = ['Low', 'Normal', 'Medium', 'High', 'Urgent'];

export const STAGE_CONFIG = {
  'Booked': {
    label: 'Booked',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    barColor: 'bg-blue-500',
    headerBg: 'bg-blue-950/30'
  },
  'Shoot Done': {
    label: 'Shoot Done',
    color: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    barColor: 'bg-sky-500',
    headerBg: 'bg-sky-950/30'
  },
  'Editing': {
    label: 'Editing',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    barColor: 'bg-purple-500',
    headerBg: 'bg-purple-950/30'
  },
  'Client Review': {
    label: 'Client Review',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    barColor: 'bg-amber-500',
    headerBg: 'bg-amber-950/30'
  },
  'Revision': {
    label: 'Revision',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    barColor: 'bg-orange-500',
    headerBg: 'bg-orange-950/30'
  },
  'Ready': {
    label: 'Ready',
    color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    barColor: 'bg-teal-500',
    headerBg: 'bg-teal-950/30'
  },
  'Delivered': {
    label: 'Delivered',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    barColor: 'bg-emerald-500',
    headerBg: 'bg-emerald-950/30'
  }
};

export const PRIORITY_CONFIG = {
  'Low': {
    color: 'text-slate-400 bg-slate-800/80 border-slate-700',
    badge: 'Low',
    label: 'Low'
  },
  'Normal': {
    color: 'text-blue-300 bg-blue-900/30 border-blue-800/40',
    badge: 'Normal',
    label: 'Normal'
  },
  'Medium': {
    color: 'text-blue-300 bg-blue-900/30 border-blue-800/40',
    badge: 'Medium',
    label: 'Medium'
  },
  'High': {
    color: 'text-amber-300 bg-amber-900/30 border-amber-800/40',
    badge: 'High',
    label: 'High'
  },
  'Urgent': {
    color: 'text-rose-300 bg-rose-900/40 border-rose-700/60 font-bold',
    badge: 'Urgent',
    label: 'Urgent'
  }
};

/**
 * Build default checklist objects from an array of checklist titles
 */
export function createDefaultChecklist(items = DEFAULT_PROJECT_CHECKLIST) {
  return items.map((item, idx) => {
    const text = typeof item === 'string' ? item : (item.text || item.label || '');
    return {
      id: `chk_${Date.now()}_${idx}`,
      label: text,
      text: text,
      completed: false,
      completedAt: null
    };
  });
}

/**
 * Calculate delivery status and days difference
 */
export function getDeliveryStatus(dueDate, stage, refDate = new Date()) {
  if (stage === 'Delivered') {
    return {
      status: 'delivered',
      label: 'Delivered',
      days: 0,
      daysRemaining: 0,
      daysOverdue: 0,
      badgeColor: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
    };
  }

  if (!dueDate) {
    return {
      status: 'no_due_date',
      label: 'No Due Date',
      days: null,
      daysRemaining: null,
      daysOverdue: 0,
      badgeColor: 'text-slate-400 bg-slate-900 border-slate-800'
    };
  }

  const due = new Date(dueDate);
  if (isNaN(due.getTime())) {
    return {
      status: 'invalid',
      label: 'Invalid Date',
      days: null,
      daysRemaining: null,
      daysOverdue: 0,
      badgeColor: 'text-slate-400 bg-slate-900 border-slate-800'
    };
  }

  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((d.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      status: 'overdue',
      label: `${overdueDays}d Overdue`,
      days: diffDays,
      daysOverdue: overdueDays,
      daysRemaining: 0,
      badgeColor: 'text-rose-400 bg-rose-950/80 border-rose-700/70 font-bold animate-pulse'
    };
  }

  if (diffDays === 0) {
    return {
      status: 'due-today',
      label: 'Due Today',
      days: 0,
      daysRemaining: 0,
      daysOverdue: 0,
      badgeColor: 'text-amber-400 bg-amber-950/80 border-amber-700/70 font-bold'
    };
  }

  if (diffDays <= 3) {
    return {
      status: 'due-soon',
      label: `Due in ${diffDays}d`,
      days: diffDays,
      daysRemaining: diffDays,
      daysOverdue: 0,
      badgeColor: 'text-amber-300 bg-amber-950/50 border-amber-800/50'
    };
  }

  return {
    status: 'on-track',
    label: `Due in ${diffDays}d`,
    days: diffDays,
    daysRemaining: diffDays,
    daysOverdue: 0,
    badgeColor: 'text-slate-300 bg-slate-900/80 border-slate-800'
  };
}

/**
 * Generate friendly, professional Delivered WhatsApp notification message
 * Strictly zero emojis.
 */
export function generateDeliveredWhatsAppMessage(options = {}) {
  const proj = options.project || {};
  const settings = options.settings || {};
  const businessName = options.businessName || settings.businessName || 'DR FILMS';
  const clientName = options.clientName || proj.clientName || 'Client';
  const title = options.projectTitle || proj.title || 'Project';
  const eventType = (options.eventType || proj.eventType) ? ` (${options.eventType || proj.eventType})` : '';
  const downloadLink = options.downloadLink || proj.downloadLink || '';
  const invoiceNumber = options.invoiceNumber !== undefined ? options.invoiceNumber : proj.invoiceNumber;
  const balanceDue = options.balanceDue !== undefined ? Number(options.balanceDue) : (proj.balanceDue !== undefined ? Number(proj.balanceDue) : null);

  let message = `Hello ${clientName},

Your project "${title}"${eventType} is complete and delivered!`;

  if (downloadLink) {
    message += `

Download Link:
${downloadLink}`;
  }

  if (invoiceNumber) {
    if (balanceDue !== null && balanceDue <= 0) {
      message += `

Invoice: Settled in full (Thank you!)`;
    } else if (balanceDue !== null && balanceDue > 0) {
      message += `

Invoice Balance Due: ₹${balanceDue.toLocaleString('en-IN')}`;
    }
  }

  message += `

Thank you for choosing ${businessName}. Please let us know if you need anything else.

Best regards,
${businessName}`;

  return removeEmojis(message).trim();
}

/**
 * Calculate checklist completion progress percentage
 */
export function getChecklistProgress(checklist = []) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { completed: 0, total: 0, percentage: 0, percent: 0 };
  }
  const completed = checklist.filter(item => Boolean(item.completed)).length;
  const total = checklist.length;
  const percentage = Math.round((completed / total) * 100);
  return { completed, total, percentage, percent: percentage };
}
