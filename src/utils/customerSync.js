import { db } from '../db/db.js';
import { scheduleAutoSync } from './googleSheetsSync.js';
import { triggerDebouncedSupabaseSync } from './supabaseSync.js';

/**
 * Normalizes phone numbers to their last 10 digits for accurate matching across formats.
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Cascades updated client profile fields to all invoices, quotes, projects, and contracts
 * linked to this customer ID (or matching direct client credentials).
 */
export async function cascadeCustomerUpdate(customerId, updatedFields, oldCustomer = null) {
  if (!customerId || !updatedFields) {
    return { updatedInvoices: 0, updatedQuotes: 0, updatedProjects: 0, updatedContracts: 0 };
  }

  const targetId = Number(customerId);
  const now = new Date().toISOString();
  let updatedInvoicesCount = 0;
  let updatedQuotesCount = 0;
  let updatedProjectsCount = 0;
  let updatedContractsCount = 0;

  const oldCleanPhone = normalizePhone(oldCustomer?.phone);
  const newCleanPhone = normalizePhone(updatedFields?.phone);

  // 1. Invoices
  if (db.invoices) {
    const allInvoices = await db.invoices.toArray();
    for (const inv of allInvoices) {
      const snap = inv.customerSnapshot || {};
      const invCleanPhone = normalizePhone(snap.phone);

      const isDirectMatch = Boolean(
        !inv.customerId && (
          (oldCleanPhone && invCleanPhone && invCleanPhone === oldCleanPhone) ||
          (newCleanPhone && invCleanPhone && invCleanPhone === newCleanPhone) ||
          (oldCustomer?.name && snap.name && snap.name.trim().toLowerCase() === oldCustomer.name.trim().toLowerCase())
        )
      );

      if (Number(inv.customerId) === targetId || isDirectMatch) {
        const newSnap = {
          ...snap,
          name: updatedFields.name !== undefined ? updatedFields.name.trim() : (snap.name || ''),
          company: updatedFields.company !== undefined ? updatedFields.company.trim() : (snap.company || ''),
          phone: updatedFields.phone !== undefined ? updatedFields.phone.trim() : (snap.phone || ''),
          email: updatedFields.email !== undefined ? updatedFields.email.trim() : (snap.email || ''),
          address: updatedFields.address !== undefined ? updatedFields.address.trim() : (snap.address || ''),
          gstin: updatedFields.gstin !== undefined ? updatedFields.gstin.trim() : (snap.gstin || ''),
          tag: updatedFields.tag || snap.tag || 'Regular',
          dontRemind: updatedFields.dontRemind !== undefined ? Boolean(updatedFields.dontRemind) : Boolean(snap.dontRemind)
        };

        await db.invoices.update(inv.id, {
          customerId: targetId,
          customerSnapshot: newSnap,
          updatedAt: now
        });
        updatedInvoicesCount++;
      }
    }
  }

  // 2. Quotes
  if (db.quotes) {
    const allQuotes = await db.quotes.toArray();
    for (const q of allQuotes) {
      const snap = q.customerSnapshot || {};
      const qCleanPhone = normalizePhone(snap.phone);

      const isDirectMatch = Boolean(
        !q.customerId && (
          (oldCleanPhone && qCleanPhone && qCleanPhone === oldCleanPhone) ||
          (newCleanPhone && qCleanPhone && qCleanPhone === newCleanPhone) ||
          (oldCustomer?.name && snap.name && snap.name.trim().toLowerCase() === oldCustomer.name.trim().toLowerCase())
        )
      );

      if (Number(q.customerId) === targetId || isDirectMatch) {
        const newSnap = {
          ...snap,
          name: updatedFields.name !== undefined ? updatedFields.name.trim() : (snap.name || ''),
          company: updatedFields.company !== undefined ? updatedFields.company.trim() : (snap.company || ''),
          phone: updatedFields.phone !== undefined ? updatedFields.phone.trim() : (snap.phone || ''),
          email: updatedFields.email !== undefined ? updatedFields.email.trim() : (snap.email || ''),
          address: updatedFields.address !== undefined ? updatedFields.address.trim() : (snap.address || ''),
          gstin: updatedFields.gstin !== undefined ? updatedFields.gstin.trim() : (snap.gstin || ''),
          tag: updatedFields.tag || snap.tag || 'Regular'
        };

        await db.quotes.update(q.id, {
          customerId: targetId,
          customerSnapshot: newSnap,
          updatedAt: now
        });
        updatedQuotesCount++;
      }
    }
  }

  // 3. Projects
  if (db.projects) {
    const allProjects = await db.projects.toArray();
    for (const proj of allProjects) {
      const projCleanPhone = normalizePhone(proj.clientPhone);
      const isProjMatch = Number(proj.customerId) === targetId || Number(proj.clientId) === targetId || (
        oldCleanPhone && projCleanPhone && projCleanPhone === oldCleanPhone
      );

      if (isProjMatch) {
        await db.projects.update(proj.id, {
          customerId: targetId,
          clientName: updatedFields.name !== undefined ? updatedFields.name.trim() : proj.clientName,
          clientPhone: updatedFields.phone !== undefined ? updatedFields.phone.trim() : proj.clientPhone,
          updatedAt: now
        });
        updatedProjectsCount++;
      }
    }
  }

  // 4. Contracts
  if (db.contracts) {
    const allContracts = await db.contracts.toArray();
    for (const c of allContracts) {
      const cCleanPhone = normalizePhone(c.clientPhone);
      const isContractMatch = Number(c.customerId) === targetId || (
        oldCleanPhone && cCleanPhone && cCleanPhone === oldCleanPhone
      );

      if (isContractMatch) {
        await db.contracts.update(c.id, {
          customerId: targetId,
          clientName: updatedFields.name !== undefined ? updatedFields.name.trim() : c.clientName,
          clientPhone: updatedFields.phone !== undefined ? updatedFields.phone.trim() : c.clientPhone,
          clientCompany: updatedFields.company !== undefined ? updatedFields.company.trim() : c.clientCompany,
          updatedAt: now
        });
        updatedContractsCount++;
      }
    }
  }

  // Auto-sync Google Sheets & Supabase
  scheduleAutoSync(500);
  try {
    triggerDebouncedSupabaseSync(1000, 'invoices');
    triggerDebouncedSupabaseSync(1000, 'customers');
  } catch {}

  return {
    updatedInvoices: updatedInvoicesCount,
    updatedQuotes: updatedQuotesCount,
    updatedProjects: updatedProjectsCount,
    updatedContracts: updatedContractsCount
  };
}

