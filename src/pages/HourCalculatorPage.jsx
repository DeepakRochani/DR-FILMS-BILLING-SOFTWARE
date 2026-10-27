import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Clock,
  Plus,
  Trash2,
  Copy,
  Printer,
  RotateCcw,
  Receipt,
  Save,
  Check,
  ChevronDown,
  Sparkles,
  Layers,
  ArrowRight,
  FileText,
  Calendar,
  User,
  AlertCircle,
  HelpCircle,
  FolderOpen,
  Split,
  Percent,
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { Modal } from '../components/Modal';
import {
  parseDurationInput,
  normalizeHoursMinutes,
  formatDuration,
  formatPartDuration,
  calculateBilledMinutes,
  calculateDurationAmount,
  generateBreakdownDescription,
  generateWhatsAppSummary
} from '../utils/durationParser';
import { DEFAULT_PDF_OPT } from '../utils/pdfExport';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

export function HourCalculatorPage({
  onNewInvoice,
  onAddToDraft,
  onGoToInvoices
}) {
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const services = useLiveQuery(() => db.services.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const savedCalculations = useLiveQuery(() => db.hourCalculations ? db.hourCalculations.reverse().toArray() : [], []) || [];
  const draftInvoices = useLiveQuery(
    async () => {
      const drafts = await db.invoices.where('status').equals('draft').toArray();
      return drafts.filter(inv => !inv?.isDeleted);
    },
    []
  ) || [];

  const sym = settings?.currencySymbol || '₹';

  // Calculator Preferences / State
  const [rows, setRows] = useState([
    { id: 1, name: '', hours: 0, minutes: 0, quickInput: '' }
  ]);
  const [rate, setRate] = useState(1200);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [customServiceName, setCustomServiceName] = useState('Video Editing');
  const [roundingMode, setRoundingMode] = useState('exact'); // 'exact' | 'ceil_15' | 'ceil_30' | 'ceil_60'
  const [minBillableHours, setMinBillableHours] = useState(0); // in hours
  const [showPerPartAmount, setShowPerPartAmount] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Save / Reopen State
  const [currentCalcId, setCurrentCalcId] = useState(null);
  const [calcTitle, setCalcTitle] = useState('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [isDraftPickerOpen, setIsDraftPickerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const estimateRef = useRef(null);
  const lastRowInputRef = useRef(null);

  // Hourly services from catalog
  const hourlyServices = useMemo(() => {
    return services.filter(s => s.unit === 'per_hour' || s.unit === 'hour' || s.unit === 'hr');
  }, [services]);

  // Load remembered preferences from settings on mount
  useEffect(() => {
    db.settings.get('hour_calculator_prefs').then(prefs => {
      if (prefs) {
        if (prefs.roundingMode) setRoundingMode(prefs.roundingMode);
        if (prefs.minBillableHours !== undefined) setMinBillableHours(prefs.minBillableHours);
        if (prefs.rate) setRate(prefs.rate);
        if (prefs.selectedServiceId) setSelectedServiceId(prefs.selectedServiceId);
        if (prefs.customServiceName) setCustomServiceName(prefs.customServiceName);
        if (prefs.showPerPartAmount !== undefined) setShowPerPartAmount(prefs.showPerPartAmount);
      } else if (hourlyServices.length > 0) {
        // Default to first hourly service if available
        const first = hourlyServices[0];
        setSelectedServiceId(String(first.id));
        setCustomServiceName(first.name);
        setRate(first.rate || 1200);
      }
    }).catch(() => {});
  }, [hourlyServices]);

  // Persist preferences
  const savePreferences = (newPrefs) => {
    const updated = {
      roundingMode,
      minBillableHours,
      rate,
      selectedServiceId,
      customServiceName,
      showPerPartAmount,
      ...newPrefs
    };
    db.settings.put({
      key: 'hour_calculator_prefs',
      ...updated,
      updatedAt: new Date().toISOString()
    }).catch(() => {});
  };

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Row Manipulation
  const handleAddRow = () => {
    const newId = Date.now() + Math.random();
    setRows(prev => [...prev, { id: newId, name: '', hours: 0, minutes: 0, quickInput: '' }]);
    setTimeout(() => {
      if (lastRowInputRef.current) {
        lastRowInputRef.current.focus();
      }
    }, 50);
  };

  const handleDuplicateRow = (index) => {
    const target = rows[index];
    const cloned = {
      id: Date.now() + Math.random(),
      name: target.name ? `${target.name} (Copy)` : '',
      hours: target.hours,
      minutes: target.minutes,
      quickInput: target.quickInput
    };
    const next = [...rows];
    next.splice(index + 1, 0, cloned);
    setRows(next);
    showToast('Row duplicated');
  };

  const handleDeleteRow = (index) => {
    if (rows.length === 1) {
      // Just clear the single row
      setRows([{ id: Date.now(), name: '', hours: 0, minutes: 0, quickInput: '' }]);
      return;
    }
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  // Quick Input Change
  const handleQuickInputChange = (index, value) => {
    const next = [...rows];
    next[index].quickInput = value;
    // Realtime parse
    const parsed = parseDurationInput(value);
    next[index].hours = parsed.hours;
    next[index].minutes = parsed.minutes;
    setRows(next);
  };

  // Direct Hours / Minutes Change
  const handleNumericDurationChange = (index, field, value) => {
    const next = [...rows];
    const current = { ...next[index], [field]: parseInt(value, 10) || 0 };
    // Auto convert minutes > 59
    const normalized = normalizeHoursMinutes(current.hours, current.minutes);
    current.hours = normalized.hours;
    current.minutes = normalized.minutes;
    current.quickInput = formatPartDuration(normalized.hours, normalized.minutes);
    next[index] = current;
    setRows(next);
  };

  // Enter key on inputs
  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === rows.length - 1) {
        handleAddRow();
      }
    }
  };

  // Handle Service Selection Change
  const handleServiceSelect = (serviceId) => {
    setSelectedServiceId(serviceId);
    if (!serviceId) {
      savePreferences({ selectedServiceId: '' });
      return;
    }
    const svc = services.find(s => String(s.id) === String(serviceId));
    if (svc) {
      setCustomServiceName(svc.name);
      setRate(svc.rate || 0);
      savePreferences({
        selectedServiceId: serviceId,
        customServiceName: svc.name,
        rate: svc.rate || 0
      });
    }
  };

  // Total Calculations
  const { totalMinutes, exactAmount, billedMinutes, billedAmount, activeServiceName } = useMemo(() => {
    let tMin = 0;
    rows.forEach(r => {
      const h = Number(r.hours) || 0;
      const m = Number(r.minutes) || 0;
      tMin += (h * 60) + m;
    });

    const minMinutes = (Number(minBillableHours) || 0) * 60;
    const bMin = calculateBilledMinutes(tMin, roundingMode, minMinutes);
    const exAmt = calculateDurationAmount(tMin, rate);
    const bAmt = calculateDurationAmount(bMin, rate);

    let svcName = customServiceName.trim();
    if (!svcName && selectedServiceId) {
      const svc = services.find(s => String(s.id) === String(selectedServiceId));
      if (svc) svcName = svc.name;
    }
    if (!svcName) svcName = 'Hourly Creative Services';

    return {
      totalMinutes: tMin,
      exactAmount: exAmt,
      billedMinutes: bMin,
      billedAmount: bAmt,
      activeServiceName: svcName
    };
  }, [rows, minBillableHours, roundingMode, rate, customServiceName, selectedServiceId, services]);

  // Selected Customer Object
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => String(c.id) === String(selectedCustomerId)) || null;
  }, [selectedCustomerId, customers]);

  // Reset Everything
  const handleReset = () => {
    if (totalMinutes > 0) {
      if (!window.confirm('Reset all duration rows and start fresh?')) return;
    }
    setRows([{ id: Date.now(), name: '', hours: 0, minutes: 0, quickInput: '' }]);
    setCurrentCalcId(null);
    setCalcTitle('');
    showToast('Calculator reset');
  };

  // Copy Summary for WhatsApp
  const handleCopySummary = async () => {
    const summary = generateWhatsAppSummary({
      title: calcTitle,
      clientName: selectedCustomer?.name || '',
      serviceName: activeServiceName,
      rate,
      rows,
      totalMinutes,
      billedMinutes,
      amount: billedAmount,
      roundingMode,
      businessProfile: settings
    });

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summary);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summary;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast('WhatsApp summary copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy summary:', err);
      showToast('Could not copy automatically. Check permissions.');
    }
  };

  // Print / Save as PDF estimate
  const handlePrintPdf = async () => {
    if (!estimateRef.current) return;
    setIsExportingPdf(true);
    showToast('Generating estimate PDF...');

    try {
      const clientName = (selectedCustomer?.name || 'Estimate').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const filename = `DR_FILMS_Hour_Estimate_${clientName}.pdf`;

      const opt = {
        ...DEFAULT_PDF_OPT,
        filename,
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        }
      };

      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      await html2pdf().set(opt).from(estimateRef.current).save();
      showToast('Estimate PDF saved!');
    } catch (err) {
      console.error('PDF export failed:', err);
      // Fallback to window.print()
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Save Calculation to IndexedDB
  const handleSaveCalculation = async () => {
    const title = calcTitle.trim() || `${selectedCustomer?.name || 'Client'} - ${activeServiceName}`;
    const payload = {
      title,
      customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
      customerName: selectedCustomer?.name || '',
      serviceId: selectedServiceId || null,
      serviceName: activeServiceName,
      rate: Number(rate) || 0,
      roundingMode,
      minBillableHours: Number(minBillableHours) || 0,
      showPerPartAmount,
      rows,
      totalMinutes,
      billedMinutes,
      amount: billedAmount,
      updatedAt: new Date().toISOString()
    };

    if (currentCalcId) {
      await db.hourCalculations.update(currentCalcId, payload);
      scheduleAutoSync(500);
      showToast('Calculation updated in history!');
    } else {
      payload.createdAt = new Date().toISOString();
      const id = await db.hourCalculations.add(payload);
      setCurrentCalcId(id);
      scheduleAutoSync(500);
      showToast('Calculation saved to history!');
    }
    setIsSaveModalOpen(false);
  };

  // Load Saved Calculation
  const handleLoadCalculation = (saved) => {
    setCurrentCalcId(saved.id);
    setCalcTitle(saved.title || '');
    if (saved.customerId) setSelectedCustomerId(String(saved.customerId));
    if (saved.serviceId) setSelectedServiceId(String(saved.serviceId));
    if (saved.serviceName) setCustomServiceName(saved.serviceName);
    if (saved.rate !== undefined) setRate(saved.rate);
    if (saved.roundingMode) setRoundingMode(saved.roundingMode);
    if (saved.minBillableHours !== undefined) setMinBillableHours(saved.minBillableHours);
    if (saved.showPerPartAmount !== undefined) setShowPerPartAmount(saved.showPerPartAmount);
    if (Array.isArray(saved.rows) && saved.rows.length > 0) {
      setRows(saved.rows);
    }
    setIsSavedDrawerOpen(false);
    showToast(`Loaded "${saved.title || 'Calculation'}"`);
  };

  // Delete Saved Calculation
  const handleDeleteSavedCalculation = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved calculation?')) return;
    await db.hourCalculations.delete(id);
    if (currentCalcId === id) {
      setCurrentCalcId(null);
    }
    scheduleAutoSync(500);
    showToast('Saved calculation deleted');
  };

  // Add to Bill Click Handler
  const handleAddToBillClick = () => {
    if (totalMinutes === 0) {
      showToast('Please enter at least one duration before adding to bill.');
      return;
    }

    if (draftInvoices.length > 0) {
      setIsDraftPickerOpen(true);
    } else {
      handleCreateNewBillWithLineItem();
    }
  };

  // Build the standardized line item
  const buildBillLineItem = () => {
    const description = generateBreakdownDescription(rows);
    const durationLabel = formatDuration(billedMinutes);
    const billedHoursDecimal = Math.round((billedMinutes / 60) * 100) / 100;

    return {
      serviceId: selectedServiceId ? Number(selectedServiceId) : null,
      name: activeServiceName,
      description: description,
      category: 'video_editing',
      unit: 'per_hour',
      rate: Number(rate) || 0,
      quantity: billedHoursDecimal,
      quantityLabel: durationLabel,
      amount: billedAmount
    };
  };

  // Create new bill
  const handleCreateNewBillWithLineItem = () => {
    const lineItem = buildBillLineItem();
    setIsDraftPickerOpen(false);
    onNewInvoice(selectedCustomerId ? Number(selectedCustomerId) : null, lineItem);
  };

  // Add to existing draft
  const handleAddToExistingDraft = async (draftId) => {
    const lineItem = buildBillLineItem();
    setIsDraftPickerOpen(false);
    if (typeof onAddToDraft === 'function') {
      await onAddToDraft(draftId, lineItem);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-xl font-semibold shadow-xl shadow-amber-500/20 text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
                Hour Calculator
                <span className="text-xs bg-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded-full border border-amber-500/30">
                  Studio Tool
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-part duration calculator with live rounding, per-part pricing, and 1-click invoice line items.
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsSavedDrawerOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 hover:text-slate-100 transition-colors"
            title="Saved Calculations"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Saved ({savedCalculations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSaveModalOpen(true)}
            disabled={totalMinutes === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-xs text-slate-300 hover:text-slate-100 transition-colors"
            title="Save Calculation"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            <span>{currentCalcId ? 'Update' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            disabled={totalMinutes === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-xs text-slate-300 hover:text-slate-100 transition-colors"
            title="Copy WhatsApp Summary"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Text</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={totalMinutes === 0 || isExportingPdf}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-xs text-slate-300 hover:text-slate-100 transition-colors"
            title="Print or Save PDF"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>PDF Estimate</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-900 text-xs text-slate-400 hover:text-rose-400 transition-colors"
            title="Reset All"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left Column (Inputs) & Right Column (Summary & Add to Bill) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Rows and Rate configuration */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Client & Service Header */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Client Selection (Optional) */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>Client (Optional)</span>
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">— Walk-in / Select Later —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Selection from Catalog */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Service from Catalog</span>
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => handleServiceSelect(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">— Custom Hourly Rate —</option>
                  {hourlyServices.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({sym}{s.rate}/hr)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
              {/* Service Display Name */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Service Name on Bill
                </label>
                <input
                  type="text"
                  value={customServiceName}
                  onChange={(e) => {
                    setCustomServiceName(e.target.value);
                    savePreferences({ customServiceName: e.target.value });
                  }}
                  placeholder="e.g. Video Editing — Wedding Cut"
                  className="w-full bg-slate-800/80 border border-slate-700/70 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Rate Per Hour */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Hourly Rate ({sym}/hr)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono">{sym}</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={rate}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setRate(val);
                      savePreferences({ rate: val });
                    }}
                    className="w-full bg-slate-800/80 border border-slate-700/70 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Duration Rows */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>Duration Parts & Events</span>
                  <span className="text-[11px] font-mono text-slate-400 font-normal">
                    ({rows.length} {rows.length === 1 ? 'part' : 'parts'})
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Type formats like <code className="text-amber-400/90 font-mono">39</code>, <code className="text-amber-400/90 font-mono">1:15</code>, <code className="text-amber-400/90 font-mono">2.05</code>, or <code className="text-amber-400/90 font-mono">1h 15m</code>.
                </p>
              </div>

              {/* Toggle: Per Part Pricing */}
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={showPerPartAmount}
                  onChange={(e) => {
                    setShowPerPartAmount(e.target.checked);
                    savePreferences({ showPerPartAmount: e.target.checked });
                  }}
                  className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                />
                <span className="text-[11px] text-slate-300">Show per-part ₹</span>
              </label>
            </div>

            {/* Rows List */}
            <div className="space-y-3">
              {rows.map((row, index) => {
                const isLast = index === rows.length - 1;
                const rowMinutes = (Number(row.hours) || 0) * 60 + (Number(row.minutes) || 0);
                const rowAmount = calculateDurationAmount(rowMinutes, rate);

                return (
                  <div
                    key={row.id}
                    className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3"
                  >
                    {/* Part / Event Name */}
                    <div className="flex-1 min-w-[140px]">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index].name = e.target.value;
                          setRows(next);
                        }}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        placeholder={`Part ${index + 1} (e.g. Haldi, Wedding)`}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Quick Format Entry Input */}
                    <div className="w-full sm:w-36">
                      <div className="relative">
                        <input
                          ref={isLast ? lastRowInputRef : null}
                          type="text"
                          value={row.quickInput}
                          onChange={(e) => handleQuickInputChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          placeholder="Quick: 1:15, 39m"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                          title="Type formats like 39, 39m, 1:15, 1h 15m, 2.05"
                        />
                      </div>
                    </div>

                    {/* Hours & Minutes Discrete Inputs (Synced) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          value={row.hours}
                          onChange={(e) => handleNumericDurationChange(index, 'hours', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          className="w-10 bg-transparent text-xs font-mono text-center text-slate-100 focus:outline-none"
                          title="Hours"
                        />
                        <span className="text-[10px] text-slate-500 font-mono ml-0.5">hr</span>
                      </div>

                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          value={row.minutes}
                          onChange={(e) => handleNumericDurationChange(index, 'minutes', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          className="w-10 bg-transparent text-xs font-mono text-center text-slate-100 focus:outline-none"
                          title="Minutes (auto converts >= 60)"
                        />
                        <span className="text-[10px] text-slate-500 font-mono ml-0.5">min</span>
                      </div>
                    </div>

                    {/* Optional Per-Part Amount */}
                    {showPerPartAmount && (
                      <div className="text-right sm:w-24 shrink-0 font-mono text-xs font-semibold text-slate-300">
                        {formatCurrency(rowAmount, sym)}
                      </div>
                    )}

                    {/* Row Action Buttons */}
                    <div className="flex items-center justify-end gap-1 shrink-0 pt-1 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRow(index)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Duplicate Row"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRow(index)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Part CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/5 text-xs font-semibold text-amber-400 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Part / Event (Press Enter)</span>
              </button>
            </div>
          </div>

          {/* Card 3: Rounding & Minimum Billable Time */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Percent className="w-3.5 h-3.5 text-amber-400" />
              <span>Billing & Rounding Rules</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rounding Mode Options */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1.5">Rounding Option</label>
                <select
                  value={roundingMode}
                  onChange={(e) => {
                    setRoundingMode(e.target.value);
                    savePreferences({ roundingMode: e.target.value });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="exact">Exact minutes (no rounding)</option>
                  <option value="ceil_15">Round up to nearest 15 min</option>
                  <option value="ceil_30">Round up to nearest 30 min</option>
                  <option value="ceil_60">Round up to full hour</option>
                </select>
              </div>

              {/* Minimum Billable Time */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1.5">
                  Minimum Billable Time (Hours)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={minBillableHours}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setMinBillableHours(val);
                    savePreferences({ minBillableHours: val });
                  }}
                  placeholder="0 = no minimum"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Side by side comparison: Original vs Billed */}
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Original Duration</span>
                <span className="text-slate-200 font-bold block text-sm">
                  {formatDuration(totalMinutes)}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {totalMinutes} min • {(totalMinutes / 60).toFixed(2)} hr
                </span>
              </div>

              <div className="border-l border-slate-800 pl-4">
                <span className="text-[10px] text-amber-500 block uppercase font-sans font-semibold">Billed Duration</span>
                <span className="text-amber-400 font-bold block text-sm">
                  {formatDuration(billedMinutes)}
                </span>
                <span className="text-[11px] text-amber-500/80 block">
                  {billedMinutes} min • {(billedMinutes / 60).toFixed(2)} hr
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Calculation Summary & Add to Bill CTA */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          {/* Main Calculation Card */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-slate-950/50 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Calculation Summary</span>
              <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {sym}{rate}/hr
              </span>
            </div>

            {/* Big Total Numbers */}
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 block">Total Billable Time</span>
              <div className="text-3xl font-display font-extrabold text-slate-100 tracking-tight">
                {formatDuration(billedMinutes)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span>{billedMinutes} mins</span>
                <span>•</span>
                <span>{(billedMinutes / 60).toFixed(2)} hrs</span>
              </div>
            </div>

            {/* Amount and Calculation Breakdown */}
            <div className="p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Payable Amount</span>
                <span className="text-xl font-display font-bold text-amber-400 font-mono">
                  {formatCurrency(billedAmount, sym)}
                </span>
              </div>

              {/* Exact Formula Breakdown */}
              <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span>Formula:</span>
                <span className="text-slate-400">
                  {billedMinutes}m ÷ 60 × {sym}{rate}
                </span>
              </div>

              {billedMinutes !== totalMinutes && (
                <div className="text-[10px] text-amber-500/90 pt-1 flex items-center justify-between">
                  <span>Exact unrounded amount:</span>
                  <span className="font-mono">{formatCurrency(exactAmount, sym)}</span>
                </div>
              )}
            </div>

            {/* Breakdown Description Preview */}
            <div className="text-xs space-y-1">
              <span className="text-[11px] text-slate-500 block uppercase tracking-wider">Line Item Preview</span>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs">
                <p className="font-semibold text-slate-100">{activeServiceName}</p>
                <p className="text-slate-400 text-[11px] mt-1 italic line-clamp-3">
                  {generateBreakdownDescription(rows) || 'No parts entered yet'}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
                  <span className="text-slate-500">Duration: {formatDuration(billedMinutes)}</span>
                  <span className="font-bold text-amber-400">{formatCurrency(billedAmount, sym)}</span>
                </div>
              </div>
            </div>

            {/* Primary Action Button: Add to Bill */}
            <button
              type="button"
              onClick={handleAddToBillClick}
              disabled={totalMinutes === 0}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/15 transition-all duration-200 active:scale-[0.98] text-sm"
            >
              <Receipt className="w-4 h-4" />
              <span>Add to Bill</span>
            </button>

            {/* Secondary Direct Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                disabled={totalMinutes === 0}
                className="w-full py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-30 text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>WhatsApp Text</span>
              </button>

              <button
                type="button"
                onClick={handlePrintPdf}
                disabled={totalMinutes === 0 || isExportingPdf}
                className="w-full py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-30 text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Print Estimate</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden PDF Printable Container */}
      <div className="hidden">
        <div
          ref={estimateRef}
          id="estimate-paper"
          className="p-8 bg-white text-slate-900 font-sans max-w-[800px] mx-auto text-xs"
          style={{ width: '800px', backgroundColor: '#ffffff', color: '#0f172a' }}
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                {settings?.businessName || 'DR FILMS'}
              </h2>
              <p className="text-slate-600 text-[11px]">{settings?.tagline || 'Creative Studio • Fine Print'}</p>
              <p className="text-slate-500 text-[10px] mt-1">{settings?.phone} • {settings?.email}</p>
            </div>
            <div className="text-right">
              <span className="text-base font-bold uppercase tracking-wider text-amber-600 block">
                HOUR ESTIMATE / WORK ORDER
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Date: {formatDate(new Date().toISOString())}</p>
              {calcTitle && <p className="font-semibold text-slate-800 text-[11px] mt-0.5">{calcTitle}</p>}
            </div>
          </div>

          {/* Client Details */}
          {selectedCustomer && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 mb-6">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Prepared For</span>
              <p className="font-bold text-sm text-slate-900">{selectedCustomer.name}</p>
              {selectedCustomer.company && <p className="text-slate-600">{selectedCustomer.company}</p>}
              {selectedCustomer.phone && <p className="text-slate-500">{selectedCustomer.phone}</p>}
            </div>
          )}

          {/* Breakdown Table */}
          <table className="w-full text-left mb-6 border-collapse">
            <thead>
              <tr className="border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <th className="py-2">#</th>
                <th className="py-2">Part / Description</th>
                <th className="py-2 text-right">Duration</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.filter(r => (Number(r.hours) || 0) > 0 || (Number(r.minutes) || 0) > 0).map((r, i) => {
                const rowM = (Number(r.hours) || 0) * 60 + (Number(r.minutes) || 0);
                const amt = calculateDurationAmount(rowM, rate);
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 text-slate-400 font-mono">{i + 1}</td>
                    <td className="py-2.5 font-medium">{r.name || `Part ${i + 1}`}</td>
                    <td className="py-2.5 text-right font-mono">{formatPartDuration(r.hours, r.minutes)}</td>
                    <td className="py-2.5 text-right font-mono">{formatCurrency(rate, sym)}/hr</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(amt, sym)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary */}
          <div className="flex justify-end pt-4 border-t-2 border-slate-900">
            <div className="w-64 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Exact Duration:</span>
                <span>{formatDuration(totalMinutes)}</span>
              </div>
              {billedMinutes !== totalMinutes && (
                <div className="flex justify-between text-amber-700 font-medium">
                  <span>Billed Duration ({roundingMode}):</span>
                  <span>{formatDuration(billedMinutes)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-950 pt-2 border-t border-slate-300">
                <span>Total Payable:</span>
                <span>{formatCurrency(billedAmount, sym)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-200 text-slate-500 text-[10px] text-center">
            This is an automated hour calculation estimate generated by DR FILMS Billing Studio.
          </div>
        </div>
      </div>

      {/* Modal: Save Calculation */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title={currentCalcId ? "Update Calculation" : "Save Calculation"}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Calculation Title
            </label>
            <input
              type="text"
              value={calcTitle}
              onChange={(e) => setCalcTitle(e.target.value)}
              placeholder="e.g. Wedding Edit - Kabir Mehta"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Client
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">— Select Client —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Duration:</span>
              <span className="text-slate-200 font-bold">{formatDuration(billedMinutes)}</span>
            </div>
            <div className="flex justify-between">
              <span>Payable:</span>
              <span className="text-amber-400 font-bold">{formatCurrency(billedAmount, sym)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsSaveModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCalculation}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
            >
              Save Calculation
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Saved Calculations Drawer / List */}
      <Modal
        isOpen={isSavedDrawerOpen}
        onClose={() => setIsSavedDrawerOpen(false)}
        title="Saved Calculations"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3">
          {savedCalculations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs space-y-2">
              <Clock className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No saved calculations yet.</p>
              <p className="text-[11px] text-slate-600">
                Calculate durations and click "Save" to keep them in your history.
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {savedCalculations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleLoadCalculation(item)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    currentCalcId === item.id
                      ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-100">
                        {item.title || 'Untitled Calculation'}
                      </span>
                      {currentCalcId === item.id && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 font-mono px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      {item.customerName && <span>Client: <strong>{item.customerName}</strong></span>}
                      <span>•</span>
                      <span>{item.serviceName}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {formatDate(item.createdAt || item.updatedAt)} • {item.rows?.length || 0} parts
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono">
                      <span className="text-xs font-bold text-amber-400 block">
                        {formatCurrency(item.amount, sym)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDuration(item.billedMinutes || item.totalMinutes)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedCalculation(e, item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Draft Invoice Picker when clicking Add to Bill */}
      <Modal
        isOpen={isDraftPickerOpen}
        onClose={() => setIsDraftPickerOpen(false)}
        title="Add to Bill"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            You have open draft bills. Would you like to create a new bill or add this item to an existing draft?
          </p>

          <div className="space-y-2">
            {/* Create New Bill Option */}
            <button
              type="button"
              onClick={handleCreateNewBillWithLineItem}
              className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-left transition-colors flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-xs text-amber-400 block">Create New Bill</span>
                <span className="text-[11px] text-slate-400">
                  Start a fresh bill with this {formatDuration(billedMinutes)} line item
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400" />
            </button>

            {/* List open drafts */}
            <div className="pt-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Or Add to Open Draft:
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {draftInvoices.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => handleAddToExistingDraft(draft.id)}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition-colors flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold font-mono text-slate-200">
                        {formatInvoiceNumber(draft.invoiceNumber)}
                      </span>
                      <span className="text-slate-400 ml-2">
                        {draft.customerSnapshot?.name || 'Draft Client'}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono">
                        Current Items: {draft.items?.length || 0} • Total: {formatCurrency(draft.totalAmount, sym)}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsDraftPickerOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
export default HourCalculatorPage;
