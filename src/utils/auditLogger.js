/**
 * Centralized Audit Logging Utility for DR FILMS Billing Suite & Admin Panel
 *
 * Tracks administrative actions, user authentication, role changes, and system events
 * for compliance, transparency, and live website monitoring.
 */

import { db } from '../db/db.js';

export const AUDIT_CATEGORIES = {
  AUTH: 'auth',
  USER_MANAGEMENT: 'user_management',
  DEPLOYMENT: 'deployment',
  BILLING: 'billing',
  SYSTEM: 'system'
};

/**
 * Record an audit log entry
 */
export async function logAuditEvent({
  category = AUDIT_CATEGORIES.SYSTEM,
  action,
  details = '',
  userId = null,
  username = 'admin',
  metadata = null
}) {
  try {
    if (!db || !db.auditLogs) return;

    const entry = {
      timestamp: new Date().toISOString(),
      category,
      action,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details),
      userId: userId ? Number(userId) : null,
      username: username || 'admin',
      metadata: metadata || null,
      deviceInfo: typeof navigator !== 'undefined' ? (navigator.userAgent ? 'Web Browser' : 'Unknown') : 'System'
    };

    await db.auditLogs.add(entry);

    // Keep max 1000 logs to maintain fast performance in browser IndexedDB
    const count = await db.auditLogs.count();
    if (count > 1200) {
      const oldest = await db.auditLogs.orderBy('id').limit(200).keys();
      await db.auditLogs.bulkDelete(oldest);
    }
  } catch (err) {
    console.warn('[DR FILMS AUDIT] Failed to record audit log:', err);
  }
}

/**
 * Query recent audit logs with optional category filter
 */
export async function getRecentAuditLogs(limit = 100, category = null) {
  try {
    if (!db || !db.auditLogs) return [];
    let collection;
    if (category && category !== 'all') {
      collection = db.auditLogs.where('category').equals(category);
    } else {
      collection = db.auditLogs.toCollection();
    }
    const logs = await collection.reverse().sortBy('timestamp');
    return logs.slice(0, limit);
  } catch (err) {
    console.error('[DR FILMS AUDIT] Error fetching audit logs:', err);
    return [];
  }
}

/**
 * Clear all audit logs
 */
export async function clearAuditLogs() {
  try {
    if (!db || !db.auditLogs) return;
    await db.auditLogs.clear();
    await logAuditEvent({
      category: AUDIT_CATEGORIES.SYSTEM,
      action: 'AUDIT_LOGS_CLEARED',
      details: 'All previous audit log records were pruned by administrator.'
    });
  } catch (err) {
    console.error('[DR FILMS AUDIT] Failed to clear audit logs:', err);
  }
}

/**
 * Export audit logs as CSV or JSON
 */
export function exportAuditLogsFile(logs, format = 'json') {
  if (!Array.isArray(logs) || logs.length === 0) return;

  let content = '';
  let mimeType = 'application/json';
  let filename = `audit_logs_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    mimeType = 'text/csv';
    filename += '.csv';
    const headers = ['ID', 'Timestamp', 'Category', 'Action', 'User', 'Details'];
    const rows = logs.map(l => [
      l.id || '',
      `"${l.timestamp || ''}"`,
      `"${l.category || ''}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.username || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  } else {
    filename += '.json';
    content = JSON.stringify(logs, null, 2);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