/**
 * Startup / on-demand reconciliation of customer snapshots across all invoices and quotes.
 * If any invoice has customerId and its customerSnapshot does not match the current customer record,
 * it synchronizes it automatically.
 */
export async function reconcileAllCustomerSnapshots() {
  if (!db.customers || !db.invoices) {
    return { reconciledInvoices: 0, reconciledQuotes: 0 };
  }

  const customers = await db.customers.toArray();
  if (customers.length === 0) {
    return { reconciledInvoices: 0, reconciledQuotes: 0 };
  }

  const customerMap = new Map();
  customers.forEach(c => {
    if (c.id) customerMap.set(Number(c.id), c);
  });

  let reconciledInvoices = 0;
  const invoices = await db.invoices.toArray();
  const now = new Date().toISOString();

  for (const inv of invoices) {
    let customer = null;
    if (inv.customerId) {
      customer = customerMap.get(Number(inv.customerId));
    }
    if (!customer && inv.customerSnapshot?.phone) {
      const snapPhone = normalizePhone(inv.customerSnapshot.phone);
      if (snapPhone) {
        const phoneMatch = customers.filter(c => normalizePhone(c.phone) === snapPhone);
        if (phoneMatch.length === 1) {
          customer = phoneMatch[0];
        }
      }
    }
    if (!customer && inv.customerSnapshot?.name) {
      const snapName = inv.customerSnapshot.name.trim().toLowerCase();
      const nameMatch = customers.filter(c => (c.name || '').trim().toLowerCase() === snapName);
      if (nameMatch.length === 1) {
        customer = nameMatch[0];
      }
    }

    if (customer) {
      const snap = inv.customerSnapshot || {};
      const needsUpdate =
        Number(inv.customerId) !== Number(customer.id) ||
        snap.name !== customer.name ||
        (snap.company || '') !== (customer.company || '') ||
        (snap.phone || '') !== (customer.phone || '') ||
        (snap.email || '') !== (customer.email || '') ||
        (snap.address || '') !== (customer.address || '') ||
        (snap.gstin || '') !== (customer.gstin || '') ||
        (snap.tag || 'Regular') !== (customer.tag || 'Regular');

      if (needsUpdate) {
        await db.invoices.update(inv.id, {
          customerId: Number(customer.id),
          customerSnapshot: {
            ...snap,
            name: customer.name,
            company: customer.company || '',
            phone: customer.phone || '',
            email: customer.email || '',
            address: customer.address || '',
            gstin: customer.gstin || '',
            tag: customer.tag || 'Regular',
            dontRemind: Boolean(customer.dontRemind)
          },
          updatedAt: now
        });
        reconciledInvoices++;
      }
    }
  }

  let reconciledQuotes = 0;
  if (db.quotes) {
    const quotes = await db.quotes.toArray();
    for (const q of quotes) {
      let customer = null;
      if (q.customerId) {
        customer = customerMap.get(Number(q.customerId));
      }
      if (!customer && q.customerSnapshot?.phone) {
        const snapPhone = normalizePhone(q.customerSnapshot.phone);
        if (snapPhone) {
          const phoneMatch = customers.filter(c => normalizePhone(c.phone) === snapPhone);
          if (phoneMatch.length === 1) {
            customer = phoneMatch[0];
          }
        }
      }
      if (!customer && q.customerSnapshot?.name) {
        const snapName = q.customerSnapshot.name.trim().toLowerCase();
        const nameMatch = customers.filter(c => (c.name || '').trim().toLowerCase() === snapName);
        if (nameMatch.length === 1) {
          customer = nameMatch[0];
        }
      }

      if (customer) {
        const snap = q.customerSnapshot || {};
        const needsUpdate =
          Number(q.customerId) !== Number(customer.id) ||
          snap.name !== customer.name ||
          (snap.company || '') !== (customer.company || '') ||
          (snap.phone || '') !== (customer.phone || '') ||
          (snap.email || '') !== (customer.email || '') ||
          (snap.address || '') !== (customer.address || '') ||
          (snap.gstin || '') !== (customer.gstin || '') ||
          (snap.tag || 'Regular') !== (customer.tag || 'Regular');

        if (needsUpdate) {
          await db.quotes.update(q.id, {
            customerId: Number(customer.id),
            customerSnapshot: {
              ...snap,
              name: customer.name,
              company: customer.company || '',
              phone: customer.phone || '',
              email: customer.email || '',
              address: customer.address || '',
              gstin: customer.gstin || '',
              tag: customer.tag || 'Regular'
            },
            updatedAt: now
          });
          reconciledQuotes++;
        }
      }
    }
  }

  if (reconciledInvoices > 0 || reconciledQuotes > 0) {
    scheduleAutoSync(500);
    try {
      triggerDebouncedSupabaseSync(1000, 'invoices');
    } catch {}
  }

  return { reconciledInvoices, reconciledQuotes };
}

