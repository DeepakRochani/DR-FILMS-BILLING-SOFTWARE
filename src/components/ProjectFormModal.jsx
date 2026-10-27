import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Save, 
  Briefcase, 
  Calendar, 
  CheckSquare, 
  Plus, 
  Trash2, 
  Receipt, 
  Users, 
  Clock, 
  Tag, 
  AlertTriangle,
  Camera
} from 'lucide-react';
import { db } from '../db/db.js';
import { DEFAULT_PROJECT_STAGES, DEFAULT_PROJECT_CHECKLIST } from '../db/seedData.js';
import { PROJECT_PRIORITIES, createDefaultChecklist } from '../utils/projectUtils.js';
import { getActiveEventTypeNames } from '../utils/eventTypeUtils.js';
import { formatInvoiceNumber, formatCurrency } from '../utils/formatters.js';
import { scheduleAutoSync } from '../utils/googleSheetsSync.js';

export function ProjectFormModal({
  isOpen,
  onClose,
  initialProject = null,
  prefilledInvoice = null,
  prefilledCustomer = null,
  customers = [],
  invoices = [],
  settings = {},
  onSaved
}) {
  if (!isOpen) return null;

  const eventTypes = getActiveEventTypeNames(settings?.eventTypes);
  const stages = settings?.projectStages || DEFAULT_PROJECT_STAGES;

  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [eventType, setEventType] = useState('Wedding');
  const [eventDate, setEventDate] = useState('');
  const [deliveryDueDate, setDeliveryDueDate] = useState('');
  const [stage, setStage] = useState('Booked');
  const [priority, setPriority] = useState('Medium');
  const [checklist, setChecklist] = useState([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [assignedEquipment, setAssignedEquipment] = useState([]);
  const [assignedCrew, setAssignedCrew] = useState([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Live queries for equipment and crew
  const allEquipment = useLiveQuery(() => db.equipment ? db.equipment.toArray() : [], []) || [];
  const equipmentList = allEquipment.filter(e => !e?.isDeleted);

  const allCrew = useLiveQuery(() => db.crew ? db.crew.toArray() : [], []) || [];
  const crewList = allCrew.filter(c => !c?.isDeleted);

  const existingProjects = useLiveQuery(() => db.projects ? db.projects.toArray() : [], []) || [];

  // Calculate conflicts on selected eventDate
  const conflicts = useMemo(() => {
    if (!eventDate) return { equipment: {}, crew: {} };
    const equipConflicts = {};
    const crewConflicts = {};

    existingProjects.forEach(p => {
      if (initialProject && p.id === initialProject.id) return;
      if (p.isDeleted || p.stage === 'Delivered') return;
      if (p.eventDate === eventDate) {
        if (Array.isArray(p.assignedEquipment)) {
          p.assignedEquipment.forEach(item => {
            equipConflicts[item] = p.title || p.clientName || 'Another shoot';
          });
        }
        if (Array.isArray(p.assignedCrew)) {
          p.assignedCrew.forEach(member => {
            crewConflicts[member] = p.title || p.clientName || 'Another shoot';
          });
        }
      }
    });

    return { equipment: equipConflicts, crew: crewConflicts };
  }, [eventDate, existingProjects, initialProject]);

  // Initialize form state
  useEffect(() => {
    if (initialProject) {
      setTitle(initialProject.title || '');
      setCustomerId(initialProject.customerId ? String(initialProject.customerId) : '');
      setClientName(initialProject.clientName || '');
      setClientPhone(initialProject.clientPhone || '');
      setInvoiceId(initialProject.invoiceId ? String(initialProject.invoiceId) : '');
      setInvoiceNumber(initialProject.invoiceNumber || '');
      setEventType(initialProject.eventType || 'Wedding');
      setEventDate(initialProject.eventDate || '');
      setDeliveryDueDate(initialProject.deliveryDueDate || '');
      setStage(initialProject.stage || 'Booked');
      setPriority(initialProject.priority || 'Medium');
      setChecklist(Array.isArray(initialProject.checklist) && initialProject.checklist.length > 0 
        ? initialProject.checklist 
        : createDefaultChecklist());
      setAssignedEquipment(Array.isArray(initialProject.assignedEquipment) ? initialProject.assignedEquipment : []);
      setAssignedCrew(Array.isArray(initialProject.assignedCrew) ? initialProject.assignedCrew : []);
      setNotes(initialProject.notes || '');
    } else {
      // Default new project setup
      let cId = '';
      let cName = '';
      let cPhone = '';
      let invId = '';
      let invNum = '';
      let evType = 'Wedding';
      let evDate = new Date().toISOString().split('T')[0];

      if (prefilledInvoice) {
        invId = String(prefilledInvoice.id);
        invNum = prefilledInvoice.invoiceNumber;
        cId = prefilledInvoice.customerId ? String(prefilledInvoice.customerId) : '';
        cName = prefilledInvoice.customerSnapshot?.name || '';
        cPhone = prefilledInvoice.customerSnapshot?.phone || '';
        if (prefilledInvoice.eventType) evType = prefilledInvoice.eventType;
        if (prefilledInvoice.eventDate) evDate = prefilledInvoice.eventDate;
      } else if (prefilledCustomer) {
        cId = String(prefilledCustomer.id);
        cName = prefilledCustomer.name || '';
        cPhone = prefilledCustomer.phone || '';
      }

      setCustomerId(cId);
      setClientName(cName);
      setClientPhone(cPhone);
      setInvoiceId(invId);
      setInvoiceNumber(invNum);
      setEventType(evType);
      setEventDate(evDate);

      // Default due date: 14 days from now
      const defaultDue = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      setDeliveryDueDate(defaultDue);

      const generatedTitle = cName ? `${cName} — ${evType}` : `${evType} Shoot`;
      setTitle(generatedTitle);

      setStage('Booked');
      setPriority('Medium');
      setChecklist(createDefaultChecklist());
      setAssignedEquipment([]);
      setAssignedCrew([]);
      setNotes('');
    }
  }, [initialProject, prefilledInvoice, prefilledCustomer]);

  // When customer is selected from dropdown
  const handleCustomerChange = (selectedId) => {
    setCustomerId(selectedId);
    if (!selectedId) return;

    const found = customers.find(c => String(c.id) === String(selectedId));
    if (found) {
      setClientName(found.name || '');
      setClientPhone(found.phone || '');
      if (!title || title.includes('Shoot')) {
        setTitle(`${found.name} — ${eventType}`);
      }
    }
  };

  // When invoice is linked from dropdown
  const handleInvoiceChange = (selectedInvId) => {
    setInvoiceId(selectedInvId);
    if (!selectedInvId) {
      setInvoiceNumber('');
      return;
    }

    const found = invoices.find(inv => String(inv.id) === String(selectedInvId));
    if (found) {
      setInvoiceNumber(found.invoiceNumber || '');
      if (found.customerId && !customerId) {
        setCustomerId(String(found.customerId));
      }
      if (found.customerSnapshot?.name && !clientName) {
        setClientName(found.customerSnapshot.name);
      }
      if (found.customerSnapshot?.phone && !clientPhone) {
        setClientPhone(found.customerSnapshot.phone);
      }
      if (found.eventType) {
        setEventType(found.eventType);
      }
      if (found.eventDate) {
        setEventDate(found.eventDate);
      }
      if (!title) {
        const name = found.customerSnapshot?.name || clientName || 'Client';
        setTitle(`${name} — ${found.eventType || 'Production'}`);
      }
    }
  };

  // Toggle checklist item
  const handleToggleChecklist = (index) => {
    setChecklist(prev => {
      const next = [...prev];
      const item = next[index];
      const nextCompleted = !item.completed;
      next[index] = {
        ...item,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null
      };
      return next;
    });
  };

  // Add custom checklist item
  const handleAddChecklistItem = (e) => {
    e?.preventDefault();
    const text = newChecklistText.trim();
    if (!text) return;

    setChecklist(prev => [
      ...prev,
      {
        id: `chk_${Date.now()}`,
        label: text,
        completed: false,
        completedAt: null
      }
    ]);
    setNewChecklistText('');
  };

  // Remove checklist item
  const handleRemoveChecklistItem = (index) => {
    setChecklist(prev => prev.filter((_, idx) => idx !== index));
  };

  // Save project
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please enter a project title.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const isDeliveringNow = stage === 'Delivered' && (!initialProject || initialProject.stage !== 'Delivered');

      const projectData = {
        title: cleanTitle,
        customerId: customerId ? Number(customerId) : null,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        invoiceId: invoiceId ? Number(invoiceId) : null,
        invoiceNumber: invoiceNumber ? String(invoiceNumber) : '',
        eventType: eventType || 'Wedding',
        eventDate: eventDate || null,
        deliveryDueDate: deliveryDueDate || null,
        stage: stage || 'Booked',
        priority: priority || 'Medium',
        checklist: checklist || [],
        assignedEquipment: assignedEquipment || [],
        assignedCrew: assignedCrew || [],
        notes: notes.trim(),
        deliveredAt: stage === 'Delivered' ? (initialProject?.deliveredAt || nowIso) : null,
        updatedAt: nowIso
      };

      let savedId;
      if (initialProject && initialProject.id) {
        await db.projects.update(initialProject.id, projectData);
        savedId = initialProject.id;
      } else {
        projectData.isDeleted = false;
        projectData.createdAt = nowIso;
        savedId = await db.projects.add(projectData);
      }

      // Sync to cloud
      scheduleAutoSync(1000);

      const completeProjectRecord = {
        ...projectData,
        id: savedId
      };

      if (onSaved) {
        onSaved(completeProjectRecord, isDeliveringNow);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save project:', err);
      setFormError('Error saving project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl my-auto overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-100 text-lg">
                {initialProject ? 'Edit Project / Job' : 'New Project / Job'}
              </h3>
              <p className="text-xs text-slate-400">
                Track production stages, shoot dates, and delivery deadlines
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {formError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Project Title */}
          <div>
            <label className="font-semibold text-slate-300 block mb-1">
              Project Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vikram & Neha Wedding Video Package"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-medium focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Client & Linked Bill Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Client / Customer</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500/50"
              >
                <option value="">— Select Existing Client —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} [{c.tag || 'Regular'}]
                  </option>
                ))}
              </select>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  placeholder="Client name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-300 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Client phone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-300 text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-amber-400" />
                <span>Link Invoice / Bill (Optional)</span>
              </label>
              <select
                value={invoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500/50"
              >
                <option value="">— No Linked Bill —</option>
                {invoices.filter(i => !i.isDeleted).map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {formatInvoiceNumber(inv.invoiceNumber)} — {inv.customerSnapshot?.name || 'Client'} ({formatCurrency(inv.totalAmount)}) [{inv.status}]
                  </option>
                ))}
              </select>
              {invoiceId ? (
                <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                  ✓ Linked to Bill #{formatInvoiceNumber(invoiceNumber)}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">
                  Linking automatically tracks invoice payment status on the project card.
                </p>
              )}
            </div>
          </div>

          {/* Event Type & Dates Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Event Type</span>
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500/50"
              >
                {eventTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Shoot / Event Date</span>
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Delivery Due Date</span>
              </label>
              <input
                type="date"
                required
                value={deliveryDueDate}
                onChange={(e) => setDeliveryDueDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* Stage & Priority Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Current Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-semibold focus:outline-none focus:border-amber-500/50"
              >
                {stages.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Priority</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PROJECT_PRIORITIES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-1 text-center rounded-xl border text-[11px] font-semibold transition-all ${
                      priority === p
                        ? p === 'Urgent'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500 font-bold'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Production Checklist */}
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Production Checklist ({checklist.filter(c => c.completed).length}/{checklist.length})</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 max-h-48 overflow-y-auto">
              {checklist.map((item, idx) => (
                <div 
                  key={item.id || idx}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                    item.completed 
                      ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' 
                      : 'bg-slate-900/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={Boolean(item.completed)}
                      onChange={() => handleToggleChecklist(idx)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                    />
                    <span className={`truncate text-xs ${item.completed ? 'line-through opacity-70' : ''}`}>
                      {item.label}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveChecklistItem(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Remove item"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Checklist Item */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add custom task or deliverable..."
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 text-xs focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-3 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Assigned Equipment & Crew (Conflict Guard) */}
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>Assigned Equipment & Cameras ({assignedEquipment.length})</span>
                </label>
                {eventDate && Object.keys(conflicts.equipment).length > 0 && (
                  <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Shoot date conflict detected</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-950/70 rounded-xl border border-slate-800/80">
                {equipmentList.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic">No equipment registered yet</span>
                ) : (
                  equipmentList.map(eq => {
                    const isSelected = assignedEquipment.includes(eq.name);
                    const hasConflict = conflicts.equipment[eq.name];
                    return (
                      <button
                        key={eq.id || eq.name}
                        type="button"
                        onClick={() => {
                          setAssignedEquipment(prev => 
                            prev.includes(eq.name) ? prev.filter(x => x !== eq.name) : [...prev, eq.name]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span>{eq.name}</span>
                        {hasConflict && (
                          <span className="text-[10px] text-rose-400 font-bold" title={`Clashing with: ${hasConflict}`}>
                            ⚠️ Clashing
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Assigned Crew & Operators ({assignedCrew.length})</span>
                </label>
                {eventDate && Object.keys(conflicts.crew).length > 0 && (
                  <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Crew double-booking clash</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-950/70 rounded-xl border border-slate-800/80">
                {crewList.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic">No crew registered yet</span>
                ) : (
                  crewList.map(cr => {
                    const isSelected = assignedCrew.includes(cr.name);
                    const hasConflict = conflicts.crew[cr.name];
                    return (
                      <button
                        key={cr.id || cr.name}
                        type="button"
                        onClick={() => {
                          setAssignedCrew(prev => 
                            prev.includes(cr.name) ? prev.filter(x => x !== cr.name) : [...prev, cr.name]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span>{cr.name} ({cr.role})</span>
                        {hasConflict && (
                          <span className="text-[10px] text-rose-400 font-bold" title={`Clashing with: ${hasConflict}`}>
                            ⚠️ Clashing
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-slate-800 pt-3">
            <label className="font-semibold text-slate-300 block mb-1">Private Production Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Raw footage stored on Drive B. Client requested warm cinematic color grade."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 text-xs focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : initialProject ? 'Update Project' : 'Create Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
