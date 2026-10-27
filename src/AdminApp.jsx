import React, { useState, useEffect } from 'react';
import { db } from './db/db';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminPinModal } from './components/AdminPinModal';
import { ErrorBoundary } from './components/ErrorBoundary';

export function AdminApp() {
  // Pure in-memory admin authentication state.
  // Never persisted in client storage or cookies.
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    async function checkDb() {
      try {
        await db.open();
        setIsDbReady(true);
      } catch {
        setIsDbReady(true);
      }
    }
    checkDb();
  }, []);

  const handleReturnToBilling = () => {
    window.location.href = '/';
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
  };

  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center animate-pulse mb-3">
          <span className="text-amber-400 font-display font-extrabold text-xl">DR</span>
        </div>
        <p className="text-slate-400 text-sm font-medium">Initializing DR FILMS Admin Control Portal...</p>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <AdminPinModal
          isOpen={true}
          onClose={handleReturnToBilling}
          onAuthenticated={() => setIsAdminAuthenticated(true)}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary onGoToBills={handleReturnToBilling}>
      <AdminDashboardPage
        onReturnToBilling={handleReturnToBilling}
        onAdminLogout={handleAdminLogout}
      />
    </ErrorBoundary>
  );
}

export default AdminApp;
