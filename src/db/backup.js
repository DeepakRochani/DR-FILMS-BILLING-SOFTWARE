import { db } from './db.js';
import { initDatabase } from './seedData.js';

export async function exportDatabaseJSON() {
  const settings = await db.settings.toArray();
  const services = await db.services.toArray();
  const customCharges = await db.customCharges.toArray();
  const customers = await db.customers.toArray();
  const invoices = await db.invoices.toArray();
  const hourCalculations = await (db.hourCalculations ? db.hourCalculations.toArray() : Promise.resolve([]));
  const expenses = await (db.expenses ? db.expenses.toArray() : Promise.resolve([]));
  const projects = await (db.projects ? db.projects.toArray() : Promise.resolve([]));

  // Sanitize settings to NEVER export the Google Sheets sync secret key or PIN security profile
  const sanitizedSettings = (settings || [])
    .filter(s => s.key !== 'security_profile' && s.key !== 'pin_security')
    .map(s => {
      if (s.key === 'business_profile') {
        const cloned = { ...s };
        delete cloned.sheetsSyncSecret;
        return cloned;
      }
      return s;
    });

  const backupData = {
    app: 'DR FILMS Billing PWA',
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: {
      settings: sanitizedSettings,
      services,
      customCharges,
      customers,
      invoices,
      hourCalculations,
      expenses,
      projects
    }
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(backupData, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `dr-films-billing-backup-${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  // Record backup timestamp
  try {
    if (db.settings) {
      await db.settings.put({ key: 'last_backup_timestamp', value: new Date().toISOString() });
    }
  } catch {
    // Ignore in non-browser or test environments
  }

  return backupData;
}

/**
 * Validate backup JSON schema before restoration
 * Enforces structure integrity and checks for valid data collections
 */
export function validateBackupSchema(parsedData) {
  if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
    return { valid: false, error: 'Backup data must be a valid JSON object.' };
  }

  // Must contain a data object
  if (!parsedData.data || typeof parsedData.data !== 'object' || Array.isArray(parsedData.data)) {
    return { valid: false, error: 'Backup payload is missing root "data" object.' };
  }

  const { data } = parsedData;

  // Verify collections
  const collections = ['invoices', 'customers', 'services', 'customCharges', 'settings', 'expenses', 'projects', 'hourCalculations'];
  let foundCollection = false;

  for (const key of collections) {
    if (key in data) {
      if (!Array.isArray(data[key])) {
        return { valid: false, error: `Collection "${key}" must be an array of records.` };
      }
      foundCollection = true;
    }
  }

  if (!foundCollection) {
    return { valid: false, error: 'Backup data does not contain any recognized DR FILMS database collections.' };
  }

  if (Array.isArray(data.invoices) && data.invoices.length > 0) {
    for (let i = 0; i < Math.min(data.invoices.length, 10); i++) {
      const inv = data.invoices[i];
      if (!inv || typeof inv !== 'object') {
        return { valid: false, error: `Invalid invoice record at index ${i}.` };
      }
      if (inv.id === undefined && !inv.invoiceNumber) {
        return { valid: false, error: `Invoice at index ${i} is missing both id and invoiceNumber.` };
      }
    }
  }

  return {
    valid: true,
    counts: {
      invoices: Array.isArray(data.invoices) ? data.invoices.length : 0,
      customers: Array.isArray(data.customers) ? data.customers.length : 0,
      services: Array.isArray(data.services) ? data.services.length : 0,
      customCharges: Array.isArray(data.customCharges) ? data.customCharges.length : 0,
      expenses: Array.isArray(data.expenses) ? data.expenses.length : 0,
      projects: Array.isArray(data.projects) ? data.projects.length : 0,
      hourCalculations: Array.isArray(data.hourCalculations) ? data.hourCalculations.length : 0
    }
  };
}

export async function getLastBackupTimestamp() {
  try {
    if (!db.settings) return null;
    const rec = await db.settings.get('last_backup_timestamp');
    return rec?.value || null;
  } catch {
    return null;
  }
}

export async function isWeeklyBackupOverdue(overdueDays = 7) {
  const ts = await getLastBackupTimestamp();
  if (!ts) return true;
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= overdueDays;
}

export async function restoreDatabaseData(parsedData, mode = 'replace', options = { restoreDeleted: false }) {
  try {
    const schemaCheck = validateBackupSchema(parsedData);
    if (!schemaCheck.valid) {
      throw new Error(`Invalid backup schema: ${schemaCheck.error}`);
    }

    const { 
      settings = [], 
      services = [], 
      customCharges = [], 
      customers = [], 
      invoices = [], 
      hourCalculations = [],
      expenses = [],
      projects = []
    } = parsedData.data;

    const tables = [db.settings, db.services, db.customCharges, db.customers, db.invoices];
    if (db.hourCalculations) {
      tables.push(db.hourCalculations);
    }
    if (db.expenses) {
      tables.push(db.expenses);
    }
    if (db.projects) {
      tables.push(db.projects);
    }

    // Preserve local sensitive/sync settings and security profile if incoming backup doesn't have them
    const currentProfile = await db.settings.get('business_profile');
    const currentSecurity = await db.settings.get('security_profile');

    // Normalize older invoice objects:
    // Old data without isDeleted loads cleanly as isDeleted = false (Active)
    const shouldRestoreDeleted = Boolean(options && options.restoreDeleted);

    const normalizedInvoices = (invoices || [])
      .map(inv => ({
        ...inv,
        isDeleted: Boolean(inv.isDeleted),
        deletedAt: inv.deletedAt || null,
        showPreviousBalance: inv.showPreviousBalance ?? false,
        previousBalance: inv.previousBalance ?? 0,
        previousInvoiceNumbers: inv.previousInvoiceNumbers ?? [],
        charges: Array.isArray(inv.charges) ? inv.charges : [],
        items: Array.isArray(inv.items) ? inv.items : [],
        payments: Array.isArray(inv.payments) ? inv.payments : [],
        advancePaid: inv.advancePaid ?? 0
      }))
      .filter(inv => {
        // By default restore Active bills only unless "Also restore deleted bills" is checked
        if (!shouldRestoreDeleted && inv.isDeleted) {
          return false;
        }
        return true;
      });

    const normalizedExpenses = (expenses || [])
      .map(exp => ({
        ...exp,
        isDeleted: Boolean(exp.isDeleted),
        deletedAt: exp.deletedAt || null,
        amount: Number(exp.amount) || 0,
        gstPaid: Number(exp.gstPaid) || 0
      }))
      .filter(exp => {
        if (!shouldRestoreDeleted && exp.isDeleted) {
          return false;
        }
        return true;
      });

    const normalizedProjects = (projects || [])
      .map(proj => ({
        ...proj,
        isDeleted: Boolean(proj.isDeleted),
        deletedAt: proj.deletedAt || null,
        stage: proj.stage || 'Booked',
        priority: proj.priority || 'Normal',
        checklist: Array.isArray(proj.checklist) ? proj.checklist : []
      }))
      .filter(proj => {
        if (!shouldRestoreDeleted && proj.isDeleted) {
          return false;
        }
        return true;
      });

    if (mode === 'replace') {
      await db.transaction('rw', tables, async () => {
        // Clear all tables
        await db.settings.clear();
        await db.services.clear();
        await db.customCharges.clear();
        await db.customers.clear();
        await db.invoices.clear();
        if (db.hourCalculations) {
          await db.hourCalculations.clear();
        }
        if (db.expenses) {
          await db.expenses.clear();
        }
        if (db.projects) {
          await db.projects.clear();
        }

        // Restore settings with preserved sync credentials if backup has none
        if (Array.isArray(settings) && settings.length > 0) {
          const mergedSettings = settings
            .filter(s => s.key !== 'security_profile' && s.key !== 'pin_security')
            .map(s => {
              if (s.key === 'business_profile' && currentProfile) {
                return {
                  ...s,
                  sheetsBackupEnabled: s.sheetsBackupEnabled ?? currentProfile.sheetsBackupEnabled ?? false,
                  sheetsWebAppUrl: s.sheetsWebAppUrl || currentProfile.sheetsWebAppUrl || '',
                  sheetsSyncSecret: s.sheetsSyncSecret || currentProfile.sheetsSyncSecret || '',
                  sheetsLastSyncedAt: s.sheetsLastSyncedAt || currentProfile.sheetsLastSyncedAt || null,
                  sheetsLastSyncStatus: s.sheetsLastSyncStatus || currentProfile.sheetsLastSyncStatus || 'idle',
                  sheetsNoticeDismissed: s.sheetsNoticeDismissed ?? currentProfile.sheetsNoticeDismissed ?? false
                };
              }
              return s;
            });
          if (currentSecurity) {
            mergedSettings.push(currentSecurity);
          }
          await db.settings.bulkAdd(mergedSettings);
        } else {
          if (currentProfile) await db.settings.put(currentProfile);
          if (currentSecurity) await db.settings.put(currentSecurity);
        }

        if (Array.isArray(services) && services.length > 0) {
          await db.services.bulkAdd(services);
        }
        if (Array.isArray(customCharges) && customCharges.length > 0) {
          await db.customCharges.bulkAdd(customCharges);
        }
        if (Array.isArray(customers) && customers.length > 0) {
          await db.customers.bulkAdd(customers);
        }
        if (normalizedInvoices.length > 0) {
          await db.invoices.bulkAdd(normalizedInvoices);
        }
        if (db.hourCalculations && Array.isArray(hourCalculations) && hourCalculations.length > 0) {
          await db.hourCalculations.bulkAdd(hourCalculations);
        }
        if (db.expenses && normalizedExpenses.length > 0) {
          await db.expenses.bulkAdd(normalizedExpenses);
        }
        if (db.projects && normalizedProjects.length > 0) {
          await db.projects.bulkAdd(normalizedProjects);
        }
      });
    } else {
      // MERGE MODE: Upsert records without wiping existing data
      await db.transaction('rw', tables, async () => {
        // Merge customers (match by phone or name)
        const existingCustomers = await db.customers.toArray();
        for (const c of customers) {
          const match = existingCustomers.find(
            ec => (c.phone && ec.phone === c.phone) || (c.name && ec.name?.toLowerCase() === c.name.toLowerCase())
          );
          if (match) {
            await db.customers.update(match.id, { ...c, id: match.id });
          } else {
            const { id, ...newCust } = c;
            await db.customers.add(newCust);
          }
        }

        // Merge expenses
        if (db.expenses && normalizedExpenses.length > 0) {
          for (const exp of normalizedExpenses) {
            const { id, ...expData } = exp;
            if (id) {
              const existing = await db.expenses.get(Number(id));
              if (existing) {
                await db.expenses.update(Number(id), expData);
              } else {
                await db.expenses.put(exp);
              }
            } else {
              await db.expenses.add(expData);
            }
          }
        }

        // Merge projects
        if (db.projects && normalizedProjects.length > 0) {
          for (const proj of normalizedProjects) {
            const { id, ...projData } = proj;
            if (id) {
              const existing = await db.projects.get(Number(id));
              if (existing) {
                await db.projects.update(Number(id), projData);
              } else {
                await db.projects.put(proj);
              }
            } else {
              await db.projects.add(projData);
            }
          }
        }

        // Merge services (match by name)
        const existingServices = await db.services.toArray();
        for (const s of services) {
          const match = existingServices.find(es => es.name?.toLowerCase() === s.name?.toLowerCase());
          if (match) {
            await db.services.update(match.id, { ...s, id: match.id });
          } else {
            const { id, ...newSvc } = s;
            await db.services.add(newSvc);
          }
        }

        // Merge custom charges (match by name)
        const existingCharges = await db.customCharges.toArray();
        for (const ch of customCharges) {
          const match = existingCharges.find(ech => ech.name?.toLowerCase() === ch.name?.toLowerCase());
          if (match) {
            await db.customCharges.update(match.id, { ...ch, id: match.id });
          } else {
            const { id, ...newCh } = ch;
            await db.customCharges.add(newCh);
          }
        }

        // Merge invoices (match by invoiceNumber)
        const existingInvoices = await db.invoices.toArray();
        for (const inv of normalizedInvoices) {
          const match = existingInvoices.find(
            einv => String(einv.invoiceNumber).trim().toLowerCase() === String(inv.invoiceNumber).trim().toLowerCase()
          );
          if (match) {
            await db.invoices.update(match.id, { ...inv, id: match.id });
          } else {
            const { id, ...newInv } = inv;
            await db.invoices.add(newInv);
          }
        }

        // Merge hour calculations
        if (db.hourCalculations && Array.isArray(hourCalculations)) {
          const existingHours = await db.hourCalculations.toArray();
          for (const hc of hourCalculations) {
            const match = existingHours.find(eh => eh.title === hc.title && eh.createdAt === hc.createdAt);
            if (!match) {
              const { id, ...newHc } = hc;
              await db.hourCalculations.add(newHc);
            }
          }
        }

        // Merge settings (preserve local profile, adopt sheets backup credentials if provided)
        if (Array.isArray(settings) && settings.length > 0) {
          const incomingProfile = settings.find(s => s.key === 'business_profile');
          if (incomingProfile) {
            const current = await db.settings.get('business_profile');
            if (current) {
              await db.settings.update('business_profile', {
                ...current,
                sheetsWebAppUrl: incomingProfile.sheetsWebAppUrl || current.sheetsWebAppUrl || '',
                sheetsSyncSecret: incomingProfile.sheetsSyncSecret || current.sheetsSyncSecret || '',
                sheetsSpreadsheetId: incomingProfile.sheetsSpreadsheetId || current.sheetsSpreadsheetId || '',
                sheetsConnectedSheetName: incomingProfile.sheetsConnectedSheetName || current.sheetsConnectedSheetName || '',
                sheetsConnectedSheetId: incomingProfile.sheetsConnectedSheetId || current.sheetsConnectedSheetId || '',
                sheetsConnectedSheetUrl: incomingProfile.sheetsConnectedSheetUrl || current.sheetsConnectedSheetUrl || '',
                sheetsBackupEnabled: incomingProfile.sheetsBackupEnabled !== undefined ? incomingProfile.sheetsBackupEnabled : (current.sheetsBackupEnabled ?? false),
                sheetsLastSyncedAt: incomingProfile.sheetsLastSyncedAt || current.sheetsLastSyncedAt || null,
                sheetsLastSyncStatus: incomingProfile.sheetsLastSyncStatus || current.sheetsLastSyncStatus || 'idle'
              });
            } else {
              await db.settings.put(incomingProfile);
            }
          }
        }
      });
    }

    return { 
      success: true, 
      count: { 
        invoices: invoices?.length || 0, 
        customers: customers?.length || 0,
        services: services?.length || 0,
        hourCalculations: hourCalculations?.length || 0,
        expenses: expenses?.length || 0,
        projects: projects?.length || 0
      } 
    };
  } catch (error) {
    console.error('Failed to restore database data:', error);
    return { success: false, error: error.message };
  }
}

export async function importDatabaseJSON(fileContent) {
  try {
    const parsed = JSON.parse(fileContent);
    return await restoreDatabaseData(parsed, 'replace');
  } catch (error) {
    console.error('Failed to parse and import database:', error);
    return { success: false, error: error.message };
  }
}

export async function resetDatabaseToDefaults() {
  const tables = [db.settings, db.services, db.customCharges, db.customers, db.invoices];
  if (db.hourCalculations) {
    tables.push(db.hourCalculations);
  }
  if (db.expenses) {
    tables.push(db.expenses);
  }
  if (db.projects) {
    tables.push(db.projects);
  }

  await db.transaction('rw', tables, async () => {
    await db.settings.clear();
    await db.services.clear();
    await db.customCharges.clear();
    await db.customers.clear();
    await db.invoices.clear();
    if (db.hourCalculations) {
      await db.hourCalculations.clear();
    }
    if (db.expenses) {
      await db.expenses.clear();
    }
    if (db.projects) {
      await db.projects.clear();
    }
  });
  await initDatabase();
  return true;
}
