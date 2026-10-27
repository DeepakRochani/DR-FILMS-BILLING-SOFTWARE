import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  Building, 
  Calendar, 
  User, 
  FileText, 
  Sparkles,
  Search,
  DollarSign,
  Clock,
  UserCheck
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatInvoiceNumber } from '../utils/formatters';
import { getActiveEventTypeNames } from '../utils/eventTypeUtils';

export function CreateQuotePage({ onBack, onSaved, editingQuoteId = null }) {
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const customers = useLiveQuery(() => db.customers?.toArray() || [], []) || [];
  const services = useLiveQuery(() => db.services?.toArray() || [], []) || [];
  const customCharges = useLiveQuery(() => db.customCharges?.toArray() || [], []) || [];

  const sym = settings?.currencySymbol || '₹';
  const eventTypes = getActiveEventTypeNames(settings?.eventTypes);

  // Form State
  const [isDirectClient, setIsDirectClient] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [directClientName, setDirectClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(15);
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  );
  const [eventType, setEventType] = useState('Wedding');
  const [eventDate, setEventDate] = useState('');
  const [notes, setNotes] = useState('');

  const isWedding = Boolean(eventType && eventType.toLowerCase().includes('wedding'));

  const handleEventTypeChange = (newType) => {
    setEventType(newType);
    const newIsWedding = Boolean(newType && newType.toLowerCase().includes('wedding'));
    if (newIsWedding) {
      setItems(prev => prev.map(it => ({
        ...it,
        unit: 'fixed',
        quantity: 1,
        amount: Math.round((Number(it.rate) || 0) * 100) / 100
      })));
    }
  };

  // Items State
  const [items, setItems] = useState([
    { id: `item-${Date.now()}`, description: '', unit: 'per_video', rate: 0, quantity: 1, amount: 0 }
  ]);

  // Selected Charges/Discounts
  const [selectedChargeIds, setSelectedChargeIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing quote if editing
  useEffect(() => {
    if (!editingQuoteId) return;
    const loadQuote = async () => {
      const q = await db.quotes.get(Number(editingQuoteId));
      if (!q) return;

      setIsDirectClient(Boolean(q.isDirectClient));
      if (q.customerId) setSelectedCustomerId(String(q.customerId));
      if (q.customerSnapshot?.name) setDirectClientName(q.customerSnapshot.name);
      if (q.customerSnapshot?.phone) setClientPhone(q.customerSnapshot.phone);
      if (q.customerSnapshot?.company) setClientCompany(q.customerSnapshot.company);
      if (q.customerSnapshot?.email) setClientEmail(q.customerSnapshot.email);
      if (q.customerSnapshot?.address) setClientAddress(q.customerSnapshot.address);

      if (q.quoteDate) setQuoteDate(q.quoteDate);
      if (q.expiryDate) setExpiryDate(q.expiryDate);
      if (q.eventType) setEventType(q.eventType);
      if (q.eventDate) setEventDate(q.eventDate);
      if (q.notes) setNotes(q.notes);

      if (Array.isArray(q.items) && q.items.length > 0) {
        setItems(q.items);
      }
    };
    loadQuote();
  }, [editingQuoteId]);

  // Handle customer selection
  const handleCustomerChange = (cId) => {
    setSelectedCustomerId(cId);
    if (!cId) {
      setClientPhone('');
      setClientCompany('');
      setClientEmail('');
      setClientAddress('');
      return;
    }
    const found = customers.find(c => String(c.id) === String(cId));
    if (found) {
      setClientPhone(found.phone || '');
      setClientCompany(found.company || '');
      setClientEmail(found.email || '');
      setClientAddress(found.address || '');
    }
  };

  // Add Item
  const handleAddItem = (presetService = null) => {
    const isW = isWedding;
    const r = presetService ? (Number(presetService.rate) || 0) : 0;
    const newItem = presetService ? {
      id: `item-${Date.now()}-${Math.random()}`,
      serviceId: presetService.id,
      description: presetService.name,
      unit: isW ? 'fixed' : (presetService.unit || 'unit'),
      rate: r,
      quantity: 1,
      amount: r
    } : {
      id: `item-${Date.now()}-${Math.random()}`,
      description: '',
      unit: 'fixed',
      rate: 0,
      quantity: 1,
      amount: 0
    };
    setItems(prev => [...prev, newItem]);
  };

  // Update Item
  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      const it = { ...updated[index], [field]: value };
      if (isWedding) {
        it.quantity = 1;
        it.unit = 'fixed';
        const r = Number(field === 'rate' ? value : it.rate) || 0;
        it.amount = Math.round(r * 100) / 100;
      } else if (field === 'rate' || field === 'quantity') {
        const r = Number(field === 'rate' ? value : it.rate) || 0;
        const q = Number(field === 'quantity' ? value : it.quantity) || 0;
        it.amount = Math.round(r * q * 100) / 100;
      }
      updated[index] = it;
      return updated;
    });
  };

  // Remove Item
  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Totals Calculation
  const subtotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  // Compute active charges
  const activeCharges = selectedChargeIds.map(id => {
    const ch = customCharges.find(c => c.id === id);
    if (!ch) return null;
    const rateVal = Number(ch.rate) || 0;
    const chAmount = ch.type === 'percentage' 
      ? Math.round((subtotal * rateVal) / 100)
      : rateVal;
    return {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      rate: rateVal,
      nature: ch.nature, // 'charge' | 'discount'
      amount: chAmount
    };
  }).filter(Boolean);

  let netAmount = subtotal;
  activeCharges.forEach(ch => {
    if (ch.nature === 'discount') {
      netAmount -= ch.amount;
    } else {
      netAmount += ch.amount;
    }
  });

  const totalAmount = Math.max(0, netAmount);

  // Submit Quote
  const handleSubmit = async (status = 'draft') => {
    let finalClientName = '';
    if (isDirectClient) {
      finalClientName = directClientName.trim();
    } else {
      const found = customers.find(c => String(c.id) === String(selectedCustomerId));
      finalClientName = found ? found.name : directClientName.trim();
    }

    if (!finalClientName) {
      alert('Please enter or select a client name.');
      return;
    }

    if (items.length === 0 || !items.some(it => it.description.trim() && it.amount > 0)) {
      alert('Please add at least one line item with an amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();

      let quoteNumber = '';
      if (editingQuoteId) {
        const existing = await db.quotes.get(Number(editingQuoteId));
        quoteNumber = existing?.quoteNumber || '';
      }

      if (!quoteNumber) {
        const prefix = settings?.quotePrefix || 'DRF-EST-';
        const count = await db.quotes.count();
        quoteNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
      }

      const quoteRecord = {
        quoteNumber,
        customerId: isDirectClient ? null : (selectedCustomerId ? Number(selectedCustomerId) : null),
        isDirectClient: Boolean(isDirectClient),
        customerSnapshot: {
          name: finalClientName,
          phone: clientPhone.trim(),
          email: clientEmail.trim(),
          company: clientCompany.trim(),
          address: clientAddress.trim()
        },
        quoteDate,
        expiryDate,
        eventType,
        eventDate: eventDate || null,
        items,
        charges: activeCharges,
        subtotal,
        totalAmount,
        status, // 'draft' | 'sent'
        notes: notes.trim(),
        isDeleted: false,
        updatedAt: nowIso
      };

      if (editingQuoteId) {
        await db.quotes.update(Number(editingQuoteId), quoteRecord);
      } else {
        quoteRecord.createdAt = nowIso;
        await db.quotes.add(quoteRecord);
      }

      if (onSaved) {
        onSaved();
      } else {
        onBack();
      }
    } catch (err) {
      console.error('Failed to save quote:', err);
      alert('Failed to save quote. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              <span>{editingQuoteId ? 'Edit Quotation / Estimate' : 'Create New Estimate'}</span>
            </h2>
            <p className="text-xs text-slate-400">Draft professional media production proposals for clients</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            Save as Draft
          </button>

          <button
            type="button"
            onClick={() => handleSubmit('sent')}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save & Ready</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client & Event Information */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
            <h3 className="font-display font-bold text-sm text-slate-200 flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              <span>Client Information</span>
            </h3>

            {/* Direct Client Toggle */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDirectClient(false)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  !isDirectClient ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Existing Client
              </button>
              <button
                type="button"
                onClick={() => setIsDirectClient(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isDirectClient ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Direct / Walk-In
              </button>
            </div>

            {isDirectClient ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={directClientName}
                    onChange={(e) => setDirectClientName(e.target.value)}
                    placeholder="Enter client or company name"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Select Client *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">-- Choose from Directory --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
                    ))}
                  </select>
                </div>

                {selectedCustomerId && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Event & Validity Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
            <h3 className="font-display font-bold text-sm text-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Event & Proposal Details</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Event / Shoot Type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => handleEventTypeChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  {eventTypes.map(ev => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Tentative Shoot Date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Quote Date
                  </label>
                  <input
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Line Items, Charges & Totals */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <h3 className="font-display font-bold text-sm text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Scope of Services & Deliverables ({items.length})</span>
              </h3>

              {/* Quick Add from Service Catalog */}
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    const found = services.find(s => String(s.id) === e.target.value);
                    if (found) {
                      handleAddItem(found);
                      e.target.value = '';
                    }
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-400 font-semibold focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>+ Add from Catalog...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({formatCurrency(s.rate, sym)})</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleAddItem()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Custom Item</span>
                </button>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      placeholder="e.g. Wedding Cinematic Teaser & 4K Master Video"
                      className="flex-1 bg-transparent border-b border-slate-800 pb-1 text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="text-slate-500 hover:text-rose-400 p-1 disabled:opacity-20 cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isWedding ? (
                    <div className="grid grid-cols-12 gap-3 items-center text-xs">
                      <div className="col-span-8 sm:col-span-9">
                        <span className="text-[10px] text-slate-400 font-medium block mb-0.5">Rate ({sym})</span>
                        <input
                          type="number"
                          min="0"
                          value={item.rate || ''}
                          onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono font-semibold text-xs text-amber-300 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-3 text-right">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Amount</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {formatCurrency(item.amount !== undefined ? item.amount : item.rate, sym)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 items-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Unit</span>
                        <input
                          type="text"
                          value={item.unit || ''}
                          onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                          placeholder="unit"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Rate ({sym})</span>
                        <input
                          type="number"
                          min="0"
                          value={item.rate || ''}
                          onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Qty</span>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          placeholder="1"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-1 text-right">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Amount</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {formatCurrency(item.amount, sym)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Custom Charges & Discounts Selector */}
            {customCharges.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 block">Package Adjustments / Discounts</span>
                <div className="flex flex-wrap gap-2">
                  {customCharges.map(ch => {
                    const isSelected = selectedChargeIds.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setSelectedChargeIds(prev => 
                            prev.includes(ch.id) ? prev.filter(x => x !== ch.id) : [...prev, ch.id]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? ch.nature === 'discount'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span>{ch.name}</span>
                        <span className="opacity-80">({ch.rate}{ch.type === 'percentage' ? '%' : ''})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes / Special Instructions */}
            <div className="pt-3 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Custom Shoot Terms & Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Flight tickets & accommodation to be arranged by the client."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            {/* Financial Summary Box */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Scope Subtotal:</span>
                <span className="font-mono text-slate-200">{formatCurrency(subtotal, sym)}</span>
              </div>

              {activeCharges.map(ch => (
                <div key={ch.id} className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{ch.name}:</span>
                  <span className={`font-mono font-semibold ${ch.nature === 'discount' ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {ch.nature === 'discount' ? '-' : '+'}{formatCurrency(ch.amount, sym)}
                  </span>
                </div>
              ))}

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                <span className="font-display font-bold text-slate-200 text-sm">Estimated Total Investment:</span>
                <span className="font-mono font-extrabold text-amber-400 text-xl">
                  {formatCurrency(totalAmount, sym)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
