import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Settings as SettingsIcon, 
  Save, 
  Upload, 
  Download, 
  Database, 
  RefreshCw, 
  Building, 
  CreditCard, 
  CheckCircle, 
  AlertTriangle,
  AlertCircle,
  Clapperboard,
  HardDrive,
  ShieldCheck,
  QrCode,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Cloud,
  CloudUpload,
  CloudDownload,
  Key,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Info,
  Lock,
  Unlock,
  Fingerprint,
  Shield,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Bell,
  Calendar,
  Edit2
} from 'lucide-react';
import { db } from '../db/db';
import { DEFAULT_SETTINGS, DEFAULT_WHATSAPP_TEMPLATE, DEFAULT_WHATSAPP_PAID_TEMPLATE, DEFAULT_REMINDER_SETTINGS } from '../db/seedData';
import { exportDatabaseJSON, importDatabaseJSON, resetDatabaseToDefaults, restoreDatabaseData, validateBackupSchema } from '../db/backup';
import { isSentryEnabled, setSentryEnabled } from '../utils/sentry';
import { RestoreSheetModal } from '../components/RestoreSheetModal';
import { testGoogleSheetsConnection, fetchGoogleSheetBackup, triggerManualSync, extractSpreadsheetId, scheduleAutoSync } from '../utils/googleSheetsSync';
import { normalizeEventTypes } from '../utils/eventTypeUtils';
import { getSupabase, testSupabaseConnection, SUPABASE_PROJECT_ID, SUPABASE_REGION, DEFAULT_SUPABASE_URL } from '../config/supabase';
import { pushAllToSupabase, pullAllFromSupabase, getSyncMetadata } from '../utils/supabaseSync';
import { SupabaseAuthModal } from '../components/SupabaseAuthModal';
import { 
  getSecurityProfile, 
  saveSecurityProfile, 
  removeSecurityProfile, 
  hashPin, 
  verifyPin, 
  generateSalt, 
  INACTIVITY_TIMEOUT_OPTIONS, 
  isWebAuthnAvailable, 
  enrollBiometrics 
} from '../utils/security';

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('business_profile'));

  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    tagline: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    gstin: '',
    logoUrl: '',
    currencySymbol: '₹',
    currencyCode: 'INR',
    invoicePrefix: 'DRF-',
    nextInvoiceSeq: 1,
    defaultTaxRate: 18,
    taxLabel: 'GST',
    defaultPaymentTerms: '',
    bankDetails: {
      accountName: '',
      accountNumber: '',
      bankName: '',
      ifsc: '',
      branch: '',
      upiId: ''
    },
    whatsappMode: 'auto',
    defaultCountryCode: '91',
    whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    whatsappPaidTemplate: DEFAULT_WHATSAPP_PAID_TEMPLATE,
    sheetsBackupEnabled: false,
    sheetsWebAppUrl: '',
    sheetsSyncSecret: 'drfilms_backup_secret_2026',
    sheetsSpreadsheetId: '',
    eventTypes: DEFAULT_SETTINGS.eventTypes,
    defaultDueDays: 7,
    reminderGraceDays: 0,
    reminderTemplates: DEFAULT_SETTINGS.reminderTemplates
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [sentryOptIn, setSentryOptIn] = useState(true);

  useEffect(() => {
    isSentryEnabled().then(res => setSentryOptIn(res));
  }, []);

  // Event Types management state
  const [newEventTypeInput, setNewEventTypeInput] = useState('');
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [editingTypeName, setEditingTypeName] = useState('');

  // Payment Reminders management state
  const [reminderToneTab, setReminderToneTab] = useState('friendly'); // 'friendly' | 'neutral' | 'firm'
  const reminderTextareaRef = useRef(null);

  // Google Sheets Backup State
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isFetchingBackup, setIsFetchingBackup] = useState(false);
  const [backupInfo, setBackupInfo] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [hasCopiedScript, setHasCopiedScript] = useState(false);

  // Supabase Cloud State
  const [isSupabaseAuthOpen, setIsSupabaseAuthOpen] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [supabaseTestStatus, setSupabaseTestStatus] = useState(null);
  const [isPushingSupabase, setIsPushingSupabase] = useState(false);
  const [isPullingSupabase, setIsPullingSupabase] = useState(false);
  const [supabaseSyncMessage, setSupabaseSyncMessage] = useState('');
  const [supabaseSyncMeta, setSupabaseSyncMeta] = useState(getSyncMetadata());

  useEffect(() => {
    try {
      const supabase = getSupabase();
      supabase.auth.getUser().then(({ data: { user } }) => {
        setSupabaseUser(user);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSupabaseUser(session?.user ?? null);
      });
      return () => subscription?.unsubscribe();
    } catch {
      // Ignore initial loading
    }
  }, []);

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseTestStatus(null);
    try {
      const res = await testSupabaseConnection();
      if (res.ok) {
        setSupabaseTestStatus({ ok: true, message: 'Connected to Supabase PostgreSQL database successfully.' });
      } else {
        setSupabaseTestStatus({ ok: false, message: res.error || 'Connection failed' });
      }
    } catch (err) {
      setSupabaseTestStatus({ ok: false, message: err.message });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handlePushSupabase = async () => {
    setIsPushingSupabase(true);
    setSupabaseSyncMessage('');
    try {
      const res = await pushAllToSupabase();
      setSupabaseSyncMeta(getSyncMetadata());
      if (res.ok) {
        setSupabaseSyncMessage(`Successfully backed up ${res.results.totalSynced} record(s) to Supabase Cloud.`);
      } else {
        setSupabaseSyncMessage(`Synced with warnings: ${res.results.errors.join(', ')}`);
      }
    } catch (err) {
      setSupabaseSyncMessage(`Push error: ${err.message}`);
    } finally {
      setIsPushingSupabase(false);
    }
  };

  const handlePullSupabase = async () => {
    if (!window.confirm('Pull from Supabase will merge cloud records into your local database. Continue?')) {
      return;
    }
    setIsPullingSupabase(true);
    setSupabaseSyncMessage('');
    try {
      const res = await pullAllFromSupabase();
      setSupabaseSyncMeta(getSyncMetadata());
      if (res.ok) {
        setSupabaseSyncMessage(`Successfully restored/merged ${res.results.totalImported} record(s) from Supabase Cloud.`);
      } else {
        setSupabaseSyncMessage(`Pull completed with warnings: ${res.results.errors.join(', ')}`);
      }
    } catch (err) {
      setSupabaseSyncMessage(`Pull error: ${err.message}`);
    } finally {
      setIsPullingSupabase(false);
    }
  };

  // Security & App PIN Lock State
  const securityProfile = useLiveQuery(() => db.settings.get('security_profile'));
  const [pinMode, setPinMode] = useState('view'); // 'view' | 'setup' | 'change' | 'remove'
  const [pinForm, setPinForm] = useState({
    newPin: '',
    confirmPin: '',
    currentPin: '',
    timeoutMinutes: '5',
    biometricsEnabled: false
  });
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);
  const [isProcessingPin, setIsProcessingPin] = useState(false);

  const unpaidTextareaRef = useRef(null);
  const paidTextareaRef = useRef(null);
  const [activeTemplateTab, setActiveTemplateTab] = useState('unpaid');
  const [showTemplatePreview, setShowTemplatePreview] = useState(true);

  useEffect(() => {
    if (settings) {
      setFormData({
        businessName: settings.businessName || '',
        ownerName: settings.ownerName || '',
        tagline: settings.tagline || '',
        phone: settings.phone || '',
        email: settings.email || '',
        website: settings.website || '',
        address: settings.address || '',
        gstin: settings.gstin || '',
        logoUrl: settings.logoUrl || '',
        currencySymbol: settings.currencySymbol || '₹',
        currencyCode: settings.currencyCode || 'INR',
        invoicePrefix: settings.invoicePrefix || 'DRF-',
        nextInvoiceSeq: settings.nextInvoiceSeq !== undefined ? settings.nextInvoiceSeq : 1,
        defaultTaxRate: settings.defaultTaxRate !== undefined ? settings.defaultTaxRate : 18,
        taxLabel: settings.taxLabel || 'GST',
        defaultPaymentTerms: settings.defaultPaymentTerms || '',
        bankDetails: {
          accountName: settings.bankDetails?.accountName || '',
          accountNumber: settings.bankDetails?.accountNumber || '',
          bankName: settings.bankDetails?.bankName || '',
          ifsc: settings.bankDetails?.ifsc || '',
          branch: settings.bankDetails?.branch || '',
          upiId: settings.bankDetails?.upiId || ''
        },
        whatsappMode: settings.whatsappMode || 'auto',
        defaultCountryCode: settings.defaultCountryCode !== undefined ? settings.defaultCountryCode : '91',
        whatsappTemplate: settings.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
        whatsappPaidTemplate: settings.whatsappPaidTemplate || DEFAULT_WHATSAPP_PAID_TEMPLATE,
        sheetsBackupEnabled: Boolean(settings.sheetsBackupEnabled),
        sheetsWebAppUrl: settings.sheetsWebAppUrl || '',
        sheetsSyncSecret: (settings.sheetsSyncSecret && !settings.sheetsSyncSecret.startsWith('AKfy')) ? settings.sheetsSyncSecret : 'drfilms_backup_secret_2026',
        sheetsSpreadsheetId: settings.sheetsSpreadsheetId || '',
        eventTypes: normalizeEventTypes(settings.eventTypes || DEFAULT_SETTINGS.eventTypes),
        defaultDueDays: settings.defaultDueDays !== undefined ? settings.defaultDueDays : 7,
        reminderGraceDays: settings.reminderGraceDays !== undefined ? settings.reminderGraceDays : 0,
        reminderTemplates: settings.reminderTemplates || DEFAULT_SETTINGS.reminderTemplates
      });
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        setStorageEstimate(est);
      });
    }
  }, [settings]);

  const insertPlaceholder = (fieldName, ref, placeholder) => {
    const textarea = ref?.current;
    if (textarea) {
      const start = textarea.selectionStart ?? (formData[fieldName] || '').length;
      const end = textarea.selectionEnd ?? start;
      const val = formData[fieldName] || '';
      const newVal = val.substring(0, start) + placeholder + val.substring(end);
      setFormData(prev => ({ ...prev, [fieldName]: newVal }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setFormData(prev => ({
        ...prev,
        [fieldName]: (prev[fieldName] || '') + placeholder
      }));
    }
  };

  const handleResetTemplates = () => {
    if (window.confirm('Reset both WhatsApp message templates back to studio defaults?')) {
      setFormData(prev => ({
        ...prev,
        whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
        whatsappPaidTemplate: DEFAULT_WHATSAPP_PAID_TEMPLATE
      }));
    }
  };

  const renderUnpaidPreview = () => {
    const t = formData.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
    const sym = formData.currencySymbol || '₹';
    let txt = t;
    if (txt.includes('*{invoiceNumber}*')) {
      txt = txt.replace(/\{invoiceNumber\}/g, 'DRF-1042');
    } else {
      txt = txt.replace(/\{invoiceNumber\}/g, '*DRF-1042*');
    }
    txt = txt
      .replace(/\{clientName\}/g, 'Aakash Verma')
      .replace(/\{total\}/g, `${sym}45,000`)
      .replace(/\{balance\}/g, `${sym}22,500`)
      .replace(/\{dueDate\}/g, '22 Oct 2026')
      .replace(/\{date\}/g, '15 Oct 2026')
      .replace(/\{upiId\}/g, formData.bankDetails?.upiId || 'drfilms@hdfcbank')
      .replace(/\{businessName\}/g, formData.businessName || 'DR FILMS')
      .replace(/\{phone\}/g, formData.phone || '+91 98765 43210');
    return txt;
  };

  const renderPaidPreview = () => {
    const t = formData.whatsappPaidTemplate || DEFAULT_WHATSAPP_PAID_TEMPLATE;
    const sym = formData.currencySymbol || '₹';
    let txt = t;
    if (txt.includes('*{invoiceNumber}*')) {
      txt = txt.replace(/\{invoiceNumber\}/g, 'DRF-1042');
    } else {
      txt = txt.replace(/\{invoiceNumber\}/g, '*DRF-1042*');
    }
    txt = txt
      .replace(/\{clientName\}/g, 'Aakash Verma')
      .replace(/\{total\}/g, `${sym}45,000`)
      .replace(/\{date\}/g, '15 Oct 2026')
      .replace(/\{businessName\}/g, formData.businessName || 'DR FILMS')
      .replace(/\{phone\}/g, formData.phone || '+91 98765 43210');
    return txt;
  };

  const formatWhatsAppPreviewText = (text) => {
    const parts = (text || '').split(/(\*[^*]+\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return <strong key={idx} className="font-bold text-white">{part.slice(1, -1)}</strong>;
      }
      return part;
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Please choose an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFormData({ ...formData, logoUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setFormData({ ...formData, logoUrl: '' });
  };

  // --- Event Types Handlers ---
  const handleAddEventType = (e) => {
    if (e) e.preventDefault();
    const trimmed = (newEventTypeInput || '').trim();
    if (!trimmed) return;
    const current = formData.eventTypes || [];
    if (current.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      alert(`Event type "${trimmed}" already exists.`);
      return;
    }
    const newId = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `type-${Date.now()}`;
    const updated = [
      ...current,
      {
        id: newId,
        name: trimmed,
        isHidden: false,
        sortOrder: current.length
      }
    ];
    setFormData(prev => ({ ...prev, eventTypes: updated }));
    setNewEventTypeInput('');
  };

  const handleToggleHideEventType = (id) => {
    setFormData(prev => ({
      ...prev,
      eventTypes: (prev.eventTypes || []).map(t =>
        t.id === id ? { ...t, isHidden: !t.isHidden } : t
      )
    }));
  };

  const handleStartRenameEventType = (type) => {
    setEditingTypeId(type.id);
    setEditingTypeName(type.name);
  };

  const handleSaveRenameEventType = (id) => {
    const trimmed = (editingTypeName || '').trim();
    if (!trimmed) {
      setEditingTypeId(null);
      return;
    }
    setFormData(prev => ({
      ...prev,
      eventTypes: (prev.eventTypes || []).map(t =>
        t.id === id ? { ...t, name: trimmed } : t
      )
    }));
    setEditingTypeId(null);
    setEditingTypeName('');
  };

  const handleMoveEventType = (index, direction) => {
    const types = [...(formData.eventTypes || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= types.length) return;
    const temp = types[index];
    types[index] = types[targetIndex];
    types[targetIndex] = temp;
    const reordered = types.map((t, idx) => ({ ...t, sortOrder: idx }));
    setFormData(prev => ({ ...prev, eventTypes: reordered }));
  };

  const handleResetEventTypes = () => {
    if (window.confirm('Reset event types to studio defaults? (Wedding, Pre-wedding, Engagement, Birthday, Corporate, Baby/Maternity, Product Shoot, Printing Order, Other)\n\nExisting bills will retain their original saved type snapshot.')) {
      setFormData(prev => ({
        ...prev,
        eventTypes: normalizeEventTypes(DEFAULT_SETTINGS.eventTypes)
      }));
    }
  };

  // --- Payment Reminder Templates Handlers ---
  const insertReminderPlaceholder = (placeholder) => {
    const textarea = reminderTextareaRef?.current;
    const currentText = formData.reminderTemplates?.[reminderToneTab] || '';
    if (textarea) {
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? start;
      const newVal = currentText.substring(0, start) + placeholder + currentText.substring(end);
      setFormData(prev => ({
        ...prev,
        reminderTemplates: {
          ...prev.reminderTemplates,
          [reminderToneTab]: newVal
        }
      }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setFormData(prev => ({
        ...prev,
        reminderTemplates: {
          ...prev.reminderTemplates,
          [reminderToneTab]: currentText + placeholder
        }
      }));
    }
  };

  const handleResetReminderTemplates = () => {
    if (window.confirm('Reset all payment reminder message templates back to studio defaults?')) {
      setFormData(prev => ({
        ...prev,
        reminderTemplates: DEFAULT_SETTINGS.reminderTemplates
      }));
    }
  };

  const renderReminderPreview = () => {
    const t = formData.reminderTemplates?.[reminderToneTab] || DEFAULT_SETTINGS.reminderTemplates[reminderToneTab];
    const sym = formData.currencySymbol || '₹';
    let txt = (t || '').replace(/(?:[₹$€£]|Rs\.?)\s*\{amount\}/gi, '{amount}');
    const upi = (formData.bankDetails?.upiId || 'drfilms@hdfcbank').trim();
    let res = txt
      .replace(/\{clientName\}/g, 'Rohit Sharma')
      .replace(/\{invoiceNumber\}/g, 'DRF-1045')
      .replace(/\{amount\}/g, `${sym} 25,000.00`)
      .replace(/\{dueDate\}/g, '12 Oct 2026')
      .replace(/\{daysOverdue\}/g, reminderToneTab === 'friendly' ? '4' : (reminderToneTab === 'neutral' ? '15' : '42'))
      .replace(/\{upiId\}/g, upi)
      .replace(/\{businessName\}/g, formData.businessName || 'DR FILMS');
    return res.replace(/([₹$€£])\s*\1+/g, '$1');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await db.settings.put({
      key: 'business_profile',
      ...formData,
      nextInvoiceSeq: Number(formData.nextInvoiceSeq) >= 0 ? Number(formData.nextInvoiceSeq) : 1,
      defaultTaxRate: Number(formData.defaultTaxRate) || 0,
      defaultDueDays: Number(formData.defaultDueDays) >= 0 ? Number(formData.defaultDueDays) : 7,
      reminderGraceDays: Number(formData.reminderGraceDays) >= 0 ? Number(formData.reminderGraceDays) : 0,
      eventTypes: normalizeEventTypes(formData.eventTypes),
      reminderTemplates: formData.reminderTemplates || DEFAULT_SETTINGS.reminderTemplates,
      sheetsBackupEnabled: Boolean(formData.sheetsBackupEnabled),
      sheetsWebAppUrl: (formData.sheetsWebAppUrl || '').trim(),
      sheetsSyncSecret: (formData.sheetsSyncSecret || '').trim(),
      sheetsSpreadsheetId: (formData.sheetsSpreadsheetId || '').trim()
    });

    scheduleAutoSync(500);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleToggleSheetsBackup = async (checked) => {
    setFormData(prev => ({ ...prev, sheetsBackupEnabled: checked }));
    const current = await db.settings.get('business_profile');
    if (current) {
      await db.settings.update('business_profile', { sheetsBackupEnabled: checked });
    }
    if (checked && formData.sheetsWebAppUrl && formData.sheetsSyncSecret) {
      triggerManualSync();
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testGoogleSheetsConnection(formData.sheetsWebAppUrl, formData.sheetsSyncSecret, formData.sheetsSpreadsheetId);
    setIsTesting(false);
    setTestResult(res);
  };

  const handleManualSync = async () => {
    if (!formData.sheetsWebAppUrl?.trim() || !formData.sheetsSyncSecret?.trim()) {
      alert('Please enter your Google Apps Script Web App URL and Secret Key first.');
      return;
    }

    setIsManualSyncing(true);
    await db.settings.update('business_profile', {
      sheetsBackupEnabled: formData.sheetsBackupEnabled,
      sheetsWebAppUrl: formData.sheetsWebAppUrl.trim(),
      sheetsSyncSecret: formData.sheetsSyncSecret.trim(),
      sheetsSpreadsheetId: (formData.sheetsSpreadsheetId || '').trim()
    });

    const res = await triggerManualSync();
    setIsManualSyncing(false);
    if (res.success) {
      const targetName = res.sheetName ? `to "${res.sheetName}"` : 'successfully';
      alert(`🎉 Google Sheet synchronized ${targetName}!\nInvoices, Payments, Clients, and Services tabs have been updated.`);
    } else {
      alert(`Sync failed: ${res.error || res.reason || 'Check your internet connection and credentials.'}`);
    }
  };

  const handleRestoreFromSheet = async () => {
    if (!formData.sheetsWebAppUrl?.trim() || !formData.sheetsSyncSecret?.trim()) {
      alert('Please enter your Google Apps Script Web App URL and Secret Key first.');
      return;
    }

    setIsFetchingBackup(true);
    const res = await fetchGoogleSheetBackup(formData.sheetsWebAppUrl, formData.sheetsSyncSecret, formData.sheetsSpreadsheetId);
    setIsFetchingBackup(false);

    if (!res.success) {
      alert(`Could not fetch backup from Google Sheet: ${res.error}`);
      return;
    }

    setBackupInfo(res);
    setShowRestoreModal(true);
  };

  const handleConfirmRestore = async (mode, options = {}) => {
    // 1. Automatically download local JSON backup of current data as safety copy
    await exportDatabaseJSON();

    // 2. Perform restore from Google Sheet snapshot
    const res = await restoreDatabaseData(backupInfo.backupData, mode, options);
    setShowRestoreModal(false);

    if (res.success) {
      alert(`Database restored successfully (${mode === 'replace' ? 'Replaced' : 'Merged'})! Restored ${res.count.invoices} invoices and ${res.count.customers} clients.`);
      window.location.reload();
    } else {
      alert(`Restore failed: ${res.error}`);
    }
  };

  const handleDismissNotice = async () => {
    await db.settings.update('business_profile', { sheetsNoticeDismissed: true });
  };

  const handleCopyScript = () => {
    const code = `/**
 * =========================================================================
 * DR FILMS BILLING SOFTWARE — GOOGLE APPS SCRIPT BACKUP WEB APP
 * =========================================================================
 */
var DEFAULT_SECRET = "drfilms_backup_secret_2026";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Empty request payload" });
    }
    var payload = JSON.parse(e.postData.contents);
    var secret = payload.secret;
    var action = payload.action;

    var expectedSecret = PropertiesService.getScriptProperties().getProperty("BACKUP_SECRET") || DEFAULT_SECRET;
    if (!secret || secret !== expectedSecret) {
      return jsonResponse({ success: false, error: "Unauthorized: Invalid or missing secret key" });
    }

    var ss = null;
    var targetSheetId = (payload.sheetId || payload.spreadsheetId || "").toString().trim();

    if (targetSheetId.indexOf("/d/") !== -1) {
      var match = targetSheetId.match(/\\/d\\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) targetSheetId = match[1];
    }

    if (targetSheetId) {
      try {
        ss = SpreadsheetApp.openById(targetSheetId);
      } catch (errOpen) {
        return jsonResponse({
          success: false,
          error: "Could not open Google Sheet with ID '" + targetSheetId + "': " + errOpen.message
        });
      }
    }

    if (!ss) {
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
    }

    if (!ss) {
      return jsonResponse({
        success: false,
        error: "No Google Sheet found. Please provide 'sheetId' or create this script inside your spreadsheet via Extensions > Apps Script."
      });
    }

    if (action === "ping") {
      return jsonResponse({ 
        success: true, 
        message: "Connected to Google Sheet successfully!", 
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === "syncAll") {
      var tables = payload.tables || {};
      for (var tableName in tables) {
        if (tables.hasOwnProperty(tableName)) {
          var table = tables[tableName];
          if (tableName === "Invoices") {
            upsertInvoicesTable(ss, table.headers, table.rows);
          } else if (tableName === "Payments") {
            upsertPaymentsTable(ss, table.headers, table.rows);
          } else if (tableName === "Deleted Bills") {
            updateDeletedBillsTab(ss, table.headers, table.rows);
          } else {
            updateStandardTable(ss, tableName, table.headers, table.rows);
          }
        }
      }

      try {
        var defaultSheet = ss.getSheetByName("Sheet1");
        if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
          ss.deleteSheet(defaultSheet);
        }
      } catch (e) {}

      if (payload.backupJson) {
        saveRawBackupJson(ss, payload.backupJson);
        saveBackupHistory(ss, payload.backupJson);
      }
      return jsonResponse({
        success: true,
        message: "All tables and backup snapshot synchronized successfully",
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        syncedAt: new Date().toISOString()
      });
    }

    if (action === "getBackup") {
      var backupJson = loadRawBackupJson(ss);
      if (!backupJson) {
        return jsonResponse({ success: false, error: "No backup snapshot found in '" + ss.getName() + "'. Click 'Sync now' first." });
      }
      return jsonResponse({ 
        success: true, 
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        backupJson: backupJson 
      });
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function formatHeaderRow(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a");
  headerRange.setFontColor("#f8fafc");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

function formatDataRow(sheet, rowIndex, numCols, recordStatusVal) {
  var rowRange = sheet.getRange(rowIndex, 1, 1, numCols);
  rowRange.setWrap(true);
  rowRange.setVerticalAlignment("top");
  var status = String(recordStatusVal || '').toLowerCase();
  if (status.indexOf('deleted') !== -1) {
    rowRange.setBackground("#fee2e2");
    rowRange.setFontColor("#991b1b");
  } else {
    rowRange.setBackground(rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff");
    rowRange.setFontColor("#0f172a");
  }
}

function applySheetStyling(sheet, headers) {
  try {
    for (var c = 1; c <= Math.min(headers.length, 25); c++) {
      sheet.autoResizeColumn(c);
      var headerText = String(headers[c - 1] || '');
      if (headerText.toLowerCase().includes('items summary') || headerText.toLowerCase().includes('service / description')) {
        if (sheet.getColumnWidth(c) < 350) sheet.setColumnWidth(c, 450);
      }
    }
  } catch (errResize) {}
}

function upsertInvoicesTable(ss, headers, rows) {
  var sheet = ss.getSheetByName("Invoices");
  if (!sheet) sheet = ss.insertSheet("Invoices");
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var invColIdx = 0;
  var recordStatusIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase() === 'record status') {
      recordStatusIdx = h;
      break;
    }
  }

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var invKey = String(existingVals[r][invColIdx] || '').trim();
      if (invKey) existingMap[invKey] = r + 2;
    }
  }

  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[invColIdx] || '').trim();
      var targetRow = existingMap[key];
      if (targetRow) {
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
        formatDataRow(sheet, targetRow, row.length, row[recordStatusIdx]);
      } else {
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;
        formatDataRow(sheet, nextRow, row.length, row[recordStatusIdx]);
      }
    }
  }
  applySheetStyling(sheet, headers);
}

function upsertPaymentsTable(ss, headers, rows) {
  var sheet = ss.getSheetByName("Payments");
  if (!sheet) sheet = ss.insertSheet("Payments");
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var paymentIdIdx = 0;
  var recordStatusIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase() === 'record status') {
      recordStatusIdx = h;
      break;
    }
  }

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var pmtKey = String(existingVals[r][paymentIdIdx] || '').trim();
      if (pmtKey) existingMap[pmtKey] = r + 2;
    }
  }

  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[paymentIdIdx] || '').trim();
      var targetRow = existingMap[key];
      if (targetRow) {
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
        formatDataRow(sheet, targetRow, row.length, row[recordStatusIdx]);
      } else {
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;
        formatDataRow(sheet, nextRow, row.length, row[recordStatusIdx]);
      }
    }
  }
  applySheetStyling(sheet, headers);
}

function updateDeletedBillsTab(ss, headers, rows) {
  var sheet = ss.getSheetByName("Deleted Bills");
  if (!sheet) sheet = ss.insertSheet("Deleted Bills");
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var invKey = String(existingVals[r][0] || '').trim();
      if (invKey) existingMap[invKey] = r + 2;
    }
  }

  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[0] || '').trim();
      var targetRow = existingMap[key];
      if (targetRow) {
        var restoredAt = row[9];
        var notes = row[10];
        if (restoredAt) sheet.getRange(targetRow, 10).setValue(restoredAt);
        if (notes) sheet.getRange(targetRow, 11).setValue(notes);
      } else {
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;
        var newRange = sheet.getRange(nextRow, 1, 1, row.length);
        newRange.setBackground("#fff1f2");
        newRange.setFontColor("#991b1b");
        newRange.setWrap(true);
        newRange.setVerticalAlignment("top");
      }
    }
  }
  applySheetStyling(sheet, headers);
}

function updateStandardTable(ss, sheetName, headers, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }
  if (!headers || headers.length === 0) return;
  var data = [headers];
  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) data.push(rows[i]);
  }
  var range = sheet.getRange(1, 1, data.length, headers.length);
  range.setValues(data);
  range.setWrap(true);
  range.setVerticalAlignment("top");
  formatHeaderRow(sheet, headers.length);
  if (rows && rows.length > 0) {
    for (var r = 2; r <= data.length; r++) {
      var rowRange = sheet.getRange(r, 1, 1, headers.length);
      rowRange.setBackground(r % 2 === 0 ? "#f8fafc" : "#ffffff");
    }
  }
  applySheetStyling(sheet, headers);
}

function saveRawBackupJson(ss, jsonStr) {
  var sheet = ss.getSheetByName("_BACKUP_DATA");
  if (!sheet) {
    sheet = ss.insertSheet("_BACKUP_DATA");
    try { sheet.hideSheet(); } catch (e) {}
  } else {
    sheet.clear();
  }
  var chunkSize = 30000;
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += chunkSize) {
    chunks.push([jsonStr.substring(i, i + chunkSize)]);
  }
  if (chunks.length > 0) {
    sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
  }
}

function saveBackupHistory(ss, jsonStr) {
  var sheet = ss.getSheetByName("_BackupHistory");
  var headers = ["Snapshot Date", "Timestamp", "Chunk Index", "Total Chunks", "JSON Chunk"];
  if (!sheet) {
    sheet = ss.insertSheet("_BackupHistory");
    try { sheet.hideSheet(); } catch (e) {}
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }
  var todayDateStr = new Date().toISOString().split("T")[0];
  var nowTimestamp = new Date().toISOString();
  var chunkSize = 30000;
  var chunks = [];
  for (var c = 0; c < jsonStr.length; c += chunkSize) {
    chunks.push(jsonStr.substring(c, c + chunkSize));
  }
  var totalChunks = chunks.length;
  var lastRow = sheet.getLastRow();
  var rowsToKeep = [];
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  var cutoffDateStr = cutoffDate.toISOString().split("T")[0];

  if (lastRow > 1) {
    var existingHistory = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < existingHistory.length; i++) {
      var row = existingHistory[i];
      var snapshotDate = String(row[0] || '').trim();
      if (snapshotDate >= cutoffDateStr && snapshotDate !== todayDateStr) {
        rowsToKeep.push(row);
      }
    }
  }

  for (var k = 0; k < chunks.length; k++) {
    rowsToKeep.push([todayDateStr, nowTimestamp, k + 1, totalChunks, chunks[k]]);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);
  if (rowsToKeep.length > 0) {
    sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  }
}

function loadRawBackupJson(ss) {
  var sheet = ss.getSheetByName("_BACKUP_DATA");
  if (sheet && sheet.getLastRow() > 0) {
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(1, 1, lastRow, 1).getValues();
    var result = "";
    for (var i = 0; i < values.length; i++) result += values[i][0];
    if (result && result.trim().length > 0) return result;
  }
  var historySheet = ss.getSheetByName("_BackupHistory");
  if (historySheet && historySheet.getLastRow() > 1) {
    var hVals = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 5).getValues();
    if (hVals.length > 0) {
      var latestDate = "";
      for (var j = 0; j < hVals.length; j++) {
        var d = String(hVals[j][0] || '');
        if (d > latestDate) latestDate = d;
      }
      var latestChunks = hVals.filter(function(r) { return String(r[0]) === latestDate; });
      latestChunks.sort(function(a, b) { return Number(a[2]) - Number(b[2]); });
      var histResult = "";
      for (var k = 0; k < latestChunks.length; k++) histResult += latestChunks[k][4];
      if (histResult) return histResult;
    }
  }
  return null;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse({
    success: true,
    message: "DR FILMS Google Sheets Sync Service is active."
  });
}`;

    navigator.clipboard.writeText(code).then(() => {
      setHasCopiedScript(true);
      setTimeout(() => setHasCopiedScript(false), 3000);
    }).catch(() => {
      alert('Could not copy to clipboard automatically. You can copy it from scripts/googleAppsScript.gs');
    });
  };

  const handleCopyDiagnostics = async () => {
    let storage = { usageMB: '0.00', quotaMB: '0.00' };
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        storage = {
          usageMB: est.usage ? (est.usage / (1024 * 1024)).toFixed(2) : '0.00',
          quotaMB: est.quota ? (est.quota / (1024 * 1024)).toFixed(2) : '0.00'
        };
      } catch {
        // ignore
      }
    }

    let invoiceCount = 0;
    let customerCount = 0;
    let serviceCount = 0;
    let chargeCount = 0;
    let expenseCount = 0;
    let projectCount = 0;

    try {
      if (db.invoices) invoiceCount = await db.invoices.count();
      if (db.customers) customerCount = await db.customers.count();
      if (db.services) serviceCount = await db.services.count();
      if (db.customCharges) chargeCount = await db.customCharges.count();
      if (db.expenses) expenseCount = await db.expenses.count();
      if (db.projects) projectCount = await db.projects.count();
    } catch {
      // ignore
    }

    let lastBackup = 'Never';
    try {
      const rec = await db.settings.get('last_backup_timestamp');
      if (rec?.value) lastBackup = rec.value;
    } catch {
      // ignore
    }

    const diagnosticReport = {
      app: 'DR FILMS BILLING SOFTWARE',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      platform: {
        online: navigator.onLine,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        origin: typeof window !== 'undefined' ? window.location.origin : ''
      },
      storage: storage,
      databaseMetrics: {
        invoices: invoiceCount,
        customers: customerCount,
        services: serviceCount,
        customCharges: chargeCount,
        expenses: expenseCount,
        projects: projectCount
      },
      backupStatus: {
        lastBackupTimestamp: lastBackup,
        googleSheetsConfigured: Boolean(formData?.sheetsWebAppUrl)
      },
      privacyCompliance: 'Zero customer PII (names, phones, emails, addresses) and zero financial transaction figures are included in this diagnostic report.'
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticReport, null, 2));
      setDiagnosticsCopied(true);
      setTimeout(() => setDiagnosticsCopied(false), 3000);
    } catch {
      alert('Could not copy diagnostics to clipboard.');
    }
  };

  const handleToggleSentry = async (e) => {
    const nextVal = e.target.checked;
    setSentryOptIn(nextVal);
    await setSentryEnabled(nextVal);
  };

  const handleExportBackup = async () => {
    await exportDatabaseJSON();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        alert('Invalid backup file: File content is not valid JSON.');
        e.target.value = '';
        return;
      }

      // Schema validation check before any state change
      const schemaCheck = validateBackupSchema(parsed);
      if (!schemaCheck.valid) {
        alert(`Backup schema validation failed: ${schemaCheck.error}\n\nRestoration aborted to protect database integrity.`);
        e.target.value = '';
        return;
      }

      const counts = schemaCheck.counts;
      const confirmMsg = `Backup file validated successfully!\n\nRecords to restore:\n- Invoices: ${counts.invoices}\n- Clients: ${counts.customers}\n- Services: ${counts.services}\n- Custom Charges: ${counts.customCharges}\n- Expenses: ${counts.expenses}\n- Projects: ${counts.projects}\n\nWARNING: Restoring will overwrite current IndexedDB data with this backup.\n\nDo you want to proceed with full database restore?`;

      if (!window.confirm(confirmMsg)) {
        e.target.value = '';
        return;
      }

      setIsImporting(true);
      try {
        const res = await restoreDatabaseData(parsed, 'replace');
        if (res.success) {
          alert(`Database restored successfully! Loaded ${res.count.invoices} invoices and ${res.count.customers} clients.`);
          window.location.reload();
        } else {
          alert(`Restore failed: ${res.error}`);
        }
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Reset app database to initial studio seeds? This will delete custom invoices and test records!')) {
      if (window.confirm('Please confirm again: ALL unsaved invoices will be deleted.')) {
        await resetDatabaseToDefaults();
        alert('Database reset to fresh defaults.');
        window.location.reload();
      }
    }
  };

  // Security & WebAuthn Initialization
  useEffect(() => {
    isWebAuthnAvailable().then(supported => setIsWebAuthnSupported(supported));
  }, []);

  useEffect(() => {
    if (securityProfile) {
      setPinForm(prev => ({
        ...prev,
        timeoutMinutes: securityProfile.timeoutMinutes || '5',
        biometricsEnabled: Boolean(securityProfile.biometricsEnabled)
      }));
    }
  }, [securityProfile]);

  const handleSetupPin = async (e) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    const pin = pinForm.newPin.trim();
    const confirm = pinForm.confirmPin.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      setPinError('PIN must be 4 to 6 numbers (digits 0-9 only).');
      return;
    }
    if (pin !== confirm) {
      setPinError('New PIN and Confirm PIN do not match.');
      return;
    }

    setIsProcessingPin(true);
    try {
      let credentialId = null;
      if (pinForm.biometricsEnabled && isWebAuthnSupported) {
        try {
          credentialId = await enrollBiometrics(formData.businessName || 'DR FILMS Studio');
        } catch (bioErr) {
          console.warn('Biometric registration was skipped or cancelled:', bioErr);
        }
      }

      const salt = generateSalt(16);
      const pinHash = await hashPin(pin, salt);

      await saveSecurityProfile({
        isEnabled: true,
        pinHash,
        salt,
        timeoutMinutes: pinForm.timeoutMinutes || '5',
        biometricsEnabled: Boolean(pinForm.biometricsEnabled && credentialId),
        credentialId
      });

      setPinSuccess('PIN lock enabled successfully!');
      setPinForm(prev => ({ ...prev, newPin: '', confirmPin: '', currentPin: '' }));
      setPinMode('view');
      setTimeout(() => setPinSuccess(''), 4000);
    } catch (err) {
      setPinError('Failed to enable PIN: ' + err.message);
    } finally {
      setIsProcessingPin(false);
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (!securityProfile) return;

    const curr = pinForm.currentPin.trim();
    const pin = pinForm.newPin.trim();
    const confirm = pinForm.confirmPin.trim();

    if (!curr) {
      setPinError('Please enter your current PIN.');
      return;
    }

    setIsProcessingPin(true);
    try {
      const isValid = await verifyPin(curr, securityProfile.salt, securityProfile.pinHash);
      if (!isValid) {
        setPinError('Current PIN is incorrect.');
        setIsProcessingPin(false);
        return;
      }

      if (!/^\d{4,6}$/.test(pin)) {
        setPinError('New PIN must be 4 to 6 numbers (digits 0-9 only).');
        setIsProcessingPin(false);
        return;
      }

      if (pin !== confirm) {
        setPinError('New PIN and Confirm PIN do not match.');
        setIsProcessingPin(false);
        return;
      }

      const newSalt = generateSalt(16);
      const newHash = await hashPin(pin, newSalt);

      await saveSecurityProfile({
        ...securityProfile,
        pinHash: newHash,
        salt: newSalt
      });

      setPinSuccess('PIN changed successfully!');
      setPinForm(prev => ({ ...prev, newPin: '', confirmPin: '', currentPin: '' }));
      setPinMode('view');
      setTimeout(() => setPinSuccess(''), 4000);
    } catch (err) {
      setPinError('Failed to change PIN: ' + err.message);
    } finally {
      setIsProcessingPin(false);
    }
  };

  const handleRemovePin = async (e) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (!securityProfile) return;

    const curr = pinForm.currentPin.trim();
    if (!curr) {
      setPinError('Please enter your current PIN to confirm removal.');
      return;
    }

    setIsProcessingPin(true);
    try {
      const isValid = await verifyPin(curr, securityProfile.salt, securityProfile.pinHash);
      if (!isValid) {
        setPinError('Current PIN is incorrect.');
        setIsProcessingPin(false);
        return;
      }

      const confirmed = window.confirm(
        'Are you sure you want to disable App PIN lock?\n\n' +
        'Anyone with access to this device will be able to view invoices, client details, and financial reports.'
      );
      if (!confirmed) {
        setIsProcessingPin(false);
        return;
      }

      await removeSecurityProfile();
      setPinSuccess('PIN lock removed successfully.');
      setPinForm({ newPin: '', confirmPin: '', currentPin: '', timeoutMinutes: '5', biometricsEnabled: false });
      setPinMode('view');
      setTimeout(() => setPinSuccess(''), 4000);
    } catch (err) {
      setPinError('Failed to remove PIN: ' + err.message);
    } finally {
      setIsProcessingPin(false);
    }
  };

  const handleUpdateTimeout = async (newTimeout) => {
    if (!securityProfile) return;
    try {
      await saveSecurityProfile({
        ...securityProfile,
        timeoutMinutes: newTimeout
      });
      setPinForm(prev => ({ ...prev, timeoutMinutes: newTimeout }));
    } catch (err) {
      console.error('Failed to update timeout:', err);
    }
  };

  const handleToggleBiometrics = async (enabled) => {
    if (!securityProfile) return;
    setIsProcessingPin(true);
    try {
      let credentialId = securityProfile.credentialId;
      if (enabled && !credentialId && isWebAuthnSupported) {
        credentialId = await enrollBiometrics(formData.businessName || 'DR FILMS Studio');
      }
      await saveSecurityProfile({
        ...securityProfile,
        biometricsEnabled: enabled,
        credentialId: enabled ? credentialId : null
      });
      setPinForm(prev => ({ ...prev, biometricsEnabled: enabled }));
    } catch (err) {
      console.error('Failed to toggle biometrics:', err);
      alert('Biometric setup failed or was cancelled: ' + err.message);
    } finally {
      setIsProcessingPin(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-amber-400" />
            <span>Studio Settings & Configuration</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Customize business profile, payment coordinates, invoice prefix, and offline backup.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
            <CheckCircle className="w-4 h-4" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card 1: Business Profile & Logo */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Building className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Business Profile & Studio Branding
            </h3>
          </div>

          {/* Logo upload row */}
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
            <div className="w-20 h-20 rounded-2xl bg-slate-950 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden shrink-0 relative group">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Clapperboard className="w-8 h-8 text-amber-400/80" />
              )}
            </div>

            <div className="space-y-1.5 text-center sm:text-left flex-1">
              <h4 className="text-sm font-semibold text-slate-200">Studio Logo</h4>
              <p className="text-xs text-slate-400">
                Printed on invoice header. Recommending square or landscape PNG/JPG under 2MB.
              </p>
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 transition-colors">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Upload Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="text-xs text-rose-400 hover:underline px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Owner / Proprietor Name
              </label>
              <input
                type="text"
                value={formData.ownerName || ''}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-medium"
                placeholder="e.g. Deepak Rochwani"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tagline / Creative Specialty
            </label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
              placeholder="e.g. Creative Studio • Photography • Film Production"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                GSTIN / Tax Registration ID
              </label>
              <input
                type="text"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase"
                placeholder="27AABBD1234F1Z8"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Studio Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
              placeholder="Studio street address, city, state, postal code"
            />
          </div>
        </div>

        {/* Card 2: Invoicing & Financial Preferences */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Invoicing & Numbering Preferences
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Currency Symbol
              </label>
              <input
                type="text"
                value={formData.currencySymbol}
                onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-center"
                placeholder="₹ or $"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Invoice Prefix
              </label>
              <input
                type="text"
                value={formData.invoicePrefix}
                onChange={(e) => setFormData({ ...formData, invoicePrefix: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase"
                placeholder="DRF-"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Next Invoice #
              </label>
              <input
                type="number"
                value={formData.nextInvoiceSeq}
                onChange={(e) => setFormData({ ...formData, nextInvoiceSeq: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Tax Rate (%)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={formData.defaultTaxRate}
                onChange={(e) => setFormData({ ...formData, defaultTaxRate: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
                placeholder="18"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Default Payment Terms (Printed on Invoice)
            </label>
            <textarea
              rows="2"
              value={formData.defaultPaymentTerms}
              onChange={(e) => setFormData({ ...formData, defaultPaymentTerms: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-xs resize-none"
              placeholder="e.g. Payment due within 7 days. 50% advance booking deposit."
            />
          </div>
        </div>

        {/* Card 3: Bank Details & UPI QR Code */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <QrCode className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Payment Coordinates & UPI QR Code
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                UPI ID (Generates Scan-to-Pay QR on Bill)
              </label>
              <input
                type="text"
                value={formData.bankDetails.upiId}
                onChange={(e) => setFormData({
                  ...formData,
                  bankDetails: { ...formData.bankDetails, upiId: e.target.value }
                })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono text-emerald-400 font-semibold"
                placeholder="drfilms@okaxis or drfilms@upi"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Bank Name
              </label>
              <input
                type="text"
                value={formData.bankDetails.bankName}
                onChange={(e) => setFormData({
                  ...formData,
                  bankDetails: { ...formData.bankDetails, bankName: e.target.value }
                })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                placeholder="HDFC Bank, ICICI Bank, SBI, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Account Holder Name
              </label>
              <input
                type="text"
                value={formData.bankDetails.accountName}
                onChange={(e) => setFormData({
                  ...formData,
                  bankDetails: { ...formData.bankDetails, accountName: e.target.value }
                })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                placeholder="DR FILMS or Your Name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Account Number
              </label>
              <input
                type="text"
                value={formData.bankDetails.accountNumber}
                onChange={(e) => setFormData({
                  ...formData,
                  bankDetails: { ...formData.bankDetails, accountNumber: e.target.value }
                })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
                placeholder="00123456789"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                IFSC Code
              </label>
              <input
                type="text"
                value={formData.bankDetails.ifsc}
                onChange={(e) => setFormData({
                  ...formData,
                  bankDetails: { ...formData.bankDetails, ifsc: e.target.value }
                })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase"
                placeholder="HDFC0001234"
              />
            </div>
          </div>
        </div>

        {/* Card: Event & Shoot Types */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clapperboard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Event & Shoot Types</span>
                  <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Catalog
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage photography and shoot event categories. Renaming or hiding a type only affects future selections; existing bills keep their saved snapshot.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetEventTypes}
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-amber-400 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-colors self-start sm:self-auto"
              title="Reset to 9 standard studio defaults"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Defaults</span>
            </button>
          </div>

          {/* Quick Add Form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newEventTypeInput}
              onChange={(e) => setNewEventTypeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddEventType();
                }
              }}
              placeholder="Add new event type (e.g. Fashion Portfolio, Music Video...)"
              className="flex-1 glass-input px-3.5 py-2 rounded-xl text-sm"
            />
            <button
              type="button"
              onClick={handleAddEventType}
              className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Type</span>
            </button>
          </div>

          {/* Event Types List */}
          <div className="space-y-2">
            {(formData.eventTypes || []).map((type, idx) => (
              <div
                key={type.id || idx}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  type.isHidden
                    ? 'bg-slate-950/40 border-slate-800/40 opacity-60'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveEventType(idx, 'up')}
                      className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                      title="Move up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === (formData.eventTypes.length - 1)}
                      onClick={() => handleMoveEventType(idx, 'down')}
                      className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                      title="Move down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Name (editable inline or click to edit) */}
                  {editingTypeId === type.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        autoFocus
                        value={editingTypeName}
                        onChange={(e) => setEditingTypeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRenameEventType(type.id);
                          } else if (e.key === 'Escape') {
                            setEditingTypeId(null);
                          }
                        }}
                        className="glass-input px-2.5 py-1 rounded-lg text-sm flex-1 font-medium text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRenameEventType(type.id)}
                        className="px-2.5 py-1 text-xs bg-amber-500 text-slate-950 font-bold rounded-lg hover:bg-amber-400"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTypeId(null)}
                        className="px-2.5 py-1 text-xs bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="font-semibold text-sm text-slate-200 truncate">
                        {type.name}
                      </span>
                      {type.isHidden && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          Hidden from dropdowns
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions: Edit / Hide / Show */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {editingTypeId !== type.id && (
                    <button
                      type="button"
                      onClick={() => handleStartRenameEventType(type)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      title="Rename this event type"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleHideEventType(type.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      type.isHidden
                        ? 'text-amber-400 hover:bg-amber-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title={type.isHidden ? 'Unhide this type in bill creation' : 'Hide this type from bill creation'}
                  >
                    {type.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: WhatsApp Message Templates & Customizer */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>WhatsApp Message Templates</span>
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Plain Text Only
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customize the greeting, payment details, and sign-off text. Emojis are removed to avoid broken characters.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowTemplatePreview(!showTemplatePreview)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-100 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                title="Toggle Realtime Message Preview"
              >
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span>{showTemplatePreview ? 'Hide Preview' : 'Show Preview'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetTemplates}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-rose-400 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 transition-colors"
                title="Reset to default studio templates"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>

          {/* WhatsApp Mode & Country Code Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800/80">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                WhatsApp Mode
              </label>
              <select
                value={formData.whatsappMode || 'auto'}
                onChange={(e) => setFormData({ ...formData, whatsappMode: e.target.value })}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
              >
                <option value="auto">Auto (default)</option>
                <option value="web">Always WhatsApp Web</option>
                <option value="share_sheet">Always Share Sheet</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Auto uses native share sheet on mobile and downloads PDF + opens WhatsApp Web on desktop.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Default Country Code
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-mono">+</span>
                <input
                  type="text"
                  value={formData.defaultCountryCode !== undefined ? formData.defaultCountryCode : '91'}
                  onChange={(e) => setFormData({ ...formData, defaultCountryCode: e.target.value.replace(/[^0-9]/g, '') })}
                  className="w-full glass-input pl-8 pr-3.5 py-2.5 rounded-xl text-sm font-mono"
                  placeholder="91"
                  maxLength={5}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Prepended to client mobile numbers when country code is missing (default: 91).
              </p>
            </div>
          </div>

          {/* Template Switch Tabs */}
          <div className="flex border-b border-slate-800 gap-2">
            <button
              type="button"
              onClick={() => setActiveTemplateTab('unpaid')}
              className={`pb-2.5 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTemplateTab === 'unpaid'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Pending / Partial Balance Template</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTemplateTab('paid')}
              className={`pb-2.5 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTemplateTab === 'paid'
                  ? 'border-emerald-400 text-emerald-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Fully Paid Invoice Template</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">Paid</span>
            </button>
          </div>

          {activeTemplateTab === 'unpaid' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Pending / Balance Due Message
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Keep *bold* only around invoice number
                  </span>
                </div>

                {/* Available Placeholders */}
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 mb-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Click placeholder to insert at cursor:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { key: '{clientName}', label: 'Client Name' },
                      { key: '{invoiceNumber}', label: 'Invoice #' },
                      { key: '{total}', label: 'Total Amount' },
                      { key: '{balance}', label: 'Balance Due' },
                      { key: '{dueDate}', label: 'Due Date' },
                      { key: '{date}', label: 'Invoice Date' },
                      { key: '{upiId}', label: 'UPI ID' },
                      { key: '{businessName}', label: 'Business Name' },
                      { key: '{phone}', label: 'Phone' }
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => insertPlaceholder('whatsappTemplate', unpaidTextareaRef, item.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/50 border border-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                        title={`Insert ${item.label}`}
                      >
                        <span className="text-amber-400 font-bold">+</span>
                        <span>{item.key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className={showTemplatePreview ? 'lg:col-span-7' : 'lg:col-span-12'}>
                    <textarea
                      ref={unpaidTextareaRef}
                      rows="11"
                      value={formData.whatsappTemplate}
                      onChange={(e) => setFormData({ ...formData, whatsappTemplate: e.target.value })}
                      className="w-full glass-input px-3.5 py-3 rounded-xl text-xs font-mono text-slate-200 resize-y leading-relaxed"
                      placeholder="Enter unpaid invoice message template..."
                    />
                  </div>

                  {showTemplatePreview && (
                    <div className="lg:col-span-5 flex flex-col">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>WhatsApp Preview (Sample)</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Live Simulated</span>
                      </div>
                      <div className="flex-1 bg-[#0b141a] p-3.5 rounded-xl border border-slate-800 flex flex-col justify-center">
                        <div className="bg-[#005c4b] text-emerald-50 rounded-xl p-3.5 text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-md border border-[#005c4b]/50">
                          {formatWhatsAppPreviewText(renderUnpaidPreview())}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Fully Paid Invoice Message ("Payment received, thank you")
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Omit balance due and UPI lines
                  </span>
                </div>

                {/* Available Placeholders */}
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 mb-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>Click placeholder to insert at cursor:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { key: '{clientName}', label: 'Client Name' },
                      { key: '{invoiceNumber}', label: 'Invoice #' },
                      { key: '{total}', label: 'Total Amount' },
                      { key: '{date}', label: 'Invoice Date' },
                      { key: '{businessName}', label: 'Business Name' },
                      { key: '{phone}', label: 'Phone' }
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => insertPlaceholder('whatsappPaidTemplate', paidTextareaRef, item.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/50 border border-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                        title={`Insert ${item.label}`}
                      >
                        <span className="text-emerald-400 font-bold">+</span>
                        <span>{item.key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className={showTemplatePreview ? 'lg:col-span-7' : 'lg:col-span-12'}>
                    <textarea
                      ref={paidTextareaRef}
                      rows="10"
                      value={formData.whatsappPaidTemplate}
                      onChange={(e) => setFormData({ ...formData, whatsappPaidTemplate: e.target.value })}
                      className="w-full glass-input px-3.5 py-3 rounded-xl text-xs font-mono text-slate-200 resize-y leading-relaxed"
                      placeholder="Enter paid invoice message template..."
                    />
                  </div>

                  {showTemplatePreview && (
                    <div className="lg:col-span-5 flex flex-col">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>WhatsApp Preview (Sample)</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Live Simulated</span>
                      </div>
                      <div className="flex-1 bg-[#0b141a] p-3.5 rounded-xl border border-slate-800 flex flex-col justify-center">
                        <div className="bg-[#005c4b] text-emerald-50 rounded-xl p-3.5 text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-md border border-[#005c4b]/50">
                          {formatWhatsAppPreviewText(renderPaidPreview())}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card: Payment Reminders & Due Rules */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Payment Reminders & Due Dates</span>
                  <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    3 Tones
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure default invoice due terms and polite WhatsApp reminders for overdue payments (no emojis).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetReminderTemplates}
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-amber-400 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-colors self-start sm:self-auto"
              title="Reset reminder templates to defaults"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Templates</span>
            </button>
          </div>

          {/* Due Days & Grace Period Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800/80">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Default Due Days for New Invoices
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={formData.defaultDueDays}
                  onChange={(e) => setFormData({ ...formData, defaultDueDays: e.target.value })}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
                  placeholder="7"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                  days after invoice date
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Sets default due date to Invoice Date + X days when creating a new bill.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Reminder Grace Days
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={formData.reminderGraceDays}
                  onChange={(e) => setFormData({ ...formData, reminderGraceDays: e.target.value })}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono"
                  placeholder="0"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                  grace days before overdue
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Extra days after due date before marking a bill overdue on Dashboard.
              </p>
            </div>
          </div>

          {/* Tone Selector Tabs */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setReminderToneTab('friendly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    reminderToneTab === 'friendly'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Friendly (1–7 days)
                </button>
                <button
                  type="button"
                  onClick={() => setReminderToneTab('neutral')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    reminderToneTab === 'neutral'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Neutral (8–30 days)
                </button>
                <button
                  type="button"
                  onClick={() => setReminderToneTab('firm')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    reminderToneTab === 'firm'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Firm (&gt;30 days)
                </button>
              </div>

              <span className="text-[11px] text-slate-500">
                Tone is auto-picked by days overdue; can be overridden per reminder.
              </span>
            </div>

            {/* Placeholders Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              <span className="text-[11px] font-medium text-slate-500 mr-1">Insert Placeholder:</span>
              {[
                '{clientName}',
                '{invoiceNumber}',
                '{amount}',
                '{dueDate}',
                '{daysOverdue}',
                '{upiId}',
                '{businessName}'
              ].map((ph) => (
                <button
                  key={ph}
                  type="button"
                  onClick={() => insertReminderPlaceholder(ph)}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 transition-colors"
                >
                  {ph}
                </button>
              ))}
            </div>

            {/* Textarea & Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Template for {reminderToneTab.toUpperCase()} Reminder
                </label>
                <textarea
                  ref={reminderTextareaRef}
                  rows="6"
                  value={formData.reminderTemplates?.[reminderToneTab] || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    reminderTemplates: {
                      ...formData.reminderTemplates,
                      [reminderToneTab]: e.target.value
                    }
                  })}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs font-mono resize-none leading-relaxed"
                  placeholder="Enter reminder template without emojis..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Message Preview (as sent to WhatsApp)
                </label>
                <div className="bg-[#0b141a] p-3 rounded-xl border border-slate-800 h-[140px] flex flex-col justify-center">
                  <div className="bg-[#005c4b] text-emerald-50 rounded-xl p-3 text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-md border border-[#005c4b]/50 overflow-y-auto max-h-[120px]">
                    {renderReminderPreview()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm py-3 px-6 rounded-2xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>

      {/* Card 4: Google Sheets Backup (Cloud Mirror) */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 font-display">
                  Google Sheets Backup
                </h3>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Cloud Mirror
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically sync invoices, client directory, services & payments to your private Google Sheet
              </p>
            </div>
          </div>

          {/* On/Off Switch & Status Badge */}
          <div className="flex items-center gap-3 self-end sm:self-center">
            {/* Status Pill */}
            {(() => {
              const status = settings?.sheetsLastSyncStatus || 'idle';
              if (!formData.sheetsBackupEnabled) {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800">
                    <span className="w-2 h-2 rounded-full bg-slate-600" />
                    Disabled
                  </span>
                );
              }
              if (status === 'syncing' || isManualSyncing) {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    Syncing
                  </span>
                );
              }
              if (status === 'synced') {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Synced
                  </span>
                );
              }
              if (status === 'pending') {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    Pending (offline)
                  </span>
                );
              }
              if (status === 'error') {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30" title={settings?.sheetsLastSyncError || 'Sync failed'}>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    Error
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  Ready
                </span>
              );
            })()}

            {/* Switch Toggle */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={Boolean(formData.sheetsBackupEnabled)} 
                onChange={(e) => handleToggleSheetsBackup(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* One-time Privacy & Safety Notice */}
        {!settings?.sheetsNoticeDismissed && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300 block mb-0.5">Privacy & Security Notice</span>
                <p className="text-slate-300 leading-relaxed">
                  Your bills, payment entries, and client phone numbers will be stored directly inside your own Google Sheet. Keep your Apps Script Web App URL and Secret Key private. DR FILMS does not store your credentials on any external cloud server.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissNotice}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold shrink-0 border border-amber-500/30 transition-colors"
            >
              I Understand
            </button>
          </div>
        )}

        {/* Sync Metadata Details */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-slate-400">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Last synced:</span>
              <span className="font-medium text-slate-200">
                {settings?.sheetsLastSyncedAt
                  ? new Date(settings.sheetsLastSyncedAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  : 'Never'}
              </span>
            </div>

            {settings?.sheetsConnectedSheetName && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sheet: <strong>{settings.sheetsConnectedSheetName}</strong></span>
                {settings?.sheetsConnectedSheetUrl && (
                  <a
                    href={settings.sheetsConnectedSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-emerald-400 hover:text-emerald-200 underline inline-flex items-center gap-0.5"
                    title="Open connected Google Sheet"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowScriptGuide(!showScriptGuide)}
            className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>{showScriptGuide ? 'Hide Setup Instructions' : 'View Google Sheet Setup Guide'}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Expandable Setup Instructions & One-click Copy Code */}
        {showScriptGuide && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-3 text-xs animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Quick 2-Minute Google Sheet Setup:</span>
              </div>
              <button
                type="button"
                onClick={handleCopyScript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow"
              >
                {hasCopiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{hasCopiedScript ? 'Copied to Clipboard!' : 'Copy Apps Script Code'}</span>
              </button>
            </div>

            <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed pl-1">
              <li>Open your Google Sheet (e.g. <strong className="text-white">DR FILMS Billing Backup</strong>).</li>
              <li>Click <strong className="text-slate-100">Extensions</strong> &gt; <strong className="text-slate-100">Apps Script</strong>.</li>
              <li>Delete any sample code in <code className="text-amber-300">Code.gs</code> and paste the copied code.</li>
              <li>Click <strong className="text-slate-100">Deploy</strong> &gt; <strong className="text-slate-100">New deployment</strong>.</li>
              <li>Select type <strong className="text-slate-100">Web app</strong>, set Execute as: <strong className="text-slate-100">"Me"</strong>, and Who has access: <strong className="text-slate-100">"Anyone"</strong>.</li>
              <li>Click <strong className="text-slate-100">Deploy</strong>, authorize permissions, and copy the generated <strong className="text-emerald-400">Web app URL</strong> below!</li>
            </ol>
          </div>
        )}

        {/* Form Inputs: Web App URL, Secret Key, and Target Google Sheet */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Web App URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Google Apps Script Web App URL</span>
              </label>
              <input
                type="url"
                value={formData.sheetsWebAppUrl}
                onChange={(e) => setFormData({ ...formData, sheetsWebAppUrl: e.target.value })}
                onBlur={async (e) => {
                  const val = (e.target.value || '').trim();
                  const current = await db.settings.get('business_profile');
                  if (current) {
                    await db.settings.update('business_profile', { sheetsWebAppUrl: val });
                  }
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-emerald-500"
              />
              {formData.sheetsWebAppUrl && (
                formData.sheetsWebAppUrl.includes('@') ? (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg flex items-start gap-1.5 mt-1 animate-fadeIn">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span><strong>Notice:</strong> You entered an email address. Google Sheets requires the deployed Apps Script Web App URL (starts with <code className="text-amber-200">https://script.google.com/macros/s/.../exec</code>). Click "View Google Sheet Setup Guide" above for the steps.</span>
                  </p>
                ) : formData.sheetsWebAppUrl.includes('docs.google.com/spreadsheets') ? (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg flex items-start gap-1.5 mt-1 animate-fadeIn">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span><strong>Notice:</strong> You entered the spreadsheet link. In that spreadsheet, click <strong>Extensions &gt; Apps Script</strong>, deploy as Web App, and paste the generated Web App URL here.</span>
                  </p>
                ) : !formData.sheetsWebAppUrl.startsWith('http') ? (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg flex items-start gap-1.5 mt-1 animate-fadeIn">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span><strong>Notice:</strong> URL must begin with <code className="text-amber-200">https://script.google.com/macros/s/.../exec</code></span>
                  </p>
                ) : null
              )}
            </div>

            {/* Secret Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Secret Key</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const def = 'drfilms_backup_secret_2026';
                      setFormData(prev => ({ ...prev, sheetsSyncSecret: def }));
                      const current = await db.settings.get('business_profile');
                      if (current) {
                        await db.settings.update('business_profile', { sheetsSyncSecret: def });
                      }
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                  >
                    Use Default Key
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                  >
                    {showSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showSecretKey ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
              </div>
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={formData.sheetsSyncSecret}
                onChange={(e) => setFormData({ ...formData, sheetsSyncSecret: e.target.value })}
                onBlur={async (e) => {
                  const val = (e.target.value || '').trim();
                  const current = await db.settings.get('business_profile');
                  if (current) {
                    await db.settings.update('business_profile', { sheetsSyncSecret: val });
                  }
                }}
                placeholder="drfilms_backup_secret_2026"
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-amber-500"
              />
              {/* Notice if user pasted Deployment ID instead of Secret Key */}
              {formData.sheetsSyncSecret && (formData.sheetsSyncSecret.startsWith('AKfy') || (formData.sheetsWebAppUrl && formData.sheetsWebAppUrl.includes(formData.sheetsSyncSecret))) && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] space-y-1.5 animate-fadeIn">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span><strong>Notice:</strong> You pasted the Google <em>Deployment ID</em> into the Secret Key field. The Apps Script expects: <code className="text-amber-200 font-bold">drfilms_backup_secret_2026</code>.</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const def = 'drfilms_backup_secret_2026';
                      setFormData(prev => ({ ...prev, sheetsSyncSecret: def }));
                      const current = await db.settings.get('business_profile');
                      if (current) {
                        await db.settings.update('business_profile', { sheetsSyncSecret: def });
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors"
                  >
                    Click to Use Default Secret Key
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Target Google Sheet ID or Link (Directs backup to the exact spreadsheet) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Target Google Sheet (URL or ID)</span>
                <span className="text-[10px] text-slate-500 font-normal">(Ensures backup writes directly to your sheet)</span>
              </label>
              {formData.sheetsSpreadsheetId && (
                <a
                  href={formData.sheetsSpreadsheetId.startsWith('http') ? formData.sheetsSpreadsheetId : `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(formData.sheetsSpreadsheetId)}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                >
                  <span>Open Target Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <input
              type="text"
              value={formData.sheetsSpreadsheetId}
              onChange={(e) => setFormData({ ...formData, sheetsSpreadsheetId: e.target.value })}
              onBlur={async (e) => {
                const val = (e.target.value || '').trim();
                const current = await db.settings.get('business_profile');
                if (current) {
                  await db.settings.update('business_profile', { sheetsSpreadsheetId: val });
                }
              }}
              placeholder="e.g. 1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc or paste full Google Sheet link"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Info className="w-3 h-3 text-slate-500 shrink-0" />
              <span>
                If your bills are not updating in the opened sheet, paste your Google Sheet link or Sheet ID here.
              </span>
            </p>
          </div>
        </div>

        {/* Error Details Banner if status is error */}
        {settings?.sheetsLastSyncStatus === 'error' && settings?.sheetsLastSyncError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-rose-200">Sync Error:</span>
              <span className="text-rose-400 font-mono text-[11px]">{settings.sheetsLastSyncError}</span>
            </div>
          </div>
        )}

        {/* Test Result Feedback */}
        {testResult && (
          <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn ${
            testResult.success
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 space-y-1">
              <div>
                <span className="font-semibold">{testResult.success ? 'Success: ' : 'Connection Failed: '}</span>
                <span>{testResult.message || testResult.error}</span>
              </div>
              {testResult.sheetName && (
                <div className="text-[11px] text-slate-300 flex items-center gap-2 pt-1 border-t border-emerald-500/20">
                  <span>Connected Sheet: <strong className="text-white">"{testResult.sheetName}"</strong></span>
                  {testResult.sheetUrl && (
                    <a
                      href={testResult.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:text-emerald-200 underline font-semibold inline-flex items-center gap-0.5 ml-1"
                    >
                      <span>Open Sheet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons: Test connection, Sync now, Restore */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Test connection */}
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {isTesting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isTesting ? 'Testing Ping...' : 'Test Connection'}</span>
          </button>

          {/* Sync now */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isManualSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-bold text-emerald-300 transition-all active:scale-95 disabled:opacity-50"
          >
            {isManualSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isManualSyncing ? 'Syncing Now...' : 'Sync Now'}</span>
          </button>

          {/* Restore from Google Sheet */}
          <button
            type="button"
            onClick={handleRestoreFromSheet}
            disabled={isFetchingBackup}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold text-amber-300 transition-all active:scale-95 disabled:opacity-50"
          >
            {isFetchingBackup ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <CloudDownload className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isFetchingBackup ? 'Fetching Backup...' : 'Restore from Google Sheet'}</span>
          </button>
        </div>
      </div>

      {/* Card 5: Supabase Cloud Database & Multi-Device Sync */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Supabase Cloud Database & Multi-Device Sync
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Project: {SUPABASE_PROJECT_ID}</span>
            </span>
          </div>
        </div>

        {/* Project details card */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-slate-400">Endpoint: </span>
              <span className="font-mono text-slate-200">{DEFAULT_SUPABASE_URL}</span>
            </div>
            <div>
              <span className="text-slate-400">Region: </span>
              <span className="font-mono text-slate-200">{SUPABASE_REGION} (Asia Pacific)</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            12 PostgreSQL tables initialized with Row Level Security (RLS) and Realtime replication active. Invoices, customers, services, custom charges, quotes, projects, and expenses sync seamlessly across multiple devices.
          </div>
        </div>

        {/* Account Authentication Status */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Cloud Authentication State
              </h4>
            </div>
            <p className="text-xs text-slate-400">
              {supabaseUser ? (
                <span>Signed in as <strong className="text-emerald-300 font-mono">{supabaseUser.email}</strong></span>
              ) : (
                <span>Anonymous Key Access (Studio Default). Sign in for user-level cloud access.</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSupabaseAuthOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <span>{supabaseUser ? 'Manage Account' : 'Sign In / Sign Up'}</span>
          </button>
        </div>

        {/* Status / Message Display */}
        {supabaseTestStatus && (
          <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            supabaseTestStatus.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {supabaseTestStatus.ok ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{supabaseTestStatus.message}</span>
          </div>
        )}

        {supabaseSyncMessage && (
          <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200 flex items-center gap-2.5">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{supabaseSyncMessage}</span>
          </div>
        )}

        {/* Sync Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isTestingSupabase}
            onClick={handleTestSupabase}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isTestingSupabase ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isTestingSupabase ? 'Testing Connection...' : 'Test Connection'}</span>
          </button>

          <button
            type="button"
            disabled={isPushingSupabase}
            onClick={handlePushSupabase}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isPushingSupabase ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 text-slate-950" />
            )}
            <span>{isPushingSupabase ? 'Pushing to Cloud...' : 'Push All to Supabase Cloud'}</span>
          </button>

          <button
            type="button"
            disabled={isPullingSupabase}
            onClick={handlePullSupabase}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-amber-500/30 hover:bg-slate-800 text-amber-300 font-semibold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isPullingSupabase ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <CloudDownload className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isPullingSupabase ? 'Pulling from Cloud...' : 'Pull / Restore from Cloud'}</span>
          </button>
        </div>

        {/* Metadata Footer */}
        {supabaseSyncMeta?.lastPush && (
          <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-2">
            <Clock className="w-3 h-3 text-slate-600" />
            <span>Last push: {new Date(supabaseSyncMeta.lastPush).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Card 5: Security & App PIN Lock */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Security & App PIN Lock
            </h3>
          </div>
          {securityProfile?.isEnabled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              PIN Lock Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              <Unlock className="w-3.5 h-3.5" />
              Disabled
            </span>
          )}
        </div>

        {/* Disclaimer / Notice */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start sm:items-center gap-2.5">
          <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5 sm:mt-0" />
          <span>PIN lock hides the app screen. Keep your device locked too.</span>
        </div>

        {/* Recovery Warning */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-2.5 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200">Non-recoverable security:</span> PIN lock cannot be recovered if forgotten. If lost, you must restore from your Google Sheets backup or JSON file. Keep your PIN safe.
          </div>
        </div>

        {/* Feedback Alerts */}
        {pinError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{pinError}</span>
          </div>
        )}
        {pinSuccess && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{pinSuccess}</span>
          </div>
        )}

        {/* View Mode: When PIN is enabled */}
        {securityProfile?.isEnabled && pinMode === 'view' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timeout Setting */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-200 block">
                  Auto-Lock Inactivity Timeout
                </label>
                <select
                  value={securityProfile.timeoutMinutes || '5'}
                  onChange={(e) => handleUpdateTimeout(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  {INACTIVITY_TIMEOUT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  Locks the screen when idle or returning to the tab after timeout.
                </p>
              </div>

              {/* Biometrics Setting */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Fingerprint className="w-4 h-4 text-amber-400" />
                      Biometric Unlock
                    </label>
                    <input
                      type="checkbox"
                      checked={Boolean(securityProfile.biometricsEnabled)}
                      disabled={!isWebAuthnSupported || isProcessingPin}
                      onChange={(e) => handleToggleBiometrics(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer disabled:opacity-40"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isWebAuthnSupported
                      ? 'Unlock using device Touch ID, Face ID, or Windows Hello.'
                      : 'Biometrics not supported on this browser or platform.'}
                  </p>
                </div>
                {Boolean(securityProfile.biometricsEnabled) && (
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    ✓ Biometrics enrolled & enabled
                  </span>
                )}
              </div>
            </div>

            {/* Actions: Change PIN or Remove */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPinMode('change');
                  setPinError('');
                  setPinSuccess('');
                  setPinForm(prev => ({ ...prev, currentPin: '', newPin: '', confirmPin: '' }));
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('remove');
                  setPinError('');
                  setPinSuccess('');
                  setPinForm(prev => ({ ...prev, currentPin: '' }));
                }}
                className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-xs font-bold text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
              >
                Disable PIN Lock
              </button>
            </div>
          </div>
        )}

        {/* Change PIN Mode */}
        {securityProfile?.isEnabled && pinMode === 'change' && (
          <form onSubmit={handleChangePin} className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Change Security PIN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••"
                  value={pinForm.currentPin}
                  onChange={(e) => setPinForm(prev => ({ ...prev, currentPin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 text-center tracking-widest font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  New PIN (4-6 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••"
                  value={pinForm.newPin}
                  onChange={(e) => setPinForm(prev => ({ ...prev, newPin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 text-center tracking-widest font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••"
                  value={pinForm.confirmPin}
                  onChange={(e) => setPinForm(prev => ({ ...prev, confirmPin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 text-center tracking-widest font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isProcessingPin}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isProcessingPin ? 'Updating...' : 'Save New PIN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('view');
                  setPinError('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Remove PIN Mode */}
        {securityProfile?.isEnabled && pinMode === 'remove' && (
          <form onSubmit={handleRemovePin} className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20 space-y-3">
            <h4 className="text-sm font-bold text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Disable PIN Lock
            </h4>
            <p className="text-xs text-slate-300">
              Enter your current PIN to confirm disabling app security:
            </p>
            <div className="max-w-xs">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                value={pinForm.currentPin}
                onChange={(e) => setPinForm(prev => ({ ...prev, currentPin: e.target.value.replace(/\D/g, '') }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-400 text-center tracking-widest font-mono"
                required
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isProcessingPin}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-xs font-bold text-slate-950 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isProcessingPin ? 'Disabling...' : 'Confirm & Disable PIN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('view');
                  setPinError('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Not Enabled: Setup Mode or Call to Action */}
        {!securityProfile?.isEnabled && pinMode === 'view' && (
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-semibold text-xs text-slate-200 block">
                Protect studio invoices & financials with a security PIN
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Require a 4 to 6 digit PIN (and optional biometric unlock) whenever opening or returning to DR FILMS Billing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPinMode('setup');
                setPinError('');
                setPinSuccess('');
                setPinForm(prev => ({ ...prev, newPin: '', confirmPin: '', currentPin: '' }));
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all active:scale-95 shrink-0 cursor-pointer shadow-md shadow-amber-500/20"
            >
              Set Up PIN Lock
            </button>
          </div>
        )}

        {/* Setup Form */}
        {!securityProfile?.isEnabled && pinMode === 'setup' && (
          <form onSubmit={handleSetupPin} className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Configure New App PIN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Choose PIN (4 to 6 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••"
                  value={pinForm.newPin}
                  onChange={(e) => setPinForm(prev => ({ ...prev, newPin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 text-center tracking-widest font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••"
                  value={pinForm.confirmPin}
                  onChange={(e) => setPinForm(prev => ({ ...prev, confirmPin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 text-center tracking-widest font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Auto-Lock Inactivity Timeout
                </label>
                <select
                  value={pinForm.timeoutMinutes}
                  onChange={(e) => setPinForm(prev => ({ ...prev, timeoutMinutes: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  {INACTIVITY_TIMEOUT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {isWebAuthnSupported && (
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="enable-biometrics-setup"
                    checked={pinForm.biometricsEnabled}
                    onChange={(e) => setPinForm(prev => ({ ...prev, biometricsEnabled: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                  <label htmlFor="enable-biometrics-setup" className="text-xs text-slate-300 font-medium cursor-pointer flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-amber-400" />
                    Enable Biometrics (Fingerprint / Face ID)
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={isProcessingPin}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
              >
                {isProcessingPin ? 'Enabling...' : 'Enable PIN Lock'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('view');
                  setPinError('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Card 6: Offline Storage & JSON Backup / Restore */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Offline Storage, Diagnostics & JSON Backup
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-semibold">
            v1.0.0
          </span>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center gap-3 text-xs text-slate-300">
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <span className="font-semibold text-slate-100 block">100% Offline-First Architecture</span>
            <p className="text-slate-400">
              All your invoices, client directory, and custom service rates are stored securely inside your device's IndexedDB. You can export a JSON backup at any time.
            </p>
          </div>
        </div>

        {/* Domain & Storage Address Diagnostic */}
        <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-xs text-amber-300 block">Active Storage Domain</span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Current URL: <code className="text-amber-400 font-mono bg-slate-950 px-1.5 py-0.5 rounded text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}</code>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-700"
              >
                {diagnosticsCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Diagnostics Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Diagnostics</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  import('../utils/crossOriginSync.js').then(m => {
                    m.triggerCounterpartScan();
                    alert('Scanning http://127.0.0.1:5173 and http://localhost:5173 for previously saved bills...');
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold transition-colors cursor-pointer"
              >
                Scan Alternate Address
              </button>
              {typeof window !== 'undefined' && (
                <a
                  href={window.location.hostname === 'localhost' ? `http://127.0.0.1:${window.location.port || '5173'}` : `http://localhost:${window.location.port || '5173'}`}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Open {window.location.hostname === 'localhost' ? '127.0.0.1' : 'localhost'} ↗
                </a>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Note: Browsers keep IndexedDB separated between <code className="text-slate-300">localhost</code> and <code className="text-slate-300">127.0.0.1</code>. The diagnostic report excludes all financial numbers and client PII.
          </p>
        </div>

        {/* Crash & Stability Reporting Toggle */}
        <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="font-semibold text-xs text-slate-200 block">Crash & Stability Telemetry</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Report unexpected software exceptions to assist in stability fixes. All client PII (names, emails, phones) and billing figures are strictly scrubbed before transmission.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={sentryOptIn}
              onChange={handleToggleSentry}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all text-center group"
          >
            <Download className="w-6 h-6 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-semibold text-sm text-slate-200">Export Backup (JSON)</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Download full database snapshot</span>
          </button>

          {/* Import JSON */}
          <label className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all text-center group cursor-pointer">
            <Upload className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-semibold text-sm text-slate-200">
              {isImporting ? 'Restoring...' : 'Restore from JSON'}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">Upload a previous .json backup</span>
            <input type="file" accept=".json" onChange={handleImportFile} disabled={isImporting} className="hidden" />
          </label>

          {/* Reset Defaults */}
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all text-center group"
          >
            <RefreshCw className="w-6 h-6 text-rose-400 mb-2 group-hover:rotate-180 transition-transform duration-500" />
            <span className="font-semibold text-sm text-rose-300">Reset to Defaults</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Re-seed clean catalog & demo</span>
          </button>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <RestoreSheetModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        backupInfo={backupInfo}
        onConfirmRestore={handleConfirmRestore}
      />
      <SupabaseAuthModal
        isOpen={isSupabaseAuthOpen}
        onClose={() => setIsSupabaseAuthOpen(false)}
      />
    </div>
  );
}
