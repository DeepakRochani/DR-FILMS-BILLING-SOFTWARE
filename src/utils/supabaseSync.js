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
export async function pushAllToSupabase() {
  saveSyncMetadata({ status: 'pushing', lastError: null });
  const supabase = getSupabase();
  const results = { totalSynced: 0, byTable: {}, errors: [] };

  try {
    for (const [dexieTable, supaTable] of Object.entries(TABLE_MAP)) {
      if (!db[dexieTable]) continue;
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

let syncDebounceTimer = null;

/**
 * Debounced background sync trigger
 */
export function triggerDebouncedSupabaseSync(delayMs = 3000) {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    pushAllToSupabase().catch(err => {
      console.warn('Background Supabase push error:', err);
    });
  }, delayMs);
}

let activeChannel = null;

/**
 * Setup Realtime multi-device subscription
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

      if (payload.eventType === 'DELETE') {
        const delId = payload.old?.id ?? payload.old?.key;
        if (delId) {
          const numId = Number(delId);
          await db[dexieTable].delete(!Number.isNaN(numId) ? numId : delId);
        }
      } else if (payload.new) {
        const item = formatRowForDexie(dexieTable, payload.new);
        await db[dexieTable].put(item);
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
