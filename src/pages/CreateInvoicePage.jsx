import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { 
  Plus, 
  Trash2, 
  UserPlus, 
  ArrowLeft, 
  Save, 
  Calculator, 
  CheckCircle2, 
  Percent, 
  Layers, 
  Sparkles,
  HelpCircle,
  Calendar,
  Building,
  Hash,
  AlertCircle,
  AlertTriangle,
  Clock,
  Receipt,
  Ban,
  User,
  Users
} from 'lucide-react';
import { db } from '../db/db';
import { calculateInvoiceTotals, getClientPreviousPendingBills } from '../utils/calculations';
import { isServiceMatch, isChargeMatch } from '../utils/catalogSync';
import { formatCurrency, formatDate, formatInvoiceNumber, UNIT_LABELS, UNIT_SHORT } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { scheduleAutoSync } from '../utils/googleSheetsSync';
import { getActiveEventTypeNames } from '../utils/eventTypeUtils';

export function CreateInvoicePage({ 
  initialCustomerId = null, 
  initialItem = null,
  editInvoiceId = null, 
  onCancel, 
  onSaved 
}) {
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const customers = allCustomers.filter(c => !c?.isDeleted);
  const services = useLiveQuery(() => db.services.toArray(), []) || [];
  const savedCharges = useLiveQuery(() => db.customCharges.toArray(), []) || [];
  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) || [];

  const sym = settings?.currencySymbol || '₹';

  // Invoice State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientMode, setClientMode] = useState('directory'); // 'directory' | 'direct'
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [directClient, setDirectClient] = useState({
    name: '',
    phone: '',
    company: '',
    email: '',
    address: '',
    gstin: ''
  });
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [hasDueDate, setHasDueDate] = useState(true);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [eventType, setEventType] = useState('');
  const [eventDate, setEventDate] = useState('');

  const isWedding = useMemo(() => {
    return Boolean(eventType && eventType.toLowerCase().includes('wedding'));
  }, [eventType]);

  const handleToggleDueDate = (enabled) => {
    setHasDueDate(enabled);
    if (enabled && !dueDate) {
      const d = new Date(invoiceDate || new Date());
      d.setDate(d.getDate() + (Number(settings?.defaultDueDays) || 7));
      setDueDate(d.toISOString().split('T')[0]);
    }
  };

  const handleEventTypeChange = (newType) => {
    setEventType(newType);
    const newIsWedding = Boolean(newType && newType.toLowerCase().includes('wedding'));
    if (newIsWedding) {
      setHasDueDate(false);
      setItems((prevItems) =>
        prevItems.map((item) => {
          const r = Number(item.rate) || 0;
          return {
            ...item,
            unit: 'fixed',
            quantity: 1,
            amount: Math.round(r * 100) / 100
          };
        })
      );
    } else {
      setHasDueDate(true);
      if (!dueDate) {
        const d = new Date(invoiceDate || new Date());
        d.setDate(d.getDate() + (Number(settings?.defaultDueDays) || 7));
        setDueDate(d.toISOString().split('T')[0]);
      }
    }
  };

  const activeEventTypes = useMemo(() => getActiveEventTypeNames(settings?.eventTypes), [settings?.eventTypes]);
  const availableEventTypes = useMemo(() => {
    const list = [...activeEventTypes];
    if (eventType && !list.includes(eventType)) {
      list.push(eventType);
    }
    return list;
  }, [activeEventTypes, eventType]);

  const [items, setItems] = useState([]);
  const [charges, setCharges] = useState([]);
  const [discountType, setDiscountType] = useState('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(18);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [status, setStatus] = useState('unpaid');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [existingPayments, setExistingPayments] = useState([]);

  // Previous Balance handling
  const [showPreviousBalance, setShowPreviousBalance] = useState(true);
  const [isPendingBillsModalOpen, setIsPendingBillsModalOpen] = useState(false);

  // Calculate previous pending bills for selected client (excluding drafts and this bill)
  const previousPendingInfo = useMemo(() => {
    if (!selectedCustomerId) {
      return { previousBalance: 0, previousInvoiceNumbers: [], previousInvoices: [] };
    }
    return getClientPreviousPendingBills(
      allInvoices,
      selectedCustomerId,
      editInvoiceId,
      editInvoiceId ? invoiceDate : null
    );
  }, [allInvoices, selectedCustomerId, editInvoiceId, invoiceDate]);

  // Modals
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', company: '', phone: '', email: '', address: '', gstin: '' });
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [isChargePickerOpen, setIsChargePickerOpen] = useState(false);
  const [isCustomChargeModalOpen, setIsCustomChargeModalOpen] = useState(false);
  const [adhocCharge, setAdhocCharge] = useState({ name: '', type: 'fixed', rate: '', nature: 'charge' });
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Load existing invoice if edit mode
  useEffect(() => {
    if (editInvoiceId) {
      db.invoices.get(Number(editInvoiceId)).then(inv => {
        if (inv) {
          if (inv.status === 'cancelled') {
            setIsCancelled(true);
            setCancelReason(inv.cancelReason || '');
          } else {
            setIsCancelled(false);
            setCancelReason('');
          }
          setInvoiceNumber(inv.invoiceNumber || '');
          if (inv.customerId) {
            setClientMode('directory');
            setSelectedCustomerId(inv.customerId || '');
          } else if (inv.customerSnapshot?.name) {
            setClientMode('direct');
            setSelectedCustomerId('');
            setDirectClient({
              name: inv.customerSnapshot.name || '',
              phone: inv.customerSnapshot.phone || '',
              company: inv.customerSnapshot.company || '',
              email: inv.customerSnapshot.email || '',
              address: inv.customerSnapshot.address || '',
              gstin: inv.customerSnapshot.gstin || ''
            });
          } else {
            setClientMode('directory');
            setSelectedCustomerId(inv.customerId || '');
          }
          setInvoiceDate(inv.invoiceDate || new Date().toISOString().split('T')[0]);
          const existingHasDueDate = Boolean(inv.dueDate && String(inv.dueDate).trim() !== '');
          setHasDueDate(existingHasDueDate);
          setDueDate(inv.dueDate || '');
          setEventType(inv.eventType || '');
          setEventDate(inv.eventDate || '');
          setItems(Array.isArray(inv.items) ? inv.items : []);
          setCharges(Array.isArray(inv.charges) ? inv.charges : []);
          setDiscountType(inv.discountType || 'fixed');
          setDiscountValue(inv.discountValue || 0);
          setTaxPercentage(inv.taxPercentage !== undefined ? inv.taxPercentage : 18);
          setAdvancePaid(inv.advancePaid || 0);
          setStatus(inv.status || 'unpaid');
          setNotes(inv.notes || '');
          setPaymentTerms(inv.paymentTerms || '');
          setExistingPayments(Array.isArray(inv.payments) ? inv.payments : []);
          if (inv.showPreviousBalance !== undefined) {
            setShowPreviousBalance(Boolean(inv.showPreviousBalance));
          }
        }
      });
    } else if (settings && !invoiceNumber) {
      // Calculate initial due date based on defaultDueDays
      if (settings.defaultDueDays !== undefined) {
        const d = new Date(invoiceDate);
        d.setDate(d.getDate() + (Number(settings.defaultDueDays) || 7));
        setDueDate(d.toISOString().split('T')[0]);
      }
      // Generate new invoice number padded to at least 4 digits (e.g. DRF-0001)
      const prefix = settings.invoicePrefix || 'DRF-';
      let seq = settings.nextInvoiceSeq !== undefined ? Number(settings.nextInvoiceSeq) : 1;

      // Ensure deleted bills (both in DB and permanently deleted) never have their numbers reused
      const permDeleted = Array.isArray(settings.permanentlyDeletedInvoiceNumbers)
        ? settings.permanentlyDeletedInvoiceNumbers
        : [];

      const usedSeqs = new Set();
      allInvoices.forEach(inv => {
        if (!inv?.invoiceNumber) return;
        const match = String(inv.invoiceNumber).match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num)) usedSeqs.add(num);
        }
      });
      permDeleted.forEach(invNum => {
        if (!invNum) return;
        const match = String(invNum).match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num)) usedSeqs.add(num);
        }
      });

      // Advance sequence until unused
      while (usedSeqs.has(seq)) {
        seq++;
      }

      setInvoiceNumber(`${prefix}${String(seq).padStart(4, '0')}`);
      setTaxPercentage(settings.defaultTaxRate !== undefined ? settings.defaultTaxRate : 18);
      setPaymentTerms(settings.defaultPaymentTerms || '');
    }
  }, [editInvoiceId, settings, allInvoices]);

  // Set initial customer if passed
  useEffect(() => {
    if (initialCustomerId) {
      setClientMode('directory');
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  // Set initial line item if passed (e.g. from Hour Calculator)
  useEffect(() => {
    if (initialItem && !editInvoiceId) {
      setItems([{
        id: Date.now() + Math.random(),
        ...initialItem
      }]);
    }
  }, [initialItem, editInvoiceId]);

  // Real-time calculation
  const totals = calculateInvoiceTotals({
    items,
    charges,
    discountType,
    discountValue,
    taxPercentage,
    advancePaid
  });

  // Auto-status helper when advance changes
  const handleAdvanceChange = (val) => {
    const num = Math.max(0, Number(val) || 0);
    setAdvancePaid(num);
    if (num >= totals.totalAmount && totals.totalAmount > 0) {
      setStatus('paid');
    } else if (num > 0) {
      setStatus('partially_paid');
    } else {
      setStatus('unpaid');
    }
  };

  // Item helpers
  const addItemFromService = (svc) => {
    const isW = isWedding;
    const r = Number(svc.rate) || 0;
    setItems([
      ...items,
      {
        id: Date.now() + Math.random(),
        serviceId: svc.id,
        name: svc.name,
        description: svc.description || '',
        category: svc.category || 'other',
        unit: isW ? 'fixed' : (svc.unit || 'fixed'),
        rate: r,
        quantity: 1,
        amount: r
      }
    ]);
    setIsServicePickerOpen(false);
  };

  const addAdhocItem = () => {
    setItems([
      ...items,
      {
        id: Date.now() + Math.random(),
        name: '',
        description: '',
        category: 'other',
        unit: 'fixed',
        rate: 0,
        quantity: 1,
        amount: 0
      }
    ]);
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    const current = { ...updated[index], [field]: value };
    if (field === 'quantity') {
      delete current.quantityLabel;
    }
    if (isWedding) {
      current.quantity = 1;
      current.unit = 'fixed';
      const r = Number(current.rate) || 0;
      current.amount = Math.round(r * 100) / 100;
    } else {
      const q = Number(current.quantity) || 0;
      const r = Number(current.rate) || 0;
      current.amount = Math.round(q * r * 100) / 100;
    }
    updated[index] = current;
    setItems(updated);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Charge helpers
  const addChargeFromSaved = (ch) => {
    setCharges([
      ...charges,
      {
        id: Date.now() + Math.random(),
        chargeId: ch.id,
        name: ch.name,
        description: ch.description || '',
        type: ch.type,
        rate: ch.rate,
        nature: ch.nature || 'charge'
      }
    ]);
    setIsChargePickerOpen(false);
  };

  const handleAddAdhocCharge = (e) => {
    e.preventDefault();
    if (!adhocCharge.name.trim() || adhocCharge.rate === '') return;

    setCharges([
      ...charges,
      {
        id: Date.now() + Math.random(),
        name: adhocCharge.name.trim(),
        type: adhocCharge.type,
        rate: Number(adhocCharge.rate) || 0,
        nature: adhocCharge.nature
      }
    ]);

    setAdhocCharge({ name: '', type: 'fixed', rate: '', nature: 'charge' });
    setIsCustomChargeModalOpen(false);
  };

  const removeCharge = (index) => {
    setCharges(charges.filter((_, i) => i !== index));
  };

  // Quick Client inline create
  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClient.name.trim()) return;

    const id = await db.customers.add({
      name: newClient.name.trim(),
      company: newClient.company.trim(),
      phone: newClient.phone.trim(),
      email: newClient.email.trim(),
      address: newClient.address.trim(),
      gstin: newClient.gstin.trim(),
      createdAt: new Date().toISOString()
    });

    setSelectedCustomerId(id);
    setClientMode('directory');
    setIsClientModalOpen(false);
    setNewClient({ name: '', company: '', phone: '', email: '', address: '', gstin: '' });
  };

  // Save direct one-time client into directory if user wishes
  const handleSaveDirectClientToDirectory = async () => {
    if (!directClient.name.trim()) {
      alert('Please enter a client name first.');
      return;
    }
    try {
      const id = await db.customers.add({
        name: directClient.name.trim(),
        company: (directClient.company || '').trim(),
        phone: (directClient.phone || '').trim(),
        email: (directClient.email || '').trim(),
        address: (directClient.address || '').trim(),
        gstin: (directClient.gstin || '').trim(),
        tag: 'Regular',
        createdAt: new Date().toISOString()
      });
      setSelectedCustomerId(id);
      setClientMode('directory');
    } catch (err) {
      console.error('Failed to save client to directory:', err);
      alert('Error saving client to directory.');
    }
  };

  // Save invoice
  const handleSaveInvoice = async () => {
    if (isCancelled) {
      alert('This bill is cancelled and cannot be modified. Please reinstate it first to make changes.');
      return;
    }

    if (!invoiceNumber.trim()) {
      alert('Please provide an invoice number.');
      return;
    }

    if (clientMode === 'directory') {
      if (!selectedCustomerId) {
        alert('Please select a client from directory or switch to Direct Client Name.');
        return;
      }
    } else {
      if (!directClient.name || !directClient.name.trim()) {
        alert('Please enter the client name.');
        return;
      }
    }

    if (items.length === 0) {
      alert('Please add at least one service or line item.');
      return;
    }

    const selectedCust = customers.find(c => c.id === Number(selectedCustomerId));

    let paymentsPayload = [];
    if (editInvoiceId) {
      paymentsPayload = Array.isArray(existingPayments) ? [...existingPayments] : [];
      if (paymentsPayload.length === 0 && Number(totals.advancePaid) > 0) {
        paymentsPayload = [{
          id: 'INIT-ADV',
          date: invoiceDate,
          amount: Number(totals.advancePaid),
          method: 'Advance',
          note: 'Booking advance payment'
        }];
      }
    } else {
      paymentsPayload = Number(totals.advancePaid) > 0 ? [{
        id: 'INIT-ADV',
        date: invoiceDate,
        amount: Number(totals.advancePaid),
        method: 'Advance',
        note: 'Deposit paid upon invoice issuance'
      }] : [];
    }

    // Auto-link and snapshot all line items and charges
    const linkedItems = (Array.isArray(items) ? items : []).map(item => {
      const matchedSvc = item.serviceId
        ? services.find(s => s.id === Number(item.serviceId))
        : services.find(s => isServiceMatch(item, s, s.id));

      const r = Number(item.rate !== undefined ? item.rate : (matchedSvc?.rate || 0));
      const q = isWedding ? 1 : (Number(item.quantity) || 1);
      const amt = isWedding ? r : Number(item.amount !== undefined ? item.amount : (q * r));

      return {
        id: item.id || Date.now() + Math.random(),
        serviceId: item.serviceId || (matchedSvc ? matchedSvc.id : null),
        name: (item.name || matchedSvc?.name || '').trim(),
        description: (item.description !== undefined ? item.description : (matchedSvc?.description || '')).trim(),
        category: item.category || matchedSvc?.category || 'other',
        unit: isWedding ? 'fixed' : (item.unit || matchedSvc?.unit || 'fixed'),
        rate: r,
        quantity: q,
        amount: Math.round(amt * 100) / 100,
        ...((item.quantityLabel && !isWedding) ? { quantityLabel: item.quantityLabel } : {})
      };
    });

    const linkedCharges = (Array.isArray(totals.charges) ? totals.charges : []).map(ch => {
      const matchedCh = ch.chargeId
        ? savedCharges.find(c => c.id === Number(ch.chargeId))
        : savedCharges.find(c => isChargeMatch(ch, c, c.id));

      return {
        id: ch.id || Date.now() + Math.random(),
        chargeId: ch.chargeId || (matchedCh ? matchedCh.id : null),
        name: (ch.name || matchedCh?.name || '').trim(),
        description: (ch.description !== undefined ? ch.description : (matchedCh?.description || '')).trim(),
        type: ch.type || matchedCh?.type || 'fixed',
        rate: Number(ch.rate !== undefined ? ch.rate : (matchedCh?.rate || 0)),
        nature: ch.nature || matchedCh?.nature || 'charge',
        amount: Number(ch.amount) || 0
      };
    });

    const finalCustomerSnapshot = clientMode === 'directory' ? {
      name: selectedCust?.name || '',
      company: selectedCust?.company || '',
      phone: selectedCust?.phone || '',
      email: selectedCust?.email || '',
      address: selectedCust?.address || '',
      gstin: selectedCust?.gstin || '',
      tag: selectedCust?.tag || 'Regular'
    } : {
      name: directClient.name.trim(),
      company: (directClient.company || '').trim(),
      phone: (directClient.phone || '').trim(),
      email: (directClient.email || '').trim(),
      address: (directClient.address || '').trim(),
      gstin: (directClient.gstin || '').trim(),
      tag: 'Regular',
      isDirectClient: true
    };

    const invoicePayload = {
      invoiceNumber: invoiceNumber.trim(),
      customerId: clientMode === 'directory' ? (Number(selectedCustomerId) || null) : null,
      customerSnapshot: finalCustomerSnapshot,
      invoiceDate,
      dueDate: hasDueDate ? (dueDate || '') : '',
      eventType: (eventType || '').trim(),
      eventDate: eventDate || '',
      items: linkedItems,
      charges: linkedCharges,
      discount: totals.allDiscounts || 0,
      discountType,
      discountValue: Number(discountValue) || 0,
      taxPercentage: Number(taxPercentage) || 0,
      subtotal: totals.subtotal || 0,
      taxAmount: totals.taxAmount || 0,
      totalAmount: totals.totalAmount || 0,
      advancePaid: totals.advancePaid || 0,
      balanceDue: totals.balanceDue || 0,
      status,
      // Previous Balance Snapshot
      showPreviousBalance: Boolean(showPreviousBalance && previousPendingInfo.previousBalance > 0),
      previousBalance: Boolean(showPreviousBalance && previousPendingInfo.previousBalance > 0)
        ? previousPendingInfo.previousBalance
        : 0,
      previousInvoiceNumbers: Boolean(showPreviousBalance && previousPendingInfo.previousBalance > 0)
        ? previousPendingInfo.previousInvoiceNumbers
        : [],
      notes: notes.trim(),
      paymentTerms: paymentTerms.trim(),
      payments: paymentsPayload,
      updatedAt: new Date().toISOString()
    };

    let savedId;
    if (editInvoiceId) {
      await db.invoices.update(Number(editInvoiceId), invoicePayload);
      savedId = Number(editInvoiceId);
    } else {
      invoicePayload.createdAt = new Date().toISOString();
      savedId = await db.invoices.add(invoicePayload);

      // Increment sequence in settings so subsequent bills keep increasing
      const currentMatch = invoiceNumber.trim().match(/\d+$/);
      const usedNum = currentMatch ? parseInt(currentMatch[0], 10) : null;
      const nextSeq = usedNum !== null 
        ? Math.max((Number(settings?.nextInvoiceSeq) || 1), usedNum + 1)
        : ((Number(settings?.nextInvoiceSeq) || 1) + 1);

      await db.settings.update('business_profile', {
        nextInvoiceSeq: nextSeq
      });
    }

    if (status === 'paid') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {}
    }

    scheduleAutoSync(500);
    onSaved(savedId);
  };

  const selectedCustomerObj = customers.find(c => c.id === Number(selectedCustomerId));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
              <span>{editInvoiceId ? `Edit Bill: ${formatInvoiceNumber(invoiceNumber)}` : 'Create New Bill'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Draft professional invoices for photography, video production, and printing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSaveInvoice}
            disabled={isCancelled}
            className={`flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm py-2.5 px-5 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-transform ${isCancelled ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
            title={isCancelled ? 'Cannot update a cancelled bill' : (editInvoiceId ? 'Update Invoice' : 'Generate Invoice')}
          >
            <Save className="w-4 h-4" />
            <span>{editInvoiceId ? 'Update Invoice' : 'Generate Invoice'}</span>
          </button>
        </div>
      </div>

      {isCancelled && (
        <div className="bg-slate-800/90 border border-slate-700/80 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-300 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-700/60 text-slate-300">
              <Ban className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">
                This bill is Cancelled / Voided
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Reason: <span className="text-slate-300 font-medium">{cancelReason || 'Cancelled'}</span>. Editing is disabled. Reinstate the bill from the invoice view to make changes.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
          >
            Return to Invoices
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Client & Line Items Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Client Selection */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Building className="w-4 h-4" />
                <span>Client & Details</span>
              </h3>

              {/* Mode Switcher: Saved Client Directory vs Direct Client Name */}
              <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setClientMode('directory')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    clientMode === 'directory'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Select a saved client from your directory"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Client Directory</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode('direct')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    clientMode === 'direct'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Type client name directly for one-time or walk-in clients without saving to directory"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Direct Client (One-Time)</span>
                </button>
              </div>
            </div>

            {clientMode === 'directory' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Select Client *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsClientModalOpen(true)}
                        className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ New Client</span>
                      </button>
                    </div>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        if (e.target.value === '__direct__') {
                          setClientMode('direct');
                        } else {
                          setSelectedCustomerId(e.target.value);
                        }
                      }}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                    >
                      <option value="">-- Choose a Client --</option>
                      <option value="__direct__">✏️ Direct Client Name (Walk-In / One-Time)...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.company ? `(${c.company})` : ''} {c.tag ? `[${c.tag}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Invoice Number *
                    </label>
                    <div className="relative">
                      <Hash className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full glass-input pl-9 pr-3.5 py-2.5 rounded-xl text-sm font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Client Snapshot Preview */}
                {selectedCustomerObj && (
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-400 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-slate-500 block text-[10px] uppercase">Client Info:</span>
                        {selectedCustomerObj.tag && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            selectedCustomerObj.tag === 'VIP' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                            selectedCustomerObj.tag === 'Corporate' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                            selectedCustomerObj.tag === 'Studio/Partner' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {selectedCustomerObj.tag}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-200 text-sm">{selectedCustomerObj.name}</p>
                      {selectedCustomerObj.company && <p className="text-amber-400">{selectedCustomerObj.company}</p>}
                      {selectedCustomerObj.phone && <p className="font-mono mt-0.5">{selectedCustomerObj.phone}</p>}
                      {selectedCustomerObj.privateNote && (
                        <p className="text-[11px] text-amber-300/80 italic mt-1 bg-amber-500/5 p-1.5 rounded border border-amber-500/10">
                          Private note: {selectedCustomerObj.privateNote}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Billing Address:</span>
                      <p className="line-clamp-2">{selectedCustomerObj.address || 'No address provided'}</p>
                      {selectedCustomerObj.gstin && (
                        <p className="font-mono text-slate-300 mt-1">GSTIN: {selectedCustomerObj.gstin}</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Direct Client Mode (One-time / Not regular) */
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                  <User className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-amber-200">Direct / Walk-In Client Mode:</span>
                    <span className="text-slate-300 ml-1">
                      Type the client name directly. This will be printed on the invoice and stored on this bill without creating a permanent record in your Clients & Directory.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Client Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Patel / Walk-in Customer"
                      value={directClient.name}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Invoice Number *
                    </label>
                    <div className="relative">
                      <Hash className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full glass-input pl-9 pr-3.5 py-2.5 rounded-xl text-sm font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={directClient.phone}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Company / Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Studios / Wedding Walk-in"
                      value={directClient.company}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, company: e.target.value }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      GSTIN (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 24AAAAA0000A1Z5"
                      value={directClient.gstin}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. client@example.com"
                      value={directClient.email}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Billing Address (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Station Road, Surat, Gujarat"
                      value={directClient.address}
                      onChange={(e) => setDirectClient(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    💡 This client is only attached to this invoice and won't appear in Clients & Directory.
                  </span>
                  {directClient.name.trim() && (
                    <button
                      type="button"
                      onClick={handleSaveDirectClientToDirectory}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors cursor-pointer"
                      title="Convert this one-time client into a permanent directory client"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Save to Directory</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Previous Balance Alert & Toggle */}
            {selectedCustomerObj && previousPendingInfo.previousBalance > 0 && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Previous pending:{' '}
                      <strong className="text-amber-200 font-bold">
                        {formatCurrency(previousPendingInfo.previousBalance, sym)}
                      </strong>{' '}
                      ({previousPendingInfo.previousInvoices.length} bill{previousPendingInfo.previousInvoices.length === 1 ? '' : 's'})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPendingBillsModalOpen(true)}
                      className="text-amber-400 hover:text-amber-200 underline font-semibold ml-1 cursor-pointer transition-colors"
                    >
                      View bills
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 text-xs pt-1 border-t border-amber-500/20">
                  <input
                    type="checkbox"
                    checked={showPreviousBalance}
                    onChange={(e) => setShowPreviousBalance(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 focus:ring-offset-slate-950"
                  />
                  <span>Show previous balance on this invoice</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-sans tabular-nums"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <span>Due Date</span>
                    {hasDueDate && (
                      <span className="text-[10px] font-semibold text-amber-400">
                        (Active)
                      </span>
                    )}
                  </label>
                  {/* ON / OFF Toggle Buttons */}
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleToggleDueDate(true)}
                      className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                        hasDueDate
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Turn ON Due Date to give a payment deadline to the client"
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDueDate(false)}
                      className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                        !hasDueDate
                          ? 'bg-slate-700 text-slate-200 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Turn OFF Due Date (no due date will be given on the invoice)"
                    >
                      OFF
                    </button>
                  </div>
                </div>

                {hasDueDate ? (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-sans tabular-nums focus:border-amber-500"
                  />
                ) : (
                  <div
                    onClick={() => handleToggleDueDate(true)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-xs text-slate-500 flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors"
                    title="Click to turn ON Due Date"
                  >
                    <span>No Due Date</span>
                    <span className="text-[10px] text-slate-600 uppercase font-semibold">Hidden on Bill</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Event / Shoot Type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => handleEventTypeChange(e.target.value)}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-medium text-amber-300"
                >
                  <option value="">-- None / General Shoot --</option>
                  {availableEventTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Event Date (Optional)
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Line Items */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>Services & Line Items ({items.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsServicePickerOpen(true)}
                  className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold py-1.5 px-3 rounded-lg border border-amber-500/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catalog</span>
                </button>
                <button
                  type="button"
                  onClick={addAdhocItem}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-1.5 px-3 rounded-lg border border-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Custom Item</span>
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/60 rounded-xl border border-dashed border-slate-800 p-4">
                <p className="text-xs text-slate-400 mb-2">No items added to this bill yet.</p>
                <button
                  type="button"
                  onClick={() => setIsServicePickerOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Pick a service from your catalog</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          placeholder="Service / Item Name"
                          value={item.name}
                          onChange={(e) => updateItem(index, 'name', e.target.value)}
                          className="w-full glass-input px-3 py-1.5 rounded-lg text-sm font-medium"
                        />
                        <input
                          type="text"
                          placeholder="Description / deliverables (optional)"
                          value={item.description || ''}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          className="w-full glass-input px-3 py-1 text-xs text-slate-300 placeholder:text-slate-500 rounded-lg"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Remove Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isWedding ? (
                      <div className="grid grid-cols-12 gap-3 items-center text-xs">
                        {/* Rate Only */}
                        <div className="col-span-8 sm:col-span-9">
                          <label className="text-[10px] text-slate-400 font-medium block mb-1">
                            Rate ({sym})
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={item.rate}
                            onChange={(e) => updateItem(index, 'rate', e.target.value)}
                            className="w-full glass-input px-3 py-2 rounded-lg text-xs font-mono font-semibold text-amber-300"
                          />
                        </div>

                        {/* Line Amount */}
                        <div className="col-span-4 sm:col-span-3 text-right">
                          <label className="text-[10px] text-slate-500 block mb-1">Amount</label>
                          <span className="font-display font-bold text-sm text-amber-400 block py-1.5 font-mono">
                            {formatCurrency(item.amount !== undefined ? item.amount : item.rate, sym)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-12 gap-2.5 items-center text-xs">
                        {/* Unit Selector */}
                        <div className="col-span-4 sm:col-span-3">
                          <label className="text-[10px] text-slate-500 block mb-1">Unit</label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                            className="w-full glass-input px-2 py-1.5 rounded-lg text-xs"
                          >
                            <option value="per_video">per video</option>
                            <option value="per_photo">per photo</option>
                            <option value="per_hour">per hour</option>
                            <option value="per_day">per day</option>
                            <option value="per_page">per page</option>
                            <option value="per_piece">per piece</option>
                            <option value="fixed">fixed</option>
                          </select>
                        </div>

                        {/* Qty */}
                        <div className="col-span-3 sm:col-span-3">
                          <label className="text-[10px] text-slate-500 block mb-1 truncate" title={item.quantityLabel || 'Qty'}>
                            {item.quantityLabel ? (
                              <span className="text-amber-400 font-semibold">{item.quantityLabel}</span>
                            ) : (
                              'Qty'
                            )}
                          </label>
                          <div className="flex items-center">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                              className="w-full glass-input px-2 py-1.5 rounded-lg text-xs font-mono text-center"
                              title={item.quantityLabel ? `Duration: ${item.quantityLabel}` : ''}
                            />
                          </div>
                        </div>

                        {/* Rate */}
                        <div className="col-span-5 sm:col-span-3">
                          <label className="text-[10px] text-slate-500 block mb-1">Rate ({sym})</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.rate}
                            onChange={(e) => updateItem(index, 'rate', e.target.value)}
                            className="w-full glass-input px-2 py-1.5 rounded-lg text-xs font-mono"
                          />
                        </div>

                        {/* Line Amount */}
                        <div className="col-span-12 sm:col-span-3 text-right">
                          <label className="text-[10px] text-slate-500 block mb-1">Amount</label>
                          <span className="font-display font-bold text-sm text-amber-400 block py-1 font-mono">
                            {formatCurrency(item.amount, sym)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 3: Custom Charges & Discounts */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Percent className="w-4 h-4" />
                <span>Custom Charges & Discounts ({charges.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChargePickerOpen(true)}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-1.5 px-3 rounded-lg border border-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Pick Reusable</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomChargeModalOpen(true)}
                  className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold py-1.5 px-3 rounded-lg border border-amber-500/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ One-Time Fee/Discount</span>
                </button>
              </div>
            </div>

            {charges.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4 bg-slate-900/40 rounded-xl">
                No extra charges or discounts applied. (e.g. Rush Fee, Travel Allowance, Revisions).
              </p>
            ) : (
              <div className="space-y-2">
                {totals.charges.map((ch, index) => {
                  const isDiscount = ch.nature === 'discount';
                  return (
                    <div
                      key={ch.id || index}
                      className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isDiscount ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {isDiscount ? '- Discount' : '+ Charge'}
                        </span>
                        <span className="font-semibold text-slate-200">{ch.name}</span>
                        <span className="text-slate-500 font-mono">
                          ({ch.type === 'percentage' ? `${ch.rate}%` : `${sym}${ch.rate}`})
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`font-display font-semibold ${isDiscount ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {isDiscount ? '-' : '+'}{formatCurrency(ch.amount, sym)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCharge(index)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 4: Notes & Terms */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Deliverables & Production Notes
              </label>
              <textarea
                rows="2"
                placeholder="e.g. High-res deliverables delivered via Google Drive / Frame.io in 4K ProRes."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Payment Terms & Conditions
              </label>
              <textarea
                rows="2"
                placeholder="Payment due dates, cancellation clause, copyright ownership notes."
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full glass-input px-3.5 py-2 rounded-xl text-xs resize-none"
              />
            </div>
          </div>
        </div>

        {/* Right 1 Col: Financial Summary & Status */}
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5 border border-slate-700/80 sticky top-4 space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              <span>Bill Summary</span>
            </h3>

            {/* Calculations breakdown */}
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatCurrency(totals.subtotal, sym)}
                </span>
              </div>

              {totals.totalCharges > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-800/80 text-amber-400">
                  <span>Custom Charges (+)</span>
                  <span className="font-mono font-medium">
                    +{formatCurrency(totals.totalCharges, sym)}
                  </span>
                </div>
              )}

              {totals.totalCustomDiscounts > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-800/80 text-emerald-400">
                  <span>Custom Discounts (-)</span>
                  <span className="font-mono font-medium">
                    -{formatCurrency(totals.totalCustomDiscounts, sym)}
                  </span>
                </div>
              )}

              {/* General Discount */}
              <div className="py-2 border-b border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Additional Discount</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${discountType === 'fixed' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}
                    >
                      {sym} Flat
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${discountType === 'percentage' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}
                    >
                      %
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-mono"
                    placeholder="0"
                  />
                  <span className="font-mono text-emerald-400 whitespace-nowrap">
                    -{formatCurrency(totals.generalDiscount, sym)}
                  </span>
                </div>
              </div>

              {/* Tax Rate % */}
              <div className="py-2 border-b border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{settings?.taxLabel || 'Tax / GST'} Rate</span>
                  <span className="font-mono font-medium text-slate-200">{taxPercentage}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 5, 12, 18, 28].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setTaxPercentage(rate)}
                      className={`flex-1 text-[11px] py-1 rounded-lg font-mono transition-colors ${
                        taxPercentage === rate
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-400">{settings?.taxLabel || 'Tax'} Amount</span>
                  <span className="font-mono font-medium text-slate-200">
                    +{formatCurrency(totals.taxAmount, sym)}
                  </span>
                </div>
              </div>

              {/* Total Amount */}
              <div className="flex justify-between items-baseline pt-2 pb-2 text-sm font-bold text-slate-100">
                <span>Total Amount</span>
                <span className="font-display text-lg text-slate-100 font-bold">
                  {formatCurrency(totals.totalAmount, sym)}
                </span>
              </div>

              {/* Advance Paid */}
              <div className="py-2.5 px-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 block">
                  Advance Deposit Paid ({sym})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                    {sym}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={advancePaid}
                    onChange={(e) => handleAdvanceChange(e.target.value)}
                    className="w-full glass-input pl-7 pr-3 py-1.5 rounded-lg text-xs font-mono font-bold text-emerald-400"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Prominent Balance Due Card */}
              <div className="p-4 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 block">
                  Balance Due
                </span>
                <div className="text-2xl font-display font-extrabold text-amber-400 tracking-tight mt-0.5">
                  {formatCurrency(totals.balanceDue, sym)}
                </div>
                {totals.balanceDue === 0 && totals.totalAmount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Fully Paid</span>
                  </span>
                )}
              </div>

              {/* Previous Balance Breakdown if enabled */}
              {showPreviousBalance && previousPendingInfo.previousBalance > 0 && (
                <div className="p-3 bg-slate-900/90 border border-amber-500/30 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>This bill balance:</span>
                    <span className="font-mono text-slate-200">{formatCurrency(totals.balanceDue, sym)}</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>
                      Previous pending:
                      {previousPendingInfo.previousInvoiceNumbers.length > 0 && (
                        <span className="text-[10px] text-slate-400 ml-1">
                          ({previousPendingInfo.previousInvoiceNumbers.join(', ')})
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-medium">{formatCurrency(previousPendingInfo.previousBalance, sym)}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold text-amber-300">
                    <span>Total payable now:</span>
                    <span className="font-mono text-sm">{formatCurrency(totals.balanceDue + previousPendingInfo.previousBalance, sym)}</span>
                  </div>
                </div>
              )}

              {/* Invoice Status Picker */}
              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Invoice Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <option value="draft">Draft (Preparing)</option>
                  <option value="unpaid">Unpaid (Awaiting payment)</option>
                  <option value="partially_paid">Partially Paid (Advance received)</option>
                  <option value="paid">Paid in Full</option>
                </select>
              </div>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={handleSaveInvoice}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all text-sm"
              >
                <Save className="w-4 h-4" />
                <span>Save & Preview Bill</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Quick Add Client */}
      <Modal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        title="Add Client Quickly"
      >
        <form onSubmit={handleCreateClient} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Rohit Varma"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              className="w-full glass-input px-3 py-2 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Company / Project</label>
            <input
              type="text"
              placeholder="e.g. Red Carpet Media"
              value={newClient.company}
              onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
              className="w-full glass-input px-3 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Phone</label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={newClient.phone}
                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                placeholder="client@mail.com"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Address</label>
            <input
              type="text"
              placeholder="Mumbai, India"
              value={newClient.address}
              onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
              className="w-full glass-input px-3 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsClientModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl"
            >
              Add Client
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Service Picker from Catalog */}
      <Modal
        isOpen={isServicePickerOpen}
        onClose={() => setIsServicePickerOpen(false)}
        title="Select Service from Catalog"
        maxWidth="max-w-xl"
      >
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {services.map((svc) => (
            <div
              key={svc.id}
              onClick={() => addItemFromService(svc)}
              className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group"
            >
              <div>
                <h4 className="font-semibold text-slate-200 text-sm group-hover:text-amber-400 transition-colors">
                  {svc.name}
                </h4>
                {svc.description && (
                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{svc.description}</p>
                )}
              </div>

              <div className="text-right shrink-0">
                <span className="font-display font-bold text-sm text-slate-100 block">
                  {formatCurrency(svc.rate, sym)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {UNIT_SHORT[svc.unit] || svc.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal 3: Reusable Charge Picker */}
      <Modal
        isOpen={isChargePickerOpen}
        onClose={() => setIsChargePickerOpen(false)}
        title="Select Reusable Charge or Discount"
        maxWidth="max-w-lg"
      >
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {savedCharges.map((ch) => {
            const isDiscount = ch.nature === 'discount';
            return (
              <div
                key={ch.id}
                onClick={() => addChargeFromSaved(ch)}
                className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group"
              >
                <div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mr-2 ${isDiscount ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {isDiscount ? 'Discount' : 'Charge'}
                  </span>
                  <span className="font-semibold text-slate-200 text-sm group-hover:text-amber-400 transition-colors">
                    {ch.name}
                  </span>
                </div>

                <span className="font-display font-bold text-sm text-slate-200">
                  {ch.type === 'percentage' ? `${ch.rate}%` : formatCurrency(ch.rate, sym)}
                </span>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Modal 4: Ad-hoc One-Time Charge/Discount */}
      <Modal
        isOpen={isCustomChargeModalOpen}
        onClose={() => setIsCustomChargeModalOpen(false)}
        title="Add One-Time Custom Item"
      >
        <form onSubmit={handleAddAdhocCharge} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Item Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Travel Surcharge or Festival Discount"
              value={adhocCharge.name}
              onChange={(e) => setAdhocCharge({ ...adhocCharge, name: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Type</label>
              <select
                value={adhocCharge.type}
                onChange={(e) => setAdhocCharge({ ...adhocCharge, type: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs"
              >
                <option value="fixed">Flat Amount ({sym})</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Action</label>
              <select
                value={adhocCharge.nature}
                onChange={(e) => setAdhocCharge({ ...adhocCharge, nature: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs"
              >
                <option value="charge">Extra Charge (+)</option>
                <option value="discount">Discount (-)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Rate Value {adhocCharge.type === 'percentage' ? '(%)' : `(${sym})`} *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              required
              placeholder="0.00"
              value={adhocCharge.rate}
              onChange={(e) => setAdhocCharge({ ...adhocCharge, rate: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm font-mono"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCustomChargeModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl"
            >
              Apply Charge
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 5: View Client Pending Bills */}
      <Modal
        isOpen={isPendingBillsModalOpen}
        onClose={() => setIsPendingBillsModalOpen(false)}
        title={`Pending Bills - ${selectedCustomerObj?.name || 'Client'}`}
      >
        <div className="space-y-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
            <span>Total Previous Pending:</span>
            <span className="font-mono font-bold text-sm text-amber-400">
              {formatCurrency(previousPendingInfo.previousBalance, sym)}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {previousPendingInfo.previousInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-200">{formatInvoiceNumber(inv.invoiceNumber)}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Date: {formatDate(inv.invoiceDate || inv.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block uppercase">Balance Due</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {formatCurrency(inv.balanceDue, sym)}
                  </span>
                  <div className="text-[10px] text-slate-500">
                    Total: {formatCurrency(inv.totalAmount, sym)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsPendingBillsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
