import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

export function UndoToast({ 
  message, 
  onUndo, 
  onDismiss, 
  duration = 5000 
}) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    const interval = 100;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= interval) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - interval;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration, onDismiss]);

  const progressPercent = Math.max(0, (timeLeft / duration) * 100);

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 max-w-md w-[calc(100%-2rem)] bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-slate-200 font-medium truncate">{message}</span>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo ({Math.ceil(timeLeft / 1000)}s)</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* 5-second Animated Progress Bar */}
      <div className="w-full bg-slate-800 h-1">
        <div 
          className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
