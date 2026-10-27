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
  CheckSquare
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { PLAN_TIERS } from '../utils/licenseManager';
import { 
  generateLicenseKeyAsync, 
  generateSignedRevocationList, 
  importPrivateKeyInMemory 
} from '../utils/adminLicenseGenerator';

export const FEATURE_MODULES = [
  { key: 'enableQuotes', name: 'Estimates & Quotations', category: 'Billing Core', icon: FileSpreadsheet },
  { key: 'enableProjects', name: 'Projects & Crew Tracker', category: 'Production', icon: Briefcase },
  { key: 'enableExpenses', name: 'Expenses & Net Profit', category: 'Finance', icon: Wallet },
  { key: 'enableReports', name: 'Tax & Accountant Reports', category: 'Finance', icon: Percent },
  { key: 'enableHourCalculator', name: 'Hour & Shift Calculator', category: 'Production', icon: Clock },
  { key: 'enableWeddingSuite', name: 'Wedding Studio Suite', category: 'Studio Specialized', icon: Sparkles },
  { key: 'enableContracts', name: 'Legal Service Agreements', category: 'Legal & Compliance', icon: FileText },
  { key: 'enableReceipts', name: 'Official Payment Receipts', category: 'Billing Core', icon: Receipt },
  { key: 'enableWhatsApp', name: 'WhatsApp Invoicing & Reminders', category: 'Client Delivery', icon: MessageSquare },
  { key: 'enableGoogleSheets', name: 'Google Sheets Cloud Backup', category: 'Integration', icon: Database },
  { key: 'enableDirectClient', name: 'Direct Client Fast Billing', category: 'Billing Core', icon: CheckSquare },
  { key: 'enableThemeSwitcher', name: 'Invoice Themes & Styling', category: 'Branding', icon: Layers }
];

