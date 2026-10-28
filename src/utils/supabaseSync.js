import { db } from '../db/db';
import { getSupabase } from '../config/supabase';

// Map Dexie table names to Supabase table names
export const TABLE_MAP = {
  customers: 'customers',
  services: 'services',
  customCharges: 'custom_charges',
  invoices: 'invoices',
  quotes: 'quotes',
  projects: 'projects',
  expenses: 'expenses',
  hourCalculations: 'hour_calculations',
  contracts: 'contracts',
  equipment: 'equipment',
  crew: 'crew',
  settings: 'settings'
};

const SYNC_META_KEY = 'drfilms_supabase_sync_meta';

export function getSyncMetadata() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    return raw ? JSON.parse(raw) : { lastPush: null, lastPull: null, status: 'idle', lastError: null };
  } catch {
    return { lastPush: null, lastPull: null, status: 'idle', lastError: null };
  }
}

export function saveSyncMetadata(meta) {
  try {
    const current = getSyncMetadata();
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ ...current, ...meta }));
  } catch {
    // Ignore localStorage write failures
  }
}

/**
 * Convert Dexie record to Supabase table row format
 */
export function formatRecordForSupabase(dexieTable, item) {
  const idStr = String(item.id ?? item.key ?? '');
  const now = new Date().toISOString();

  switch (dexieTable) {
    case 'invoices':
      return {
        id: idStr,
        invoice_number: item.invoiceNumber || 'DRF-0000',
        customer_id: item.customerId ? String(item.customerId) : null,
        invoice_date: item.invoiceDate || null,
        due_date: item.dueDate || null,
        status: item.status || 'draft',
        total_amount: Number(item.totalAmount) || 0,
        advance_paid: Number(item.advancePaid) || 0,
        balance_due: Number(item.balanceDue) || 0,
        is_deleted: Boolean(item.isDeleted),
        cancelled_at: item.cancelledAt || null,
        data: item,
        updated_at: now
      };

    case 'customers':
      return {
        id: idStr,
        name: item.name || 'Unnamed',
        phone: item.phone || null,
        email: item.email || null,
        company: item.company || null,
        address: item.address || null,
        gstin: item.gstin || null,
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'services':
      return {
        id: idStr,
        name: item.name || 'Service',
        category: item.category || null,
        unit: item.unit || null,
        rate: Number(item.rate) || 0,
        description: item.description || null,
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'customCharges':
      return {
        id: idStr,
        name: item.name || 'Charge',
        type: item.type || 'percentage',
        rate: Number(item.rate) || 0,
        nature: item.nature || 'discount',
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'quotes':
      return {
        id: idStr,
        quote_number: item.quoteNumber || 'DRF-EST-0000',
        customer_id: item.customerId ? String(item.customerId) : null,
        quote_date: item.quoteDate || null,
        expiry_date: item.expiryDate || null,
        status: item.status || 'draft',
        total_amount: Number(item.totalAmount) || 0,
        converted_invoice_id: item.convertedInvoiceId ? String(item.convertedInvoiceId) : null,
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'projects':
      return {
        id: idStr,
        title: item.title || 'Project',
        customer_id: item.customerId ? String(item.customerId) : null,
        invoice_id: item.invoiceId ? String(item.invoiceId) : null,
        event_type: item.eventType || null,
        event_date: item.eventDate || null,
        delivery_due_date: item.deliveryDueDate || null,
        stage: item.stage || 'lead',
        priority: item.priority || 'medium',
        is_deleted: Boolean(item.isDeleted),
        delivered_at: item.deliveredAt || null,
        data: item,
        updated_at: now
      };

    case 'expenses':
      return {
        id: idStr,
        date: item.date || null,
        category: item.category || 'general',
        amount: Number(item.amount) || 0,
        payee: item.payee || null,
        payment_method: item.paymentMethod || null,
        is_recurring: Boolean(item.isRecurring),
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'hourCalculations':
      return {
        id: idStr,
        title: item.title || 'Hour Calculation',
        customer_id: item.customerId ? String(item.customerId) : null,
        total_minutes: Number(item.totalMinutes) || 0,
        billed_minutes: Number(item.billedMinutes) || 0,
        amount: Number(item.amount) || 0,
        data: item,
        updated_at: now
      };

    case 'contracts':
      return {
        id: idStr,
        contract_number: item.contractNumber || 'DRF-AGR-0000',
        project_id: item.projectId ? String(item.projectId) : null,
        invoice_id: item.invoiceId ? String(item.invoiceId) : null,
        customer_id: item.customerId ? String(item.customerId) : null,
        title: item.title || 'Contract',
        shoot_date: item.shootDate || null,
        total_amount: Number(item.totalAmount) || 0,
        status: item.status || 'draft',
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'equipment':
      return {
        id: idStr,
        name: item.name || 'Equipment',
        category: item.category || null,
        serial_number: item.serialNumber || null,
        status: item.status || 'available',
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'crew':
      return {
        id: idStr,
        name: item.name || 'Crew Member',
        role: item.role || null,
        phone: item.phone || null,
        email: item.email || null,
        daily_rate: Number(item.dailyRate) || 0,
        is_deleted: Boolean(item.isDeleted),
        data: item,
        updated_at: now
      };

    case 'settings':
      return {
        key: item.key,
        value: item,
        updated_at: now
      };

    default:
      return {
        id: idStr,
        data: item,
        updated_at: now
      };
  }
}

/**
 * Reconstruct Dexie record from Supabase row
 */
export function formatRowForDexie(dexieTable, row) {
  if (dexieTable === 'settings') {
    return row.value || { key: row.key };
  }

  if (row.data && typeof row.data === 'object' && Object.keys(row.data).length > 0) {
    const item = { ...row.data };
    // Preserve original numeric ID if row.id parses as integer
    const numId = Number(row.id);
    if (!Number.isNaN(numId) && String(numId) === row.id) {
      item.id = numId;
    } else {
      item.id = row.id;
    }
    return item;
  }

  // Fallback if data jsonb is empty
  const fallback = { ...row };
  const numId = Number(row.id);
  if (!Number.isNaN(numId) && String(numId) === row.id) {
    fallback.id = numId;
  }
  return fallback;
}

/**
 * Push all local tables to Supabase Cloud
 */
export async function pushAllToSupabase(targetTables = null) {
  saveSyncMetadata({ status: 'pushing', lastError: null });
  const supabase = getSupabase();
  const results = { totalSynced: 0, byTable: {}, errors: [] };

  const tablesToPush = Array.isArray(targetTables) && targetTables.length > 0
    ? targetTables.filter(t => TABLE_MAP[t])
    : Object.keys(TABLE_MAP);

  try {
    for (const dexieTable of tablesToPush) {
      const supaTable = TABLE_MAP[dexieTable];
      if (!db[dexieTable] || !supaTable) continue;
      const records = await db[dexieTable].toArray();

      if (records.length === 0) {
        results.byTable[dexieTable] = 0;
        continue;
      }

      const formatted = records.map(item => formatRecordForSupabase(dexieTable, item));

      // Batch in chunks of 50
      const CHUNK_SIZE = 50;
      let tableSuccessCount = 0;

      for (let i = 0; i < formatted.length; i += CHUNK_SIZE) {
        const chunk = formatted.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from(supaTable)
          .upsert(chunk, { onConflict: dexieTable === 'settings' ? 'key' : 'id' });

        if (error) {
          console.error(`Supabase push error on ${supaTable}:`, error);
          results.errors.push(`${dexieTable}: ${error.message}`);
        } else {
          tableSuccessCount += chunk.length;
        }
      }

      results.byTable[dexieTable] = tableSuccessCount;
      results.totalSynced += tableSuccessCount;
    }

    const timestamp = new Date().toISOString();
    saveSyncMetadata({
      status: results.errors.length > 0 ? 'partial_error' : 'synced',
      lastPush: timestamp,
      lastError: results.errors.length > 0 ? results.errors.join('; ') : null
    });

    return { ok: results.errors.length === 0, results, timestamp };
  } catch (err) {
    console.error('Fatal error during Supabase push:', err);
    saveSyncMetadata({ status: 'error', lastError: err.message });
    return { ok: false, error: err.message, results };
  }
}

/**
 * Pull all data from Supabase Cloud into local IndexedDB
 */
export async function pullAllFromSupabase() {
  saveSyncMetadata({ status: 'pulling', lastError: null });
  const supabase = getSupabase();
  const results = { totalImported: 0, byTable: {}, errors: [] };

  try {
    for (const [dexieTable, supaTable] of Object.entries(TABLE_MAP)) {
      if (!db[dexieTable]) continue;

      const { data, error } = await supabase
        .from(supaTable)
        .select('*');

      if (error) {
        console.error(`Supabase pull error on ${supaTable}:`, error);
        results.errors.push(`${dexieTable}: ${error.message}`);
        continue;
      }

      if (!data || data.length === 0) {
        results.byTable[dexieTable] = 0;
        continue;
      }

      const restoredItems = data.map(row => formatRowForDexie(dexieTable, row));

      await db.transaction('rw', db[dexieTable], async () => {
        for (const item of restoredItems) {
          await db[dexieTable].put(item);
        }
      });

      results.byTable[dexieTable] = restoredItems.length;
      results.totalImported += restoredItems.length;
    }

    const timestamp = new Date().toISOString();
    saveSyncMetadata({
      status: results.errors.length > 0 ? 'partial_error' : 'synced',
      lastPull: timestamp,
      lastError: results.errors.length > 0 ? results.errors.join('; ') : null
    });

    return { ok: results.errors.length === 0, results, timestamp };
  } catch (err) {
    console.error('Fatal error during Supabase pull:', err);
    saveSyncMetadata({ status: 'error', lastError: err.message });
    return { ok: false, error: err.message, results };
  }
}

/**
 * Sync an individual record immediately to Supabase
 */
export async function syncRecordToSupabase(dexieTable, item) {
  const supaTable = TABLE_MAP[dexieTable];
  if (!supaTable) return;

  try {
    const supabase = getSupabase();
    const formatted = formatRecordForSupabase(dexieTable, item);
    await supabase
      .from(supaTable)
      .upsert(formatted, { onConflict: dexieTable === 'settings' ? 'key' : 'id' });
  } catch (err) {
    console.warn(`Background sync failed for ${dexieTable} ${item.id}:`, err);
  }
}

export let isApplyingRemoteChange = false;

export function getIsApplyingRemoteChange() {
  return isApplyingRemoteChange;
}

export function setIsApplyingRemoteChange(flag) {
  isApplyingRemoteChange = Boolean(flag);
}

let syncDebounceTimer = null;
const dirtyTables = new Set();

/**
 * Debounced background sync trigger with selective table tracking
 */
export function triggerDebouncedSupabaseSync(delayMs = 3000, tableName = null) {
  if (isApplyingRemoteChange) return;

  if (tableName) {
    dirtyTables.add(tableName);
  }

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(async () => {
    if (isApplyingRemoteChange) return;
    try {
      const tablesToPush = dirtyTables.size > 0 ? Array.from(dirtyTables) : null;
      dirtyTables.clear();
      await pushAllToSupabase(tablesToPush);
    } catch (err) {
      console.warn('Background Supabase push error:', err);
    }
  }, delayMs);
}

let activeChannel = null;

/**
 * Setup Realtime multi-device subscription with echo-cancellation guard
 */
export function setupRealtimeSync(onRemoteChange) {
  if (activeChannel) {
    activeChannel.unsubscribe();
    activeChannel = null;
  }

  const supabase = getSupabase();

  activeChannel = supabase
    .channel('drfilms-multi-device')
    .on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
      const supaTable = payload.table;
      const dexieTable = Object.keys(TABLE_MAP).find(k => TABLE_MAP[k] === supaTable);

      if (!dexieTable || !db[dexieTable]) return;

      isApplyingRemoteChange = true;
      try {
        if (payload.eventType === 'DELETE') {
          const delId = payload.old?.id ?? payload.old?.key;
          if (delId) {
            const numId = Number(delId);
            await db[dexieTable].delete(!Number.isNaN(numId) ? numId : delId);
          }
        } else if (payload.new) {
          const item = formatRowForDexie(dexieTable, payload.new);
          // Only update local Dexie if data actually changed to avoid spurious re-renders
          const current = await db[dexieTable].get(item.id ?? item.key);
          if (JSON.stringify(current) !== JSON.stringify(item)) {
            await db[dexieTable].put(item);
          }
        }
      } catch (err) {
        console.warn(`Realtime local sync error on ${dexieTable}:`, err);
      } finally {
        setTimeout(() => {
          isApplyingRemoteChange = false;
        }, 300);
      }

      if (typeof onRemoteChange === 'function') {
        onRemoteChange({ table: dexieTable, eventType: payload.eventType, row: payload.new });
      }
    })
    .subscribe();

  return () => {
    if (activeChannel) {
      activeChannel.unsubscribe();
      activeChannel = null;
    }
  };
}

/**
 * Bidirectional intelligent sync:
 * Compares local Dexie records and remote Supabase rows across all tables.
 * Pushes local records that are missing or newer in Supabase.
 * Pulls remote rows that are missing or newer into Dexie.
 * Ensures localhost and live sites have identical data.
 */
export async function syncBidirectional() {
  saveSyncMetadata({ status: 'syncing', lastError: null });
  const supabase = getSupabase();
  const summary = { pushed: 0, pulled: 0, errors: [] };

  try {
    for (const [dexieTable, supaTable] of Object.entries(TABLE_MAP)) {
      if (!db[dexieTable]) continue;

      // 1. Fetch all local records
      const localItems = await db[dexieTable].toArray();

      // 2. Fetch all remote rows from Supabase
      const { data: remoteRows, error } = await supabase.from(supaTable).select('*');
      if (error) {
        summary.errors.push(`${dexieTable}: ${error.message}`);
        continue;
      }

      const remoteMap = new Map((remoteRows || []).map(r => [String(r.id ?? r.key), r]));
      const localMap = new Map(localItems.map(item => [String(item.id ?? item.key), item]));

      const toPush = [];
      const toPull = [];

      // Check local items to push
      for (const item of localItems) {
        const key = String(item.id ?? item.key);
        const remote = remoteMap.get(key);

        if (!remote) {
          toPush.push(formatRecordForSupabase(dexieTable, item));
        } else if (dexieTable === 'settings') {
          // For settings, compare payload content directly to prevent false diff loops
          const remoteDexie = formatRowForDexie(dexieTable, remote);
          if (JSON.stringify(item) !== JSON.stringify(remoteDexie)) {
            const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
            const remoteTime = new Date(remote.updated_at || remote.created_at || 0).getTime();
            if (localTime > remoteTime) {
              toPush.push(formatRecordForSupabase(dexieTable, item));
            }
          }
        } else {
          // Compare timestamps
          const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
          const remoteTime = new Date(remote.updated_at || remote.created_at || 0).getTime();
          if (localTime > remoteTime) {
            toPush.push(formatRecordForSupabase(dexieTable, item));
          }
        }
      }

      // Check remote rows to pull
      for (const remote of (remoteRows || [])) {
        const key = String(remote.id ?? remote.key);
        const local = localMap.get(key);

        if (!local) {
          toPull.push(formatRowForDexie(dexieTable, remote));
        } else if (dexieTable === 'settings') {
          // For settings, compare payload content directly to prevent false diff loops
          const remoteDexie = formatRowForDexie(dexieTable, remote);
          if (JSON.stringify(local) !== JSON.stringify(remoteDexie)) {
            const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
            const remoteTime = new Date(remote.updated_at || remote.created_at || 0).getTime();
            if (remoteTime > localTime) {
              toPull.push(remoteDexie);
            }
          }
        } else {
          const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
          const remoteTime = new Date(remote.updated_at || remote.created_at || 0).getTime();
          if (remoteTime > localTime) {
            toPull.push(formatRowForDexie(dexieTable, remote));
          }
        }
      }

      // Apply push in chunks of 50
      if (toPush.length > 0) {
        for (let i = 0; i < toPush.length; i += 50) {
          const chunk = toPush.slice(i, i + 50);
          const { error: pushErr } = await supabase
            .from(supaTable)
            .upsert(chunk, { onConflict: dexieTable === 'settings' ? 'key' : 'id' });
          if (pushErr) {
            summary.errors.push(`${dexieTable} push: ${pushErr.message}`);
          } else {
            summary.pushed += chunk.length;
          }
        }
      }

      // Apply pull to local Dexie with remote change guard
      if (toPull.length > 0) {
        isApplyingRemoteChange = true;
        try {
          await db.transaction('rw', db[dexieTable], async () => {
            for (const item of toPull) {
              await db[dexieTable].put(item);
            }
          });
        } finally {
          setTimeout(() => {
            isApplyingRemoteChange = false;
          }, 300);
        }
        summary.pulled += toPull.length;
      }
    }

    const timestamp = new Date().toISOString();
    saveSyncMetadata({
      status: summary.errors.length > 0 ? 'partial_error' : 'synced',
      lastPush: summary.pushed > 0 ? timestamp : undefined,
      lastPull: summary.pulled > 0 ? timestamp : undefined,
      lastError: summary.errors.length > 0 ? summary.errors.join('; ') : null
    });

    return { ok: summary.errors.length === 0, summary, timestamp };
  } catch (err) {
    console.error('Fatal bidirectional sync error:', err);
    saveSyncMetadata({ status: 'error', lastError: err.message });
    return { ok: false, error: err.message, summary };
  }
}

let hooksRegistered = false;

/**
 * Register Dexie lifecycle hooks to auto-sync changes to Supabase
 */
export function registerDexieSyncHooks(databaseInstance) {
  if (hooksRegistered || !databaseInstance || typeof window === 'undefined') return;

  const tables = Object.keys(TABLE_MAP);
  for (const tableName of tables) {
    const table = databaseInstance[tableName];
    if (table && typeof table.hook === 'function') {
      table.hook('creating', () => {
        if (isApplyingRemoteChange) return;
        triggerDebouncedSupabaseSync(3000, tableName);
      });
      table.hook('updating', () => {
        if (isApplyingRemoteChange) return;
        triggerDebouncedSupabaseSync(3000, tableName);
      });
      table.hook('deleting', () => {
        if (isApplyingRemoteChange) return;
        triggerDebouncedSupabaseSync(3000, tableName);
      });
    }
  }

  hooksRegistered = true;
}

