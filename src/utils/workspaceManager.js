import { db } from '../db/db.js';
import { DEFAULT_SETTINGS } from '../db/seedData.js';
import { isStudioCloudAuthorized } from '../config/supabase.js';

const MIGRATION_KEY = 'drfilms_workspace_v2_ready';

/**
 * Ensures any visitor opening the public Vercel app gets their own clean,
 * isolated billing software workspace, and purges any leaked owner records
 * previously synced to unauthenticated devices.
 */
export async function sanitizeVisitorWorkspace() {
  if (typeof window === 'undefined') return;

  // Never sanitize localhost / local development (owner's development machine)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return;
  }

  // Never sanitize an authorized studio owner device
  if (isStudioCloudAuthorized()) {
    return;
  }

  // If already verified clean, skip
  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    return;
  }

  try {
    const sec = await db.settings.get('security_profile');
    const prof = await db.settings.get('business_profile');

    const hasLeakedOwnerData =
      sec?.pinHash === '205e10eb64355bc95cae5fa159b159796b1a8dbc16f88722779f367263d6106c' ||
      prof?.phone === '+91 7046106858' ||
      prof?.sheetsSyncSecret === 'drfilms_backup_secret_2026';

    if (hasLeakedOwnerData) {
      await db.transaction('rw', [
        db.invoices,
        db.customers,
        db.expenses,
        db.projects,
        db.quotes,
        db.hourCalculations,
        db.contracts,
        db.settings
      ], async () => {
        await db.invoices.clear();
        await db.customers.clear();
        await db.expenses.clear();
        await db.projects.clear();
        await db.quotes.clear();
        await db.hourCalculations.clear();
        await db.contracts.clear();
        await db.settings.delete('security_profile');
        await db.settings.put(DEFAULT_SETTINGS);
      });
    }

    localStorage.setItem(MIGRATION_KEY, 'true');
  } catch (err) {
    console.warn('Workspace sanitization notice:', err);
  }
}

/**
 * Explicitly reset the current workspace to a fresh, clean billing software.
 */
export async function resetToFreshWorkspace() {
  if (typeof window === 'undefined') return;
  try {
    await db.transaction('rw', [
      db.invoices,
      db.customers,
      db.expenses,
      db.projects,
      db.quotes,
      db.hourCalculations,
      db.contracts,
      db.settings
    ], async () => {
      await db.invoices.clear();
      await db.customers.clear();
      await db.expenses.clear();
      await db.projects.clear();
      await db.quotes.clear();
      await db.hourCalculations.clear();
      await db.contracts.clear();
      await db.settings.delete('security_profile');
      await db.settings.put(DEFAULT_SETTINGS);
    });
    localStorage.setItem(MIGRATION_KEY, 'true');
    localStorage.removeItem('drfilms_studio_cloud_authorized');
  } catch (err) {
    console.warn('Reset workspace error:', err);
  }
}

