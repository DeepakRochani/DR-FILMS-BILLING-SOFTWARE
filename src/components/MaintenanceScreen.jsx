import React, { useState } from 'react';
import { ShieldCheck, Phone, Mail, Wrench, Lock, ArrowRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { AdminPinModal } from './AdminPinModal';

export function MaintenanceScreen({ onAdminAuthenticated }) {
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const deployConfig = useLiveQuery(() => db.settings.get('admin_deployment_config'));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-4xl flex items-center justify-between py-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-amber-500/20">
            DR
          </div>
          <div>
            <h1 className="font-display font-bold text-base text-slate-100 tracking-tight leading-none">
              {settings?.businessName || 'DR FILMS'}
            </h1>
            <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider mt-0.5">
              Creative Studios & Cinema
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAdminModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-amber-400 font-medium transition-colors cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Admin Portal Login</span>
        </button>
      </header>

      {/* Center Maintenance Content */}
      <div className="max-w-lg w-full text-center space-y-6 relative z-10 py-12">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/20">
          <Wrench className="w-10 h-10 text-amber-400 animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
            System Maintenance Underway
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-display text-slate-100 tracking-tight">
            We Will Be Right Back
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
            {deployConfig?.maintenanceMessage || 
             'The DR FILMS Billing System is currently undergoing scheduled platform upgrades and database optimizations. Regular billing access will resume shortly.'}
          </p>
        </div>

        {/* Contact info for urgent queries */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 max-w-md mx-auto space-y-2.5 text-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
            For Urgent Studio Inquiries & Invoicing
          </span>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-300">
            {settings?.phone && (
              <a 
                href={`tel:${settings.phone}`}
                className="flex items-center gap-1.5 hover:text-amber-400 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-amber-500" />
                <span>{settings.phone}</span>
              </a>
            )}
            {settings?.email && (
              <a 
                href={`mailto:${settings.email}`}
                className="flex items-center gap-1.5 hover:text-amber-400 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-amber-500" />
                <span>{settings.email}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-xs text-slate-500 text-center py-4 relative z-10">
        &copy; {new Date().getFullYear()} {settings?.businessName || 'DR FILMS'}. All rights reserved.
      </footer>

      {/* Admin Unlock Modal */}
      <AdminPinModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onAuthenticated={() => {
          setIsAdminModalOpen(false);
          onAdminAuthenticated();
        }}
      />
    </div>
  );
}
