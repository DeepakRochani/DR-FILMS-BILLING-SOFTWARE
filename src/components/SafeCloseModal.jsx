import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Power, 
  X, 
  FileSpreadsheet, 
  ArrowRight,
  Settings as SettingsIcon
} from 'lucide-react';
import { performCloseWithBackup } from '../utils/googleSheetsSync';

export function SafeCloseModal({ isOpen, onClose, onGoToSettings }) {
  const [phase, setPhase] = useState('syncing'); // 'syncing' | 'success' | 'error' | 'unconfigured'
  const [errorMsg, setErrorMsg] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [canManualClose, setCanManualClose] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startBackupAndClose();
    } else {
      setPhase('syncing');
      setErrorMsg('');
      setSheetName('');
      setCanManualClose(false);
    }
  }, [isOpen]);

  const startBackupAndClose = async () => {
    setPhase('syncing');
    setErrorMsg('');

    try {
      const res = await performCloseWithBackup();

      if (res.unconfigured) {
        setPhase('unconfigured');
        return;
      }

      if (res && res.success) {
        setPhase('success');
        setSheetName(res.sheetName || 'Google Sheet');

        // Attempt to close the window automatically
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {
            console.warn('window.close() prevented by browser security:', e);
          }
          // If still open after 1.2s (e.g. browser security policy on tabs not opened by script)
          setCanManualClose(true);
        }, 1200);
      } else {
        // "if not then not close" -> Keep window open and show failure state
        setPhase('error');
        setErrorMsg(res?.error || res?.reason || 'Could not verify connection to Google Sheets.');
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.message || 'Unexpected error during backup.');
    }
  };

  const handleForceManualClose = () => {
    try {
      window.close();
    } catch (e) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5">
        
        {/* PHASE 1: SYNCING BEFORE CLOSE */}
        {phase === 'syncing' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-display font-bold text-slate-100">
                Updating Backup Before Closing...
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Saving all bills, clients, and services to your Google Sheet backup so nothing is lost.
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] font-mono text-amber-400/90 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Syncing live data to Google Cloud...</span>
            </div>

            <p className="text-[11px] text-slate-500">
              The window will close automatically once the backup is verified.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 hover:underline pt-2"
            >
              Cancel & Keep Billing App Open
            </button>
          </div>
        )}

        {/* PHASE 2: SUCCESS -> CLOSING WINDOW */}
        {phase === 'success' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-9 h-9 animate-bounce" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-display font-bold text-emerald-300">
                Backup Updated Successfully!
              </h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                All bills and clients are 100% saved in your Google Sheet <span className="text-amber-400 font-semibold font-mono">{sheetName ? `(${sheetName})` : ''}</span>.
              </p>
            </div>

            <div className="p-3 bg-emerald-950/30 rounded-xl border border-emerald-900/40 text-xs text-emerald-200 font-medium">
              Closing app window now...
            </div>

            {canManualClose && (
              <div className="pt-2 space-y-2 border-t border-slate-800/80">
                <p className="text-[11px] text-slate-400">
                  If this tab does not close automatically due to browser permissions:
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleForceManualClose}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Close Window</span>
                  </button>
                  <span className="text-xs text-slate-500">or press <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">⌘ + W</kbd></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PHASE 3: ERROR -> NOT CLOSE */}
        {phase === 'error' && (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-rose-200">
                  Backup Failed — Window NOT Closed
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  To protect your data from being lost or unbacked, DR FILMS has kept this window open.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs space-y-1.5">
              <span className="text-rose-300 font-semibold block">Reason for failure:</span>
              <p className="text-rose-200/90 font-mono text-[11px] break-words">
                {errorMsg}
              </p>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Please check your internet connection or Google Sheets URL in Settings before closing.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Keep App Open
              </button>

              <button
                type="button"
                onClick={startBackupAndClose}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg transition-transform active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Backup & Close</span>
              </button>
            </div>
          </div>
        )}

        {/* PHASE 4: UNCONFIGURED */}
        {phase === 'unconfigured' && (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-slate-100">
                  Google Sheets Backup Not Configured
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cloud backup is not yet enabled. All data remains safe in local IndexedDB.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Would you like to configure your Google Sheets cloud backup now, or close the billing app?
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
              >
                Cancel
              </button>

              {onGoToSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToSettings();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold py-2 px-3.5 rounded-xl transition-colors"
                >
                  <SettingsIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Configure Backup</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleForceManualClose}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold py-2 px-4 rounded-xl transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Close Window</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
