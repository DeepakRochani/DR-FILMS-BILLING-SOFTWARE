import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Send, 
  X, 
  MessageSquare, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { cleanWhatsAppPhone, shouldOpenWhatsAppWeb } from '../utils/whatsapp.js';
import { generateDeliveredWhatsAppMessage } from '../utils/projectUtils.js';
import { removeEmojis } from '../utils/reminderCalculations.js';

export function ProjectDeliveredModal({ project, settings, isOpen, onClose }) {
  const defaultMsg = project ? generateDeliveredWhatsAppMessage({ project, settings }) : '';
  const [messageText, setMessageText] = useState(defaultMsg);
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !project) return null;

  const clientPhone = project.clientPhone || '';

  const handleSendWhatsApp = () => {
    const cleanPhone = cleanWhatsAppPhone(clientPhone, settings?.defaultCountryCode || '91');
    const finalMsg = removeEmojis(messageText).trim();
    const encoded = encodeURIComponent(finalMsg);

    const useWeb = shouldOpenWhatsAppWeb(settings);
    const url = useWeb
      ? (cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`)
      : (cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`);

    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-100 text-lg">
                Project Delivered!
              </h3>
              <p className="text-xs text-slate-400">
                Notify <span className="text-slate-200 font-semibold">{project.clientName}</span> on WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center justify-between text-slate-300">
            <div>
              <span className="text-slate-400 block text-[11px]">Delivered Project:</span>
              <span className="font-bold text-slate-100 text-sm">{project.title}</span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
              Delivered
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>WhatsApp Message Preview (Zero Emojis):</span>
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : null}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <textarea
              rows={6}
              value={messageText}
              onChange={(e) => setMessageText(removeEmojis(e.target.value))}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-slate-200 font-sans text-xs focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Recipient phone: <span className="font-mono text-slate-300">{clientPhone || 'No phone number attached'}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Skip Notification
          </button>
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950 transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>Send on WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
}
