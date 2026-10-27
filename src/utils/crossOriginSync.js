import { db } from '../db/db.js';
import { restoreDatabaseData } from '../db/backup.js';

let bridgeInitialized = false;
let activeCounterparts = [];

/**
 * Request modern browser persistent storage protection so IndexedDB
 * is never automatically evicted or cleared by the browser.
 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log('DR FILMS — Storage persistence granted:', isPersisted);
      return isPersisted;
    }
  } catch (err) {
    console.warn('Storage persistence request failed:', err);
  }
  return false;
}

/**
 * Check if the current page is running inside a hidden sync iframe channel
 */
export function isSyncChannelMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('drfilms_sync_channel') === '1';
}

/**
 * Initialize cross-origin recovery and sync bridge.
 * Bridges http://localhost:5173 and http://127.0.0.1:5173 (and port 5174).
 */
export function initCrossOriginBridge(onCounterpartFound) {
  if (typeof window === 'undefined' || bridgeInitialized) return;
  bridgeInitialized = true;

  // 1. Request persistent storage on startup
  requestPersistentStorage();

  // 2. IF RUNNING AS AN IFRAME BRIDGE CHANNEL:
  if (isSyncChannelMode()) {
    console.log('DR FILMS — Running as cross-origin sync channel on', window.location.origin);
    
    window.addEventListener('message', async (event) => {
      // Security: only respond to requests from our own localhost/127.0.0.1 ports
      if (!isPermittedOrigin(event.origin)) return;

      const { type } = event.data || {};

      if (type === 'DRFILMS_REQUEST_STATUS') {
        try {
          const invoices = await db.invoices.toArray();
          const customers = await db.customers.toArray();
          const services = await db.services.toArray();
          const customCharges = await db.customCharges.toArray();
          const settings = await db.settings.toArray();
          const hourCalculations = db.hourCalculations ? await db.hourCalculations.toArray() : [];

          const report = {
            type: 'DRFILMS_REPORT_STATUS',
            origin: window.location.origin,
            invoices,
            customers,
            services,
            customCharges,
            settings,
            hourCalculations,
            invoiceCount: invoices.length
          };

          event.source.postMessage(report, event.origin || '*');
        } catch (e) {
          console.error('Bridge failed to report status:', e);
        }
      }
    });

    // Notify parent immediately when channel is ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'DRFILMS_CHANNEL_READY', origin: window.location.origin }, '*');
    }
    return;
  }

  // 3. IF RUNNING AS MAIN APP:
  // Determine counterpart candidate URLs to check (both localhost and 127.0.0.1 on ports 5173 and 5174)
  const currentOrigin = window.location.origin;
  const candidateOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5174'
  ].filter(orig => orig !== currentOrigin);

  // Listen for reports from candidate iframes
  window.addEventListener('message', async (event) => {
    if (!isPermittedOrigin(event.origin) || event.origin === currentOrigin) return;

    const { type, invoices, invoiceCount } = event.data || {};

    if (type === 'DRFILMS_CHANNEL_READY') {
      // Channel ready, request its status
      event.source.postMessage({ type: 'DRFILMS_REQUEST_STATUS' }, event.origin || '*');
    } else if (type === 'DRFILMS_REPORT_STATUS') {
      try {
        const localInvoices = await db.invoices.toArray();
        const localInvoiceNumbers = new Set(
          localInvoices.map(inv => String(inv.invoiceNumber || '').trim().toLowerCase())
        );

        // Find missing invoices in the counterpart that don't exist locally
        const missingInvoices = (invoices || []).filter(inv => {
          const num = String(inv.invoiceNumber || '').trim().toLowerCase();
          return num && !localInvoiceNumbers.has(num);
        });

        const localSettings = await db.settings.get('business_profile');
        const counterpartSettings = Array.isArray(event.data?.settings) ? event.data.settings : [];
        const counterpartProfile = counterpartSettings.find(s => s.key === 'business_profile');

        const counterpartHasSheets = Boolean(counterpartProfile?.sheetsWebAppUrl || counterpartProfile?.sheetsSyncSecret || counterpartProfile?.sheetsSpreadsheetId);
        const localHasSheets = Boolean(localSettings?.sheetsWebAppUrl || localSettings?.sheetsSyncSecret || localSettings?.sheetsSpreadsheetId);
        const needsSettingsMerge = counterpartHasSheets && (!localHasSheets || counterpartProfile?.sheetsWebAppUrl !== localSettings?.sheetsWebAppUrl || counterpartProfile?.sheetsSyncSecret !== localSettings?.sheetsSyncSecret || counterpartProfile?.sheetsSpreadsheetId !== localSettings?.sheetsSpreadsheetId || Boolean(counterpartProfile?.sheetsBackupEnabled) !== Boolean(localSettings?.sheetsBackupEnabled));

        const hasMissingInvoices = missingInvoices.length > 0 || (invoices && invoices.length > localInvoices.length && localInvoices.length <= 1);

        if (hasMissingInvoices || needsSettingsMerge) {
          console.log(`DR FILMS Bridge: Automatically syncing from ${event.origin}...`);
          
          // Non-destructive auto-merge
          const mergeRes = await mergeFromCounterpart(event.data);
          if (mergeRes.success) {
            const msg = hasMissingInvoices
              ? `🎉 Restored ${missingInvoices.length || invoices.length} bill(s) from your ${event.origin} session!`
              : `⚡ Synchronized Google Sheet backup settings from your ${event.origin} session!`;

            window.dispatchEvent(
              new CustomEvent('drfilms:sheets-sync', {
                detail: {
                  type: 'synced',
                  message: msg
                }
              })
            );
          }

          if (hasMissingInvoices) {
            const detail = {
              origin: event.origin,
              missingInvoices,
              totalCounterpartInvoices: invoiceCount || invoices?.length || 0,
              reportData: event.data
            };

            // Dispatch event so UI components can also display recovery alerts
            window.dispatchEvent(
              new CustomEvent('drfilms:counterpart-data-found', { detail })
            );

            if (typeof onCounterpartFound === 'function') {
              onCounterpartFound(detail);
            }
          }
        }
      } catch (err) {
        console.error('Failed to compare counterpart invoices:', err);
      }
    }
  });

  // Mount hidden iframes to inspect candidate origins
  candidateOrigins.forEach(origin => {
    try {
      const iframe = document.createElement('iframe');
      iframe.src = `${origin}/?drfilms_sync_channel=1`;
      iframe.style.display = 'none';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.onload = () => {
        try {
          iframe.contentWindow?.postMessage({ type: 'DRFILMS_REQUEST_STATUS' }, origin);
        } catch {}
      };
      document.body.appendChild(iframe);
      activeCounterparts.push({ origin, iframe });
    } catch (e) {
      console.warn('Failed to attach candidate iframe:', origin, e);
    }
  });
}

/**
 * Manually trigger counterpart scan (e.g. from Settings or Invoices page)
 */
export function triggerCounterpartScan() {
  activeCounterparts.forEach(({ origin, iframe }) => {
    try {
      iframe.contentWindow?.postMessage({ type: 'DRFILMS_REQUEST_STATUS' }, origin);
    } catch {}
  });
}

/**
 * Merge invoices and data from a counterpart origin report into the current database
 */
export async function mergeFromCounterpart(reportData) {
  if (!reportData || (!reportData.invoices && !reportData.settings)) {
    return { success: false, error: 'No data to import' };
  }

  try {
    const res = await restoreDatabaseData(reportData, 'merge');
    if (res.success) {
      window.dispatchEvent(
        new CustomEvent('drfilms:sheets-sync', {
          detail: {
            type: 'synced',
            message: `Successfully merged bills from ${reportData.origin}!`
          }
        })
      );
    }
    return res;
  } catch (err) {
    console.error('Failed to merge from counterpart:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Helper to validate permitted origins (localhost and 127.0.0.1 on ports 5170-5180)
 */
function isPermittedOrigin(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
  } catch {
    return false;
  }
}