/**
 * Resolves effective customer details for an invoice by merging the latest customer
 * record from the database with the stored snapshot.
 */
export function resolveEffectiveCustomer(invoice, customers) {
  if (!invoice) return null;
  const snap = invoice.customerSnapshot || {};
  if (!Array.isArray(customers) || customers.length === 0) {
    return snap;
  }

  let clientRecord = null;
  if (invoice.customerId) {
    clientRecord = customers.find(c => Number(c.id) === Number(invoice.customerId)) || null;
  }
  if (!clientRecord && snap.phone) {
    const snapPhone = normalizePhone(snap.phone);
    if (snapPhone) {
      clientRecord = customers.find(c => normalizePhone(c.phone) === snapPhone) || null;
    }
  }
  if (!clientRecord && snap.name) {
    const snapName = snap.name.trim().toLowerCase();
    clientRecord = customers.find(c => (c.name || '').trim().toLowerCase() === snapName) || null;
  }

  if (clientRecord) {
    return {
      ...snap,
      name: clientRecord.name || snap.name,
      company: clientRecord.company !== undefined ? clientRecord.company : (snap.company || ''),
      phone: clientRecord.phone || snap.phone,
      email: clientRecord.email !== undefined ? clientRecord.email : (snap.email || ''),
      address: clientRecord.address !== undefined ? clientRecord.address : (snap.address || ''),
      gstin: clientRecord.gstin !== undefined ? clientRecord.gstin : (snap.gstin || ''),
      tag: clientRecord.tag || snap.tag || 'Regular',
      dontRemind: Boolean(clientRecord.dontRemind)
    };
  }

  return snap;
}
