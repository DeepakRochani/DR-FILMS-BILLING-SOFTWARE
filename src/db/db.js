import Dexie from 'dexie';

export class DrFilmsDatabase extends Dexie {
  constructor() {
    super('DrFilmsBillingDB');

    this.version(1).stores({
      services: '++id, name, category, unit, rate, createdAt',
      customCharges: '++id, name, type, rate, nature',
      customers: '++id, name, phone, email, company, createdAt',
      invoices: '++id, invoiceNumber, customerId, invoiceDate, dueDate, status, totalAmount, balanceDue, createdAt',
      settings: 'key'
    });

    this.version(2).stores({
      hourCalculations: '++id, title, customerId, totalMinutes, billedMinutes, amount, createdAt'
    });

    this.version(3).stores({
      expenses: '++id, date, category, amount, payee, paymentMethod, isDeleted, isRecurring, createdAt'
    });

    this.version(4).stores({
      projects: '++id, title, customerId, invoiceId, eventType, eventDate, deliveryDueDate, stage, priority, isDeleted, createdAt, deliveredAt'
    });

    this.version(5).stores({
      quotes: '++id, quoteNumber, customerId, quoteDate, expiryDate, status, totalAmount, isDeleted, createdAt, convertedInvoiceId',
      contracts: '++id, contractNumber, projectId, invoiceId, customerId, title, shootDate, totalAmount, status, isDeleted, createdAt',
      equipment: '++id, name, category, serialNumber, status, isDeleted, createdAt',
      crew: '++id, name, role, phone, email, dailyRate, isDeleted, createdAt'
    });

    this.version(6).stores({
      users: '++id, username, fullName, role, status, email, phone, isDeleted, createdAt',
      auditLogs: '++id, timestamp, category, action, username, userId'
    });

    this.version(7).stores({
      licenseSecurity: 'key, lastSeenTimestamp, updatedAt'
    }).upgrade(async (tx) => {
      // Safe additive migration: existing tables and user settings preserved intact
    });
  }
}

export const db = new DrFilmsDatabase();

