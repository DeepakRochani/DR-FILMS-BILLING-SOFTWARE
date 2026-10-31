import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { initDatabase } from './db/seedData';
import { db } from './db/db';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { CreateInvoicePage } from './pages/CreateInvoicePage';
import { InvoiceViewPage } from './pages/InvoiceViewPage';
import { ServicesPage } from './pages/ServicesPage';
import { ChargesPage } from './pages/ChargesPage';
import { CustomersPage } from './pages/CustomersPage';
import { SettingsPage } from './pages/SettingsPage';
import { exportDatabaseJSON, isWeeklyBackupOverdue } from './db/backup';
import { reconcileAllCustomerSnapshots } from './utils/customerSync';

import { TrashPage } from './pages/TrashPage';
const HourCalculatorPage = React.lazy(() => import('./pages/HourCalculatorPage').then(m => ({ default: m.HourCalculatorPage || m.default })));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage || m.default })));
const ExpensesPage = React.lazy(() => import('./pages/ExpensesPage').then(m => ({ default: m.ExpensesPage || m.default })));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage || m.default })));
const QuotesPage = React.lazy(() => import('./pages/QuotesPage').then(m => ({ default: m.QuotesPage || m.default })));
const CreateQuotePage = React.lazy(() => import('./pages/CreateQuotePage').then(m => ({ default: m.CreateQuotePage || m.default })));

function PageSuspenseFallback() {
  return (
    <div className="flex items-center justify-center min-h-[360px] text-slate-400 text-sm font-medium">
      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-5 py-3.5 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-300">Loading component...</span>
      </div>
    </div>
  );
}
import { SubscriptionLockoutScreen } from './components/SubscriptionLockoutScreen';
import { SafeCloseModal } from './components/SafeCloseModal';
import { PinLockScreen } from './components/PinLockScreen';
import { calculateSubscriptionStatus, preVerifyLicenseKey } from './utils/licenseManager';
import { isFeatureAllowedByLicense } from './utils/licenseCrypto';
import { initGoogleSheetsSync, scheduleAutoSync } from './utils/googleSheetsSync';
import { setupRealtimeSync, syncBidirectional, registerDexieSyncHooks } from './utils/supabaseSync';

import { initCrossOriginBridge, isSyncChannelMode, mergeFromCounterpart } from './utils/crossOriginSync';
import { recordUserActivity, shouldLockOnResume } from './utils/security';
import { calculateInvoiceTotals } from './utils/calculations';