export function AdminDashboardPage({ onReturnToBilling, onAdminLogout }) {
  // Navigation tabs: 'issuing' | 'customers' | 'revocations'
  const [activeTab, setActiveTab] = useState('issuing');

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLicenseResult, setGeneratedLicenseResult] = useState(null);
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
        // Verify key by importing to CryptoKey
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

    try {
      const limitVal = billLimit !== '' && !isNaN(Number(billLimit)) ? Number(billLimit) : null;
      const res = await generateLicenseKeyAsync({
        privateKey: privateKeyInMemory,
        planTier,
        durationDays: isLifetime ? 0 : Number(durationDays),
        isLifetime,
        clientCode: customerName.trim(),
        allowedFeatures: ['*'],
        billLimit: limitVal,
        notes: planNotes.trim()
      });

      setGeneratedLicenseResult(res);

      // Save customer record to directory
      const newCustomerItem = {
        id: res.payload.licenseId,
        customerName: res.payload.customerName,
        planTier: res.payload.planTier,
        isLifetime: res.payload.isLifetime,
        issueDate: res.payload.issueDate,
        expiryDate: res.payload.expiryDate,
        billLimit: res.payload.billLimit,
        licenseKey: res.key,
        notes: planNotes.trim(),
        createdAt: new Date().toISOString()
      };

      const existing = (await db.settings.get('admin_customer_directory'))?.data || [];
      const updated = [newCustomerItem, ...existing.filter(c => c.id !== newCustomerItem.id)];
      await db.settings.put({ key: 'admin_customer_directory', data: updated });

      setIssueNotice({ type: 'success', text: `License issued successfully for ${res.payload.customerName}.` });
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

  // 9. Add revocation manually
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

  // 10. Remove revocation from list
  const handleRemoveRevocation = async (licenseId) => {
    const existing = (await db.settings.get('admin_revoked_licenses'))?.data || [];
    const updated = existing.filter(r => r.licenseId !== licenseId);
    await db.settings.put({ key: 'admin_revoked_licenses', data: updated });
    setSignedRevocationJson(null);
  };

  // 11. Sign Revocation List using in-memory private key
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

  // 12. Download signed revoked.json
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">DR FILMS Admin Control Portal</h1>
            <p className="text-xs text-slate-400">Owner Licensing, Customer Directory & Revocation Center</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Key Status Pill */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
            privateKeyInMemory 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            {privateKeyInMemory ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>{privateKeyInMemory ? `Private Key Loaded (${keyLoadedName || 'Session'})` : 'No Private Key Loaded'}</span>
            {privateKeyInMemory && (
              <button
                type="button"
                onClick={handleWipeKeyFromMemory}
                className="ml-1 text-slate-400 hover:text-rose-400 text-[11px] underline"
                title="Wipe private key from RAM immediately"
              >
                Wipe Key
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onReturnToBilling}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Billing Studio</span>
          </button>

          <button
            type="button"
            onClick={onAdminLogout}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Lock admin session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {/* Main Navigation Bar (Reduced to 3 Core Modules) */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 px-6">
        <nav className="flex space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('issuing')}
            className={`py-3.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'issuing'
                ? 'border-amber-400 text-amber-300 bg-amber-400/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>License Issuing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`py-3.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'customers'
                ? 'border-amber-400 text-amber-300 bg-amber-400/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Customer List & Plan Notes</span>
            {customerDirectoryRecord?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {customerDirectoryRecord.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('revocations')}
            className={`py-3.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'revocations'
                ? 'border-amber-400 text-amber-300 bg-amber-400/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Revocation List Management</span>
            {revocationRecord?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-800/40">
                {revocationRecord.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {/* TAB 1: LICENSE ISSUING */}
        {activeTab === 'issuing' && (
          <div className="space-y-6">
            {/* Private Key Session Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>In-Memory Private Key (Session Only)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    To sign ECDSA P-256 licenses and revocation lists, load your private key into memory. 
                    The private key is never written to IndexedDB, localStorage, or sessionStorage.
                  </p>
                </div>
                {privateKeyInMemory && (
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-medium">
                    Key Active in RAM
                  </span>
                )}
              </div>

              {!privateKeyInMemory ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="keyInputType"
                        checked={keyInputType === 'file'}
                        onChange={() => setKeyInputType('file')}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Select local key file (.json)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
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
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".json,.pem,application/json,text/plain"
                        onChange={handleKeyFileUpload}
                        className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        value={keyInputText}
                        onChange={(e) => setKeyInputText(e.target.value)}
                        placeholder="Paste JWK JSON ({'kty':'EC', 'crv':'P-256', 'd':'...'}) or PKCS#8 PEM string..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleKeyTextPaste}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition"
                      >
                        Load Key into Memory
                      </button>
                    </div>
                  )}

                  {keyError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{keyError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-slate-950/80 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Loaded source: <strong>{keyLoadedName}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={handleWipeKeyFromMemory}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/50 rounded text-xs transition"
                  >
                    Clear from RAM
                  </button>
                </div>
              )}
            </div>

            {/* License Generator Form */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Issue Commercial Studio License</span>
              </h2>

              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Customer / Studio Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Royal Wedding Cinema"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Subscription Plan Tier
                    </label>
                    <select
                      value={planTier}
                      onChange={(e) => {
                        const newTier = e.target.value;
                        setPlanTier(newTier);
                        if (newTier === 'enterprise') setIsLifetime(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="trial">Free Trial (14-Day / 25 Invoices)</option>
                      <option value="starter">Starter Studio (Annual / 500 Invoices)</option>
                      <option value="pro">Pro Studio Suite (Annual / Unlimited)</option>
                      <option value="enterprise">Enterprise / Perpetual Lifetime</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Duration (Days)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        disabled={isLifetime}
                        value={durationDays}
                        onChange={(e) => setDurationDays(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLifetime}
                          onChange={(e) => setIsLifetime(e.target.checked)}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        <span>Perpetual Lifetime</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Bill / Invoice Limit (optional)
                    </label>
                    <input
                      type="number"
                      value={billLimit}
                      onChange={(e) => setBillLimit(e.target.value)}
                      placeholder={planTier === 'trial' ? '25' : 'Unlimited (leave blank)'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Plan Notes / Payment Details (Internal)
                  </label>
                  <textarea
                    rows={2}
                    value={planNotes}
                    onChange={(e) => setPlanNotes(e.target.value)}
                    placeholder="e.g. Paid via NEFT Ref #1928491, 1-Year subscription for Main Branch. Contact: Rahul Sharma."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {issueNotice && (
                  <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    issueNotice.type === 'error'
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  }`}>
                    {issueNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                    <span>{issueNotice.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isGenerating || !privateKeyInMemory}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition flex items-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  <span>{isGenerating ? 'Generating Signed Key...' : 'Generate Signed License Key'}</span>
                </button>
              </form>
            </div>

            {/* Generated License Result Card */}
            {generatedLicenseResult && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Cryptographically Signed License Key</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyLicenseKey(generatedLicenseResult.key)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      {copyStatus ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copyStatus ? 'Copied' : 'Copy Key'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadLicenseFile(generatedLicenseResult)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg break-all font-mono text-xs text-amber-200 select-all">
                  {generatedLicenseResult.key}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block">License ID:</span>
                    <span className="text-slate-200 font-mono font-medium">{generatedLicenseResult.payload.licenseId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Customer:</span>
                    <span className="text-slate-200 font-medium">{generatedLicenseResult.payload.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Plan Tier:</span>
                    <span className="text-amber-400 font-semibold uppercase">{generatedLicenseResult.payload.planTier}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Expires:</span>
                    <span className="text-slate-200">{generatedLicenseResult.payload.isLifetime ? 'Never (Lifetime)' : generatedLicenseResult.payload.expiryDate}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CUSTOMER LIST WITH PLAN NOTES */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Customer License Directory & Plan Notes</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage studio customers, record subscription notes, and view expiration status.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search customers or notes..."
                      className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none w-48 md:w-64"
                    />
                  </div>

                  <select
                    value={customerTierFilter}
                    onChange={(e) => setCustomerTierFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="all">All Tiers</option>
                    <option value="pro">Pro Suite</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="starter">Starter</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  No customer licenses found. Issue a new license from the "License Issuing" tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="py-2.5 px-3">Studio / Customer</th>
                        <th className="py-2.5 px-3">Plan Tier</th>
                        <th className="py-2.5 px-3">Issued</th>
                        <th className="py-2.5 px-3">Expiry</th>
                        <th className="py-2.5 px-3">Plan Notes</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredCustomers.map((cust) => (
                        <tr key={cust.id} className="hover:bg-slate-800/20">
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-200 block">{cust.customerName}</span>
                            <span className="font-mono text-[10px] text-slate-500">{cust.id}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 uppercase">
                              {cust.planTier}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400">{cust.issueDate || 'N/A'}</td>
                          <td className="py-3 px-3 text-slate-300">
                            {cust.isLifetime ? 'Lifetime' : (cust.expiryDate || 'N/A')}
                          </td>
                          <td className="py-3 px-3 max-w-xs">
                            {editingNotesId === cust.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingNotesText}
                                  onChange={(e) => setEditingNotesText(e.target.value)}
                                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveNotes(cust.id)}
                                  className="px-2 py-1 bg-amber-500 text-slate-950 rounded text-[11px] font-bold"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNotesId(null)}
                                  className="text-slate-400 hover:text-slate-200 text-[11px]"
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
                                className="cursor-pointer text-slate-400 hover:text-slate-200 truncate"
                                title="Click to edit notes"
                              >
                                {cust.notes || <span className="italic text-slate-600">Click to add plan notes...</span>}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {cust.licenseKey && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyLicenseKey(cust.licenseKey)}
                                  className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                                  title="Copy license key"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRevokeCustomerLicense(cust)}
                                className="p-1.5 hover:bg-rose-950 rounded text-slate-400 hover:text-rose-300"
                                title="Revoke this license"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: REVOCATION LIST MANAGEMENT */}
        {activeTab === 'revocations' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Cryptographic Revocation List Management</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage revoked licenses and generate a signed <code>revoked.json</code> to deploy online.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSigningRevocations || !privateKeyInMemory}
                  onClick={handleSignRevocationList}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition flex items-center gap-2"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isSigningRevocations ? 'Signing...' : 'Sign & Export revoked.json'}</span>
                </button>
              </div>

              {/* Add Revocation Form */}
              <form onSubmit={handleAddRevocation} className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    License ID to Revoke
                  </label>
                  <input
                    type="text"
                    required
                    value={newRevokeId}
                    onChange={(e) => setNewRevokeId(e.target.value)}
                    placeholder="e.g. lic_20261023_abc1"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reason
                  </label>
                  <input
                    type="text"
                    value={newRevokeReason}
                    onChange={(e) => setNewRevokeReason(e.target.value)}
                    placeholder="e.g. Chargeback refund, contract terminated"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition shrink-0"
                >
                  Add to Queue
                </button>
              </form>

              {revocationNotice && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  revocationNotice.type === 'error'
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                }`}>
                  {revocationNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                  <span>{revocationNotice.text}</span>
                </div>
              )}

              {/* Table of Revoked Items */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 mb-2">Revocation Queue ({revocationRecord?.length || 0})</h3>
                {revocationRecord?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-800 rounded">
                    No revoked licenses in the list.
                  </p>
                ) : (
                  <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="py-2 px-3">License ID</th>
                          <th className="py-2 px-3">Reason</th>
                          <th className="py-2 px-3">Revoked Date</th>
                          <th className="py-2 px-3 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {revocationRecord.map((item) => (
                          <tr key={item.licenseId} className="hover:bg-slate-800/20">
                            <td className="py-2 px-3 font-mono font-medium text-rose-300">{item.licenseId}</td>
                            <td className="py-2 px-3 text-slate-300">{item.reason}</td>
                            <td className="py-2 px-3 text-slate-400">{item.revokedAt ? new Date(item.revokedAt).toLocaleDateString() : 'N/A'}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveRevocation(item.licenseId)}
                                className="p-1 text-slate-400 hover:text-rose-400"
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
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Signed revoked.json Ready</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadRevocationJson}
                      className="px-3 py-1 bg-emerald-500 text-slate-950 font-bold rounded text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download revoked.json</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
                    {JSON.stringify(signedRevocationJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminDashboardPage;
