import React, { useState, useEffect } from 'react';
import { 
  X, 
  Printer, 
  Share2, 
  FileText, 
  CheckSquare, 
  Square, 
  Calendar, 
  Building, 
  DollarSign, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters';
import { sendWhatsAppMessage } from '../utils/whatsapp';

export function ContractsModal({ 
  isOpen, 
  onClose, 
  project = null, 
  invoice = null, 
  settings 
}) {
  if (!isOpen) return null;

  const sym = settings?.currencySymbol || '₹';

  // Client Details
  const initialClientName = project?.clientName || invoice?.customerSnapshot?.name || '';
  const initialClientPhone = project?.clientPhone || invoice?.customerSnapshot?.phone || '';
  const initialClientCompany = invoice?.customerSnapshot?.company || '';
  const initialClientAddress = invoice?.customerSnapshot?.address || '';

  // Shoot Details
  const initialEventType = project?.eventType || invoice?.eventType || 'Wedding & Reception';
  const initialShootDate = project?.eventDate || invoice?.eventDate || new Date().toISOString().split('T')[0];
  const initialVenue = project?.venue || 'Venue as mutually agreed';
  const initialTotalFee = invoice?.totalAmount || project?.budget || 50000;
  const initialAdvance = invoice?.advancePaid || (project?.payments ? project.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : 15000);

  const [clientName, setClientName] = useState(initialClientName);
  const [clientPhone, setClientPhone] = useState(initialClientPhone);
  const [clientCompany, setClientCompany] = useState(initialClientCompany);
  const [clientAddress, setClientAddress] = useState(initialClientAddress);
  const [eventType, setEventType] = useState(initialEventType);
  const [shootDate, setShootDate] = useState(initialShootDate);
  const [venue, setVenue] = useState(initialVenue);
  const [totalFee, setTotalFee] = useState(initialTotalFee);
  const [advancePaid, setAdvancePaid] = useState(initialAdvance);
  const [turnaroundDays, setTurnaroundDays] = useState('30 to 45 working days');
  const [revisionLimit, setRevisionLimit] = useState('2 complimentary rounds');

  // Deliverables Toggles
  const [deliverables, setDeliverables] = useState({
    cinematicTeaser: true,
    highlightFilm: true,
    fullLengthVideo: true,
    candidPhotography: true,
    traditionalPhotography: true,
    luxuryAlbum: true,
    droneCoverage: true,
    rawFootageDrive: true
  });

  // Contract Terms Toggles
  const [terms, setTerms] = useState({
    nonRefundableAdvance: true,
    paymentSchedule: true,
    revisionPolicy: true,
    rawFootagePolicy: true,
    dronePolicy: true,
    copyrightPortfolio: true,
    forceMajeure: true
  });

  const toggleDeliverable = (key) => {
    setDeliverables(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTerm = (key) => {
    setTerms(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const contractNumber = `DRF-AGR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const balanceDue = Math.max(0, Number(totalFee) - Number(advancePaid));

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const deliverablesList = Object.entries(deliverables)
      .filter(([_, active]) => active)
      .map(([key]) => {
        switch (key) {
          case 'cinematicTeaser': return '• Cinematic Teaser (1-2 Min)';
          case 'highlightFilm': return '• Highlight Film (5-8 Min)';
          case 'fullLengthVideo': return '• Full Length Traditional Video';
          case 'candidPhotography': return '• Candid Photography';
          case 'traditionalPhotography': return '• Traditional Photography';
          case 'luxuryAlbum': return '• Premium Photo Album';
          case 'droneCoverage': return '• Drone Aerial Cinematography';
          case 'rawFootageDrive': return '• Raw Footage (Client Drive)';
          default: return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const msg = `Hello ${clientName},

Here is the shoot booking agreement summary from ${settings?.businessName || 'DR FILMS'}.

CONTRACT SUMMARY:
Contract No: ${contractNumber}
Shoot Event: ${eventType}
Shoot Date: ${formatDate(shootDate)}
Location / Venue: ${venue}

AGREED FEE & TERMS:
Total Package Fee: ${formatCurrency(totalFee, sym)}
Booking Advance: ${formatCurrency(advancePaid, sym)}
Balance Due: ${formatCurrency(balanceDue, sym)}

INCLUDED DELIVERABLES:
${deliverablesList}

KEY POLICIES:
- Booking advance confirms studio dates & crew.
- Turnaround time: ${turnaroundDays} post-event.
- Revisions: ${revisionLimit} included.

Thank you for choosing ${settings?.businessName || 'DR FILMS'}!
Phone: ${settings?.phone || ''}`;

    sendWhatsAppMessage({
      phone: clientPhone,
      text: msg,
      mode: settings?.whatsappMode || 'auto',
      defaultCountryCode: settings?.defaultCountryCode || '91'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Top Control Bar (Hidden on print) */}
        <div className="no-print flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <FileText className="w-4 h-4" />
            <span>Shoot Booking Agreement & Service Contract</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Print Agreement</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp Summary</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Customization Controls (Hidden on print) */}
        <div className="no-print p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3 text-xs">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Customize Shoot Contract Clauses & Deliverables</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.cinematicTeaser} 
                onChange={() => toggleDeliverable('cinematicTeaser')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Cinematic Teaser</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.highlightFilm} 
                onChange={() => toggleDeliverable('highlightFilm')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Highlight Film</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.fullLengthVideo} 
                onChange={() => toggleDeliverable('fullLengthVideo')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Full Video</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.candidPhotography} 
                onChange={() => toggleDeliverable('candidPhotography')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Candid Photo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.luxuryAlbum} 
                onChange={() => toggleDeliverable('luxuryAlbum')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Photo Album</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.droneCoverage} 
                onChange={() => toggleDeliverable('droneCoverage')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Drone Aerial</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={deliverables.rawFootageDrive} 
                onChange={() => toggleDeliverable('rawFootageDrive')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Raw Footage</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input 
                type="checkbox" 
                checked={terms.nonRefundableAdvance} 
                onChange={() => toggleTerm('nonRefundableAdvance')} 
                className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
              />
              <span>Non-Refund Advance</span>
            </label>
          </div>
        </div>

        {/* Printable Contract Document Paper */}
        <div 
          id="printable-contract-document"
          className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-xl border border-slate-200 space-y-6 text-xs leading-relaxed"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b-2 border-slate-950">
            <div>
              <h2 className="font-black text-2xl tracking-tight text-slate-950 uppercase">
                {settings?.businessName || 'DR FILMS'}
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                {settings?.tagline || 'Cinematic Film Production & Creative Studio'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {settings?.address || 'Film City, Mumbai'}
              </p>
              <p className="text-[11px] font-mono text-slate-700">
                Contact: {settings?.phone || '+91 98765 43210'} • {settings?.email || 'contact@drfilms.studio'}
              </p>
            </div>

            <div className="sm:text-right">
              <span className="inline-block bg-slate-950 text-amber-400 font-black text-xs px-3 py-1 rounded tracking-wider uppercase">
                SHOOT AGREEMENT
              </span>
              <p className="text-xs font-mono font-bold text-slate-900 mt-2">
                Contract #{contractNumber}
              </p>
              <p className="text-xs text-slate-600">
                Date: {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>

          {/* Parties Introduction */}
          <div>
            <p>
              This Professional Media & Film Production Agreement is entered into between{' '}
              <strong>{settings?.businessName || 'DR FILMS'}</strong> (&quot;Studio / Service Provider&quot;) and{' '}
              <strong>{clientName || 'The Client'}</strong>{' '}
              {clientCompany ? `representing ${clientCompany} ` : ''}
              (&quot;Client&quot;) with contact number <strong>{clientPhone || '—'}</strong>.
            </p>
          </div>

          {/* Section 1: Shoot & Event Specifications */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-700 mb-2">
              1. Event & Shoot Specifications
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Event Type</span>
                <span className="font-semibold text-slate-900">{eventType}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Shoot Date</span>
                <span className="font-semibold font-mono text-slate-900">{formatDate(shootDate)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Location / Venue</span>
                <span className="font-semibold text-slate-900">{venue}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Deliverables */}
          <div>
            <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-900 mb-2">
              2. Scope of Deliverables Included
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
              {deliverables.cinematicTeaser && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Cinematic Teaser (1 to 2 minutes high-impact preview)</span>
                </div>
              )}
              {deliverables.highlightFilm && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Cinematic Highlight Film (5 to 10 minutes story film)</span>
                </div>
              )}
              {deliverables.fullLengthVideo && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Full Length Event Video / Traditional Coverage</span>
                </div>
              )}
              {deliverables.candidPhotography && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Candid Photography Coverage & Selected High-Res Edits</span>
                </div>
              )}
              {deliverables.traditionalPhotography && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Traditional Photography Coverage of Ceremonies & Guests</span>
                </div>
              )}
              {deliverables.luxuryAlbum && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Custom Designed Luxury Hardcover Photo Album</span>
                </div>
              )}
              {deliverables.droneCoverage && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Drone Aerial Cinematography (Weather & clearances permitting)</span>
                </div>
              )}
              {deliverables.rawFootageDrive && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Raw Video & Photo Master Files (Client provided USB3/SSD)</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Commercial Terms & Payment Schedule */}
          <div>
            <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-900 mb-2">
              3. Commercial Terms & Payment Schedule
            </h4>
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100 rounded-xl text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Total Agreed Fee</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{formatCurrency(totalFee, sym)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-700 uppercase block font-semibold">Booking Advance Paid</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">{formatCurrency(advancePaid, sym)}</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-700 uppercase block font-semibold">Balance Payable</span>
                <span className="font-mono font-bold text-amber-800 text-sm">{formatCurrency(balanceDue, sym)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 mt-2">
              Payment Milestones: 50% advance on signing to reserve dates/crew; 40% on or before shoot commencement; 10% on review of preliminary draft before final release of masters.
            </p>
          </div>

          {/* Section 4: Studio Policies & Terms */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-900">
              4. Standard Operating Policies
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-700">
              {terms.nonRefundableAdvance && (
                <li>
                  <strong>Booking Reservation:</strong> The booking deposit is strictly non-refundable as it reserves studio personnel, camera equipment, and prevents other bookings on the reserved dates.
                </li>
              )}
              {terms.revisionPolicy && (
                <li>
                  <strong>Post-Production Revisions:</strong> Final edits include up to {revisionLimit}. Any subsequent revision cycles or major structural storyline changes requested thereafter will be billed at standard hourly editing rates.
                </li>
              )}
              {terms.rawFootagePolicy && (
                <li>
                  <strong>Turnaround & Raw Footage:</strong> Preliminary video teasers and photo previews will be delivered within {turnaroundDays}. Raw files require client to provide a designated USB 3.0 hard drive within 15 days of event conclusion.
                </li>
              )}
              {terms.dronePolicy && (
                <li>
                  <strong>Aerial Drone Operations:</strong> Drone flights are subject to meteorological safety (wind/rain) and local administrative/DGCA regulations. If safety forbids flight, indoor coverage will proceed without liability.
                </li>
              )}
              {terms.copyrightPortfolio && (
                <li>
                  <strong>Creative Copyright & Portfolio:</strong> Studio retains artistic copyright and reserves the non-commercial right to exhibit excerpts on DR FILMS website, portfolio reels, and official social media profiles.
                </li>
              )}
            </ol>
          </div>

          {/* Signatures */}
          <div className="pt-8 grid grid-cols-2 gap-8 border-t-2 border-slate-950">
            <div>
              <div className="h-14 flex items-end">
                <span className="font-display font-semibold text-slate-950 text-sm">
                  {settings?.businessName || 'DR FILMS'}
                </span>
              </div>
              <div className="border-t border-slate-950 pt-1">
                <p className="font-bold text-slate-900">Authorized Studio Representative</p>
                {settings?.ownerName && (
                  <p className="text-[11px] text-slate-700 font-medium">({settings.ownerName})</p>
                )}
                <p className="text-[10px] text-slate-500">Sign & Stamp • Date</p>
              </div>
            </div>

            <div>
              <div className="h-14 flex items-end">
                <span className="font-display font-semibold text-slate-950 text-sm">
                  {clientName}
                </span>
              </div>
              <div className="border-t border-slate-950 pt-1">
                <p className="font-bold text-slate-900">Client / Authorized Signatory</p>
                <p className="text-[10px] text-slate-500">Signature • Date</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info (Hidden on print) */}
        <div className="no-print flex items-center justify-between text-xs text-slate-400 pt-2">
          <span>Official DR FILMS Cinema & Photography Production Agreement</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
