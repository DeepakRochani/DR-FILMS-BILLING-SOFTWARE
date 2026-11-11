import React from 'react';
import { 
  Clapperboard, 
  Receipt, 
  FileText, 
  Briefcase, 
  Wallet, 
  ShieldCheck, 
  Sparkles, 
  QrCode, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Lock, 
  Layers, 
  Users, 
  FileSpreadsheet,
  ChevronRight
} from 'lucide-react';

export function LandingPage({ onLogin, onEnterApp }) {
  const features = [
    {
      title: 'Tax & GST Invoices',
      description: 'Generate clean, professional invoices with automated tax, discounts, and partial payment tracking.',
      icon: Receipt,
      color: 'amber'
    },
    {
      title: 'Estimates & Quotations',
      description: 'Send itemized quotations to prospective clients and convert approved estimates to invoices in one click.',
      icon: FileText,
      color: 'emerald'
    },
    {
      title: 'WhatsApp Delivery & Instant UPI QR',
      description: 'Deliver invoices straight to client WhatsApp with embedded dynamic UPI QR codes for instant payments.',
      icon: MessageSquare,
      color: 'sky'
    },
    {
      title: 'Production Projects & Crew',
      description: 'Manage shoot dates, crew assignments, equipment checklists, and delivery milestones without schedule clashes.',
      icon: Briefcase,
      color: 'purple'
    },
    {
      title: 'Expenses & Accountant Reports',
      description: 'Log production costs, gear rentals, and conveyance with automated net profit calculation and Excel exports.',
      icon: Wallet,
      color: 'rose'
    },
    {
      title: 'Bank-Grade Tenant Privacy',
      description: 'Every studio gets isolated storage backed by PostgreSQL Row-Level Security. Your bills are strictly private.',
      icon: ShieldCheck,
      color: 'amber'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold">
              <Clapperboard className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-lg text-slate-100 tracking-tight leading-none">
                  DR FILMS
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                  Billing Suite
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                Photography & Production Invoicing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onEnterApp}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 transition cursor-pointer"
            >
              <span>Guest Demo</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In / Login</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 px-6 border-b border-slate-800/60">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/30 text-amber-300 text-xs font-medium shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Dedicated Billing Software for Creative Studios</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Streamline Studio Billing, <br />
            <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent">
              Invoices & Client Payments
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Crafted specifically for photographers, cinematographers, and film production houses. 
            Create GST-compliant invoices, track wedding packages, prevent crew clashes, and collect payments on WhatsApp.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={onLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/25 active:scale-95 transition cursor-pointer"
            >
              <span>Get Started / Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onEnterApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-700/80 transition cursor-pointer"
            >
              <span>Explore Software (Guest Mode)</span>
            </button>
          </div>

          {/* Feature Highlights Pills */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Google & Apple Single Sign-On</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Private Cloud Tenant Isolation</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Offline-First (PWA & IndexedDB)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="py-16 px-6 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Built for Real-World Photography & Production Workflows
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Everything your creative business needs to bill clients, track shoots, and keep finances in check.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div 
                key={feat.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between hover:border-slate-700 hover:bg-slate-900/80 transition-all duration-200 group"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Multi-Tenant Security Section */}
      <section className="py-12 px-6 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-4xl mx-auto rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-slate-900/90 to-slate-900/60 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Multi-Tenant Row-Level Security</span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Your Studio Records Are Strictly Private
            </h3>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              When you log in with Google, Apple, or Email, your bills and clients are protected 
              at the database engine level with PostgreSQL Row-Level Security. No other user can ever access or view your bills.
            </p>
          </div>

          <button
            type="button"
            onClick={onLogin}
            className="shrink-0 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer"
          >
            Create Your Private Workspace
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-8 px-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">DR FILMS</span>
            <span>Billing Suite</span>
            <span>—</span>
            <span>All rights reserved 2026.</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onEnterApp}
              className="text-slate-400 hover:text-amber-400 transition"
            >
              Guest Demo
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="text-slate-400 hover:text-amber-400 transition"
            >
              Sign In
            </button>
            <a
              href="/admin"
              className="text-slate-500 hover:text-amber-400 transition"
            >
              Studio Admin Portal
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