export function CustomerApp() {
  const isSyncChannel = isSyncChannelMode();
  if (isSyncChannel) {
    initCrossOriginBridge();
    return (
      <div className="p-4 text-xs text-slate-500 font-mono">
        DR FILMS Cross-Origin Sync Channel Active ({typeof window !== 'undefined' ? window.location.origin : ''})
      </div>
    );
  }

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [editInvoiceId, setEditInvoiceId] = useState(null);
  const [editQuoteId, setEditQuoteId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState(null);
  const [prefilledLineItem, setPrefilledLineItem] = useState(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [counterpartAlert, setCounterpartAlert] = useState(null);
  const [isMergingCounterpart, setIsMergingCounterpart] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [swUpdateEvent, setSwUpdateEvent] = useState(null);
  const [showSwUpdateBanner, setShowSwUpdateBanner] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [isExportingQuickBackup, setIsExportingQuickBackup] = useState(false);

  // PWA Service Worker Update Listener
  useEffect(() => {
    const handleSwNeedRefresh = (e) => {
      if (e.detail?.updateSW) {
        setSwUpdateEvent(() => e.detail.updateSW);
        setShowSwUpdateBanner(true);
      }
    };
    window.addEventListener('drfilms:sw-need-refresh', handleSwNeedRefresh);
    return () => window.removeEventListener('drfilms:sw-need-refresh', handleSwNeedRefresh);
  }, []);

  // Weekly Backup Overdue Check
  useEffect(() => {
    const checkBackup = async () => {
      try {
        const dismissedUntil = localStorage.getItem('drfilms_backup_reminder_dismissed');
        if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
          return;
        }
        const overdue = await isWeeklyBackupOverdue(7);
        if (overdue) {
          setShowBackupReminder(true);
        }
      } catch {
        // Ignore in restricted environments
      }
    };
    checkBackup();
  }, []);

  const handleQuickBackupDownload = async () => {
    setIsExportingQuickBackup(true);
    try {
      await exportDatabaseJSON();
      setShowBackupReminder(false);
    } finally {
      setIsExportingQuickBackup(false);
    }
  };

  const handleDismissBackupReminder = () => {
    setShowBackupReminder(false);
    try {
      localStorage.setItem('drfilms_backup_reminder_dismissed', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // Ignore
    }
  };

  // Subscription & Feature Flags State
  const subscriptionConfig = useLiveQuery(
    async () => {
      if (!db.settings) return null;
      try {
        return (await db.settings.get('admin_subscription_config')) || null;
      } catch {
        return null;
      }
    },
    [],
    null
  );
  const featureFlags = useLiveQuery(
    async () => {
      if (!db.settings) return null;
      try {
        return (await db.settings.get('admin_feature_flags')) || null;
      } catch {
        return null;
      }
    },
    [],
    null
  );
  const totalInvoiceCount = useLiveQuery(
    async () => {
      if (!db.invoices) return 0;
      try {
        return await db.invoices.filter(i => !i?.isDeleted).count();
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  const subscriptionStatus = calculateSubscriptionStatus(subscriptionConfig, totalInvoiceCount);

  // Pre-verify license key asynchronously on launch
  useEffect(() => {
    if (subscriptionConfig?.licenseKey) {
      preVerifyLicenseKey(subscriptionConfig.licenseKey);
    }
  }, [subscriptionConfig?.licenseKey]);

  // Feature Flag & License Permission Redirection Guard
  useEffect(() => {
    if (!featureFlags) return;
    const allowed = subscriptionStatus?.allowedFeatures || ['*'];
    const isPermitted = (flagKey) => {
      return isFeatureAllowedByLicense(flagKey, allowed) && featureFlags[flagKey] !== false;
    };

    if (currentTab === 'quotes' && !isPermitted('enableQuotes')) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'projects' && !isPermitted('enableProjects')) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'reports' && !isPermitted('enableReports')) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'expenses' && !isPermitted('enableExpenses')) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'hour_calculator' && !isPermitted('enableHourCalculator')) {
      setCurrentTab('dashboard');
    }
  }, [currentTab, featureFlags, subscriptionStatus?.allowedFeatures]);

  // Security & App PIN Lock State
  const securityProfile = useLiveQuery(() => db.settings.get('security_profile'));
  const [isLocked, setIsLocked] = useState(true);

  // Auto-unlock if security profile is not configured or disabled
  useEffect(() => {
    if (securityProfile !== undefined) {
      if (!securityProfile || !securityProfile.isEnabled) {
        setIsLocked(false);
      }
    }
  }, [securityProfile]);

  // Global user activity tracking (mousedown, keydown, touchstart, scroll)
  useEffect(() => {
    const handleActivity = () => {
      recordUserActivity();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    recordUserActivity();

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, []);

  // Inactivity & Visibility Change lock monitor
  useEffect(() => {
    if (!securityProfile || !securityProfile.isEnabled) return;

    const checkLock = () => {
      if (!isLocked && shouldLockOnResume(securityProfile.timeoutMinutes)) {
        setIsLocked(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkLock();
      }
    };

    const handleFocus = () => {
      checkLock();
    };

    const interval = setInterval(checkLock, 15000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [securityProfile, isLocked]);

  useEffect(() => {
    initDatabase().then(async () => {
      setIsDbReady(true);
      initGoogleSheetsSync();
      initCrossOriginBridge();
      try {
        await reconcileAllCustomerSnapshots();
      } catch (err) {
        console.warn('Customer snapshot reconciliation notice:', err);
      }
      try {
        registerDexieSyncHooks(db);
        setupRealtimeSync();
        await syncBidirectional();
      } catch (err) {
        console.warn('Supabase sync notice:', err);
      }
    });
  }, []);

  // Auto-dismiss floating toast notifications after 4 seconds
  useEffect(() => {
    if (syncToast) {
      const timer = setTimeout(() => {
        setSyncToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [syncToast]);

  useEffect(() => {
    const handleCounterpartFound = (e) => {
      if (e.detail && e.detail.missingInvoices?.length > 0) {
        setCounterpartAlert(e.detail);
      }
    };

    window.addEventListener('drfilms:counterpart-data-found', handleCounterpartFound);
    return () => window.removeEventListener('drfilms:counterpart-data-found', handleCounterpartFound);
  }, []);

  const handleMergeCounterpart = async () => {
    if (!counterpartAlert?.reportData) return;
    setIsMergingCounterpart(true);
    try {
      const res = await mergeFromCounterpart(counterpartAlert.reportData);
      if (res.success) {
        setCounterpartAlert(null);
        setSyncToast({
          type: 'synced',
          message: `Successfully restored ${counterpartAlert.missingInvoices.length} bill(s)!`
        });
      } else {
        alert('Failed to merge bills: ' + res.error);
      }
    } finally {
      setIsMergingCounterpart(false);
    }
  };

  useEffect(() => {
    const handleSyncEvent = (e) => {
      const { type, message } = e.detail || {};
      if (type === 'error' || type === 'pending' || type === 'synced') {
        setSyncToast({ type, message });
        setTimeout(() => {
          setSyncToast(prev => (prev?.message === message ? null : prev));
        }, 5000);
      }
    };

    window.addEventListener('drfilms:sheets-sync', handleSyncEvent);
    return () => window.removeEventListener('drfilms:sheets-sync', handleSyncEvent);
  }, []);

  const handleNewInvoice = (customerId = null, initialLineItem = null) => {
    setEditInvoiceId(null);
    setActiveInvoiceId(null);
    setPreselectedCustomerId(customerId);
    setPrefilledLineItem(initialLineItem);
    setCurrentTab('create_invoice');
  };

  const handleAddToDraft = async (draftId, lineItem) => {
    const draft = await db.invoices.get(Number(draftId));
    if (!draft) return;
    const currentItems = Array.isArray(draft.items) ? [...draft.items] : [];
    currentItems.push({
      id: Date.now() + Math.random(),
      ...lineItem
    });
    const totals = calculateInvoiceTotals({
      items: currentItems,
      charges: draft.charges || [],
      discountType: draft.discountType || 'fixed',
      discountValue: draft.discountValue || 0,
      taxPercentage: draft.taxPercentage !== undefined ? draft.taxPercentage : 18,
      advancePaid: draft.advancePaid || 0
    });
    await db.invoices.update(Number(draftId), {
      items: currentItems,
      subtotal: totals.subtotal,
      totalAmount: totals.totalAmount,
      balanceDue: totals.balanceDue,
      taxAmount: totals.taxAmount,
      updatedAt: new Date().toISOString()
    });
    scheduleAutoSync(500);
    setEditInvoiceId(Number(draftId));
    setActiveInvoiceId(Number(draftId));
    setCurrentTab('edit_invoice');
  };

  const handleEditInvoice = (id) => {
    const numId = Number(id);
    setEditInvoiceId(numId);
    setActiveInvoiceId(numId);
    setCurrentTab('edit_invoice');
  };

  const handleViewInvoice = (id) => {
    const numId = Number(id);
    setActiveInvoiceId(numId);
    setEditInvoiceId(null);
    setCurrentTab('view_invoice');
  };

  const handleInvoiceSaved = (savedId) => {
    const numId = Number(savedId);
    setActiveInvoiceId(numId);
    setEditInvoiceId(null);
    setCurrentTab('view_invoice');
  };

  const handleCancelInvoiceForm = () => {
    if (activeInvoiceId || editInvoiceId) {
      setActiveInvoiceId(activeInvoiceId || editInvoiceId);
      setCurrentTab('view_invoice');
    } else {
      setCurrentTab('invoices');
    }
    setEditInvoiceId(null);
    setPreselectedCustomerId(null);
  };

  const handleResetToInvoices = () => {
    setActiveInvoiceId(null);
    setEditInvoiceId(null);
    setEditQuoteId(null);
    setCurrentTab('invoices');
  };

  const handleNewQuote = () => {
    setEditQuoteId(null);
    setCurrentTab('create_quote');
  };

  const handleEditQuote = (id) => {
    const numId = Number(id);
    setEditQuoteId(numId);
    setCurrentTab('create_quote');
  };

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center animate-pulse mb-3">
          <span className="text-amber-400 font-display font-extrabold text-xl">DR</span>
        </div>
        <p className="text-slate-400 text-sm font-medium">Initializing DR FILMS Studio Engine...</p>
      </div>
    );
  }

  // Subscription Lockout Intercept (Lock software if plan expired, trial bill limit hit, or suspended)
  if (subscriptionStatus?.isLocked) {
    return (
      <SubscriptionLockoutScreen
        subscriptionConfig={subscriptionConfig}
        subscriptionStatus={subscriptionStatus}
        onSubscriptionRenewed={() => {
          // Subscription renewed
        }}
      />
    );
  }

  return (
    <>
      <Layout
        currentTab={currentTab}
        onSelectTab={(tabId) => {
          setEditInvoiceId(null);
          setActiveInvoiceId(null);
          setEditQuoteId(null);
          setPrefilledLineItem(null);
          setCurrentTab(tabId);
        }}
        onNewInvoice={() => handleNewInvoice(null)}
        onRequestCloseApp={() => setIsCloseModalOpen(true)}
      >
      <ErrorBoundary onGoToBills={handleResetToInvoices}>
        {/* PWA Update Available Banner */}
        {showSwUpdateBanner && (
          <div className="mb-6 bg-gradient-to-r from-sky-500/20 via-sky-600/10 to-transparent border border-sky-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2.5 py-1.5 rounded-xl">UPDATE</span>
              <div>
                <h4 className="text-sm font-bold text-sky-200">
                  New Version Available
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  An update to DR FILMS Billing is ready. Your offline database in IndexedDB is completely preserved.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (swUpdateEvent) {
                    swUpdateEvent(true);
                  } else {
                    window.location.reload();
                  }
                }}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                Update Now
              </button>
              <button
                type="button"
                onClick={() => setShowSwUpdateBanner(false)}
                className="text-slate-400 hover:text-slate-200 text-xs py-2 px-2.5 rounded-xl hover:bg-slate-800/60 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Weekly Backup Overdue Reminder Banner */}
        {showBackupReminder && (
          <div className="mb-6 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-transparent border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-xl">BACKUP</span>
              <div>
                <h4 className="text-sm font-bold text-amber-200">
                  Weekly Backup Reminder
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  You have not exported a local backup in the last 7 days. Download a JSON snapshot to keep your business records safe.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                disabled={isExportingQuickBackup}
                onClick={handleQuickBackupDownload}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                {isExportingQuickBackup ? 'Exporting...' : 'Download Backup (JSON)'}
              </button>
              <button
                type="button"
                onClick={handleDismissBackupReminder}
                className="text-slate-400 hover:text-slate-200 text-xs py-2 px-2.5 rounded-xl hover:bg-slate-800/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Missing Bills Cross-Origin Recovery Banner */}
        {counterpartAlert && (
          <div className="mb-6 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-transparent border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-xl">SYNC</span>
              <div>
                <h4 className="text-sm font-bold text-amber-200">
                  Found {counterpartAlert.missingInvoices.length} bill(s) from your {counterpartAlert.origin} session!
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Bills created yesterday under <code className="text-amber-400 bg-slate-900/60 px-1 py-0.5 rounded">{counterpartAlert.origin}</code> were detected. Click restore to merge them into this view.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                disabled={isMergingCounterpart}
                onClick={handleMergeCounterpart}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                {isMergingCounterpart ? 'Restoring...' : 'Restore & Merge All Bills'}
              </button>
              <button
                type="button"
                onClick={() => setCounterpartAlert(null)}
                className="text-slate-400 hover:text-slate-200 text-xs py-2 px-2.5 rounded-xl hover:bg-slate-800/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <React.Suspense fallback={<PageSuspenseFallback />}>
        {currentTab === 'dashboard' && (
          <DashboardPage
            onNewInvoice={() => handleNewInvoice(null)}
            onViewInvoice={handleViewInvoice}
            onGoToInvoices={() => setCurrentTab('invoices')}
            onGoToClients={() => setCurrentTab('customers')}
            onGoToSettings={() => setCurrentTab('settings')}
            onGoToTrash={() => setCurrentTab('trash')}
            onGoToExpenses={() => setCurrentTab('expenses')}
            onGoToProjects={(projectId) => {
              setCurrentTab('projects');
              if (projectId) setSelectedProjectId(projectId);
            }}
          />
        )}

        {currentTab === 'invoices' && (
          <InvoicesPage
            onNewInvoice={() => handleNewInvoice(null)}
            onViewInvoice={handleViewInvoice}
            onEditInvoice={handleEditInvoice}
            onGoToTrash={() => setCurrentTab('trash')}
          />
        )}

        {currentTab === 'quotes' && (
          <QuotesPage
            onNewQuote={handleNewQuote}
            onEditQuote={handleEditQuote}
            onViewInvoice={handleViewInvoice}
          />
        )}

        {currentTab === 'create_quote' && (
          <CreateQuotePage
            editQuoteId={editQuoteId}
            onCancel={() => {
              setEditQuoteId(null);
              setCurrentTab('quotes');
            }}
            onSaved={({ quoteId }) => {
              setEditQuoteId(null);
              setCurrentTab('quotes');
            }}
          />
        )}

        {currentTab === 'projects' && (
          <ProjectsPage
            onViewInvoice={handleViewInvoice}
            onGoToTrash={() => setCurrentTab('trash')}
            initialSelectedProjectId={selectedProjectId}
          />
        )}

        {currentTab === 'hour_calculator' && (
          <HourCalculatorPage
            onNewInvoice={handleNewInvoice}
            onAddToDraft={handleAddToDraft}
            onGoToInvoices={() => setCurrentTab('invoices')}
          />
        )}

        {(currentTab === 'create_invoice' || currentTab === 'edit_invoice') && (
          <CreateInvoicePage
            initialCustomerId={preselectedCustomerId}
            initialItem={prefilledLineItem}
            editInvoiceId={editInvoiceId}
            onCancel={handleCancelInvoiceForm}
            onSaved={handleInvoiceSaved}
          />
        )}

        {currentTab === 'view_invoice' && (
          activeInvoiceId ? (
            <InvoiceViewPage
              invoiceId={activeInvoiceId}
              onBack={handleResetToInvoices}
              onEdit={handleEditInvoice}
              onGoToProjects={(projectId) => {
                setCurrentTab('projects');
                if (projectId) setSelectedProjectId(projectId);
              }}
            />
          ) : (
            <InvoicesPage
              onNewInvoice={() => handleNewInvoice(null)}
              onViewInvoice={handleViewInvoice}
              onEditInvoice={handleEditInvoice}
              onGoToTrash={() => setCurrentTab('trash')}
            />
          )
        )}

        {currentTab === 'reports' && (
          <ReportsPage />
        )}

        {currentTab === 'expenses' && (
          <ExpensesPage onGoToTrash={() => setCurrentTab('trash')} />
        )}

        {currentTab === 'services' && (
          <ServicesPage />
        )}

        {currentTab === 'charges' && (
          <ChargesPage />
        )}

        {currentTab === 'customers' && (
          <CustomersPage
            onViewInvoice={handleViewInvoice}
            onNewInvoiceForCustomer={(c) => handleNewInvoice(c.id)}
            onGoToTrash={() => setCurrentTab('trash')}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsPage />
        )}

        {currentTab === 'trash' && (
          <TrashPage
            onBack={() => setCurrentTab('invoices')}
            onGoToInvoices={() => setCurrentTab('invoices')}
            onGoToProjects={() => setCurrentTab('projects')}
            onViewInvoice={handleViewInvoice}
          />
        )}
        </React.Suspense>
      </ErrorBoundary>

      {/* Non-blocking Floating Sync Toast */}
      {syncToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm pointer-events-auto animate-fadeIn">
          <div className={`p-3.5 rounded-2xl shadow-2xl border text-xs flex items-center gap-3 backdrop-blur-md ${
            syncToast.type === 'error'
              ? 'bg-rose-950/90 border-rose-800 text-rose-200'
              : syncToast.type === 'synced'
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              : 'bg-sky-950/90 border-sky-800 text-sky-200'
          }`}>
            <span className="shrink-0 text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700">
              {syncToast.type === 'error' ? 'ERR' : syncToast.type === 'synced' ? 'OK' : 'SYNC'}
            </span>
            <span className="flex-1 font-medium">{syncToast.message}</span>
            <button
              type="button"
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-slate-100 text-xs px-1 font-bold"
            >
              X
            </button>
          </div>
        </div>
      )}
      {/* Safe Close Modal with Backup-First Guarantee */}
      <SafeCloseModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onGoToSettings={() => {
          setIsCloseModalOpen(false);
          setCurrentTab('settings');
        }}
      />
    </Layout>

    {/* Security App PIN Lock Screen */}
    {isLocked && securityProfile?.isEnabled && (
      <PinLockScreen
        securityProfile={securityProfile}
        onUnlock={() => {
          setIsLocked(false);
          recordUserActivity();
        }}
      />
    )}

  </>
  );
}
export default CustomerApp;
