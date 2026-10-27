import React, { useState } from 'react';
import { 
  CloudDownload, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  FileText, 
  Users, 
  Layers, 
  X, 
  ArrowRight,
  RefreshCw,
  HardDriveDownload
} from 'lucide-react';
import { formatDate } from '../utils/formatters';

export function RestoreSheetModal({ isOpen, onClose, backupInfo, onConfirmRestore }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMode, setSelectedMode] = useState('merge'); // 'replace' | 'merge'
  const [restoreDeleted, setRestoreDeleted] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState('');

  if (!isOpen || !backupInfo) return null;

  const { backupTime, counts, backupData } = backupInfo;

  const handleAction = async (mode) => {
    setIsProcessing(true);
    setSafetyNotice('Exporting local safety backup file to your downloads...');
    try {
      await onConfirmRestore(mode, { restoreDeleted });
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
      setIsProcessing(false);
      setSafetyNotice('');
    }
  };

  const formattedTime = backupTime 
    ? new Date(backupTime).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Unknown date';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CloudDownload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 font-display">
                Restore from Google Sheet
              </h3>
              <p className="text-xs text-slate-400">
                Found backup snapshot stored in your Google Sheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Snapshot Summary Box */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="text-slate-400">Backup Timestamp:</span>
            <span className="font-semibold text-amber-400 font-mono">{formattedTime}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <FileText className="w-4 h-4 mx-auto mb-1 text-sky-400" />
              <div className="text-base font-bold text-slate-100">{counts?.invoices || 0}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Invoices</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <Users className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
              <div className="text-base font-bold text-slate-100">{counts?.customers || 0}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Clients</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <Layers className="w-4 h-4 mx-auto mb-1 text-purple-400" />
              <div className="text-base font-bold text-slate-100">{counts?.services || 0}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Services</div>
            </div>
          </div>
        </div>

        {/* Safety Copy Assurance */}
        <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 flex items-start gap-3 text-xs text-emerald-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-200 block">Automatic Safety Copy</span>
            <span>
              Before restoring, a local JSON backup of your current data will be downloaded automatically so you never lose anything.
            </span>
          </div>
        </div>

        {/* Restore Mode Explanation */}
        <div className="space-y-2 text-xs">
          <label className="text-slate-300 font-semibold block">Choose Restore Mode:</label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Merge Option */}
            <button
              type="button"
              onClick={() => setSelectedMode('merge')}
              className={`p-3.5 rounded-2xl text-left border transition-all ${
                selectedMode === 'merge'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100 ring-1 ring-emerald-500/40'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-emerald-400 text-sm">Merge Data</span>
                {selectedMode === 'merge' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Safely combines records. Updates existing items and adds missing ones without deleting current local data.
              </p>
            </button>

            {/* Replace Option */}
            <button
              type="button"
              onClick={() => setSelectedMode('replace')}
              className={`p-3.5 rounded-2xl text-left border transition-all ${
                selectedMode === 'replace'
                  ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-amber-400 text-sm">Replace All</span>
                {selectedMode === 'replace' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Completely overwrites the local database with this Google Sheet snapshot. Perfect for switching devices.
              </p>
            </button>
          </div>
        </div>

        {/* Restore Deleted Bills Checkbox Option */}
        <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:bg-slate-950 hover:border-slate-700 transition-colors">
          <input
            type="checkbox"
            checked={restoreDeleted}
            onChange={(e) => setRestoreDeleted(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700 cursor-pointer"
          />
          <div>
            <span className="font-semibold text-slate-200 block">Also restore deleted bills</span>
            <span className="text-[11px] text-slate-400">
              Default is unchecked (restores Active bills only). Check to also bring back bills from Trash.
            </span>
          </div>
        </label>

        {safetyNotice && (
          <div className="text-center text-xs font-medium text-amber-400 animate-pulse">
            {safetyNotice}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleAction(selectedMode)}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
              selectedMode === 'replace'
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            } ${isProcessing ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'}`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Restoring...</span>
              </>
            ) : (
              <>
                <HardDriveDownload className="w-4 h-4" />
                <span>
                  {selectedMode === 'replace' ? 'Replace All & Restore' : 'Merge & Restore'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
