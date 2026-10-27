import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  Clock,
  Layers, 
  Percent, 
  Users, 
  Settings, 
  Plus, 
  Wifi, 
  WifiOff, 
  Download, 
  Clapperboard,
  Sparkles,
  Trash2,
  Power,
  FileSpreadsheet,
  Wallet,
  Briefcase,
  FileText,
  ShieldCheck,
  Award,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { calculateSubscriptionStatus } from '../utils/licenseManager';
import { isFeatureAllowedByLicense } from '../utils/licenseCrypto';
import { syncBidirectional } from '../utils/supabaseSync';


export function Layout({ currentTab, onSelectTab, onNewInvoice, onRequestCloseApp, onOpenAdminPortal, children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const handleCloudSync = async () => {
    setIsCloudSyncing(true);
    try {
      await syncBidirectional();
    } catch (e) {
      console.warn('Manual cloud sync failed:', e);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Live count of active unpaid invoices (excluding soft-deleted bills)
  const unpaidCount = useLiveQuery(
    async () => {
      const unpaid = await db.invoices.where('status').equals('unpaid').or('status').equals('partially_paid').toArray();
      return unpaid.filter(inv => !inv?.isDeleted).length;
    },
    [],
    0
  );

  // Live count of items in Trash
  const trashCount = useLiveQuery(
    async () => {
      const deletedInvoices = await db.invoices.filter(inv => Boolean(inv?.isDeleted)).count();
      const deletedCustomers = await db.customers.filter(c => Boolean(c?.isDeleted)).count();
      let deletedExpenses = 0;
      try {
        if (db.expenses) {
          deletedExpenses = await db.expenses.filter(e => Boolean(e?.isDeleted)).count();
        }
      } catch {}
      let deletedProjects = 0;
      try {
        if (db.projects) {
          deletedProjects = await db.projects.filter(p => Boolean(p?.isDeleted)).count();
        }
      } catch {}
      return deletedInvoices + deletedCustomers + deletedExpenses + deletedProjects;
    },
    [],
    0
  );

  const settings = useLiveQuery(() => db.settings.get('business_profile'));

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

  const subStatus = calculateSubscriptionStatus(subscriptionConfig);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
    { id: 'invoices', label: 'Bills', shortLabel: 'Bills', icon: Receipt, badge: unpaidCount > 0 ? unpaidCount : null },
    { id: 'quotes', label: 'Estimates', shortLabel: 'Quotes', icon: FileText, flag: 'enableQuotes' },
    { id: 'projects', label: 'Projects', shortLabel: 'Projects', icon: Briefcase, flag: 'enableProjects' },
    { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: FileSpreadsheet, flag: 'enableReports' },
    { id: 'expenses', label: 'Expenses', shortLabel: 'Expenses', icon: Wallet, flag: 'enableExpenses' },
    { id: 'hour_calculator', label: 'Hour Calculator', shortLabel: 'Calc', icon: Clock, flag: 'enableHourCalculator' },
    { id: 'services', label: 'Services', shortLabel: 'Services', icon: Layers },
    { id: 'charges', label: 'Charges', shortLabel: 'Charges', icon: Percent },
    { id: 'customers', label: 'Clients', shortLabel: 'Clients', icon: Users },
    { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
    { id: 'trash', label: 'Trash', shortLabel: 'Trash', icon: Trash2, badge: trashCount > 0 ? trashCount : null, isTrash: true },
  ];

  const navItems = allNavItems.filter(item => {
    if (!item.flag) return true;
    const isAllowedByLicense = isFeatureAllowedByLicense(item.flag, subStatus?.allowedFeatures);
    if (!isAllowedByLicense) return false;
    if (!featureFlags) return true;
    return featureFlags[item.flag] !== false;
  });


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (hidden on print and small screens) */}
      <aside className="no-print hidden lg:flex flex-col w-64 border-r border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 h-screen shrink-0 z-30">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Clapperboard className="w-5 h-5 text-slate-950" />
              )}
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-100 tracking-tight leading-none">
                {settings?.businessName || 'DR FILMS'}
              </h1>
              <p className="text-[11px] font-medium text-amber-500 mt-1 uppercase tracking-wider">
                Billing Studio
              </p>
              {subStatus && (
                <div className="mt-1.5">
                  {subStatus.isLifetime ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                      Lifetime License
                    </span>
                  ) : subStatus.status === 'trial' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                      Trial: {subStatus.daysRemaining}d left
                    </span>
                  ) : subStatus.daysRemaining <= 30 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/25">
                      {subStatus.daysRemaining}d remaining
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      {subStatus.planName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick New Bill CTA */}
        <div className="p-4">
          <button
            type="button"
            onClick={onNewInvoice}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold py-3 px-4 rounded-xl shadow-lg shadow-amber-500/15 transition-all duration-200 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            <span>Create New Bill</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? item.isTrash
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold'
                    : item.isTrash
                    ? 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/20 border border-transparent'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${
                    isActive 
                      ? (item.isTrash ? 'text-rose-400' : 'text-amber-400') 
                      : (item.isTrash ? 'text-rose-400/80' : 'text-slate-400')
                  }`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    item.isTrash
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono'
                      : 'bg-amber-500 text-slate-950'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Admin Master Portal Button */}
          {onOpenAdminPortal && (
            <div className="pt-2 mt-2 border-t border-slate-800/60">
              <button
                type="button"
                onClick={onOpenAdminPortal}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                  currentTab === 'admin_dashboard'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-900/80 text-slate-300 hover:text-amber-300 hover:border-amber-500/30 hover:bg-slate-800/80 border-slate-800'
                }`}
                title="Master Admin Portal: Users, Access Control & Website Deployment"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Admin Portal</span>
                </div>
                <span className="text-[10px] font-mono tracking-wider uppercase bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/25">
                  Master
                </span>
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Footer: Install button & Offline Status */}
        <div className="p-4 border-t border-slate-800/80 space-y-2">
          {isInstallable && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-2 px-3 rounded-lg border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Install PWA App</span>
            </button>
          )}

          <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="text-slate-400 flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Online (Synced)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Offline Ready</span>
                </>
              )}
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
              IndexedDB
            </span>
          </div>

          {onRequestCloseApp && (
            <button
              type="button"
              onClick={onRequestCloseApp}
              className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold py-2 px-3 rounded-lg border border-rose-500/30 transition-colors cursor-pointer group"
              title="Update backup to Google Sheets and close window safely"
            >
              <Power className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              <span>Close Billing App</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main App Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Header (hidden on print) */}
        <header className="no-print lg:hidden sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-bold shadow">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Clapperboard className="w-4 h-4 text-slate-950" />
              )}
            </div>
            <div>
              <h2 className="font-display font-bold text-sm tracking-tight leading-none text-slate-100">
                {settings?.businessName || 'DR FILMS'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                  {isOnline ? 'Offline-Ready' : 'Offline Mode'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAdminPortal && (
              <button
                type="button"
                onClick={onOpenAdminPortal}
                className={`p-1.5 rounded-lg border transition-colors ${
                  currentTab === 'admin_dashboard'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 hover:text-amber-300 border-slate-700'
                }`}
                title="Admin Portal"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
              </button>
            )}
            {onRequestCloseApp && (
              <button
                type="button"
                onClick={onRequestCloseApp}
                className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
                title="Backup & Close App"
              >
                <Power className="w-4 h-4" />
              </button>
            )}
            {isInstallable && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="p-1.5 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700 border border-slate-700"
                title="Install App"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              disabled={isCloudSyncing}
              onClick={handleCloudSync}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                isCloudSyncing
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border-slate-700'
              }`}
              title="Sync with Cloud (Keeps Localhost & Live in Parity)"
            >
              {isCloudSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">{isCloudSyncing ? 'Syncing...' : 'Cloud Sync'}</span>
            </button>
            <button
              type="button"
              onClick={onNewInvoice}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-500/20 active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" />
              <span>New Bill</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (hidden on print and desktop) */}
        <nav className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around overflow-x-auto no-scrollbar gap-1 safe-bottom">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative shrink-0 ${
                  isActive
                    ? item.isTrash ? 'text-rose-400' : 'text-amber-400'
                    : item.isTrash ? 'text-rose-400/80 hover:text-rose-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  {item.badge !== null && item.badge !== undefined && (
                    <span className={`absolute -top-1 -right-2 text-[10px] font-bold px-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center ${
                      item.isTrash ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] mt-1 truncate ${
                  isActive 
                    ? (item.isTrash ? 'font-semibold text-rose-400' : 'font-semibold text-amber-400') 
                    : 'font-normal'
                }`}>
                  {item.shortLabel || item.label}
                </span>
                {isActive && (
                  <span className={`w-1 h-1 rounded-full mt-0.5 ${item.isTrash ? 'bg-rose-400' : 'bg-amber-400'}`} />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
