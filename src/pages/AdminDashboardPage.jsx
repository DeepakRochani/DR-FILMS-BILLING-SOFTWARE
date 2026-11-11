import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Users, 
  ShieldCheck, 
  ArrowLeft, 
  Check, 
  Copy, 
  Download, 
  Trash2, 
  Search, 
  Filter, 
  AlertTriangle, 
  FileText, 
  Lock, 
  Unlock, 
  Plus, 
  Sparkles, 
  RefreshCw, 
  LogOut, 
  Clock, 
  Layers, 
  FileSpreadsheet, 
  Briefcase, 
  Wallet, 
  Percent, 
  Receipt, 
  MessageSquare, 
  Database, 
  CheckSquare, 
  ExternalLink, 
  QrCode, 
  Calendar, 
  X, 
  ChevronRight, 
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Settings,
  UserPlus
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSupabase } from '../config/supabase';
import { PLAN_TIERS } from '../utils/licenseManager';
import { 
  generateLicenseKeyAsync, 
  generateSignedRevocationList, 
  importPrivateKeyInMemory 
} from '../utils/adminLicenseGenerator';
import { generateQrDataUrl } from '../utils/qrGenerator';

export const FEATURE_MODULES = [
  { key: 'enableQuotes', name: 'Estimates & Quotations', category: 'Billing Core', icon: FileSpreadsheet, description: 'Estimates, quotations, and client proposals' },
  { key: 'enableProjects', name: 'Projects & Crew Tracker', category: 'Production', icon: Briefcase, description: 'Shoot scheduling, crew assignments, and checklists' },
  { key: 'enableExpenses', name: 'Expenses & Net Profit', category: 'Finance', icon: Wallet, description: 'Studio expenses, vendor payments, and net profit' },
  { key: 'enableReports', name: 'Tax & Accountant Reports', category: 'Finance', icon: Percent, description: 'Accountant monthly GST summaries and balance sheets' },
  { key: 'enableHourCalculator', name: 'Hour & Shift Calculator', category: 'Production', icon: Clock, description: 'Shift duration calculator with overtime rates' },
  { key: 'enableWeddingSuite', name: 'Wedding Studio Suite', category: 'Studio Specialized', icon: Sparkles, description: 'Wedding rate-only bills and multi-day shoot events' },
  { key: 'enableContracts', name: 'Legal Service Agreements', category: 'Legal & Compliance', icon: FileText, description: 'Legal client contracts and signature agreements' },
  { key: 'enableReceipts', name: 'Official Payment Receipts', category: 'Billing Core', icon: Receipt, description: 'Payment receipt vouchers with QR code verification' },
  { key: 'enableWhatsApp', name: 'WhatsApp Invoicing & Reminders', category: 'Client Delivery', icon: MessageSquare, description: '1-click WhatsApp bill delivery and payment alerts' },
  { key: 'enableGoogleSheets', name: 'Google Sheets Cloud Backup', category: 'Integration', icon: Database, description: 'Automated background sync to Google Sheets' },
  { key: 'enableDirectClient', name: 'Direct Client Fast Billing', category: 'Billing Core', icon: CheckSquare, description: 'Fast billing for walk-in clients without saving to directory' },
  { key: 'enableThemeSwitcher', name: 'Invoice Themes & Styling', category: 'Branding', icon: Layers, description: 'Cinematic invoice themes and custom color styling' }
];

export function AdminDashboardPage({ onReturnToBilling, onAdminLogout }) {
  // Navigation tabs: 'issuing' | 'customers' | 'revocations' | 'bills'
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const p = new URLSearchParams(window.location.search).get('tab');
        if (['issuing', 'customers', 'revocations', 'bills'].includes(p)) {
          return p;
        }
      } catch {}
    }
    return 'issuing';
  });

  // STRICT IN-MEMORY PRIVATE KEY STATE (Never written to localStorage, sessionStorage, or IndexedDB)
  const [privateKeyInMemory, setPrivateKeyInMemory] = useState(null);
  const [keyInputText, setKeyInputText] = useState('');
  const [keyInputType, setKeyInputType] = useState('file'); // 'file' | 'paste'
  const [keyLoadedName, setKeyLoadedName] = useState('');
  const [keyError, setKeyError] = useState(null);

  // License Issuing Form State
  const [customerName, setCustomerName] = useState('');
  const [planTier, setPlanTier] = useState('pro');
  const [durationDays, setDurationDays] = useState(365);
  const [isLifetime, setIsLifetime] = useState(false);
  const [billLimit, setBillLimit] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState(() => FEATURE_MODULES.map(f => f.key));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLicenseResult, setGeneratedLicenseResult] = useState(null);
  const [licenseQrCodeUrl, setLicenseQrCodeUrl] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);
  const [issueNotice, setIssueNotice] = useState(null);

  // Customer List with Plan Notes (persisted in Dexie settings)
  const customerDirectoryRecord = useLiveQuery(
    async () => {
      if (!db.settings) return [];
      try {
        const item = await db.settings.get('admin_customer_directory');
        return item?.data || [];
      } catch (err) {
        console.warn('Could not load customer directory:', err);
        return [];
      }
    },
    [],
    []
  );

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerTierFilter, setCustomerTierFilter] = useState('all');
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [editingNotesText, setEditingNotesText] = useState('');

  // Feature Management Modal for an existing customer
  const [featureModalCustomer, setFeatureModalCustomer] = useState(null);
  const [modalSelectedFeatures, setModalSelectedFeatures] = useState([]);
  const [modalPlanTier, setModalPlanTier] = useState('pro');
  const [modalDurationDays, setModalDurationDays] = useState(365);
  const [modalIsLifetime, setModalIsLifetime] = useState(false);
  const [modalBillLimit, setModalBillLimit] = useState('');
  const [modalNotice, setModalNotice] = useState(null);
  const [isModalSaving, setIsModalSaving] = useState(false);
  const [modalGeneratedKey, setModalGeneratedKey] = useState(null);
  const [modalQrUrl, setModalQrUrl] = useState('');

  // Add New Customer Modal
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustTier, setNewCustTier] = useState('pro');
  const [newCustDays, setNewCustDays] = useState(365);
  const [newCustLifetime, setNewCustLifetime] = useState(false);
  const [newCustFeatures, setNewCustFeatures] = useState(() => FEATURE_MODULES.map(f => f.key));
  const [newCustNotes, setNewCustNotes] = useState('');
  const [newCustNotice, setNewCustNotice] = useState(null);

  // Revocation List Management (persisted in Dexie settings)
  const revocationRecord = useLiveQuery(
    async () => {
      if (!db.settings) return [];
      try {
        const item = await db.settings.get('admin_revoked_licenses');
        return item?.data || [];
      } catch (err) {
        console.warn('Could not load revocation list:', err);
        return [];
      }
    },
    [],
    []
  );

  const [newRevokeId, setNewRevokeId] = useState('');
  const [newRevokeReason, setNewRevokeReason] = useState('Subscription expired or cancelled');
  const [signedRevocationJson, setSignedRevocationJson] = useState(null);
  const [isSigningRevocations, setIsSigningRevocations] = useState(false);
  const [revocationNotice, setRevocationNotice] = useState(null);

  // 1. Handle in-memory private key loading via file picker
  const handleKeyFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKeyError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target.result;
        const subtleKey = await importPrivateKeyInMemory(content);
        setPrivateKeyInMemory(subtleKey);
        setKeyLoadedName(file.name);
        setKeyError(null);
      } catch (err) {
        setKeyError('Failed to import private key: ' + err.message);
        setPrivateKeyInMemory(null);
        setKeyLoadedName('');
      }
    };
    reader.onerror = () => {
      setKeyError('Failed to read private key file from disk.');
    };
    reader.readAsText(file);
  };

  // 2. Handle in-memory private key loading via text paste
  const handleKeyTextPaste = async () => {
    if (!keyInputText.trim()) {
      setKeyError('Please paste private key JWK JSON or PKCS#8 PEM content.');
      return;
    }
    setKeyError(null);
    try {
      const subtleKey = await importPrivateKeyInMemory(keyInputText.trim());
      setPrivateKeyInMemory(subtleKey);
      setKeyLoadedName('Pasted In-Memory Key (P-256)');
      setKeyInputText('');
    } catch (err) {
      setKeyError('Invalid private key: ' + err.message);
      setPrivateKeyInMemory(null);
    }
  };

  // 3. Clear private key from memory
  const handleWipeKeyFromMemory = () => {
    setPrivateKeyInMemory(null);
    setKeyLoadedName('');
    setKeyInputText('');
    setKeyError(null);
  };

  // Toggle manual feature in License Issuing Tab
  const handleToggleManualFeature = (featureKey) => {
    setSelectedFeatures(prev => {
      if (prev.includes(featureKey)) {
        return prev.filter(k => k !== featureKey);
      } else {
        return [...prev, featureKey];
      }
    });
  };

  // Preset feature selections for License Issuing Tab
  const handleSelectAllFeatures = () => {
    setSelectedFeatures(FEATURE_MODULES.map(f => f.key));
  };

  const handleDeselectAllFeatures = () => {
    setSelectedFeatures([]);
  };

  const handleSelectCoreInvoicingFeatures = () => {
    setSelectedFeatures(['enableQuotes', 'enableReceipts', 'enableWhatsApp', 'enableDirectClient', 'enableThemeSwitcher']);
  };

  const handleSelectProductionFeatures = () => {
    setSelectedFeatures(['enableQuotes', 'enableProjects', 'enableHourCalculator', 'enableReceipts', 'enableDirectClient']);
  };

  // Handle plan tier change with smart feature defaults
  const handlePlanTierChange = (newTier) => {
    setPlanTier(newTier);
    if (newTier === 'enterprise') {
      setIsLifetime(true);
      setSelectedFeatures(FEATURE_MODULES.map(f => f.key));
    } else if (newTier === 'pro') {
      setIsLifetime(false);
      setSelectedFeatures(FEATURE_MODULES.map(f => f.key));
    } else if (newTier === 'starter') {
      setIsLifetime(false);
      setSelectedFeatures(['enableQuotes', 'enableProjects', 'enableExpenses', 'enableReceipts', 'enableWhatsApp', 'enableDirectClient', 'enableThemeSwitcher']);
    } else if (newTier === 'trial') {
      setIsLifetime(false);
      setDurationDays(14);
      setSelectedFeatures(['enableQuotes', 'enableReceipts', 'enableWhatsApp', 'enableDirectClient', 'enableThemeSwitcher']);
    }
  };

  // 4. Issue a signed license key
  const handleGenerateKey = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!privateKeyInMemory) {
      setIssueNotice({ type: 'error', text: 'Private key must be loaded into memory to issue signed licenses.' });
      return;
    }
    if (!customerName.trim()) {
      setIssueNotice({ type: 'error', text: 'Customer / Studio Name is required.' });
      return;
    }

    setIsGenerating(true);
    setIssueNotice(null);
    setGeneratedLicenseResult(null);
    setLicenseQrCodeUrl('');

    try {
      const limitVal = billLimit !== '' && !isNaN(Number(billLimit)) ? Number(billLimit) : null;
      const allowedFeaturesPayload = selectedFeatures.length === FEATURE_MODULES.length ? ['*'] : selectedFeatures;

      const res = await generateLicenseKeyAsync({
        privateKey: privateKeyInMemory,
        planTier,
        durationDays: isLifetime ? 0 : Number(durationDays),
        isLifetime,
        clientCode: customerName.trim(),
        allowedFeatures: allowedFeaturesPayload,
        billLimit: limitVal,
        notes: planNotes.trim()
      });

      setGeneratedLicenseResult(res);

      // Generate QR Code for easy camera scanning
      if (res?.key) {
        try {
          const qrUrl = await generateQrDataUrl(res.key, { width: 320, margin: 1 });
          setLicenseQrCodeUrl(qrUrl);
        } catch {
          // Non-blocking fallback
        }
      }

      // Save customer record to directory
      const newCustomerItem = {
        id: res.payload.licenseId,
        customerName: res.payload.customerName,
        planTier: res.payload.planTier,
        isLifetime: res.payload.isLifetime,
        issueDate: res.payload.issueDate,
        expiryDate: res.payload.expiryDate,
        billLimit: res.payload.billLimit,
        allowedFeatures: res.payload.allowedFeatures || allowedFeaturesPayload,
        licenseKey: res.key,
        notes: planNotes.trim(),
        createdAt: new Date().toISOString()
      };

      const existing = (await db.settings.get('admin_customer_directory'))?.data || [];
      const updated = [newCustomerItem, ...existing.filter(c => c.id !== newCustomerItem.id)];
      await db.settings.put({ key: 'admin_customer_directory', data: updated });

      setIssueNotice({ type: 'success', text: `License issued successfully for ${res.payload.customerName} with ${selectedFeatures.length} manual feature(s) enabled.` });
    } catch (err) {
      setIssueNotice({ type: 'error', text: 'License generation failed: ' + err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  // 5. Copy license key
  const handleCopyLicenseKey = (keyString) => {
    if (!keyString) return;
    navigator.clipboard.writeText(keyString);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  // 6. Download license certificate
  const handleDownloadLicenseFile = (result) => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-${result.payload.customerName.replace(/[^a-zA-Z0-9]/g, '_')}-${result.payload.licenseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 7. Save plan notes edit
  const handleSaveNotes = async (customerId) => {
    const existing = (await db.settings.get('admin_customer_directory'))?.data || [];
    const updated = existing.map(c => {
      if (c.id === customerId) {
        return { ...c, notes: editingNotesText.trim(), updatedAt: new Date().toISOString() };
      }
      return c;
    });
    await db.settings.put({ key: 'admin_customer_directory', data: updated });
    setEditingNotesId(null);
  };

  // 8. Revoke from Customer Directory
  const handleRevokeCustomerLicense = async (customerItem) => {
    const confirmRevoke = window.confirm(`Revoke license for ${customerItem.customerName} (${customerItem.id})? This will add it to the revocation list.`);
    if (!confirmRevoke) return;

    const existingRevocations = (await db.settings.get('admin_revoked_licenses'))?.data || [];
    if (!existingRevocations.some(r => r.licenseId === customerItem.id)) {
      const updatedRevocations = [
        ...existingRevocations,
        {
          licenseId: customerItem.id,
          customerName: customerItem.customerName,
          reason: 'Revoked from Customer Directory',
          revokedAt: new Date().toISOString()
        }
      ];
      await db.settings.put({ key: 'admin_revoked_licenses', data: updatedRevocations });
    }
    setActiveTab('revocations');
  };

  // 9. Manage Features Modal Open
  const handleOpenFeatureModal = (customer) => {
    setFeatureModalCustomer(customer);
    setModalPlanTier(customer.planTier || 'pro');
    setModalIsLifetime(Boolean(customer.isLifetime || customer.planTier === 'enterprise'));
    setModalBillLimit(customer.billLimit || '');
    setModalNotice(null);
    setModalGeneratedKey(null);
    setModalQrUrl('');

    // Determine currently enabled features
    const rawAllowed = customer.allowedFeatures;
    if (!rawAllowed || rawAllowed.includes('*') || rawAllowed.length === 0) {
      setModalSelectedFeatures(FEATURE_MODULES.map(f => f.key));
    } else {
      setModalSelectedFeatures(
        FEATURE_MODULES.filter(m => {
          return rawAllowed.some(a => {
            const cleanA = String(a).toLowerCase().replace(/^enable/, '');
            const cleanM = m.key.toLowerCase().replace(/^enable/, '');
            return cleanA === cleanM || String(a) === m.key;
          });
        }).map(m => m.key)
      );
    }
  };

  const handleToggleModalFeature = (featureKey) => {
    setModalSelectedFeatures(prev => {
      if (prev.includes(featureKey)) {
        return prev.filter(k => k !== featureKey);
      } else {
        return [...prev, featureKey];
      }
    });
  };

  // 10. Re-Issue Signed License Key with Updated Manual Features
  const handleSaveCustomerFeatures = async () => {
    if (!featureModalCustomer) return;
    setIsModalSaving(true);
    setModalNotice(null);

    try {
      const allowedFeaturesPayload = modalSelectedFeatures.length === FEATURE_MODULES.length ? ['*'] : modalSelectedFeatures;
      let newKey = featureModalCustomer.licenseKey || '';
      let generatedRes = null;

      if (privateKeyInMemory) {
        // Re-sign with private key
        generatedRes = await generateLicenseKeyAsync({
          privateKey: privateKeyInMemory,
          planTier: modalPlanTier,
          durationDays: modalIsLifetime ? 0 : Number(modalDurationDays),
          isLifetime: modalIsLifetime,
          clientCode: featureModalCustomer.customerName,
          allowedFeatures: allowedFeaturesPayload,
          billLimit: modalBillLimit !== '' ? Number(modalBillLimit) : null,
          notes: featureModalCustomer.notes || ''
        });
        newKey = generatedRes.key;
        setModalGeneratedKey(generatedRes);

        try {
          const qr = await generateQrDataUrl(newKey, { width: 300, margin: 1 });
          setModalQrUrl(qr);
        } catch {}
      }

      // Update customer in directory
      const existing = (await db.settings.get('admin_customer_directory'))?.data || [];
      const updated = existing.map(c => {
        if (c.id === featureModalCustomer.id) {
          return {
            ...c,
            planTier: modalPlanTier,
            isLifetime: modalIsLifetime,
            allowedFeatures: allowedFeaturesPayload,
            licenseKey: newKey,
            billLimit: modalBillLimit !== '' ? Number(modalBillLimit) : null,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });

      await db.settings.put({ key: 'admin_customer_directory', data: updated });
      setModalNotice({ 
        type: 'success', 
        text: privateKeyInMemory 
          ? `Updated and cryptographically signed new license with ${modalSelectedFeatures.length} feature(s).` 
          : `Customer profile updated with ${modalSelectedFeatures.length} feature(s). (Load private key in RAM to sign updated ECDSA key).` 
      });
    } catch (err) {
      setModalNotice({ type: 'error', text: 'Error saving features: ' + err.message });
    } finally {
      setIsModalSaving(false);
    }
  };

  // 11. Apply Features Directly to Local Studio Workspace
  const handleApplyFeaturesToWorkspace = async () => {
    if (!featureModalCustomer) return;
    setIsModalSaving(true);
    setModalNotice(null);

    try {
      // 1. Update feature flags in Dexie settings
      const currentFlags = (await db.settings.get('admin_feature_flags')) || {};
      const newFlags = {
        ...currentFlags,
        key: 'admin_feature_flags'
      };
      FEATURE_MODULES.forEach(m => {
        newFlags[m.key] = modalSelectedFeatures.includes(m.key);
      });
      await db.settings.put(newFlags);

      // 2. Update subscription configuration
      const currentSub = (await db.settings.get('admin_subscription_config')) || {};
      const allowedFeaturesPayload = modalSelectedFeatures.length === FEATURE_MODULES.length ? ['*'] : modalSelectedFeatures;
      await db.settings.put({
        ...currentSub,
        key: 'admin_subscription_config',
        clientStudioName: featureModalCustomer.customerName || currentSub.clientStudioName,
        planTier: modalPlanTier,
        status: 'active',
        isLifetime: modalIsLifetime,
        allowedFeatures: allowedFeaturesPayload,
        lastRenewedAt: new Date().toISOString()
      });

      setModalNotice({ 
        type: 'success', 
        text: `Successfully applied all ${modalSelectedFeatures.length} features directly to this local studio workspace!` 
      });
    } catch (err) {
      setModalNotice({ type: 'error', text: 'Failed to apply to local workspace: ' + err.message });
    } finally {
      setIsModalSaving(false);
    }
  };

  // 12. Add New Customer with Manual Features
  const handleCreateCustomerWithFeatures = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newCustName.trim()) {
      setNewCustNotice({ type: 'error', text: 'Studio Name is required.' });
      return;
    }

    try {
      const allowedFeaturesPayload = newCustFeatures.length === FEATURE_MODULES.length ? ['*'] : newCustFeatures;
      let newKey = '';

      if (privateKeyInMemory) {
        const res = await generateLicenseKeyAsync({
          privateKey: privateKeyInMemory,
          planTier: newCustTier,
          durationDays: newCustLifetime ? 0 : Number(newCustDays),
          isLifetime: newCustLifetime,
          clientCode: newCustName.trim(),
          allowedFeatures: allowedFeaturesPayload,
          notes: newCustNotes.trim()
        });
        newKey = res.key;
      }

      const newCustItem = {
        id: `lic_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
        customerName: newCustName.trim(),
        planTier: newCustTier,
        isLifetime: newCustLifetime,
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: newCustLifetime ? null : new Date(Date.now() + Number(newCustDays) * 86400000).toISOString().split('T')[0],
        allowedFeatures: allowedFeaturesPayload,
        licenseKey: newKey,
        notes: newCustNotes.trim(),
        createdAt: new Date().toISOString()
      };

      const existing = (await db.settings.get('admin_customer_directory'))?.data || [];
      const updated = [newCustItem, ...existing];
      await db.settings.put({ key: 'admin_customer_directory', data: updated });

      setIsAddCustomerOpen(false);
      setNewCustName('');
      setNewCustNotes('');
      setNewCustNotice(null);
    } catch (err) {
      setNewCustNotice({ type: 'error', text: 'Failed to create customer: ' + err.message });
    }
  };

  // 13. Revocation actions
  const handleAddRevocation = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newRevokeId.trim()) return;

    const existing = (await db.settings.get('admin_revoked_licenses'))?.data || [];
    if (existing.some(r => r.licenseId === newRevokeId.trim())) {
      setRevocationNotice({ type: 'error', text: 'License ID is already on the revocation list.' });
      return;
    }

    const updated = [
      ...existing,
      {
        licenseId: newRevokeId.trim(),
        reason: newRevokeReason.trim() || 'Revoked by administrator',
        revokedAt: new Date().toISOString()
      }
    ];

    await db.settings.put({ key: 'admin_revoked_licenses', data: updated });
    setNewRevokeId('');
    setSignedRevocationJson(null);
    setRevocationNotice({ type: 'success', text: `Added ${newRevokeId.trim()} to revocation list.` });
  };

  const handleRemoveRevocation = async (licenseId) => {
    const existing = (await db.settings.get('admin_revoked_licenses'))?.data || [];
    const updated = existing.filter(r => r.licenseId !== licenseId);
    await db.settings.put({ key: 'admin_revoked_licenses', data: updated });
    setSignedRevocationJson(null);
  };

  const handleSignRevocationList = async () => {
    if (!privateKeyInMemory) {
      setRevocationNotice({ type: 'error', text: 'Private key must be loaded into memory to sign revocation lists.' });
      return;
    }

    setIsSigningRevocations(true);
    setRevocationNotice(null);

    try {
      const currentList = (await db.settings.get('admin_revoked_licenses'))?.data || [];
      const signedDoc = await generateSignedRevocationList({
        privateKey: privateKeyInMemory,
        revokedList: currentList
      });

      setSignedRevocationJson(signedDoc);
      setRevocationNotice({ type: 'success', text: 'Revocation list signed successfully. Ready for deployment.' });
    } catch (err) {
      setRevocationNotice({ type: 'error', text: 'Failed to sign revocation list: ' + err.message });
    } finally {
      setIsSigningRevocations(false);
    }
  };

  const handleDownloadRevocationJson = () => {
    if (!signedRevocationJson) return;
    const blob = new Blob([JSON.stringify(signedRevocationJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revoked.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered customers
  const filteredCustomers = (customerDirectoryRecord || []).filter(c => {
    const matchesSearch = !customerSearch.trim() || 
      c.customerName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.id?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.notes?.toLowerCase().includes(customerSearch.toLowerCase());
    const matchesTier = customerTierFilter === 'all' || c.planTier === customerTierFilter;
    return matchesSearch && matchesTier;
  });

  // Customer metrics
  const customerMetrics = React.useMemo(() => {
    const list = customerDirectoryRecord || [];
    const total = list.length;
    const proCount = list.filter(c => c.planTier === 'pro').length;
    const entCount = list.filter(c => c.planTier === 'enterprise' || c.isLifetime).length;
    const starterCount = list.filter(c => c.planTier === 'starter').length;
    const trialCount = list.filter(c => c.planTier === 'trial').length;
    return { total, proCount, entCount, starterCount, trialCount };
  }, [customerDirectoryRecord]);

  // Studio Bills State (Tab: 'bills')
  const [billSearch, setBillSearch] = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState('all');
  const [remoteInvoices, setRemoteInvoices] = useState([]);
  const [isLoadingRemoteInvoices, setIsLoadingRemoteInvoices] = useState(false);
  const [remoteFetchNotice, setRemoteFetchNotice] = useState(null);
  const [copiedBillId, setCopiedBillId] = useState(null);

  const localInvoices = useLiveQuery(
    async () => {
      if (!db.invoices) return [];
      try {
        const list = await db.invoices.toArray();
        return list.filter(inv => !inv?.isDeleted);
      } catch (err) {
        console.warn('Could not read local invoices in admin:', err);
        return [];
      }
    },
    [],
    []
  );

  const localCustomers = useLiveQuery(
    async () => {
      if (!db.customers) return [];
      try {
        return await db.customers.toArray();
      } catch {
        return [];
      }
    },
    [],
    []
  );

  const fetchRemoteInvoices = async () => {
    setIsLoadingRemoteInvoices(true);
    setRemoteFetchNotice(null);
    try {
      const client = getSupabase();
      if (!client) {
        setRemoteFetchNotice({ type: 'error', text: 'Supabase client is not available.' });
        return;
      }
      const { data, error } = await client
        .from('invoices')
        .select('*')
        .eq('user_id', 'admin')
        .order('id', { ascending: false });

      if (error) {
        setRemoteFetchNotice({ type: 'error', text: 'Cloud bills fetch error: ' + error.message });
      } else if (data) {
        setRemoteInvoices(data.filter(inv => !inv?.isDeleted));
        setRemoteFetchNotice({ type: 'success', text: `Loaded ${data.length} cloud bill(s) for Studio Owner.` });
      }
    } catch (err) {
      setRemoteFetchNotice({ type: 'error', text: 'Cloud fetch notice: ' + err.message });
    } finally {
      setIsLoadingRemoteInvoices(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'bills') {
      fetchRemoteInvoices();
    }
  }, [activeTab]);

  const combinedAdminInvoices = React.useMemo(() => {
    const map = new Map();
    const customerMap = new Map();
    (localCustomers || []).forEach(c => {
      if (c.id) customerMap.set(c.id, c);
    });

    (remoteInvoices || []).forEach(inv => {
      const key = inv.invoiceNumber || String(inv.id);
      map.set(key, inv);
    });

    (localInvoices || []).forEach(inv => {
      const key = inv.invoiceNumber || String(inv.id);
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...inv });
    });

    const list = Array.from(map.values()).map(inv => {
      let clientName = inv.customerSnapshot?.name || inv.customerName;
      let clientCompany = inv.customerSnapshot?.company || inv.company;
      if (!clientName && inv.customerId && customerMap.has(inv.customerId)) {
        const c = customerMap.get(inv.customerId);
        clientName = c.name;
        clientCompany = c.company;
      }
      return {
        ...inv,
        resolvedClientName: clientName || 'Direct Client',
        resolvedCompany: clientCompany || ''
      };
    });

    return list.sort((a, b) => {
      const idA = typeof a.id === 'number' ? a.id : 0;
      const idB = typeof b.id === 'number' ? b.id : 0;
      return idB - idA;
    });
  }, [localInvoices, remoteInvoices, localCustomers]);

  const billMetrics = React.useMemo(() => {
    let totalBilled = 0;
    let totalBalance = 0;
    let totalPaidCount = 0;
    let totalPartialCount = 0;
    let totalUnpaidCount = 0;

    combinedAdminInvoices.forEach(inv => {
      if (inv.status === 'cancelled') return;
      const total = Number(inv.totalAmount) || 0;
      const balance = Number(inv.balanceDue !== undefined ? inv.balanceDue : total);
      totalBilled += total;
      totalBalance += balance;

      if (inv.status === 'paid' || balance <= 0) {
        totalPaidCount++;
      } else if (inv.status === 'partially_paid') {
        totalPartialCount++;
      } else {
        totalUnpaidCount++;
      }
    });

    const totalReceived = Math.max(0, totalBilled - totalBalance);

    return {
      totalBilled,
      totalReceived,
      totalBalance,
      totalCount: combinedAdminInvoices.length,
      totalPaidCount,
      totalPartialCount,
      totalUnpaidCount
    };
  }, [combinedAdminInvoices]);

  const filteredBills = combinedAdminInvoices.filter(inv => {
    const q = billSearch.toLowerCase().trim();
    const matchesSearch = !q ||
      String(inv.invoiceNumber || '').toLowerCase().includes(q) ||
      String(inv.resolvedClientName || '').toLowerCase().includes(q) ||
      String(inv.resolvedCompany || '').toLowerCase().includes(q) ||
      String(inv.phone || '').includes(q);

    if (!matchesSearch) return false;

    if (billStatusFilter === 'all') return true;
    if (billStatusFilter === 'paid') return inv.status === 'paid' || (Number(inv.balanceDue) <= 0 && inv.status !== 'cancelled');
    if (billStatusFilter === 'partially_paid') return inv.status === 'partially_paid';
    if (billStatusFilter === 'unpaid') return inv.status === 'unpaid' || (!inv.status && Number(inv.balanceDue) > 0);
    if (billStatusFilter === 'draft') return inv.status === 'draft';
    if (billStatusFilter === 'cancelled') return inv.status === 'cancelled';
    return true;
  });

  const handleOpenBillInStudio = (inv) => {
    const targetId = inv.id;
    window.location.href = `/?tab=invoices&invoiceId=${targetId}`;
  };

  const handleCopyBillSummary = (inv) => {
    const text = `Invoice #${inv.invoiceNumber || inv.id}\nClient: ${inv.resolvedClientName}${inv.resolvedCompany ? ` (${inv.resolvedCompany})` : ''}\nTotal: INR ${Number(inv.totalAmount || 0).toLocaleString('en-IN')}\nBalance Due: INR ${Number(inv.balanceDue !== undefined ? inv.balanceDue : inv.totalAmount || 0).toLocaleString('en-IN')}\nStatus: ${inv.status || 'unpaid'}`;
    navigator.clipboard.writeText(text);
    setCopiedBillId(inv.id);
    setTimeout(() => setCopiedBillId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Frosted Command Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 sticky top-0 z-40 shadow-xl shadow-black/40">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/25 via-amber-500/10 to-transparent border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/15">
            <span className="text-amber-400 font-display font-extrabold text-sm tracking-wider">DR</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide font-display">
                DR FILMS Admin Control Portal
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-widest hidden sm:inline-block">
                Master Deck
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Owner Licensing, Customer Directory & Revocation Center
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Key Status Pill */}
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 shadow-sm ${
            privateKeyInMemory 
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
              : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${privateKeyInMemory ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-semibold">
              {privateKeyInMemory ? 'ECDSA Key Active in RAM' : 'No Key in RAM'}
            </span>
            {privateKeyInMemory && (
              <button
                type="button"
                onClick={handleWipeKeyFromMemory}
                className="ml-1 text-[10px] uppercase font-bold text-slate-400 hover:text-rose-400 transition cursor-pointer"
                title="Wipe private key from RAM"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={onReturnToBilling}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-98 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700/80 transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Billing Studio</span>
          </button>

          <button
            type="button"
            onClick={onAdminLogout}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 active:scale-95 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition-all cursor-pointer shadow-sm"
            title="Lock Admin Portal Session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Modern High-End Tab Navigation Bar */}
      <div className="border-b border-slate-800/70 bg-slate-900/60 backdrop-blur-md px-4 sm:px-6">
        <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 max-w-6xl mx-auto">
          {/* Tab 1: License Issuing */}
          <button
            type="button"
            onClick={() => setActiveTab('issuing')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer shrink-0 ${
              activeTab === 'issuing'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>License Issuing</span>
          </button>

          {/* Tab 2: Customer List & Plan Notes */}
          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer shrink-0 ${
              activeTab === 'customers'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Customer List & Plan Notes</span>
            {customerDirectoryRecord?.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                {customerDirectoryRecord.length}
              </span>
            )}
          </button>

          {/* Tab 3: Revocation List Management */}
          <button
            type="button"
            onClick={() => setActiveTab('revocations')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer shrink-0 ${
              activeTab === 'revocations'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Revocation List Management</span>
            {revocationRecord?.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/50">
                {revocationRecord.length}
              </span>
            )}
          </button>

          {/* Tab 4: Studio Bills & Invoices */}
          <button
            type="button"
            onClick={() => setActiveTab('bills')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer shrink-0 ${
              activeTab === 'bills'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Studio Bills & Invoices</span>
            {combinedAdminInvoices?.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {combinedAdminInvoices.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB 1: LICENSE ISSUING */}
        {activeTab === 'issuing' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Private Key Session Card */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>In-Memory Private Key (Session Only)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    To sign ECDSA P-256 licenses and cryptographic revocation lists, load your private key into memory. 
                    The private key is strictly isolated in RAM and is never written to IndexedDB, localStorage, or cookies.
                  </p>
                </div>
                {privateKeyInMemory && (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                    <Check className="w-3.5 h-3.5" />
                    <span>Key Active in RAM</span>
                  </span>
                )}
              </div>

              {!privateKeyInMemory ? (
                <div className="space-y-4">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
                      <input
                        type="radio"
                        name="keyInputType"
                        checked={keyInputType === 'file'}
                        onChange={() => setKeyInputType('file')}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Select local key file (.json)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
                      <input
                        type="radio"
                        name="keyInputType"
                        checked={keyInputType === 'paste'}
                        onChange={() => setKeyInputType('paste')}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Paste JSON JWK or PEM</span>
                    </label>
                  </div>

                  {keyInputType === 'file' ? (
                    <div className="border-2 border-dashed border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 text-center transition-colors bg-slate-950/40">
                      <input
                        type="file"
                        accept=".json,.pem,application/json,text/plain"
                        onChange={handleKeyFileUpload}
                        className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-500 mt-2 block">
                        Choose your license-private-key.json exported from key generation scripts
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        rows={3}
                        value={keyInputText}
                        onChange={(e) => setKeyInputText(e.target.value)}
                        placeholder="Paste JWK JSON ({'kty':'EC', 'crv':'P-256', 'd':'...'}) or PKCS#8 PEM string..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none placeholder-slate-600"
                      />
                      <button
                        type="button"
                        onClick={handleKeyTextPaste}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-amber-500/10"
                      >
                        Load Key into Memory
                      </button>
                    </div>
                  )}

                  {keyError && (
                    <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{keyError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl gap-3">
                  <div className="flex items-center gap-3 text-xs text-slate-300">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Loaded Key Source</span>
                      <strong className="text-slate-100 font-mono text-xs">{keyLoadedName}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleWipeKeyFromMemory}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800/60 rounded-xl text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
                  >
                    Clear from RAM
                  </button>
                </div>
              )}
            </div>

            {/* License Generator & Output Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Generator Form */}
              <div className="lg:col-span-7 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Issue Commercial Studio License</span>
                  </h2>
                  <span className="text-[11px] text-slate-400">ECDSA P-256</span>
                </div>

                <form onSubmit={handleGenerateKey} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Customer / Studio Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Royal Wedding Cinema"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none transition"
                    />
                  </div>

                  {/* Plan Tier Selector Cards */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Subscription Plan Model
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { id: 'trial', title: 'Free Trial', desc: '14-Day evaluation', limit: '25 Invoices max' },
                        { id: 'starter', title: 'Starter Studio', desc: 'Annual core features', limit: '500 Invoices / yr' },
                        { id: 'pro', title: 'Pro Studio Suite', desc: 'Annual full suite', limit: 'Unlimited Invoices' },
                        { id: 'enterprise', title: 'Perpetual Lifetime', desc: 'Lifetime unmetered', limit: 'Never expires' }
                      ].map((t) => {
                        const isSelected = planTier === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => handlePlanTierChange(t.id)}
                            className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-500/60 shadow-md shadow-amber-500/10'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                                {t.title}
                              </span>
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-700'
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-400 block">{t.desc}</span>
                            <span className="text-[10px] text-amber-400/80 font-mono mt-1 block">{t.limit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Feature Selection Switchboard */}
                  <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-amber-400" />
                          <span>Included Studio Features ({selectedFeatures.length}/{FEATURE_MODULES.length})</span>
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Manually select features to grant in this license key
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleSelectAllFeatures}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 transition cursor-pointer"
                        >
                          Select All (12)
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectCoreInvoicingFeatures}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 transition cursor-pointer"
                        >
                          Core Invoicing
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllFeatures}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-[10px] font-semibold text-slate-400 hover:text-rose-300 transition cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-60 overflow-y-auto no-scrollbar">
                      {FEATURE_MODULES.map((mod) => {
                        const isChecked = selectedFeatures.includes(mod.key);
                        const ModIcon = mod.icon;
                        return (
                          <div
                            key={mod.key}
                            onClick={() => handleToggleManualFeature(mod.key)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                                : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ModIcon className={`w-3.5 h-3.5 shrink-0 ${isChecked ? 'text-amber-400' : 'text-slate-500'}`} />
                              <div className="truncate">
                                <span className="text-[11px] font-semibold block leading-tight truncate">{mod.name}</span>
                                <span className="text-[9px] text-slate-500 block leading-tight">{mod.category}</span>
                              </div>
                            </div>
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked ? 'bg-amber-500 border-amber-500' : 'border-slate-700 bg-slate-950'
                            }`}>
                              {isChecked && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Duration and Bill Limits */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-300">Duration (Days)</label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isLifetime}
                            onChange={(e) => setIsLifetime(e.target.checked)}
                            className="text-amber-500 focus:ring-amber-500 rounded"
                          />
                          <span>Lifetime</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        disabled={isLifetime}
                        value={isLifetime ? '' : durationDays}
                        onChange={(e) => setDurationDays(Number(e.target.value))}
                        placeholder={isLifetime ? 'Perpetual' : '365'}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none disabled:opacity-50"
                      />
                      {/* Quick duration presets */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {[
                          { label: '14d', days: 14 },
                          { label: '30d', days: 30 },
                          { label: '1 Year', days: 365 },
                          { label: '2 Years', days: 730 }
                        ].map((d) => (
                          <button
                            key={d.label}
                            type="button"
                            disabled={isLifetime}
                            onClick={() => setDurationDays(d.days)}
                            className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-medium transition disabled:opacity-40"
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Invoice Limit (Optional)
                      </label>
                      <input
                        type="number"
                        value={billLimit}
                        onChange={(e) => setBillLimit(e.target.value)}
                        placeholder={planTier === 'trial' ? '25' : 'Unlimited (leave blank)'}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Leave blank for unmetered bills creation
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Plan Notes / Transaction Reference (Internal)
                    </label>
                    <textarea
                      rows={2}
                      value={planNotes}
                      onChange={(e) => setPlanNotes(e.target.value)}
                      placeholder="e.g. Paid via NEFT Ref #1928491, 1-Year subscription for Main Branch. Contact: Rahul Sharma."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-slate-200 outline-none resize-none placeholder-slate-600"
                    />
                  </div>

                  {issueNotice && (
                    <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                      issueNotice.type === 'error'
                        ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                        : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                    }`}>
                      {issueNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                      <span>{issueNotice.text}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isGenerating || !privateKeyInMemory}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-xs font-extrabold uppercase tracking-widest rounded-2xl shadow-lg shadow-amber-500/20 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Key className="w-4 h-4" />
                    <span>{isGenerating ? 'Signing License Key...' : 'Generate Signed License Key'}</span>
                  </button>
                </form>
              </div>

              {/* Right Column: Live License Certificate & Instant QR Preview */}
              <div className="lg:col-span-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Generated License & Activation QR</span>
                  </h3>

                  {generatedLicenseResult ? (
                    <div className="space-y-4 animate-scaleIn">
                      {/* Monospace Key Card */}
                      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Signed Key Ready</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyLicenseKey(generatedLicenseResult.key)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            >
                              {copyStatus ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copyStatus ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadLicenseFile(generatedLicenseResult)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Save .json</span>
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl break-all font-mono text-[11px] text-amber-200 select-all max-h-28 overflow-y-auto">
                          {generatedLicenseResult.key}
                        </div>
                      </div>

                      {/* Activation QR Code */}
                      {licenseQrCodeUrl && (
                        <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center text-center">
                          <div className="p-2.5 bg-white rounded-xl shadow-lg mb-2">
                            <img
                              src={licenseQrCodeUrl}
                              alt="License Activation QR"
                              className="w-36 h-36 object-contain"
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-200">Instant Activation QR</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            Customer studio can scan this QR code to activate their billing software
                          </span>
                        </div>
                      )}

                      {/* Summary Metadata Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">License ID</span>
                          <span className="text-slate-200 font-mono font-medium truncate block">
                            {generatedLicenseResult.payload.licenseId}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Studio Name</span>
                          <span className="text-slate-200 font-medium truncate block">
                            {generatedLicenseResult.payload.customerName}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Plan Tier</span>
                          <span className="text-amber-400 font-bold uppercase">
                            {generatedLicenseResult.payload.planTier}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Features</span>
                          <span className="text-emerald-400 font-medium">
                            {selectedFeatures.length === FEATURE_MODULES.length ? 'All Features (12)' : `${selectedFeatures.length} Custom Features`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[320px] bg-slate-950/20">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center text-slate-500 mb-3">
                        <QrCode className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-semibold text-slate-300 block">No License Generated Yet</span>
                      <p className="text-[11px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                        Fill in customer details on the left, pick which features to grant, and click "Generate Signed License Key".
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER LIST WITH PLAN NOTES */}
        {activeTab === 'customers' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Customer Directory Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <span className="text-slate-400 text-[11px] block uppercase font-bold tracking-wider">Total Studios</span>
                <span className="text-2xl font-bold font-mono text-slate-100 mt-1 block">{customerMetrics.total}</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <span className="text-amber-400/90 text-[11px] block uppercase font-bold tracking-wider">Pro Suite</span>
                <span className="text-2xl font-bold font-mono text-amber-300 mt-1 block">{customerMetrics.proCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <span className="text-emerald-400/90 text-[11px] block uppercase font-bold tracking-wider">Enterprise / Lifetime</span>
                <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">{customerMetrics.entCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <span className="text-sky-400/90 text-[11px] block uppercase font-bold tracking-wider">Starter & Trial</span>
                <span className="text-2xl font-bold font-mono text-sky-300 mt-1 block">{customerMetrics.starterCount + customerMetrics.trialCount}</span>
              </div>
            </div>

            {/* Customer Directory Table & Cards */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Customer List & Plan Notes</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage studio customers, record subscription payment notes, and add or adjust features manually.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search studios or notes..."
                      className="bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 outline-none w-44 sm:w-56 transition"
                    />
                  </div>

                  <select
                    value={customerTierFilter}
                    onChange={(e) => setCustomerTierFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition cursor-pointer"
                  >
                    <option value="all">All Tiers ({customerMetrics.total})</option>
                    <option value="pro">Pro Suite ({customerMetrics.proCount})</option>
                    <option value="enterprise">Enterprise ({customerMetrics.entCount})</option>
                    <option value="starter">Starter ({customerMetrics.starterCount})</option>
                    <option value="trial">Trial ({customerMetrics.trialCount})</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddCustomerOpen(true);
                      setNewCustFeatures(FEATURE_MODULES.map(f => f.key));
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Studio User</span>
                  </button>
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl bg-slate-950/20">
                  {customerSearch ? 'No studio customers match your search.' : 'No customer licenses issued yet. Generate your first license from the "License Issuing" tab or click "Add Studio User".'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Studio / Customer</th>
                        <th className="py-3 px-3">Plan Tier</th>
                        <th className="py-3 px-3">Features Enabled</th>
                        <th className="py-3 px-3">Expiry</th>
                        <th className="py-3 px-3">Plan Notes (Click to Edit)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                      {filteredCustomers.map((cust) => {
                        const rawAllowed = cust.allowedFeatures;
                        const isAll = !rawAllowed || rawAllowed.includes('*');
                        const featureCount = isAll ? FEATURE_MODULES.length : (Array.isArray(rawAllowed) ? rawAllowed.length : 0);

                        return (
                          <tr key={cust.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-300 text-xs shrink-0">
                                  {cust.customerName?.slice(0, 2).toUpperCase() || 'ST'}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-100 block">{cust.customerName}</span>
                                  <span className="font-mono text-[10px] text-slate-500">{cust.id}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${
                                cust.planTier === 'enterprise'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : cust.planTier === 'pro'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}>
                                {cust.planTier}
                              </span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold border ${
                                isAll || featureCount >= FEATURE_MODULES.length
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}>
                                <Sparkles className="w-3 h-3" />
                                <span>{isAll ? 'All Features (12)' : `${featureCount} / ${FEATURE_MODULES.length} Features`}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`font-mono text-[11px] font-medium ${
                                cust.isLifetime ? 'text-emerald-400 font-bold' : 'text-slate-300'
                              }`}>
                                {cust.isLifetime ? 'Perpetual Lifetime' : (cust.expiryDate || 'N/A')}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 max-w-xs">
                              {editingNotesId === cust.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingNotesText}
                                    onChange={(e) => setEditingNotesText(e.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 w-full outline-none focus:border-amber-500"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveNotes(cust.id)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingNotesId(null)}
                                    className="text-slate-400 hover:text-slate-200 text-[10px] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onClick={() => {
                                    setEditingNotesId(cust.id);
                                    setEditingNotesText(cust.notes || '');
                                  }}
                                  className="cursor-pointer text-slate-400 hover:text-slate-200 truncate py-1 px-1.5 rounded hover:bg-slate-800/50 transition-colors"
                                  title="Click to edit notes"
                                >
                                  {cust.notes || <span className="italic text-slate-600">Click to add plan notes...</span>}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenFeatureModal(cust)}
                                  className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                  title="Manage features & subscription manually"
                                >
                                  <Sliders className="w-3 h-3" />
                                  <span>Features</span>
                                </button>
                                {cust.licenseKey && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLicenseKey(cust.licenseKey)}
                                    className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition cursor-pointer"
                                    title="Copy license key"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRevokeCustomerLicense(cust)}
                                  className="p-1.5 hover:bg-rose-950/60 rounded-xl text-slate-400 hover:text-rose-300 transition cursor-pointer"
                                  title="Revoke this license"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: REVOCATION LIST MANAGEMENT */}
        {activeTab === 'revocations' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Cryptographic Revocation List Management</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    Manage revoked licenses and generate a signed <code>revoked.json</code> document to deploy online. 
                    Client installations verify this cryptographic list on startup.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSigningRevocations || !privateKeyInMemory}
                  onClick={handleSignRevocationList}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl shadow-md shadow-amber-500/15 transition flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isSigningRevocations ? 'Signing Revocation List...' : 'Sign & Export revoked.json'}</span>
                </button>
              </div>

              {/* Add Revocation Form */}
              <form onSubmit={handleAddRevocation} className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    License ID to Revoke *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRevokeId}
                    onChange={(e) => setNewRevokeId(e.target.value)}
                    placeholder="e.g. lic_20261023_abc1"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono outline-none"
                  />
                </div>

                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Reason
                  </label>
                  <input
                    type="text"
                    value={newRevokeReason}
                    onChange={(e) => setNewRevokeReason(e.target.value)}
                    placeholder="e.g. Chargeback refund, contract terminated"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition shrink-0 cursor-pointer border border-slate-700"
                >
                  Add to Queue
                </button>
              </form>

              {revocationNotice && (
                <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                  revocationNotice.type === 'error'
                    ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                    : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                }`}>
                  {revocationNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" /> : <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
                  <span>{revocationNotice.text}</span>
                </div>
              )}

              {/* Table of Revoked Items */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                  Revocation Queue ({revocationRecord?.length || 0})
                </h3>
                {revocationRecord?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-6 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-950/30">
                    No revoked licenses in the list. All issued keys remain active.
                  </p>
                ) : (
                  <div className="border border-slate-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3.5">License ID</th>
                          <th className="py-2.5 px-3">Reason</th>
                          <th className="py-2.5 px-3">Revoked Date</th>
                          <th className="py-2.5 px-3.5 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                        {revocationRecord.map((item) => (
                          <tr key={item.licenseId} className="hover:bg-slate-800/20">
                            <td className="py-2.5 px-3.5 font-mono font-medium text-rose-300">{item.licenseId}</td>
                            <td className="py-2.5 px-3 text-slate-300">{item.reason}</td>
                            <td className="py-2.5 px-3 text-slate-400">{item.revokedAt ? new Date(item.revokedAt).toLocaleDateString() : 'N/A'}</td>
                            <td className="py-2.5 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveRevocation(item.licenseId)}
                                className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                title="Remove from list"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Signed Revoked.json output */}
              {signedRevocationJson && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-3 animate-scaleIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Signed revoked.json Ready</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadRevocationJson}
                      className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download revoked.json</span>
                    </button>
                  </div>
                  <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
                    {JSON.stringify(signedRevocationJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: STUDIO BILLS & INVOICES */}
        {activeTab === 'bills' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header / Intro Card */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>Studio Owner Bills & Generated Invoices</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    All generated invoices owned by DR FILMS Studio Admin with Row-Level Security isolation.
                    Other tenant users cannot view these bills.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isLoadingRemoteInvoices}
                    onClick={fetchRemoteInvoices}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition cursor-pointer shadow-sm"
                    title="Reload all bills directly from Supabase Cloud"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoadingRemoteInvoices ? 'animate-spin' : ''}`} />
                    <span>{isLoadingRemoteInvoices ? 'Syncing...' : 'Sync Cloud Bills'}</span>
                  </button>
                  <a
                    href="/?tab=invoices"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-amber-500/10 cursor-pointer"
                    title="Open full interactive invoice manager in Billing Studio"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Studio</span>
                  </a>
                </div>
              </div>

              {remoteFetchNotice && (
                <div className={`mt-3 p-3 rounded-2xl text-xs flex items-center gap-2 ${
                  remoteFetchNotice.type === 'error'
                    ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                    : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                }`}>
                  {remoteFetchNotice.type === 'error' ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" /> : <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
                  <span>{remoteFetchNotice.text}</span>
                </div>
              )}
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Total Invoiced</span>
                  <Receipt className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-slate-100 font-mono">
                  INR {billMetrics.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {billMetrics.totalCount} total bill(s)
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Received</span>
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  INR {billMetrics.totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-500/80 mt-1">
                  {billMetrics.totalPaidCount} fully paid
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Balance Due</span>
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-xl font-bold text-rose-400 font-mono">
                  INR {billMetrics.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-rose-500/80 mt-1">
                  {billMetrics.totalUnpaidCount + billMetrics.totalPartialCount} pending
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Bills Summary</span>
                  <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="text-xl font-bold text-slate-100 font-mono">
                  {billMetrics.totalCount} Bills
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {billMetrics.totalPaidCount} Paid · {billMetrics.totalPartialCount} Partial · {billMetrics.totalUnpaidCount} Unpaid
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                    placeholder="Search by invoice number, client name, or company..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {[
                    { id: 'all', label: `All (${billMetrics.totalCount})` },
                    { id: 'unpaid', label: `Unpaid (${billMetrics.totalUnpaidCount})` },
                    { id: 'partially_paid', label: `Partial (${billMetrics.totalPartialCount})` },
                    { id: 'paid', label: `Paid (${billMetrics.totalPaidCount})` },
                    { id: 'draft', label: 'Draft' },
                    { id: 'cancelled', label: 'Cancelled' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBillStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
                        billStatusFilter === tab.id
                          ? 'bg-amber-500 text-slate-950 font-bold shadow'
                          : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invoices Table */}
              {filteredBills.length === 0 ? (
                <div className="p-10 text-center border border-dashed border-slate-800 rounded-2xl text-slate-400 text-xs bg-slate-950/20">
                  {billSearch ? 'No bills found matching your search.' : 'No studio bills available.'}
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-3">Client / Company</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Total</th>
                        <th className="py-3 px-3 text-right">Balance Due</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                      {filteredBills.map((inv) => {
                        const isPaid = inv.status === 'paid' || (Number(inv.balanceDue) <= 0 && inv.status !== 'cancelled');
                        const isPartial = inv.status === 'partially_paid';
                        const isCancelled = inv.status === 'cancelled';
                        const isDraft = inv.status === 'draft';

                        return (
                          <tr key={inv.invoiceNumber || inv.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                              #{inv.invoiceNumber || `DRF-${String(inv.id).padStart(4, '0')}`}
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="font-bold text-slate-100">
                                {inv.resolvedClientName}
                              </div>
                              {inv.resolvedCompany && (
                                <div className="text-[11px] text-slate-400 font-normal">
                                  {inv.resolvedCompany}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-slate-400 font-mono text-[11px]">
                              {inv.invoiceDate || 'N/A'}
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                isPaid
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : isPartial
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : isCancelled
                                  ? 'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                                  : isDraft
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              }`}>
                                {isPaid ? 'Paid' : isPartial ? 'Partially Paid' : isCancelled ? 'Cancelled' : isDraft ? 'Draft' : 'Unpaid'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-medium text-slate-200">
                              INR {Number(inv.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-bold">
                              <span className={Number(inv.balanceDue || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                INR {Number(inv.balanceDue !== undefined ? inv.balanceDue : inv.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyBillSummary(inv)}
                                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Copy bill summary"
                                >
                                  {copiedBillId === inv.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenBillInStudio(inv)}
                                  className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                  title="Open in Billing Studio"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Open</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: MANAGE FEATURES & SUBSCRIPTION FOR SPECIFIC CUSTOMER / USER */}
      {featureModalCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative my-8">
            <button
              type="button"
              onClick={() => setFeatureModalCustomer(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 font-display">
                  Manage Features & Subscription
                </h3>
                <p className="text-xs text-slate-400">
                  {featureModalCustomer.customerName} ({featureModalCustomer.id})
                </p>
              </div>
            </div>

            {modalNotice && (
              <div className={`mb-4 p-3 rounded-2xl text-xs flex items-center gap-2 ${
                modalNotice.type === 'error'
                  ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                  : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
              }`}>
                {modalNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" /> : <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
                <span>{modalNotice.text}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Plan Tier Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'trial', label: 'Trial' },
                  { id: 'starter', label: 'Starter' },
                  { id: 'pro', label: 'Pro Suite' },
                  { id: 'enterprise', label: 'Lifetime' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setModalPlanTier(t.id);
                      if (t.id === 'enterprise') setModalIsLifetime(true);
                      else setModalIsLifetime(false);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      modalPlanTier === t.id
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Feature Selection Header & Controls */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Granted Features ({modalSelectedFeatures.length}/{FEATURE_MODULES.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModalSelectedFeatures(FEATURE_MODULES.map(f => f.key))}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-semibold"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalSelectedFeatures([])}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-[10px] text-slate-400 hover:text-rose-300 font-semibold"
                    >
                      Deselect
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar pt-1">
                  {FEATURE_MODULES.map((mod) => {
                    const isChecked = modalSelectedFeatures.includes(mod.key);
                    const ModIcon = mod.icon;
                    return (
                      <div
                        key={mod.key}
                        onClick={() => handleToggleModalFeature(mod.key)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                            : 'bg-slate-900/40 border-slate-800/80 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ModIcon className={`w-3.5 h-3.5 shrink-0 ${isChecked ? 'text-amber-400' : 'text-slate-600'}`} />
                          <span className="text-[11px] font-semibold truncate">{mod.name}</span>
                        </div>
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-amber-500 border-amber-500' : 'border-slate-700 bg-slate-950'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Generated Result Preview (if re-signed) */}
              {modalGeneratedKey && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/30 space-y-2 animate-scaleIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">Updated Signed Key</span>
                    <button
                      type="button"
                      onClick={() => handleCopyLicenseKey(modalGeneratedKey.key)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy New Key</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[10px] text-amber-200 break-all select-all max-h-20 overflow-y-auto">
                    {modalGeneratedKey.key}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={isModalSaving}
                  onClick={handleSaveCustomerFeatures}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-500/20 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isModalSaving ? 'Saving...' : 'Re-Sign License'}</span>
                </button>

                <button
                  type="button"
                  disabled={isModalSaving}
                  onClick={handleApplyFeaturesToWorkspace}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
                  title="Apply features directly to the local browser / workspace database"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Apply to Local Studio</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW STUDIO USER */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <button
              type="button"
              onClick={() => setIsAddCustomerOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 font-display">
                  Add New Studio User / Customer
                </h3>
                <p className="text-xs text-slate-400">
                  Register a customer record with a chosen subscription model and manual features
                </p>
              </div>
            </div>

            {newCustNotice && (
              <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs">
                {newCustNotice.text}
              </div>
            )}

            <form onSubmit={handleCreateCustomerWithFeatures} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Customer / Studio Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Skyline Media"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Plan Tier
                  </label>
                  <select
                    value={newCustTier}
                    onChange={(e) => {
                      const t = e.target.value;
                      setNewCustTier(t);
                      if (t === 'enterprise') setNewCustLifetime(true);
                      else setNewCustLifetime(false);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                  >
                    <option value="trial">Trial (14 Days)</option>
                    <option value="starter">Starter Studio</option>
                    <option value="pro">Pro Suite</option>
                    <option value="enterprise">Lifetime</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    disabled={newCustLifetime}
                    value={newCustLifetime ? '' : newCustDays}
                    onChange={(e) => setNewCustDays(Number(e.target.value))}
                    placeholder={newCustLifetime ? 'Lifetime' : '365'}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Manual Feature Selection in New User Form */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Grant Features ({newCustFeatures.length}/{FEATURE_MODULES.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setNewCustFeatures(FEATURE_MODULES.map(f => f.key))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCustFeatures([])}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto no-scrollbar">
                  {FEATURE_MODULES.map((mod) => {
                    const isChecked = newCustFeatures.includes(mod.key);
                    return (
                      <div
                        key={mod.key}
                        onClick={() => {
                          setNewCustFeatures(prev => 
                            prev.includes(mod.key) ? prev.filter(k => k !== mod.key) : [...prev, mod.key]
                          );
                        }}
                        className={`p-2 rounded-xl border text-[11px] font-semibold flex items-center justify-between cursor-pointer transition ${
                          isChecked ? 'bg-amber-500/10 border-amber-500/40 text-slate-100' : 'bg-slate-900/40 border-slate-800 text-slate-500'
                        }`}
                      >
                        <span className="truncate">{mod.name}</span>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-amber-500 border-amber-500' : 'border-slate-700 bg-slate-950'
                        }`}>
                          {isChecked && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Plan Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="e.g. Studio contact details, custom features granted, payment method."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-2.5 text-xs text-slate-100 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md shadow-amber-500/20"
              >
                Create Customer Record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboardPage;
