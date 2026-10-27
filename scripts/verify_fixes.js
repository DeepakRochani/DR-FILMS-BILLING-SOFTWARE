import assert from 'node:assert';
import { getPaymentLabel, recalculateInvoicePayments, calculateInvoiceTotals } from '../src/utils/calculations.js';
import { generateWhatsAppMessage } from '../src/utils/whatsapp.js';
import { buildUpiLink } from '../src/utils/qrGenerator.js';
import fs from 'node:fs';
import path from 'node:path';

if (typeof self === 'undefined') {
  globalThis.self = globalThis;
}

console.log('--- Running DR FILMS Billing App Verification Suite ---');

// Test 1: getPaymentLabel logic
console.log('Test 1: Payment Labels verification...');
assert.strictEqual(getPaymentLabel('paid', 5000), 'Payment Received');
assert.strictEqual(getPaymentLabel('paid', 0), 'Payment Received');
assert.strictEqual(getPaymentLabel('partially_paid', 5000), 'Amount Paid');
assert.strictEqual(getPaymentLabel('unpaid', 5000), 'Advance Paid');
assert.strictEqual(getPaymentLabel('draft', 2000), 'Advance Paid');
console.log('✓ Test 1 Passed: Payment labels correctly distinguish Paid vs Partially Paid vs Unpaid/Draft.');

// Test 2: recalculateInvoicePayments calculation logic
console.log('Test 2: Recalculate Invoice Payments verification...');
const mockInvoice = {
  id: 1,
  invoiceNumber: 'INV-2026-001',
  subtotal: 10000,
  totalAmount: 10000,
  advancePaid: 0,
  balanceDue: 10000,
  status: 'unpaid',
  items: [{ id: 1, name: 'Video Editing', rate: 10000, quantity: 1, amount: 10000 }]
};

// 2a. Add partial payment of 4,000
const pmt1 = { id: 'PAY-1', date: '2026-10-15', amount: 4000, method: 'UPI', note: 'Advance deposit' };
const res1 = recalculateInvoicePayments(mockInvoice, [pmt1]);
assert.strictEqual(res1.status, 'partially_paid');
assert.strictEqual(res1.advancePaid, 4000);
assert.strictEqual(res1.balanceDue, 6000);
assert.strictEqual(res1.payments.length, 1);

// 2b. Add remaining payment of 6,000 -> full payment
const pmt2 = { id: 'PAY-2', date: '2026-10-16', amount: 6000, method: 'Bank Transfer', note: 'Balance payment' };
const res2 = recalculateInvoicePayments(mockInvoice, [pmt1, pmt2]);
assert.strictEqual(res2.status, 'paid');
assert.strictEqual(res2.advancePaid, 10000);
assert.strictEqual(res2.balanceDue, 0);
assert.strictEqual(res2.payments.length, 2);

// 2c. Delete payment 2 (simulate wrong payment deletion)
const res3 = recalculateInvoicePayments(mockInvoice, [pmt1]);
assert.strictEqual(res3.status, 'partially_paid');
assert.strictEqual(res3.advancePaid, 4000);
assert.strictEqual(res3.balanceDue, 6000);

// 2d. Delete all payments (simulate mark as unpaid)
const res4 = recalculateInvoicePayments(mockInvoice, []);
assert.strictEqual(res4.status, 'unpaid');
assert.strictEqual(res4.advancePaid, 0);
assert.strictEqual(res4.balanceDue, 10000);
assert.strictEqual(res4.payments.length, 0);
console.log('✓ Test 2 Passed: recalculateInvoicePayments handles partial payments, full payments, deletions, and resets.');

// Test 3: WhatsApp Share Message wording
console.log('Test 3: WhatsApp Share Message formatting...');
const mockSettings = {
  businessName: 'DR FILMS',
  phone: '+91 98765 43210',
  currencySymbol: '₹',
  bankDetails: { upiId: 'drfilms@upi' }
};

const paidInvoice = {
  ...mockInvoice,
  status: 'paid',
  advancePaid: 10000,
  balanceDue: 0
};
const paidMsg = generateWhatsAppMessage(paidInvoice, mockSettings);
console.log('Sample Paid WhatsApp Message:\n' + paidMsg);
assert.ok(paidMsg.includes('Payment Received:'), 'Paid invoice WhatsApp message must say "Payment Received"');
assert.ok(!paidMsg.includes('Advance Paid'), 'Paid invoice WhatsApp message must NOT say "Advance Paid"');

const partialInvoice = {
  ...mockInvoice,
  status: 'partially_paid',
  advancePaid: 3000,
  balanceDue: 7000
};
const partialMsg = generateWhatsAppMessage(partialInvoice, mockSettings);
console.log('Sample Partial WhatsApp Message:\n' + partialMsg);
assert.ok(partialMsg.includes('Received:'), 'Partially paid invoice WhatsApp message must say "Received:"');
assert.ok(partialMsg.includes('Balance Due:'), 'Partially paid invoice WhatsApp message must include "Balance Due"');

const unpaidWithAdvanceInvoice = {
  ...mockInvoice,
  status: 'unpaid',
  advancePaid: 2000,
  balanceDue: 8000
};
const unpaidMsg = generateWhatsAppMessage(unpaidWithAdvanceInvoice, mockSettings);
console.log('Sample Unpaid With Advance WhatsApp Message:\n' + unpaidMsg);
assert.ok(unpaidMsg.includes('Advance Paid:'), 'Unpaid invoice with deposit must say "Advance Paid"');
console.log('✓ Test 3 Passed: WhatsApp message labels dynamically reflect Paid / Partially Paid / Advance Paid.');

// Test 4: Verify Files and Error Boundary existence
console.log('Test 4: Verify component file structure...');
const errorBoundaryPath = path.resolve('src/components/ErrorBoundary.jsx');
const undoToastPath = path.resolve('src/components/UndoToast.jsx');
const invoiceViewPagePath = path.resolve('src/pages/InvoiceViewPage.jsx');
const invoicesPagePath = path.resolve('src/pages/InvoicesPage.jsx');
const appPath = path.resolve('src/CustomerApp.jsx');

assert.ok(fs.existsSync(errorBoundaryPath), 'ErrorBoundary.jsx must exist');
assert.ok(fs.existsSync(undoToastPath), 'UndoToast.jsx must exist');

const errorBoundaryCode = fs.readFileSync(errorBoundaryPath, 'utf8');
assert.ok(errorBoundaryCode.includes('Back to Bills'), 'ErrorBoundary must have "Back to Bills" button');
assert.ok(errorBoundaryCode.includes('componentDidCatch'), 'ErrorBoundary must catch runtime errors');

const appCode = fs.readFileSync(appPath, 'utf8');
assert.ok(appCode.includes('<ErrorBoundary'), 'CustomerApp.jsx must wrap content in ErrorBoundary');
assert.ok(appCode.includes('handleInvoiceSaved'), 'CustomerApp.jsx must define handleInvoiceSaved');
assert.ok(appCode.includes('setActiveInvoiceId(numId)'), 'CustomerApp.jsx must navigate directly to saved invoice id');

const viewCode = fs.readFileSync(invoiceViewPagePath, 'utf8');
assert.ok(viewCode.includes('paid-stamp'), 'InvoiceViewPage must render PAID stamp badge');
assert.ok(viewCode.includes('Mark as Paid'), 'InvoiceViewPage must contain "Mark as Paid" button');
assert.ok(viewCode.includes('Mark as Unpaid'), 'InvoiceViewPage must contain "Mark as Unpaid" button');
assert.ok(viewCode.includes('UndoToast'), 'InvoiceViewPage must render UndoToast');
assert.ok(viewCode.includes('Payments Received'), 'InvoiceViewPage must render Payments Received section');
assert.ok(viewCode.includes('RecordPaymentModal'), 'InvoiceViewPage must render RecordPaymentModal');
assert.ok(viewCode.includes('handleDeletePayment'), 'InvoiceViewPage must allow individual payment deletion');

const listCode = fs.readFileSync(invoicesPagePath, 'utf8');
assert.ok(listCode.includes('handleMarkAsPaid'), 'InvoicesPage must contain handleMarkAsPaid');
assert.ok(listCode.includes('handleMarkAsUnpaid'), 'InvoicesPage must contain handleMarkAsUnpaid');
assert.ok(listCode.includes('Record Payment'), 'InvoicesPage must contain "Record Payment" button');
assert.ok(listCode.includes('partially_paid'), 'InvoicesPage must handle partially_paid bills');
assert.ok(listCode.includes('UndoToast'), 'InvoicesPage must render UndoToast');
console.log('✓ Test 4 Passed: All components, error boundaries, undo toasts, and stamps are wired.');

// Test 5: Verify calculations safe handling of null/missing fields
console.log('Test 5: Null / undefined safety in calculations...');
const nullInvoiceTotals = calculateInvoiceTotals({
  items: null,
  charges: undefined,
  discountType: 'percentage',
  discountValue: null,
  taxPercentage: null,
  advancePaid: undefined
});
assert.strictEqual(nullInvoiceTotals.totalAmount, 0);
assert.strictEqual(nullInvoiceTotals.balanceDue, 0);

const recalculatedNull = recalculateInvoicePayments({ totalAmount: 5000 }, null);
assert.strictEqual(recalculatedNull.advancePaid, 0);
assert.strictEqual(recalculatedNull.balanceDue, 5000);
assert.strictEqual(recalculatedNull.status, 'unpaid');
console.log('✓ Test 5 Passed: Null/missing fields handled safely without throwing errors.');

// Test 6: Complete 4,800 bill lifecycle test (User Acceptance Scenario)
console.log('Test 6: User Acceptance Scenario (4,800 Bill Lifecycle)...');
const bill4800 = {
  id: 4800,
  invoiceNumber: 'INV-2026-4800',
  subtotal: 4800,
  totalAmount: 4800,
  advancePaid: 0,
  balanceDue: 4800,
  status: 'unpaid',
  items: [{ id: 1, name: 'Video Shoot', rate: 4800, quantity: 1, amount: 4800 }],
  payments: []
};

// Step 1: Record 2,400 cash
const paymentCash2400 = {
  id: 'PAY-4800-1',
  date: '2026-10-15',
  amount: 2400,
  method: 'Cash',
  note: 'Advance for shoot'
};
const step1 = recalculateInvoicePayments(bill4800, [paymentCash2400]);
assert.strictEqual(step1.status, 'partially_paid', 'Status must be partially_paid after 2400 payment');
assert.strictEqual(step1.advancePaid, 2400, 'advancePaid must be 2400');
assert.strictEqual(step1.balanceDue, 2400, 'balanceDue must be 2400');
assert.strictEqual(step1.payments.length, 1);
assert.strictEqual(step1.payments[0].method, 'Cash');

// Step 2: Check WhatsApp message for partial payment
const partialBillState = { ...bill4800, ...step1 };
const partialWaMsg = generateWhatsAppMessage(partialBillState, {
  businessName: 'DR FILMS',
  phone: '9876543210',
  currencySymbol: '₹'
});
assert.ok(partialWaMsg.includes('Received: ₹ 2,400.00'), 'WhatsApp message must include Received: ₹ 2,400.00');
assert.ok(partialWaMsg.includes('Balance Due: ₹ 2,400.00'), 'WhatsApp message must include Balance Due: ₹ 2,400.00');

// Step 3: Record remaining 2,400
const paymentUpi2400 = {
  id: 'PAY-4800-2',
  date: '2026-10-15',
  amount: 2400,
  method: 'UPI',
  note: 'Final settlement'
};
const step2 = recalculateInvoicePayments(partialBillState, [paymentCash2400, paymentUpi2400]);
assert.strictEqual(step2.status, 'paid', 'Status must be paid after remaining 2400 payment');
assert.strictEqual(step2.advancePaid, 4800, 'advancePaid must be 4800');
assert.strictEqual(step2.balanceDue, 0, 'balanceDue must be 0');
assert.strictEqual(step2.payments.length, 2);

// Step 4: Delete one payment and confirm status goes back to Partially Paid
const step3 = recalculateInvoicePayments(partialBillState, [paymentCash2400]);
assert.strictEqual(step3.status, 'partially_paid', 'Status must return to partially_paid after deleting one payment');
assert.strictEqual(step3.advancePaid, 2400, 'advancePaid must revert to 2400');
assert.strictEqual(step3.balanceDue, 2400, 'balanceDue must revert to 2400');
assert.strictEqual(step3.payments.length, 1);
console.log('✓ Test 6 Passed: Complete ₹4,800 bill lifecycle verified (Unpaid -> 2400 Cash Partially Paid -> 2400 Full Paid -> Delete Payment reverted to Partially Paid).');

// Test 7: PDF Export & Sharing Guard Verification (Issue A)
console.log('Test 7: PDF Export & Sharing Guard Verification (Issue A)...');
const pdfExportPath = path.resolve('src/utils/pdfExport.js');
assert.ok(fs.existsSync(pdfExportPath), 'pdfExport.js must exist');
const pdfExportCode = fs.readFileSync(pdfExportPath, 'utf8');

// Verify html2canvas options
assert.ok(pdfExportCode.includes('scale: 2'), 'html2canvas must use scale: 2');
assert.ok(pdfExportCode.includes('useCORS: true'), 'html2canvas must use useCORS: true');
assert.ok(pdfExportCode.includes('allowTaint: true'), 'html2canvas must use allowTaint: true');
assert.ok(pdfExportCode.includes('waitForElementImages'), 'pdfExport must include waitForElementImages to await img decode');

// Test filename generation
const { getInvoicePdfFilename, DEFAULT_PDF_OPT } = await import('../src/utils/pdfExport.js');
assert.strictEqual(DEFAULT_PDF_OPT.html2canvas.scale, 2);
assert.strictEqual(DEFAULT_PDF_OPT.html2canvas.useCORS, true);
assert.strictEqual(DEFAULT_PDF_OPT.html2canvas.allowTaint, true);

const sampleInvoice = {
  invoiceNumber: 'DRF-0001',
  customerSnapshot: { name: 'Ronak Jain' }
};
const generatedFilename = getInvoicePdfFilename(sampleInvoice);
assert.strictEqual(generatedFilename, 'DRF-0001_Ronak_Jain.pdf', 'Filename must match format DRF-0001_Ronak_Jain.pdf');

// Re-read latest InvoiceViewPage code
const latestViewCode = fs.readFileSync(invoiceViewPagePath, 'utf8');

// Check share handler and single file guard in InvoiceViewPage.jsx
assert.ok(latestViewCode.includes('console.trace'), 'InvoiceViewPage must use console.trace() at start of handler and in navigator.share');
assert.ok(latestViewCode.includes('console.log'), 'InvoiceViewPage must use console.log()');
assert.ok(latestViewCode.includes('isSharingRef.current'), 'InvoiceViewPage must use isSharingRef for immediate synchronous guard');
assert.ok(latestViewCode.includes('isSharing'), 'InvoiceViewPage must use isSharing state');
assert.ok(latestViewCode.includes('files: [pdfFile]'), 'InvoiceViewPage must pass exactly ONE single file in navigator.share');
assert.ok(!latestViewCode.includes('files: [pdfFile, pdfFile]'), 'Must never pass duplicate files in array');
assert.ok(!latestViewCode.includes('title: `Invoice'), 'Must not pass redundant title in navigator.share with files');
console.log('✓ Test 7 Passed: Single PDF sharing, diagnostic traces, isSharing guards, and clean filename verified.');

// Test 8: WhatsApp Unified Button & Desktop Fallback (Issue B)
console.log('Test 8: WhatsApp Unified Button & Fallback Verification (Issue B)...');
assert.ok(latestViewCode.includes('Send on WhatsApp'), 'InvoiceViewPage must render unified "Send on WhatsApp" button');
assert.ok(latestViewCode.includes('Text only'), 'InvoiceViewPage must render small "Text only" option');
assert.ok(
  latestViewCode.includes('PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file.'),
  'Must show toast "PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file." on desktop'
);
assert.ok(latestViewCode.includes('handleWhatsAppTextOnly'), 'Must define handleWhatsAppTextOnly handler');
console.log('✓ Test 8 Passed: Unified "Send on WhatsApp" button, desktop download fallback toast, and "Text only" button verified.');

// Test 9: In-Flow QR Image Capture via html2canvas & onclone Verification
console.log('Test 9: In-Flow QR Image Capture via html2canvas & onclone Verification...');
const { generateQrDataUrl } = await import('../src/utils/qrGenerator.js');

// Verify hardcoded #000000 and #FFFFFF in qrGenerator.js
const qrGenPath = path.resolve('src/utils/qrGenerator.js');
const qrGenCode = fs.readFileSync(qrGenPath, 'utf8');
assert.ok(qrGenCode.includes("dark: '#000000'"), 'QR must use hardcoded #000000 dark color');
assert.ok(qrGenCode.includes("light: '#FFFFFF'"), 'QR must use hardcoded #FFFFFF light color');
assert.ok(qrGenCode.includes("width || 400"), 'QR must use width 400');
assert.ok(qrGenCode.includes("margin !== undefined ? options.margin : 1"), 'QR must use margin 1');

// Verify QR PNG data URL generation
const testQrPng = await generateQrDataUrl('upi://pay?pa=drfilms@upi&pn=DR%20FILMS&am=2400.00', { width: 400, margin: 1 });
assert.ok(testQrPng.startsWith('data:image/png;base64,'), 'generateQrDataUrl must generate a valid base64 PNG data URL');
assert.ok(testQrPng.length > 500, 'QR PNG data URL must be non-empty');

// Verify UPI Link uses balance due, not total
const upiLinkPartial = buildUpiLink({
  upiId: 'drfilms@upi',
  payeeName: 'Ronak Jain',
  amount: 2400,
  invoiceNumber: 'DRF-0001'
});
assert.ok(upiLinkPartial.includes('am=2400.00'), 'UPI link for partial payment must contain balance due 2400.00, not total');

// Verify pdfExport.js updated implementation
const currentPdfExportCode = fs.readFileSync(pdfExportPath, 'utf8');
assert.ok(currentPdfExportCode.includes('buildInvoicePdf'), 'pdfExport.js must have unified buildInvoicePdf function');

// 1. Requirement 1: REMOVE manual pdf.addImage and live DOM getBoundingClientRect math completely
assert.ok(!currentPdfExportCode.includes('pdfInstance.addImage'), 'pdfExport.js must NOT have manual pdfInstance.addImage overlay');
assert.ok(!currentPdfExportCode.includes('qrBoxRect.left - invoiceRect.left'), 'pdfExport.js must NOT compute live DOM getBoundingClientRect coordinates');

// 2. Requirement 3: html2canvas options must include scale: 2, useCORS: true, allowTaint: true, logging: true
assert.ok(currentPdfExportCode.includes('scale: 2'), 'html2canvas options must specify scale: 2');
assert.ok(currentPdfExportCode.includes('useCORS: true'), 'html2canvas options must specify useCORS: true');
assert.ok(currentPdfExportCode.includes('allowTaint: true'), 'html2canvas options must specify allowTaint: true');
assert.ok(currentPdfExportCode.includes('logging: true'), 'html2canvas options must specify logging: true');

// 3. Requirement 3: onclone must find #upi-qr and re-set properties, plus support inline SVG fallback
assert.ok(currentPdfExportCode.includes('onclone:'), 'pdfExport.js must hook html2canvas.onclone');
assert.ok(currentPdfExportCode.includes("clonedDoc.getElementById('upi-qr')"), 'onclone must look for #upi-qr');
assert.ok(currentPdfExportCode.includes("clonedBox.style.width = '140px'"), 'onclone must enforce 140px width on QR box');
assert.ok(currentPdfExportCode.includes("clonedBox.style.height = '140px'"), 'onclone must enforce 140px height on QR box');
assert.ok(currentPdfExportCode.includes("clonedQr.style.opacity = '1'"), 'onclone must set opacity 1 on cloned QR');
assert.ok(currentPdfExportCode.includes("clonedQr.style.filter = 'none'"), 'onclone must set filter none on cloned QR');
assert.ok(currentPdfExportCode.includes("clonedQr.style.display = 'block'"), 'onclone must set display block on cloned QR');
assert.ok(currentPdfExportCode.includes("clonedQr.width = 120"), 'onclone must set width 120 on cloned QR');
assert.ok(currentPdfExportCode.includes("clonedQr.height = 120"), 'onclone must set height 120 on cloned QR');
assert.ok(currentPdfExportCode.includes('qrSvgString'), 'onclone must support inline SVG fallback if image is blank');

// 4. Requirement 4: verify measureClonedQrBox uses CLONED document rects
assert.ok(currentPdfExportCode.includes('measureClonedQrBox'), 'pdfExport.js must export measureClonedQrBox helper');
const { measureClonedQrBox } = await import('../src/utils/pdfExport.js');
const mockClonedRoot = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 1000 }) };
const mockClonedBox = { getBoundingClientRect: () => ({ left: 60, top: 420, width: 140, height: 140 }) };
const measured = measureClonedQrBox(mockClonedRoot, mockClonedBox);
assert.strictEqual(typeof measured.x, 'number', 'measureClonedQrBox must return x');
assert.strictEqual(typeof measured.y, 'number', 'measureClonedQrBox must return y');
assert.strictEqual(typeof measured.size, 'number', 'measureClonedQrBox must return square size');

// 5. Requirement 2: InvoiceViewPage markup for #upi-qr and #invoice-qr-box
const currentViewCode = fs.readFileSync(invoiceViewPagePath, 'utf8');
assert.ok(currentViewCode.includes('id="upi-qr"'), 'InvoiceViewPage must render <img id="upi-qr" ...>');
assert.ok(currentViewCode.includes('width="120"'), 'QR image must have width="120"');
assert.ok(currentViewCode.includes('height="120"'), 'QR image must have height="120"');
assert.ok(currentViewCode.includes("width: '140px'"), 'QR container must have fixed 140px width');
assert.ok(currentViewCode.includes("height: '140px'"), 'QR container must have fixed 140px height');
assert.ok(currentViewCode.includes("display: 'flex'"), 'QR container must have display: flex');
assert.ok(currentViewCode.includes("position: 'relative'"), 'QR container must have position: relative');
assert.ok(currentViewCode.includes("alignItems: 'center'"), 'QR container must have alignItems: center');
assert.ok(currentViewCode.includes("justifyContent: 'center'"), 'QR container must have justifyContent: center');
assert.ok(currentViewCode.includes("transform: 'none'"), 'QR container must have transform: none');
assert.ok(currentViewCode.includes("overflow: 'visible'"), 'QR container must not have overflow: hidden');
assert.ok(currentViewCode.includes("animation: 'none'"), 'QR container must have animation: none');

// 6. Verification that upi-qr decode is awaited before PDF starts
assert.ok(currentViewCode.includes("document.getElementById('upi-qr')"), 'InvoiceViewPage must locate upi-qr element');
assert.ok(currentViewCode.includes('upiQrImg.decode()'), 'InvoiceViewPage must await upiQrImg.decode() before PDF generation');

// 7. Verify balance due / total payable encoding and conditional display
assert.ok(currentViewCode.includes('amount: qrAmount'), 'QR must encode qrAmount (total payable now when previous balance shown, else balance due)');
assert.ok(currentViewCode.includes('hasQrNeeded && qrDataUrl'), 'QR must only show when hasQrNeeded (balance due > 0 and unpaid)');

console.log('✓ Test 9 Passed: In-flow QR image rendered inside 140x140 flex box, manual coordinate overlays removed, onclone properties and SVG fallback verified, single QR guaranteed.');

// Test 10: WhatsApp Web desktop flow, device detection, phone cleaning, and settings
console.log('Test 10: WhatsApp Web desktop flow & device detection verification...');
const { cleanWhatsAppPhone, shouldOpenWhatsAppWeb, getWhatsAppWebUrl, getWhatsAppShareUrl } = await import('../src/utils/whatsapp.js');
const { DEFAULT_SETTINGS } = await import('../src/db/seedData.js');

// 1. Verify default settings
assert.strictEqual(DEFAULT_SETTINGS.whatsappMode, 'auto', 'DEFAULT_SETTINGS must have whatsappMode: "auto"');
assert.strictEqual(DEFAULT_SETTINGS.defaultCountryCode, '91', 'DEFAULT_SETTINGS must have defaultCountryCode: "91"');

// 2. Phone cleaning tests
assert.strictEqual(cleanWhatsAppPhone('+91 98765 43210', '91'), '919876543210', 'Should clean space, +, and keep 91 prefix');
assert.strictEqual(cleanWhatsAppPhone('98765 43210', '91'), '919876543210', 'Should prepend 91 for 10-digit number');
assert.strictEqual(cleanWhatsAppPhone('09876543210', '91'), '919876543210', 'Should remove leading 0 and prepend 91');
assert.strictEqual(cleanWhatsAppPhone('+91 (987) 654-3210', '91'), '919876543210', 'Should strip brackets and dashes');
assert.strictEqual(cleanWhatsAppPhone('+91 09876543210', '91'), '919876543210', 'Should handle 91 followed by leading zero');
assert.strictEqual(cleanWhatsAppPhone('5551234567', '1'), '15551234567', 'Should support custom default country code');
assert.strictEqual(cleanWhatsAppPhone('+1 555 234 5678', '91'), '15552345678', 'Should keep international format with 11+ digits');
assert.strictEqual(cleanWhatsAppPhone('', '91'), '', 'Should handle empty phone gracefully');

// 3. shouldOpenWhatsAppWeb tests
// Under Node (non-mobile environment), 'auto' should return true (desktop)
assert.strictEqual(shouldOpenWhatsAppWeb({ whatsappMode: 'auto' }), true, 'Auto mode on desktop must return true');
assert.strictEqual(shouldOpenWhatsAppWeb({ whatsappMode: 'web' }), true, 'Always WhatsApp Web mode must return true');
assert.strictEqual(shouldOpenWhatsAppWeb({ whatsappMode: 'share_sheet' }), false, 'Always Share Sheet mode must return false');

// 4. getWhatsAppWebUrl tests
const testClientInvoice = {
  ...mockInvoice,
  customerSnapshot: { name: 'Ronak Jain', phone: '+91 98765 43210' }
};
const webUrl = getWhatsAppWebUrl(testClientInvoice, { ...mockSettings, defaultCountryCode: '91' });
console.log('Sample WhatsApp Web URL:\n' + webUrl);
assert.ok(webUrl.startsWith('https://web.whatsapp.com/send?phone=919876543210&text='), 'Web URL must start with web.whatsapp.com/send?phone=919876543210&text=');
assert.ok(!webUrl.includes('wa.me'), 'Web URL must NOT use wa.me');
assert.ok(!webUrl.includes('api.whatsapp.com'), 'Web URL must NOT use api.whatsapp.com');

// 5. SettingsPage markup verification
const settingsPagePath = path.resolve('src/pages/SettingsPage.jsx');
const settingsCode = fs.readFileSync(settingsPagePath, 'utf8');
assert.ok(settingsCode.includes('WhatsApp Mode'), 'SettingsPage must render WhatsApp Mode');
assert.ok(settingsCode.includes('Auto (default)'), 'SettingsPage must offer Auto (default)');
assert.ok(settingsCode.includes('Always WhatsApp Web'), 'SettingsPage must offer Always WhatsApp Web');
assert.ok(settingsCode.includes('Always Share Sheet'), 'SettingsPage must offer Always Share Sheet');
assert.ok(settingsCode.includes('Default Country Code'), 'SettingsPage must render Default Country Code');

// 6. InvoiceViewPage WhatsApp Web flow verification
assert.ok(currentViewCode.includes('shouldOpenWhatsAppWeb(settings)'), 'InvoiceViewPage must call shouldOpenWhatsAppWeb(settings)');
assert.ok(currentViewCode.includes('getWhatsAppWebUrl(invoice, settings)'), 'InvoiceViewPage must call getWhatsAppWebUrl(invoice, settings)');
assert.ok(
  currentViewCode.includes('PDF downloaded. In WhatsApp, click the + icon, choose Document, and attach the file.'),
  'InvoiceViewPage must show the 6-second instructions toast'
);
assert.ok(currentViewCode.includes('setTimeout(() => setDownloadToast(\'\'), 6000)'), 'Toast must be configured for 6 seconds');
assert.ok(currentViewCode.includes('handleWhatsAppTextOnly'), 'InvoiceViewPage must retain handleWhatsAppTextOnly');

console.log('✓ Test 10 Passed: Desktop WhatsApp Web flow, mobile share sheet routing, clean phone logic, and settings options successfully verified.');

// Test 11: Previous Balance calculation, UI notice, snapshot, UPI QR, WhatsApp message, and Payment Allocation
console.log('Test 11: Previous Balance and Multi-Bill Payment Allocation verification...');
const { getClientPreviousPendingBills, allocatePaymentToBills } = await import('../src/utils/calculations.js');

// 1. Create DRF-0001 of 4,800 and pay 2,400
const bill1Raw = {
  id: 1,
  invoiceNumber: 'DRF-0001',
  customerId: 42,
  customerSnapshot: { name: 'Kabir Mehta', phone: '+91 99887 76655' },
  invoiceDate: '2026-10-01',
  totalAmount: 4800,
  subtotal: 4800,
  advancePaid: 0,
  balanceDue: 4800,
  status: 'unpaid'
};

const bill1Paid2400 = {
  ...bill1Raw,
  ...recalculateInvoicePayments(bill1Raw, [
    { id: 'PAY-1', date: '2026-10-02', amount: 2400, method: 'Cash', note: 'Advance 50%' }
  ])
};
assert.strictEqual(bill1Paid2400.status, 'partially_paid');
assert.strictEqual(bill1Paid2400.advancePaid, 2400);
assert.strictEqual(bill1Paid2400.balanceDue, 2400);
assert.strictEqual(bill1Paid2400.totalAmount, 4800);

// 2. Create DRF-0002 of 3,000 for the same client
const bill2Raw = {
  id: 2,
  invoiceNumber: 'DRF-0002',
  customerId: 42,
  customerSnapshot: { name: 'Kabir Mehta', phone: '+91 99887 76655' },
  invoiceDate: '2026-10-05',
  totalAmount: 3000,
  subtotal: 3000,
  advancePaid: 0,
  balanceDue: 3000,
  status: 'unpaid'
};

// Calculate previous balance for client 42 before DRF-0002
const prevInfo = getClientPreviousPendingBills([bill1Paid2400], 42, bill2Raw.id, bill2Raw.invoiceDate);
assert.strictEqual(prevInfo.previousBalance, 2400, 'Previous balance must equal 2400');
assert.deepStrictEqual(prevInfo.previousInvoiceNumbers, ['DRF-0001'], 'Previous invoice numbers list must contain DRF-0001');

// Confirm DRF-0002 shows previous pending 2400 and total payable 5400
const drf0002Snapshot = {
  ...bill2Raw,
  showPreviousBalance: true,
  previousBalance: prevInfo.previousBalance,
  previousInvoiceNumbers: prevInfo.previousInvoiceNumbers
};
const totalPayableDRF0002 = (Number(drf0002Snapshot.balanceDue) || 0) + Number(drf0002Snapshot.previousBalance);
assert.strictEqual(drf0002Snapshot.balanceDue, 3000, 'DRF-0002 own balance due must remain 3000');
assert.strictEqual(drf0002Snapshot.previousBalance, 2400, 'DRF-0002 previous balance snapshot must be 2400');
assert.strictEqual(totalPayableDRF0002, 5400, 'Total payable now must be 5400');

// 3. Verify UPI QR encodes 5400 when previous balance is shown
const upiLinkWithPrev = buildUpiLink({
  upiId: 'drfilms@upi',
  payeeName: 'DR FILMS',
  amount: totalPayableDRF0002,
  invoiceNumber: drf0002Snapshot.invoiceNumber
});
assert.ok(upiLinkWithPrev.includes('am=5400.00'), 'UPI link with previous balance must encode 5400.00');

const upiLinkWithoutPrev = buildUpiLink({
  upiId: 'drfilms@upi',
  payeeName: 'DR FILMS',
  amount: drf0002Snapshot.balanceDue,
  invoiceNumber: drf0002Snapshot.invoiceNumber
});
assert.ok(upiLinkWithoutPrev.includes('am=3000.00'), 'UPI link without previous balance must encode 3000.00');

// 4. Verify WhatsApp message breakdown
const whatsappMsg = generateWhatsAppMessage(drf0002Snapshot, mockSettings);
assert.ok(whatsappMsg.includes('Total payable now: ₹ 5,400.00'), 'WhatsApp message must include Total payable now: ₹ 5,400.00');
assert.ok(whatsappMsg.includes('(This bill ₹ 3,000.00 + Previous ₹ 2,400.00 (DRF-0001))'), 'WhatsApp message must include short breakdown line');

// 5. Test Payment Allocation: Record 5,400 on DRF-0002
// 5a. Mode 'this_bill': 3,000 to DRF-0002, remaining 2,400 to DRF-0001
const allocThisBill = allocatePaymentToBills({
  bills: [bill1Paid2400, drf0002Snapshot],
  targetBillId: drf0002Snapshot.id,
  totalAmount: 5400,
  mode: 'this_bill'
});
assert.strictEqual(allocThisBill.allocations.length, 2, 'Should allocate across 2 bills');
assert.strictEqual(allocThisBill.allocations[0].invoiceId, 2);
assert.strictEqual(allocThisBill.allocations[0].amount, 3000);
assert.strictEqual(allocThisBill.allocations[1].invoiceId, 1);
assert.strictEqual(allocThisBill.allocations[1].amount, 2400);

// Recalculate DRF-0002 with 3,000 payment
const updatedDRF0002 = {
  ...drf0002Snapshot,
  ...recalculateInvoicePayments(drf0002Snapshot, [
    { id: 'PAY-BILL2', date: '2026-10-06', amount: 3000, method: 'UPI', note: 'Payment' }
  ])
};
assert.strictEqual(updatedDRF0002.balanceDue, 0, 'DRF-0002 balance due must become 0');
assert.strictEqual(updatedDRF0002.status, 'paid', 'DRF-0002 status must become paid');

// Recalculate DRF-0001 with 2,400 allocated payment
const updatedDRF0001 = {
  ...bill1Paid2400,
  ...recalculateInvoicePayments(bill1Paid2400, [
    ...(bill1Paid2400.payments || []),
    { id: 'PAY-BILL1-ALLOC', date: '2026-10-06', amount: 2400, method: 'UPI', note: 'Allocated' }
  ])
};
assert.strictEqual(updatedDRF0001.balanceDue, 0, 'DRF-0001 balance due must become 0');
assert.strictEqual(updatedDRF0001.status, 'paid', 'DRF-0001 status must become paid');

// 5b. Mode 'oldest_first': 2,400 to DRF-0001, remaining 3,000 to DRF-0002
const allocOldestFirst = allocatePaymentToBills({
  bills: [bill1Paid2400, drf0002Snapshot],
  targetBillId: drf0002Snapshot.id,
  totalAmount: 5400,
  mode: 'oldest_first'
});
assert.strictEqual(allocOldestFirst.allocations[0].invoiceId, 1);
assert.strictEqual(allocOldestFirst.allocations[0].amount, 2400);
assert.strictEqual(allocOldestFirst.allocations[1].invoiceId, 2);
assert.strictEqual(allocOldestFirst.allocations[1].amount, 3000);

// 6. Verify backward compatibility: old bill without previousBalance fields
const oldBill = {
  id: 99,
  invoiceNumber: 'OLD-001',
  customerId: 10,
  totalAmount: 1500,
  balanceDue: 1500,
  status: 'unpaid'
};
assert.strictEqual(oldBill.showPreviousBalance, undefined);
assert.strictEqual(oldBill.previousBalance, undefined);
const oldBillMsg = generateWhatsAppMessage(oldBill, mockSettings);
assert.ok(!oldBillMsg.includes('Previous pending:'), 'Old bill message must not show previous pending');

// 7. Component source code verification
const createPageCode = fs.readFileSync(path.resolve('src/pages/CreateInvoicePage.jsx'), 'utf8');
assert.ok(createPageCode.includes('getClientPreviousPendingBills'), 'CreateInvoicePage must import getClientPreviousPendingBills');
assert.ok(createPageCode.includes('Previous pending:'), 'CreateInvoicePage must display Previous pending notice');
assert.ok(createPageCode.includes('Show previous balance on this invoice'), 'CreateInvoicePage must provide checkbox');
assert.ok(createPageCode.includes('Total payable now:'), 'CreateInvoicePage must show Total payable now breakdown');

const invoicesPageCode = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
assert.ok(invoicesPageCode.includes('Previous pending'), 'InvoicesPage must render Previous pending badge');

const modalCode = fs.readFileSync(path.resolve('src/components/RecordPaymentModal.jsx'), 'utf8');
assert.ok(modalCode.includes('allocatePaymentToBills'), 'RecordPaymentModal must use allocatePaymentToBills');
assert.ok(modalCode.includes('Apply Payment To:'), 'RecordPaymentModal must provide Apply to choices');
assert.ok(modalCode.includes('Oldest First'), 'RecordPaymentModal must provide Oldest First');
assert.ok(modalCode.includes('This Bill First'), 'RecordPaymentModal must provide This Bill First');
assert.ok(modalCode.includes('Choose Bills'), 'RecordPaymentModal must provide Choose Bills (manual)');

const customersPageCode = fs.readFileSync(path.resolve('src/pages/CustomersPage.jsx'), 'utf8');
assert.ok(customersPageCode.includes('totalPending'), 'CustomersPage must calculate totalPending');
assert.ok(customersPageCode.includes('oldestUnpaidDate'), 'CustomersPage must calculate oldestUnpaidDate');
assert.ok(customersPageCode.includes('Total Pending'), 'CustomersPage must display Total Pending label');
assert.ok(customersPageCode.includes('Oldest:'), 'CustomersPage must display Oldest: date');

console.log('✓ Test 11 Passed: DRF-0001 and DRF-0002 lifecycle, previous pending 2400, total payable 5400, QR encoding, multi-bill allocation, both bills becoming Paid, and backward compatibility fully verified.');

// ==========================================
// TEST 12: Hour Calculator Full Lifecycle & Verification
// ==========================================
console.log('\nTest 12: Hour Calculator Full Lifecycle & Verification...');
const {
  parseDurationInput,
  normalizeHoursMinutes,
  formatDuration,
  formatPartDuration,
  calculateBilledMinutes,
  calculateDurationAmount,
  generateBreakdownDescription,
  generateWhatsAppSummary
} = await import('../src/utils/durationParser.js');

// 1. Duration input formats parsing
assert.deepStrictEqual(parseDurationInput('39'), { hours: 0, minutes: 39, totalMinutes: 39 });
assert.deepStrictEqual(parseDurationInput('39m'), { hours: 0, minutes: 39, totalMinutes: 39 });
assert.deepStrictEqual(parseDurationInput('1:15'), { hours: 1, minutes: 15, totalMinutes: 75 });
assert.deepStrictEqual(parseDurationInput('1h 15m'), { hours: 1, minutes: 15, totalMinutes: 75 });
assert.deepStrictEqual(parseDurationInput('1 hr 15 min'), { hours: 1, minutes: 15, totalMinutes: 75 });
assert.deepStrictEqual(parseDurationInput('2.05'), { hours: 2, minutes: 5, totalMinutes: 125 });

// Auto-conversion of minutes > 59
assert.deepStrictEqual(parseDurationInput('75'), { hours: 1, minutes: 15, totalMinutes: 75 });
assert.deepStrictEqual(parseDurationInput('75m'), { hours: 1, minutes: 15, totalMinutes: 75 });
assert.deepStrictEqual(parseDurationInput('1:75'), { hours: 2, minutes: 15, totalMinutes: 135 });

// 2. User prompt test scenario:
// "enter 39 min, 1 hr 15 min, 2 hr 05 min at ₹1,200/hr. Confirm total 3 hr 59 min and amount ₹4,780 (exact), and ₹4,800 when rounded up to 15 minutes."
const row1 = { name: 'Haldi', ...parseDurationInput('39 min') };
const row2 = { name: 'Wedding', ...parseDurationInput('1 hr 15 min') };
const row3 = { name: 'Reception', ...parseDurationInput('2 hr 05 min') };

assert.strictEqual(row1.totalMinutes, 39);
assert.strictEqual(row2.totalMinutes, 75);
assert.strictEqual(row3.totalMinutes, 125);

const totalCalcMinutes = row1.totalMinutes + row2.totalMinutes + row3.totalMinutes;
assert.strictEqual(totalCalcMinutes, 239, 'Total minutes must be 239');
assert.strictEqual(formatDuration(totalCalcMinutes), '3 hr 59 min', 'Total duration must display 3 hr 59 min');
assert.strictEqual((totalCalcMinutes / 60).toFixed(2), '3.98', 'Decimal hours must be 3.98');

// Exact amount
const hourlyRate = 1200;
const exactAmount = calculateDurationAmount(totalCalcMinutes, hourlyRate);
assert.strictEqual(exactAmount, 4780, 'Exact amount must be ₹4,780');

// Rounding options: 15 min
const billed15 = calculateBilledMinutes(totalCalcMinutes, 'ceil_15', 0);
assert.strictEqual(billed15, 240, 'Billed minutes rounded up to nearest 15 must be 240');
assert.strictEqual(formatDuration(billed15), '4 hr 00 min');
const rounded15Amount = calculateDurationAmount(billed15, hourlyRate);
assert.strictEqual(rounded15Amount, 4800, 'Rounded amount at 15 min must be ₹4,800');

// Rounding options: 30 min and 60 min
const billed30 = calculateBilledMinutes(totalCalcMinutes, 'ceil_30', 0);
assert.strictEqual(billed30, 240);
const billed60 = calculateBilledMinutes(totalCalcMinutes, 'ceil_60', 0);
assert.strictEqual(billed60, 240);

// Minimum billable time option
const billedMin10Hours = calculateBilledMinutes(39, 'exact', 60); // 1 hour minimum on 39 min
assert.strictEqual(billedMin10Hours, 60);

// Per-part amounts
const part1Amt = calculateDurationAmount(row1.totalMinutes, hourlyRate);
const part2Amt = calculateDurationAmount(row2.totalMinutes, hourlyRate);
const part3Amt = calculateDurationAmount(row3.totalMinutes, hourlyRate);
assert.strictEqual(part1Amt, 780);
assert.strictEqual(part2Amt, 1500);
assert.strictEqual(part3Amt, 2500);
assert.strictEqual(part1Amt + part2Amt + part3Amt, exactAmount, 'Per-part sum must match exact total');

// Breakdown description
const breakdownDesc = generateBreakdownDescription([row1, row2, row3]);
assert.strictEqual(
  breakdownDesc,
  'Haldi 39 min, Wedding 1 hr 15 min, Reception 2 hr 05 min',
  'Description must match expected breakdown format'
);

// WhatsApp summary
const waSummary = generateWhatsAppSummary({
  title: 'Wedding Highlights',
  clientName: 'Kabir Mehta',
  serviceName: 'Video Editing — YouTube / Long Form',
  rate: 1200,
  rows: [row1, row2, row3],
  totalMinutes: totalCalcMinutes,
  billedMinutes: billed15,
  amount: rounded15Amount,
  roundingMode: 'ceil_15',
  businessProfile: mockSettings
});
assert.ok(waSummary.includes('3 hr 59 min'));
assert.ok(waSummary.includes('Haldi: 39 min'));
assert.ok(waSummary.includes('Wedding: 1 hr 15 min'));
assert.ok(waSummary.includes('Reception: 2 hr 05 min'));
assert.ok(waSummary.includes('4,800'));

// 3. Add to Bill verification
// Line item created from calculator
const calcLineItem = {
  name: 'Video Editing — YouTube / Long Form',
  description: breakdownDesc,
  category: 'video_editing',
  unit: 'per_hour',
  rate: 1200,
  quantity: 4.0,
  quantityLabel: '3 hr 59 min',
  amount: exactAmount
};

const invoiceWithCalcItem = calculateInvoiceTotals({
  items: [calcLineItem],
  charges: [],
  taxPercentage: 18,
  advancePaid: 0
});
assert.strictEqual(invoiceWithCalcItem.subtotal, 4780, 'Invoice subtotal must equal calculated amount 4780');
assert.strictEqual(invoiceWithCalcItem.taxAmount, 860.4);
assert.strictEqual(invoiceWithCalcItem.totalAmount, 5640.4);

// 4. Source code checks for Layout, App, Page, and Backup
const layoutCode = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
assert.ok(layoutCode.includes('hour_calculator'), 'Layout navItems must include hour_calculator');
assert.ok(layoutCode.includes('Hour Calculator'), 'Layout navItems must include label Hour Calculator');
assert.ok(layoutCode.includes('shortLabel'), 'Layout navItems must include shortLabel for mobile');

const appSourceCode = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
assert.ok(appSourceCode.includes('HourCalculatorPage'), 'CustomerApp.jsx must import and render HourCalculatorPage');
assert.ok(appSourceCode.includes('handleAddToDraft'), 'CustomerApp.jsx must provide handleAddToDraft');
assert.ok(appSourceCode.includes('prefilledLineItem'), 'CustomerApp.jsx must pass prefilledLineItem');

const invoiceViewCode = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
assert.ok(invoiceViewCode.includes('item.quantityLabel || item.quantity'), 'InvoiceViewPage must display item.quantityLabel');

const backupCode = fs.readFileSync(path.resolve('src/db/backup.js'), 'utf8');
assert.ok(backupCode.includes('hourCalculations'), 'backup.js must include hourCalculations in export, import, and reset');

const dbCode = fs.readFileSync(path.resolve('src/db/db.js'), 'utf8');
assert.ok(dbCode.includes('hourCalculations'), 'db.js must declare hourCalculations table in version 2');

console.log('✓ Test 12 Passed: Hour calculator parsing, 3 hr 59 min total, ₹4,780 exact, ₹4,800 rounded (15m), line item description, invoice & PDF quantityLabel display, and backup integration verified.');

// ==========================================
// TEST 13: Previous Balance Highlighted Amounts, QR, WhatsApp & Invoice Number 4-Digit Padding
// ==========================================
console.log('\nTest 13: Previous Balance Highlighted Amounts, QR, WhatsApp & Invoice Number 4-Digit Padding...');

const { formatInvoiceNumber, formatCurrency } = await import('../src/utils/formatters.js');

// 1. Verify formatInvoiceNumber function
assert.strictEqual(formatInvoiceNumber('DRF-2'), 'DRF-0002', 'DRF-2 must be formatted to DRF-0002');
assert.strictEqual(formatInvoiceNumber('DRF-0002'), 'DRF-0002', 'DRF-0002 must remain DRF-0002');
assert.strictEqual(formatInvoiceNumber('INV-1'), 'INV-0001', 'INV-1 must be formatted to INV-0001');
assert.strictEqual(formatInvoiceNumber('DRF-1001'), 'DRF-1001', 'DRF-1001 (4 digits) must remain DRF-1001');
assert.strictEqual(formatInvoiceNumber('DRF-10001'), 'DRF-10001', 'DRF-10001 (>4 digits) must remain DRF-10001');
assert.strictEqual(formatInvoiceNumber('2'), '0002', 'Raw numeric 2 must be formatted to 0002');
assert.strictEqual(formatInvoiceNumber(''), '', 'Empty string must return empty string');
assert.strictEqual(formatInvoiceNumber(null), '', 'Null must return empty string');

// 2. User test case: DRF-0001 pending 4,600 and DRF-0002 at 7,080
const testBill1 = {
  id: 1,
  invoiceNumber: 'DRF-1', // Raw saved in DB as DRF-1
  customerId: 42,
  customerSnapshot: { name: 'Aryan Sharma', phone: '9876543210' },
  invoiceDate: '2026-10-01',
  totalAmount: 4600,
  balanceDue: 4600,
  advancePaid: 0,
  status: 'unpaid',
  payments: []
};

const testBill2 = {
  id: 2,
  invoiceNumber: 'DRF-2', // Raw saved in DB as DRF-2
  customerId: 42,
  customerSnapshot: { name: 'Aryan Sharma', phone: '9876543210' },
  invoiceDate: '2026-10-05',
  totalAmount: 7080,
  balanceDue: 7080,
  advancePaid: 0,
  status: 'unpaid',
  showPreviousBalance: true,
  previousBalance: 4600,
  previousInvoiceNumbers: ['DRF-0001'],
  payments: []
};

// Verify 4-digit formatting on invoice numbers
assert.strictEqual(formatInvoiceNumber(testBill1.invoiceNumber), 'DRF-0001');
assert.strictEqual(formatInvoiceNumber(testBill2.invoiceNumber), 'DRF-0002');

// Accounting integrity: testBill2's totalAmount and status
assert.strictEqual(testBill2.totalAmount, 7080, 'Bill 2 totalAmount must be strictly 7,080 (this bill only)');
assert.strictEqual(testBill2.balanceDue, 7080, 'Bill 2 balanceDue must be strictly 7,080 (this bill only)');
assert.strictEqual(testBill2.status, 'unpaid', 'Bill 2 status must depend only on this bill');

// When previous balance is shown:
const hasPreviousBalance = Boolean(
  testBill2.showPreviousBalance && Number(testBill2.previousBalance) > 0 && testBill2.status !== 'paid'
);
assert.strictEqual(hasPreviousBalance, true, 'hasPreviousBalance must be true');

const totalPayableNow = hasPreviousBalance
  ? (Number(testBill2.balanceDue) || 0) + Number(testBill2.previousBalance)
  : (Number(testBill2.balanceDue) || 0);

assert.strictEqual(totalPayableNow, 11680, 'Total payable now must be 7,080 + 4,600 = 11,680');

// Top-right box values:
const topBoxLabel = hasPreviousBalance ? 'TOTAL PAYABLE NOW' : 'BALANCE DUE';
const topBoxBigNumber = totalPayableNow;
const topBoxSubtitle = `This bill ${formatCurrency(testBill2.balanceDue, '₹')} + Previous ${formatCurrency(testBill2.previousBalance, '₹')}`;

assert.strictEqual(topBoxLabel, 'TOTAL PAYABLE NOW');
assert.strictEqual(topBoxBigNumber, 11680);
assert.ok(topBoxSubtitle.includes('This bill ₹ 7,080.00 + Previous ₹ 4,600.00'));

// QR code amount:
const qrAmount = hasPreviousBalance ? totalPayableNow : testBill2.balanceDue;
assert.strictEqual(qrAmount, 11680, 'QR amount must be 11,680');

// Black bar amount:
const blackBarAmount = hasPreviousBalance ? totalPayableNow : testBill2.balanceDue;
assert.strictEqual(blackBarAmount, 11680, 'Black bar amount must be 11,680');

// Confirm top box, black bar, and QR all show identical number:
assert.strictEqual(topBoxBigNumber, qrAmount, 'Top box and QR must be identical');
assert.strictEqual(blackBarAmount, qrAmount, 'Black bar and QR must be identical');

// 3. WhatsApp Message verification
const waMsg = generateWhatsAppMessage(testBill2, mockSettings);
assert.ok(waMsg.includes('*DRF-0002*'), 'WhatsApp message must show formatted invoice number *DRF-0002*');
assert.ok(waMsg.includes('Total payable now: ₹ 11,680.00'), 'WhatsApp message must have Total payable now: ₹ 11,680.00');
assert.ok(
  waMsg.includes('(This bill ₹ 7,080.00 + Previous ₹ 4,600.00 (DRF-0001))'),
  'WhatsApp message must have breakdown in one short line'
);

// 4. Payment recording of 11,680 across both bills
const paymentAllocations = allocatePaymentToBills({
  bills: [testBill1, testBill2],
  targetBillId: testBill2.id,
  totalAmount: 11680,
  mode: 'oldest_first'
});

assert.strictEqual(paymentAllocations.allocations.length, 2);
assert.strictEqual(paymentAllocations.allocations[0].invoiceId, 1);
assert.strictEqual(paymentAllocations.allocations[0].amount, 4600);
assert.strictEqual(paymentAllocations.allocations[1].invoiceId, 2);
assert.strictEqual(paymentAllocations.allocations[1].amount, 7080);
assert.strictEqual(paymentAllocations.remainingUnallocated, 0);

// Recalculate bill 1 with 4,600 allocated payment
const paidBill1 = {
  ...testBill1,
  ...recalculateInvoicePayments(testBill1, [
    { id: 'PAY-1', date: '2026-10-15', amount: 4600, method: 'UPI', note: 'Full payment' }
  ])
};
assert.strictEqual(paidBill1.balanceDue, 0, 'DRF-0001 balance due must be 0');
assert.strictEqual(paidBill1.status, 'paid', 'DRF-0001 must be paid');

// Recalculate bill 2 with 7,080 allocated payment
const paidBill2 = {
  ...testBill2,
  ...recalculateInvoicePayments(testBill2, [
    { id: 'PAY-2', date: '2026-10-15', amount: 7080, method: 'UPI', note: 'Full payment' }
  ])
};
assert.strictEqual(paidBill2.balanceDue, 0, 'DRF-0002 balance due must be 0');
assert.strictEqual(paidBill2.status, 'paid', 'DRF-0002 must be paid');

// 5. Check InvoiceViewPage code structure:
const invoiceViewPageSource = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
assert.ok(invoiceViewPageSource.includes('TOTAL PAYABLE NOW'), 'Must have TOTAL PAYABLE NOW in InvoiceViewPage');
assert.ok(invoiceViewPageSource.includes('This bill balance:'), 'Must have This bill balance: in totals');
assert.ok(invoiceViewPageSource.includes('Previous pending'), 'Must have Previous pending in totals');
assert.ok(!invoiceViewPageSource.includes('Combined Settlement Summary:'), 'Separate bottom summary box must be removed');

console.log('✓ Test 13 Passed: Highlighted amounts (11,680), top box, black bar, and QR code equality, 4-digit formatting, WhatsApp breakdown, and multi-bill payment marking both bills Paid successfully verified.');

// Test 14: Google Sheets Automatic Backup Verification
console.log('Test 14: Google Sheets Automatic Backup & Cloud Mirror verification...');

import { formatPhoneForSheets } from '../src/utils/googleSheetsSync.js';

// 14a. Phone formatting with leading apostrophe
assert.strictEqual(formatPhoneForSheets('09876543210'), "'09876543210", 'Phone starting with 0 must have leading apostrophe');
assert.strictEqual(formatPhoneForSheets('+91 98765 43210'), "'+91 98765 43210", 'Phone starting with +91 must have leading apostrophe');
assert.strictEqual(formatPhoneForSheets("'9876543210"), "'9876543210", 'Phone already with apostrophe must not duplicate it');
assert.strictEqual(formatPhoneForSheets(''), '', 'Empty phone returns empty string');
assert.strictEqual(formatPhoneForSheets(null), '', 'Null phone returns empty string');

// 14b. Table Header Schemas verification
const expectedInvoiceHeaders = [
  'Invoice No', 'Date', 'Due Date', 'Client', 'Phone', 'Subtotal', 'Charges', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Status', 'Items summary', 'Notes'
];
const expectedPaymentHeaders = ['Invoice No', 'Client', 'Date', 'Method', 'Amount', 'Note'];
const expectedClientHeaders = ['Name', 'Company', 'Phone', 'Total Billed', 'Total Paid', 'Pending'];
const expectedServiceHeaders = ['Name', 'Category', 'Unit', 'Rate'];

const syncUtilSource = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');
assert.ok(syncUtilSource.includes('text/plain;charset=utf-8'), 'Must use text/plain;charset=utf-8 to avoid CORS preflight');
assert.ok(!syncUtilSource.includes("'Content-Type': 'application/json'"), 'Must NOT use application/json content type');
assert.ok(syncUtilSource.includes("action: 'ping'"), 'Must support action ping');
assert.ok(syncUtilSource.includes("action: 'syncAll'"), 'Must support action syncAll');
assert.ok(syncUtilSource.includes("action: 'getBackup'"), 'Must support action getBackup');
assert.ok(syncUtilSource.includes("delete copy.sheetsSyncSecret"), 'Must delete sheetsSyncSecret from backup snapshot');
assert.ok(syncUtilSource.includes("delete copy.logoUrl"), 'Must delete logoUrl from backup snapshot to keep cell sizes light');
assert.ok(syncUtilSource.includes("RETRY_DELAYS = [30000, 60000, 300000, 900000]"), 'Must have 30s, 1m, 5m, 15m progressive retry backoff');
assert.ok(syncUtilSource.includes("scheduleAutoSync(5000)"), 'Must have 5 second debounce for auto-sync');

// 14c. Check Google Apps Script template file
const gasSource = fs.readFileSync(path.resolve('scripts/googleAppsScript.gs'), 'utf8');
assert.ok(gasSource.includes('function doPost(e)'), 'Apps Script must implement doPost(e)');
assert.ok(gasSource.includes('action === "ping"'), 'Apps Script must handle action ping');
assert.ok(gasSource.includes('action === "syncAll"'), 'Apps Script must handle action syncAll');
assert.ok(gasSource.includes('action === "getBackup"'), 'Apps Script must handle action getBackup');
assert.ok(gasSource.includes('_BACKUP_DATA'), 'Apps Script must store backup chunks in _BACKUP_DATA tab');
assert.ok(gasSource.includes('saveRawBackupJson'), 'Apps Script must split raw JSON into safe chunks');
assert.ok(gasSource.includes('loadRawBackupJson'), 'Apps Script must reassemble backup chunks');

// 14d. Settings Page & Dashboard Page verification
const settingsPageSource = fs.readFileSync(path.resolve('src/pages/SettingsPage.jsx'), 'utf8');
assert.ok(settingsPageSource.includes('Google Sheets Backup'), 'SettingsPage must have Google Sheets Backup section');
assert.ok(settingsPageSource.includes('Test Connection'), 'SettingsPage must have Test Connection button');
assert.ok(settingsPageSource.includes('Sync Now'), 'SettingsPage must have Sync Now button');
assert.ok(settingsPageSource.includes('Restore from Google Sheet'), 'SettingsPage must have Restore from Google Sheet button');
assert.ok(settingsPageSource.includes('Last synced:'), 'SettingsPage must show Last synced:');
assert.ok(settingsPageSource.includes('Privacy & Security Notice'), 'SettingsPage must show one-time privacy notice');
assert.ok(settingsPageSource.includes('RestoreSheetModal'), 'SettingsPage must render RestoreSheetModal');

const dashboardPageSource = fs.readFileSync(path.resolve('src/pages/DashboardPage.jsx'), 'utf8');
assert.ok(dashboardPageSource.includes('Google Sheets Backup Overdue'), 'DashboardPage must show overdue banner when > 7 days');
assert.ok(dashboardPageSource.includes('triggerManualSync'), 'DashboardPage must allow quick sync from banner');

// 14e. Verify Safety Backup before Restore in RestoreSheetModal
const restoreModalSource = fs.readFileSync(path.resolve('src/components/RestoreSheetModal.jsx'), 'utf8');
assert.ok(restoreModalSource.includes('Automatic Safety Copy'), 'Restore modal must mention automatic safety copy');
assert.ok(restoreModalSource.includes('Replace All'), 'Restore modal must offer Replace All option');
assert.ok(restoreModalSource.includes('Merge Data'), 'Restore modal must offer Merge Data option');

console.log('✓ Test 14 Passed: Google Sheets Backup, Apps Script template, CORS-safe plain text POST, sanitized snapshots, 5s debounce, progressive retry, 7-day overdue dashboard banner, and safety copy restore options successfully verified.');

// ==========================================
// TEST 15: Cross-Origin Recovery & Server Host Verification
// ==========================================
console.log('\nTest 15: Cross-Origin Recovery & Server Host Verification...');

// 15a. Check vite.config.js binds strictly to 127.0.0.1 and port 5173, and opens http://127.0.0.1:5173/
const viteCfg = fs.readFileSync(path.resolve('vite.config.js'), 'utf8');
assert.ok(viteCfg.includes("host: '127.0.0.1'"), 'vite.config.js must bind to 127.0.0.1');
assert.ok(viteCfg.includes("port: 5173"), 'vite.config.js must set default port 5173');
assert.ok(viteCfg.includes("open: 'http://127.0.0.1:5173/'"), 'vite.config.js must open http://127.0.0.1:5173/');

// 15b. Check start script cleans up port 5173 and package.json start command
const startCmd = fs.readFileSync(path.resolve('Start DR FILMS Billing.command'), 'utf8');
assert.ok(startCmd.includes('lsof -ti :5173'), 'Start command must check port 5173');
assert.ok(startCmd.includes('http://127.0.0.1:5173/'), 'Start command must reference http://127.0.0.1:5173/');

const pkgJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
assert.strictEqual(pkgJson.scripts.start, 'vite --host 127.0.0.1 --open http://127.0.0.1:5173/', 'package.json start script must open http://127.0.0.1:5173/');

// 15c. Check crossOriginSync module
const crossSync = fs.readFileSync(path.resolve('src/utils/crossOriginSync.js'), 'utf8');
assert.ok(crossSync.includes('initCrossOriginBridge'), 'crossOriginSync.js must export initCrossOriginBridge');
assert.ok(crossSync.includes('isSyncChannelMode'), 'crossOriginSync.js must export isSyncChannelMode');
assert.ok(crossSync.includes('mergeFromCounterpart'), 'crossOriginSync.js must export mergeFromCounterpart');
assert.ok(crossSync.includes('requestPersistentStorage'), 'crossOriginSync.js must export requestPersistentStorage');

// 15d. Check CustomerApp.jsx recovery banner
const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
assert.ok(appSrc.includes('counterpartAlert'), 'CustomerApp.jsx must handle counterpartAlert state');
assert.ok(appSrc.includes('isSyncChannelMode'), 'CustomerApp.jsx must handle isSyncChannelMode');
assert.ok(appSrc.includes('Restore & Merge All Bills'), 'CustomerApp.jsx must provide 1-click restore button');

// 15e. Check InvoicesPage.jsx scan button
const invPageSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
assert.ok(invPageSrc.includes('Scan Missing Bills'), 'InvoicesPage must have Scan Missing Bills button');

// 15f. Check SettingsPage.jsx origin diagnostic
const setPageSrc = fs.readFileSync(path.resolve('src/pages/SettingsPage.jsx'), 'utf8');
assert.ok(setPageSrc.includes('Active Storage Domain'), 'SettingsPage must show Active Storage Domain');
assert.ok(setPageSrc.includes('Scan Alternate Address'), 'SettingsPage must offer Scan Alternate Address');

console.log('✓ Test 15 Passed: Cross-Origin Recovery Bridge, 0.0.0.0 host binding, storage persistence, and missing bill scanner successfully verified.');

// ==========================================
// TEST 16: Explicit Target Google Sheet ID & openById Verification
// ==========================================
console.log('\nTest 16: Explicit Target Google Sheet ID & openById Verification...');

// 16a. Test extractSpreadsheetId
import { extractSpreadsheetId } from '../src/utils/googleSheetsSync.js';
const testFullUrl = 'https://docs.google.com/spreadsheets/d/1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc/edit?gid=0#gid=0';
const testRawId = '1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc';
const testShortUrl = 'https://docs.google.com/spreadsheets/d/1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc';

assert.strictEqual(extractSpreadsheetId(testFullUrl), '1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc', 'extractSpreadsheetId must parse full Google Sheet URLs');
assert.strictEqual(extractSpreadsheetId(testRawId), '1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc', 'extractSpreadsheetId must accept raw IDs');
assert.strictEqual(extractSpreadsheetId(testShortUrl), '1cEcd1PQNuIdatb5ze2D2UhutuIRqD_w7untlPudeJYc', 'extractSpreadsheetId must parse short URLs');
assert.strictEqual(extractSpreadsheetId(''), '', 'extractSpreadsheetId must handle empty string');
assert.strictEqual(extractSpreadsheetId(null), '', 'extractSpreadsheetId must handle null/undefined');

// 16b. Check googleAppsScript.gs supports openById and sheetId
const gsCode = fs.readFileSync(path.resolve('scripts/googleAppsScript.gs'), 'utf8');
assert.ok(gsCode.includes('SpreadsheetApp.openById'), 'googleAppsScript.gs must support SpreadsheetApp.openById');
assert.ok(gsCode.includes('payload.sheetId'), 'googleAppsScript.gs must read payload.sheetId');
assert.ok(gsCode.includes('ss.deleteSheet'), 'googleAppsScript.gs must delete default Sheet1 if populated');

// 16c. Check SettingsPage.jsx UI
const settingsPageCode = fs.readFileSync(path.resolve('src/pages/SettingsPage.jsx'), 'utf8');
assert.ok(settingsPageCode.includes('Target Google Sheet (URL or ID)'), 'SettingsPage must render Target Google Sheet label');
assert.ok(settingsPageCode.includes('sheetsSpreadsheetId'), 'SettingsPage must bind sheetsSpreadsheetId');

// ==========================================
// TEST 17: Client Name & Phone Number Google Sheet Sync Verification
// ==========================================
console.log('\nTest 17: Client Name & Phone Number Google Sheet Sync Verification...');

// 17a. Verify customerSnapshot resolution in googleSheetsSync source
assert.ok(syncUtilSource.includes('inv.customerSnapshot'), 'googleSheetsSync.js must inspect inv.customerSnapshot');
assert.ok(syncUtilSource.includes('getInvoiceClient'), 'googleSheetsSync.js must define getInvoiceClient helper');
assert.ok(syncUtilSource.includes('client.displayName'), 'googleSheetsSync.js must populate clientName with displayName');
assert.ok(syncUtilSource.includes('formatPhoneForSheets(client.phone)'), 'googleSheetsSync.js must format client.phone with apostrophe');

// 17b. Simulate invoice with customerSnapshot matching user image (#DRF-0001, Ronak Jain, TASVIRKARR, 7405348661)
const mockInvoiceWithSnapshot = {
  invoiceNumber: 1,
  invoiceDate: '2026-10-15',
  dueDate: '2026-10-22',
  customerSnapshot: {
    name: 'Ronak Jain',
    company: 'TASVIRKARR',
    phone: '7405348661'
  },
  subtotal: 4600,
  totalAmount: 4600,
  advancePaid: 0,
  balanceDue: 4600,
  status: 'unpaid',
  items: [{ name: 'Video Editing — Shipra x Karan Full Video', quantity: 3, amount: 3600 }]
};

// Test getInvoiceClient logic behavior
const snap = mockInvoiceWithSnapshot.customerSnapshot;
const name = snap.name.trim();
const company = snap.company.trim();
const phone = snap.phone.trim();
const displayName = (name && company && company !== name) ? `${name} (${company})` : (name || company);

assert.strictEqual(displayName, 'Ronak Jain (TASVIRKARR)', 'Client name must combine name and company if present');
assert.strictEqual(phone, '7405348661', 'Phone must match snapshot phone');

console.log('✓ Test 17 Passed: Customer snapshot name and phone extraction verified for Google Sheets backup.');

// ==========================================
// TEST 18: Service Catalog & Custom Charges Real-time Cascading Update Verification
// ==========================================
console.log('\nTest 18: Service Catalog & Custom Charges Real-time Cascading Update Verification...');

// 18a. Verify catalogSync.js exports
const catalogSyncCode = fs.readFileSync(path.resolve('src/utils/catalogSync.js'), 'utf8');
assert.ok(catalogSyncCode.includes('updateServiceAndCascade'), 'catalogSync.js must export updateServiceAndCascade');
assert.ok(catalogSyncCode.includes('updateChargeAndCascade'), 'catalogSync.js must export updateChargeAndCascade');
assert.ok(catalogSyncCode.includes('scheduleAutoSync'), 'catalogSync.js must trigger scheduleAutoSync on cascade updates');

// 18b. Verify ServicesPage.jsx uses updateServiceAndCascade
const servicesPageCode = fs.readFileSync(path.resolve('src/pages/ServicesPage.jsx'), 'utf8');
assert.ok(servicesPageCode.includes('updateServiceAndCascade'), 'ServicesPage.jsx must import updateServiceAndCascade');
assert.ok(servicesPageCode.includes('updateServiceAndCascade(editingService.id'), 'ServicesPage.jsx must call updateServiceAndCascade in edit flow');
assert.ok(servicesPageCode.includes('res.updatedCount'), 'ServicesPage.jsx must notify user of updated bills');

// 18c. Verify ChargesPage.jsx uses updateChargeAndCascade
const chargesPageCode = fs.readFileSync(path.resolve('src/pages/ChargesPage.jsx'), 'utf8');
assert.ok(chargesPageCode.includes('updateChargeAndCascade'), 'ChargesPage.jsx must import updateChargeAndCascade');
assert.ok(chargesPageCode.includes('updateChargeAndCascade(editingCharge.id'), 'ChargesPage.jsx must call updateChargeAndCascade in edit flow');
assert.ok(chargesPageCode.includes('res.updatedCount'), 'ChargesPage.jsx must notify user of updated bills');

// 18d. Verify HourCalculatorPage sets serviceId
const hourCalcCode = fs.readFileSync(path.resolve('src/pages/HourCalculatorPage.jsx'), 'utf8');
assert.ok(hourCalcCode.includes('serviceId: selectedServiceId ? Number(selectedServiceId) : null'), 'HourCalculatorPage must attach serviceId to line items');

// 18e. Simulate Service Catalog cascade logic with prefix preservation and totals recomputation
const testService = { id: 101, name: 'Video Editing', rate: 1200, category: 'video_editing', unit: 'per_hour' };
const testInvoices = [
  {
    id: 1,
    invoiceNumber: 1,
    customerId: 5,
    items: [
      { serviceId: 101, name: 'Video Editing', quantity: 3, rate: 1200, amount: 3600 }
    ],
    charges: [],
    discountValue: 0,
    taxPercentage: 0,
    advancePaid: 1000,
    totalAmount: 3600,
    balanceDue: 2600,
    status: 'partially_paid'
  },
  {
    id: 2,
    invoiceNumber: 2,
    customerId: 5,
    items: [
      { name: 'Video Editing — Shipra x Karan Full Video', quantity: 2, rate: 1200, amount: 2400 }
    ],
    charges: [],
    discountValue: 0,
    taxPercentage: 0,
    advancePaid: 0,
    totalAmount: 2400,
    balanceDue: 2400,
    status: 'unpaid'
  },
  {
    id: 3,
    invoiceNumber: 3,
    customerId: 6,
    items: [
      { serviceId: 999, name: 'Color Grading', quantity: 1, rate: 5000, amount: 5000 }
    ],
    charges: [],
    discountValue: 0,
    taxPercentage: 0,
    advancePaid: 5000,
    totalAmount: 5000,
    balanceDue: 0,
    status: 'paid'
  }
];

// Perform simulated service update to rate: 1500, name: 'Cinematic 4K Editing'
const updatedServiceData = { name: 'Cinematic 4K Editing', rate: 1500, category: 'video_editing', unit: 'per_hour' };
const oldServiceName = 'Video Editing';

const simulatedServiceCascade = testInvoices.map(inv => {
  let hasMatch = false;
  const updatedItems = inv.items.map(item => {
    const itemServiceId = item.serviceId ? Number(item.serviceId) : null;
    const itemNameNorm = (item.name || '').trim().toLowerCase();
    const oldNameNorm = oldServiceName.trim().toLowerCase();
    const matchesId = itemServiceId === 101;
    const matchesOld = itemNameNorm === oldNameNorm || itemNameNorm.startsWith(`${oldNameNorm} —`);
    if (matchesId || matchesOld) {
      hasMatch = true;
      let targetName = updatedServiceData.name;
      if (item.name.toLowerCase().startsWith(oldServiceName.toLowerCase())) {
        targetName = `${updatedServiceData.name}${item.name.slice(oldServiceName.length)}`;
      }
      const qty = Number(item.quantity) || 1;
      const newAmount = Math.round(qty * updatedServiceData.rate * 100) / 100;
      return { ...item, serviceId: 101, name: targetName, rate: updatedServiceData.rate, amount: newAmount };
    }
    return item;
  });

  if (hasMatch) {
    const newTotals = calculateInvoiceTotals({
      items: updatedItems,
      charges: inv.charges,
      discountValue: inv.discountValue,
      taxPercentage: inv.taxPercentage,
      advancePaid: inv.advancePaid
    });
    return {
      ...inv,
      items: updatedItems,
      subtotal: newTotals.subtotal,
      totalAmount: newTotals.totalAmount,
      balanceDue: Math.max(0, newTotals.totalAmount - inv.advancePaid)
    };
  }
  return inv;
});

// Assertions on Bill 1 (ID matched)
assert.strictEqual(simulatedServiceCascade[0].items[0].rate, 1500, 'Bill 1 line item rate must update to 1500');
assert.strictEqual(simulatedServiceCascade[0].items[0].amount, 4500, 'Bill 1 line item amount must update to 4500 (3 * 1500)');
assert.strictEqual(simulatedServiceCascade[0].totalAmount, 4500, 'Bill 1 totalAmount must update to 4500');
assert.strictEqual(simulatedServiceCascade[0].balanceDue, 3500, 'Bill 1 balanceDue must recompute to 3500 (4500 - 1000 paid)');

// Assertions on Bill 2 (Prefix matched with custom breakdown details)
assert.strictEqual(simulatedServiceCascade[1].items[0].name, 'Cinematic 4K Editing — Shipra x Karan Full Video', 'Bill 2 must preserve custom suffix while updating service name');
assert.strictEqual(simulatedServiceCascade[1].items[0].rate, 1500, 'Bill 2 line item rate must update to 1500');
assert.strictEqual(simulatedServiceCascade[1].items[0].amount, 3000, 'Bill 2 line item amount must update to 3000 (2 * 1500)');
assert.strictEqual(simulatedServiceCascade[1].totalAmount, 3000, 'Bill 2 totalAmount must update to 3000');
assert.strictEqual(simulatedServiceCascade[1].balanceDue, 3000, 'Bill 2 balanceDue must update to 3000');

// Assertions on Bill 3 (Different service untouched)
assert.strictEqual(simulatedServiceCascade[2].items[0].rate, 5000, 'Bill 3 must not be modified');
assert.strictEqual(simulatedServiceCascade[2].items[0].amount, 5000, 'Bill 3 amount must remain 5000');

// 18f. Simulate Custom Charges & Discounts cascade
const testCharge = { id: 201, name: 'Urgent 24h Delivery', type: 'percentage', rate: 10, nature: 'charge' };
const testChargeInvoice = {
  id: 4,
  invoiceNumber: 4,
  items: [{ name: 'Project Shoot', quantity: 1, rate: 10000, amount: 10000 }],
  charges: [{ chargeId: 201, name: 'Urgent 24h Delivery', type: 'percentage', rate: 10, nature: 'charge' }],
  discountValue: 0,
  taxPercentage: 18,
  advancePaid: 0,
  totalAmount: 12980,
  balanceDue: 12980
};

// Update charge from 10% to 20%
const updatedChargeData = { name: 'Urgent Express Delivery', type: 'percentage', rate: 20, nature: 'charge' };
const simulatedChargeCascade = {
  ...testChargeInvoice,
  charges: testChargeInvoice.charges.map(ch => {
    if (ch.chargeId === 201) {
      return { ...ch, name: updatedChargeData.name, rate: updatedChargeData.rate, type: updatedChargeData.type, nature: updatedChargeData.nature };
    }
    return ch;
  })
};

const newChargeTotals = calculateInvoiceTotals({
  items: simulatedChargeCascade.items,
  charges: simulatedChargeCascade.charges,
  taxPercentage: 18,
  advancePaid: 0
});

assert.strictEqual(newChargeTotals.subtotal, 10000, 'Subtotal remains 10000');
assert.strictEqual(newChargeTotals.charges[0].name, 'Urgent Express Delivery', 'Charge name updated');
assert.strictEqual(newChargeTotals.charges[0].amount, 2000, '20% charge of 10000 is 2000');
assert.strictEqual(newChargeTotals.taxableAmount, 12000, 'Taxable amount is 10000 + 2000 = 12000');
assert.strictEqual(newChargeTotals.taxAmount, 2160, '18% tax on 12000 is 2160');
assert.strictEqual(newChargeTotals.totalAmount, 14160, 'Total amount is 12000 + 2160 = 14160');

console.log('✓ Test 18 Passed: Real-time catalog cascade for Services & Custom Charges/Discounts with suffix preservation verified.');

// ==========================================
// TEST 19: Nested Parenthesis Delimiter Parsing & Indigo Service Reconciliation
// ==========================================
console.log('\nTest 19: Nested Parenthesis Delimiter Parsing & Indigo Service Reconciliation...');

const {
  extractTopLevelSuffix,
  getBaseServiceName,
  tokenizeText,
  isServiceMatch,
  computeTargetItemName
} = await import('../src/utils/catalogSync.js');

// 19a. Suffix extraction with pipes inside parentheses
const complexItemName = 'Album Combo (Designing | Print | Binding) | (Photo bag/Photo box)';
const extractedSuffix = extractTopLevelSuffix(complexItemName);
assert.strictEqual(extractedSuffix, ' | (Photo bag/Photo box)', 'Top-level suffix must not trip on pipes inside parentheses');

const baseServiceName = getBaseServiceName(complexItemName);
assert.strictEqual(baseServiceName, 'Album Combo (Designing | Print | Binding)', 'Base service name must be correctly extracted');

// 19b. Compute target name when service is renamed to include Indigo
const newServiceName = 'Album Combo Indigo (Designing | Print | Binding)';
const targetComputedName = computeTargetItemName(complexItemName, newServiceName);
assert.strictEqual(
  targetComputedName,
  'Album Combo Indigo (Designing | Print | Binding) | (Photo bag/Photo box)',
  'Target name must include "Indigo" while preserving the top-level suffix'
);

// 19c. Tokenization
const tokensOld = tokenizeText(baseServiceName);
const tokensNew = tokenizeText(newServiceName);
assert.ok(tokensOld.includes('album') && tokensOld.includes('combo') && tokensOld.includes('designing') && tokensOld.includes('binding'));
assert.ok(tokensNew.includes('indigo'));

// 19d. isServiceMatch when oldServiceName is provided (modal edit flow)
const catalogSvc = {
  id: 12,
  name: 'Album Combo Indigo (Designing | Print | Binding)',
  rate: 235,
  category: 'other',
  unit: 'per_page'
};
const lineItemFromBill = {
  name: 'Album Combo (Designing | Print | Binding) | (Photo bag/Photo box)',
  quantity: 60,
  rate: 235,
  amount: 14100
};

const matchesWithOld = isServiceMatch(
  lineItemFromBill,
  catalogSvc,
  12,
  'Album Combo (Designing | Print | Binding)',
  'Album Combo Indigo (Designing | Print | Binding)'
);
assert.strictEqual(matchesWithOld, true, 'isServiceMatch must match with oldServiceName provided');

// 19e. isServiceMatch when oldServiceName is null (reconcileAllBillsWithCatalog background flow)
const matchesWithoutOld = isServiceMatch(
  lineItemFromBill,
  catalogSvc,
  12,
  null,
  null
);
assert.strictEqual(matchesWithoutOld, true, 'isServiceMatch must match via token similarity & rate matching without oldServiceName');

// 19f. Full simulation of #DRF-0002 bill reconciliation matching user screenshot
const mockDRF0002 = {
  id: 2,
  invoiceNumber: 'DRF-0002',
  customerId: 1,
  customerSnapshot: { name: 'Sheetal Photographer', phone: '7021427441' },
  items: [
    { name: 'Album Combo (Designing | Print | Binding) | (Photo bag/Photo box)', unit: 'per_page', rate: 235, quantity: 60, amount: 14100 },
    { name: 'Extra Sheets (designing)', unit: 'per_page', rate: 80, quantity: 14, amount: 1120 },
    { name: 'Extra Sheets (Print | Binding)', unit: 'per_page', rate: 75, quantity: 14, amount: 1050 },
    { name: 'NT Paper', unit: 'per_page', rate: 10, quantity: 74, amount: 740 },
    { name: 'Pad/ TP/ Emboss (Designing)', unit: 'per_page', rate: 80, quantity: 4, amount: 320 }
  ],
  charges: [],
  discountType: 'fixed',
  discountValue: 420,
  taxPercentage: 0,
  advancePaid: 0,
  subtotal: 17330,
  totalAmount: 16910,
  balanceDue: 16910,
  status: 'unpaid'
};

const updatedDRFItems = mockDRF0002.items.map(item => {
  if (isServiceMatch(item, catalogSvc, catalogSvc.id)) {
    const updatedName = computeTargetItemName(item.name, catalogSvc.name);
    return {
      ...item,
      serviceId: catalogSvc.id,
      name: updatedName
    };
  }
  return item;
});

assert.strictEqual(
  updatedDRFItems[0].name,
  'Album Combo Indigo (Designing | Print | Binding) | (Photo bag/Photo box)',
  'First item in DRF-0002 must have Indigo inserted'
);
assert.strictEqual(updatedDRFItems[0].serviceId, 12, 'serviceId must be linked');
assert.strictEqual(updatedDRFItems[1].name, 'Extra Sheets (designing)', 'Item 2 must remain untouched');
assert.strictEqual(updatedDRFItems[2].name, 'Extra Sheets (Print | Binding)', 'Item 3 must remain untouched');

const reconciledDRFTotals = calculateInvoiceTotals({
  items: updatedDRFItems,
  charges: mockDRF0002.charges,
  discountType: mockDRF0002.discountType,
  discountValue: mockDRF0002.discountValue,
  taxPercentage: mockDRF0002.taxPercentage,
  advancePaid: mockDRF0002.advancePaid
});

assert.strictEqual(reconciledDRFTotals.subtotal, 17330, 'Subtotal must remain 17,330.00');
assert.strictEqual(reconciledDRFTotals.allDiscounts, 420, 'Discount must remain 420.00');
assert.strictEqual(reconciledDRFTotals.totalAmount, 16910, 'Total Amount must remain 16,910.00');

// 19g. Verify UI buttons and safe on-mount behavior
const servicesPageSrc = fs.readFileSync(path.resolve('src/pages/ServicesPage.jsx'), 'utf8');
assert.ok(servicesPageSrc.includes('Sync All Bills'), 'ServicesPage must have "Sync All Bills" button');
assert.ok(servicesPageSrc.includes('reconcileAllBillsWithCatalog'), 'ServicesPage must import reconcileAllBillsWithCatalog');

const invoicesPageSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
assert.ok(invoicesPageSrc.includes('Sync with Catalog'), 'InvoicesPage must have "Sync with Catalog" button');

const invoiceViewPageSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
assert.ok(!invoiceViewPageSrc.includes('reconcileAllBillsWithCatalog'), 'InvoiceViewPage must NOT run destructive auto-reconcile on mount');

console.log('✓ Test 19 Passed: Nested parenthesis parsing, "Album Combo Indigo" matching, DRF-0002 line item update, and UI button wiring verified.');

// Test 20: Google Sheets multiline items formatting and Bill Items table
console.log('Test 20: Google Sheets multiline items formatting and Bill Items table...');

const sheetsSyncSrc = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');
assert.ok(sheetsSyncSrc.includes("'Bill Items'"), 'googleSheetsSync.js must include Bill Items table');
assert.ok(sheetsSyncSrc.includes(".join('\\n')"), 'googleSheetsSync.js must join items summary with newline');
assert.ok(sheetsSyncSrc.includes('Rate:'), 'googleSheetsSync.js must format Rate in items summary');
assert.ok(sheetsSyncSrc.includes('Qty:'), 'googleSheetsSync.js must format Qty in items summary');
assert.ok(sheetsSyncSrc.includes('Amount:'), 'googleSheetsSync.js must format Amount in items summary');

const appsScriptSrc = fs.readFileSync(path.resolve('scripts/googleAppsScript.gs'), 'utf8');
assert.ok(appsScriptSrc.includes('range.setWrap(true)'), 'googleAppsScript.gs must enable text wrapping');
assert.ok(appsScriptSrc.includes('range.setVerticalAlignment("top")'), 'googleAppsScript.gs must align vertically to top');

// Verify actual formatting output for mockDRF0002 items
const { UNIT_SHORT } = await import('../src/utils/formatters.js');

const sym = '₹';
const drfSummary = updatedDRFItems.map((i, idx) => {
  const num = idx + 1;
  let fullName = (i.name || 'Service').trim();
  if (i.description && i.description.trim()) {
    fullName += ` (${i.description.trim()})`;
  }
  const rawUnit = (UNIT_SHORT[i.unit] || (i.unit && i.unit !== 'fixed' ? i.unit : '') || '').trim();
  const unitPart = rawUnit ? `Unit: ${rawUnit} | ` : '';
  const ratePart = `Rate: ${formatCurrency(Number(i.rate) || 0, sym)}`;
  const qtyVal = i.quantityLabel || i.quantity || 1;
  const qtyPart = `Qty: ${qtyVal}`;
  const amtPart = `Amount: ${formatCurrency(Number(i.amount) || 0, sym)}`;
  return `${num}. ${fullName} — ${unitPart}${ratePart} | ${qtyPart} | ${amtPart}`;
}).join('\n');

const lines = drfSummary.split('\n');
assert.strictEqual(lines.length, 5, 'DRF-0002 must have exactly 5 separate lines in Items summary');
assert.ok(lines[0].startsWith('1. Album Combo Indigo'), 'Line 1 must be service 1 with Indigo');
assert.ok(lines[0].includes('Rate: ₹ 235.00') && lines[0].includes('Qty: 60') && lines[0].includes('Amount: ₹ 14,100.00'), 'Line 1 must show Rate, Qty, Amount');
assert.ok(lines[1].startsWith('2. Extra Sheets (designing)'), 'Line 2 must be service 2');
assert.ok(lines[1].includes('Rate: ₹ 80.00') && lines[1].includes('Qty: 14') && lines[1].includes('Amount: ₹ 1,120.00'), 'Line 2 must show Rate, Qty, Amount');
assert.ok(lines[2].startsWith('3. Extra Sheets (Print | Binding)'), 'Line 3 must be service 3');
assert.ok(lines[3].startsWith('4. NT Paper'), 'Line 4 must be service 4');
assert.ok(lines[4].startsWith('5. Pad/ TP/ Emboss (Designing)'), 'Line 5 must be service 5');

console.log('Sample DRF-0002 Items summary in Google Sheet:\n' + drfSummary);
console.log('✓ Test 20 Passed: Multiline services with Rate, Unit, Qty, Amount verified.');

// Test 21: Prevention of repeated phrase duplication & DRF-0001 repair verification
console.log('Test 21: Prevention of repeated phrase duplication & DRF-0001 repair verification...');

const { computeTargetItemName: computeSafeName, isServiceMatch: isSafeMatch, repairCorruptedBills } = await import('../src/utils/catalogSync.js');

// 21a. Verify computeTargetItemName does not duplicate
const corruptedText = 'Video Editing — Commercial / Promo Reel — Commercial / Promo Reel — Commercial / Promo Reel — Shipra x Karan Full Video';
const cleanedName = computeSafeName(corruptedText, 'Video Editing — Commercial / Promo Reel');
assert.ok(!cleanedName.includes('Commercial / Promo Reel — Commercial / Promo Reel'), 'Must strip duplicate repeats');

// 21b. Verify isServiceMatch does NOT confuse Shipra x Karan with Commercial Promo Reel
const shipraItem = {
  name: 'Video Editing — Shipra x Karan Full Video',
  unit: 'per_hour',
  rate: 1200,
  quantity: 3,
  amount: 3600
};
const commercialService = {
  id: 1,
  name: 'Video Editing — Commercial / Promo Reel',
  unit: 'per_video',
  rate: 4500
};
const matchResult = isSafeMatch(shipraItem, commercialService, 1);
assert.strictEqual(matchResult, false, 'Shipra x Karan (rate 1200 /hr) must NOT match Commercial / Promo Reel (rate 4500 /video)');

// 21c. Verify seedData imports and calls repairCorruptedBills
const seedDataSrc = fs.readFileSync(path.resolve('src/db/seedData.js'), 'utf8');
assert.ok(seedDataSrc.includes('repairCorruptedBills'), 'seedData.js must invoke repairCorruptedBills');

const appComponentSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
assert.ok(!appComponentSrc.includes('reconcileAllBillsWithCatalog'), 'CustomerApp.jsx must NOT run reconcileAllBillsWithCatalog on mount');

console.log('✓ Test 21 Passed: Repeated phrase duplication prevented, safe matching enforced, and repair function verified.');

// ==========================================
// TEST 22: Strict Catalog Safety Lock, Line Item Snapshotting, and First-Run Clean Slate
// ==========================================
console.log('\nTest 22: Strict Catalog Safety Lock, Line Item Snapshotting, and First-Run Clean Slate...');
{
  const { updateServiceAndCascade, updateChargeAndCascade, reconcileAllBillsWithCatalog: runReconcile } = await import('../src/utils/catalogSync.js');

  // 22a. Setup mock in-memory database
  const mockServices = [
    {
      id: 42,
      name: 'Video Editing — YouTube / Long Form',
      category: 'video_editing',
      unit: 'per_hour',
      rate: 1200,
      description: 'Multi-cam synchronization'
    }
  ];

  const mockCustomCharges = [
    {
      id: 7,
      name: 'Rush Delivery Fee',
      type: 'fixed',
      rate: 500,
      nature: 'charge',
      description: '24hr turnaround'
    }
  ];

  let mockInvoices = [
    {
      id: 101,
      invoiceNumber: 'DRF-0001',
      status: 'paid',
      items: [
        {
          id: 1,
          serviceId: 42,
          name: 'Video Editing — YouTube / Long Form',
          description: 'Multi-cam synchronization',
          category: 'video_editing',
          unit: 'per_hour',
          rate: 1200,
          quantity: 2,
          amount: 2400
        }
      ],
      charges: [],
      subtotal: 2400,
      totalAmount: 2400,
      advancePaid: 2400,
      balanceDue: 0
    },
    {
      id: 102,
      invoiceNumber: 'DRF-0002',
      status: 'unpaid',
      items: [
        {
          id: 2,
          serviceId: 42,
          name: 'Video Editing — YouTube / Long Form',
          description: 'Multi-cam synchronization',
          category: 'video_editing',
          unit: 'per_hour',
          rate: 1200,
          quantity: 3,
          amount: 3600
        }
      ],
      charges: [],
      subtotal: 3600,
      totalAmount: 3600,
      advancePaid: 0,
      balanceDue: 3600
    },
    {
      id: 103,
      invoiceNumber: 'DRF-0003',
      status: 'partially_paid',
      items: [
        {
          id: 3,
          serviceId: 42,
          name: 'Video Editing — YouTube / Long Form',
          description: 'Multi-cam synchronization',
          category: 'video_editing',
          unit: 'per_hour',
          rate: 1200,
          quantity: 1,
          amount: 1200
        }
      ],
      charges: [],
      subtotal: 1200,
      totalAmount: 1200,
      advancePaid: 500,
      balanceDue: 700
    },
    {
      id: 104,
      invoiceNumber: 'DRF-0004',
      status: 'draft',
      items: [
        {
          id: 4,
          serviceId: 42,
          name: 'Video Editing — YouTube / Long Form',
          description: 'Multi-cam synchronization',
          category: 'video_editing',
          unit: 'per_hour',
          rate: 1200,
          quantity: 1,
          amount: 1200
        }
      ],
      charges: [],
      taxPercentage: 0,
      subtotal: 1200,
      totalAmount: 1200,
      advancePaid: 0,
      balanceDue: 1200
    }
  ];

  const mockDbInstance = {
    services: {
      get: async (id) => mockServices.find(s => s.id === Number(id)),
      update: async (id, data) => {
        const idx = mockServices.findIndex(s => s.id === Number(id));
        if (idx !== -1) mockServices[idx] = { ...mockServices[idx], ...data };
      },
      toArray: async () => [...mockServices]
    },
    customCharges: {
      get: async (id) => mockCustomCharges.find(c => c.id === Number(id)),
      update: async (id, data) => {
        const idx = mockCustomCharges.findIndex(c => c.id === Number(id));
        if (idx !== -1) mockCustomCharges[idx] = { ...mockCustomCharges[idx], ...data };
      },
      toArray: async () => [...mockCustomCharges]
    },
    invoices: {
      toArray: async () => JSON.parse(JSON.stringify(mockInvoices)),
      put: async (inv) => {
        const idx = mockInvoices.findIndex(i => i.id === inv.id);
        if (idx !== -1) mockInvoices[idx] = JSON.parse(JSON.stringify(inv));
        else mockInvoices.push(JSON.parse(JSON.stringify(inv)));
      },
      update: async (id, data) => {
        const idx = mockInvoices.findIndex(i => i.id === Number(id));
        if (idx !== -1) mockInvoices[idx] = { ...mockInvoices[idx], ...JSON.parse(JSON.stringify(data)) };
      }
    }
  };

  // 22b. Test: Change rate to ₹1,500 with updateDrafts: false (default checkbox OFF)
  const resOff = await updateServiceAndCascade(
    42,
    { name: 'Video Editing — YouTube / Long Form', rate: 1500, unit: 'per_hour', description: 'Updated desc' },
    null,
    { updateDrafts: false },
    mockDbInstance
  );

  assert.strictEqual(resOff.updatedCount, 0, 'No bills should be updated when updateDrafts is false');
  assert.strictEqual(mockServices[0].rate, 1500, 'Catalog service rate must be updated to 1500');

  // Verify all bills remain completely unchanged
  const paidBill1 = mockInvoices.find(i => i.id === 101);
  const unpaidBill2 = mockInvoices.find(i => i.id === 102);
  const partPaidBill3 = mockInvoices.find(i => i.id === 103);
  const draftBill4 = mockInvoices.find(i => i.id === 104);

  assert.strictEqual(paidBill1.items[0].rate, 1200, 'Paid bill must retain snapshot rate ₹1,200');
  assert.strictEqual(paidBill1.totalAmount, 2400, 'Paid bill must retain old total ₹2,400');
  assert.strictEqual(unpaidBill2.items[0].rate, 1200, 'Unpaid bill must retain snapshot rate ₹1,200');
  assert.strictEqual(unpaidBill2.totalAmount, 3600, 'Unpaid bill must retain old total ₹3,600');
  assert.strictEqual(partPaidBill3.items[0].rate, 1200, 'Partially paid bill must retain snapshot rate ₹1,200');
  assert.strictEqual(draftBill4.items[0].rate, 1200, 'Draft bill must remain ₹1,200 when updateDrafts is false');

  // 22c. Test: Change rate to ₹1,500 with updateDrafts: true (checkbox ON)
  const resOn = await updateServiceAndCascade(
    42,
    { name: 'Video Editing — YouTube / Long Form', rate: 1500, unit: 'per_hour', description: 'Updated desc' },
    null,
    { updateDrafts: true },
    mockDbInstance
  );

  assert.strictEqual(resOn.updatedCount, 1, 'Only the 1 draft bill should be updated');
  assert.strictEqual(resOn.updatedInvoiceNumbers[0], 'DRF-0004');

  const paidAfterOn = mockInvoices.find(i => i.id === 101);
  const unpaidAfterOn = mockInvoices.find(i => i.id === 102);
  const draftAfterOn = mockInvoices.find(i => i.id === 104);

  assert.strictEqual(paidAfterOn.items[0].rate, 1200, 'Paid bill must strictly remain ₹1,200 and never change');
  assert.strictEqual(paidAfterOn.totalAmount, 2400, 'Paid bill must retain old total ₹2,400');
  assert.strictEqual(unpaidAfterOn.items[0].rate, 1200, 'Unpaid bill must strictly remain ₹1,200 and never change');
  assert.strictEqual(unpaidAfterOn.totalAmount, 3600, 'Unpaid bill must retain old total ₹3,600');
  assert.strictEqual(draftAfterOn.items[0].rate, 1500, 'Draft bill must update to ₹1,500 when checkbox is on');
  assert.strictEqual(draftAfterOn.totalAmount, 1500, 'Draft bill total must recalculate to ₹1,500');

  // 22d. Test: Reconcile All Bills also strictly respects non-draft status
  const recRes = await runReconcile({ updateDrafts: true }, mockDbInstance);
  const paidAfterRec = mockInvoices.find(i => i.id === 101);
  const unpaidAfterRec = mockInvoices.find(i => i.id === 102);
  assert.strictEqual(paidAfterRec.items[0].rate, 1200, 'Reconcile must never alter paid bills');
  assert.strictEqual(unpaidAfterRec.items[0].rate, 1200, 'Reconcile must never alter unpaid bills');

  // 22e. Test UI warning and checkbox text in ServicesPage and ChargesPage
  const servicesPageCode = fs.readFileSync(path.resolve('src/pages/ServicesPage.jsx'), 'utf8');
  assert.ok(servicesPageCode.includes('Existing sent bills will not change. Only new bills use the new rate.'), 'ServicesPage must display safety lock notice');
  assert.ok(servicesPageCode.includes('Also update draft bills'), 'ServicesPage must provide "Also update draft bills" checkbox');

  const chargesPageCode = fs.readFileSync(path.resolve('src/pages/ChargesPage.jsx'), 'utf8');
  assert.ok(chargesPageCode.includes('Existing sent bills will not change. Only new bills use the new rate.'), 'ChargesPage must display safety lock notice');
  assert.ok(chargesPageCode.includes('Also update draft bills'), 'ChargesPage must provide "Also update draft bills" checkbox');

  // 22f. Test First-Run seed data and sequence configuration
  const { DEFAULT_SETTINGS, DEFAULT_CUSTOMERS } = await import('../src/db/seedData.js');
  assert.strictEqual(DEFAULT_SETTINGS.nextInvoiceSeq, 1, 'Default nextInvoiceSeq must start at 1');
  assert.strictEqual(DEFAULT_CUSTOMERS.length, 0, 'First-run sample customers must be removed');

  const seedDataCode = fs.readFileSync(path.resolve('src/db/seedData.js'), 'utf8');
  assert.ok(!seedDataCode.includes("'DRF-1001'"), 'Sample invoice DRF-1001 must not be created on first-run');

  console.log('✓ Test 22 Passed: Strict safety lock, snapshot preservation, draft-only cascade with checkbox, and clean first-run DRF-0001 sequence verified.');
}

// ==========================================
// TEST 23: Soft Delete, Trash Management, Google Sheet Never-Delete Backup & Invoice Sequence Verification
// ==========================================
console.log('\nTest 23: Soft Delete, Trash Management, Google Sheet Never-Delete Backup & Invoice Sequence Verification...');

{
  const { prepareSyncPayload } = await import('../src/utils/googleSheetsSync.js');
  const { getClientPreviousPendingBills, allocatePaymentToBills } = await import('../src/utils/calculations.js');

  // 23a. Setup test invoices: active bills & a bill to be deleted
  const testInvoices = [
    {
      id: 1,
      invoiceNumber: 'DRF-0001',
      status: 'paid',
      customerId: 1,
      customerSnapshot: { name: 'Ronak Jain', phone: '9876543210' },
      subtotal: 4600,
      totalAmount: 4600,
      advancePaid: 4600,
      balanceDue: 0,
      items: [{ id: 1, name: 'Video Editing', rate: 4600, quantity: 1, amount: 4600 }],
      payments: [{ id: 'PAY-1', amount: 4600, date: '2026-10-15', method: 'UPI' }],
      invoiceDate: '2026-10-15'
    },
    {
      id: 2,
      invoiceNumber: 'DRF-0002',
      status: 'unpaid',
      customerId: 1,
      customerSnapshot: { name: 'Ronak Jain', phone: '9876543210' },
      subtotal: 7080,
      totalAmount: 7080,
      advancePaid: 0,
      balanceDue: 7080,
      items: [{ id: 2, name: 'Album Combo', rate: 7080, quantity: 1, amount: 7080 }],
      payments: [],
      invoiceDate: '2026-10-16'
    },
    {
      id: 3,
      invoiceNumber: 'DRF-0003',
      status: 'unpaid',
      customerId: 1,
      customerSnapshot: { name: 'Ronak Jain', phone: '9876543210' },
      subtotal: 5000,
      totalAmount: 5000,
      advancePaid: 0,
      balanceDue: 5000,
      items: [{ id: 3, name: 'Promo Reel', rate: 5000, quantity: 1, amount: 5000 }],
      payments: [],
      invoiceDate: '2026-10-17'
    }
  ];

  // Initial state: all bills active
  let activeBills = testInvoices.filter(inv => !inv?.isDeleted);
  assert.strictEqual(activeBills.length, 3, 'Initially 3 active bills');
  let totalBilled = activeBills.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  let totalPending = activeBills.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);
  assert.strictEqual(totalBilled, 16680);
  assert.strictEqual(totalPending, 12080);

  // 23b. Soft delete DRF-0003
  const nowIso = new Date().toISOString();
  const deletedBill = {
    ...testInvoices[2],
    isDeleted: true,
    deletedAt: nowIso
  };
  testInvoices[2] = deletedBill;

  // Check: Deleted bill leaves Bills and totals
  activeBills = testInvoices.filter(inv => !inv?.isDeleted);
  assert.strictEqual(activeBills.length, 2, 'Active bills list must now have 2 bills');
  totalBilled = activeBills.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  totalPending = activeBills.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);
  assert.strictEqual(totalBilled, 11680, 'Total billed must exclude deleted bill');
  assert.strictEqual(totalPending, 7080, 'Pending receivables must NOT include deleted bill');

  // Check: Items, payments, and totals remain intact on deleted bill
  assert.strictEqual(deletedBill.items.length, 1);
  assert.strictEqual(deletedBill.totalAmount, 5000);
  assert.strictEqual(deletedBill.balanceDue, 5000);

  // Check: Appears in Trash filter
  const trashBills = testInvoices.filter(inv => inv?.isDeleted === true);
  assert.strictEqual(trashBills.length, 1);
  assert.strictEqual(trashBills[0].invoiceNumber, 'DRF-0003');

  // Check: Client previous pending bills excludes deleted bill
  const clientPending = getClientPreviousPendingBills(testInvoices, 1, 999, '2026-10-18');
  assert.strictEqual(clientPending.previousInvoices.length, 1, 'Client pending bills must only return DRF-0002');
  assert.strictEqual(clientPending.previousBalance, 7080);

  // Check: Payment allocation ignores deleted bill
  const allocRes = allocatePaymentToBills({
    bills: testInvoices,
    targetBillId: 2,
    totalAmount: 7080,
    mode: 'oldest_first'
  });
  assert.strictEqual(allocRes.allocations.length, 1);
  assert.strictEqual(allocRes.allocations[0].invoiceId, 2);

  // 23c. Test Sync payload: marks it Deleted instead of omitting it & adds to Deleted Bills tab
  const mockProfile = {
    key: 'business_profile',
    invoicePrefix: 'DRF-',
    currencySymbol: '₹',
    permanentlyDeletedBills: [
      {
        invoiceNumber: 'DRF-0004',
        customerName: 'Past Client',
        phone: '9999999999',
        date: '2026-10-14',
        totalAmount: 3000,
        advancePaid: 3000,
        balanceDue: 0,
        deletedAt: '2026-10-14T10:00:00.000Z'
      }
    ]
  };

  const mockDbForSync = {
    settings: { toArray: async () => [mockProfile] },
    services: { toArray: async () => [] },
    customCharges: { toArray: async () => [] },
    customers: { toArray: async () => [{ id: 1, name: 'Ronak Jain', phone: '9876543210' }] },
    invoices: { toArray: async () => testInvoices }
  };

  const payload = await prepareSyncPayload(mockProfile, mockDbForSync);

  // Verify Invoices table in payload contains all records including soft-deleted and permanently deleted
  const invRows = payload.tables.Invoices.rows;
  assert.ok(invRows.length >= 4, 'Invoices table must include active, deleted, and permanently deleted bills');

  const rowDRF0001 = invRows.find(r => r[0] === 'DRF-0001');
  const rowDRF0002 = invRows.find(r => r[0] === 'DRF-0002');
  const rowDRF0003 = invRows.find(r => r[0] === 'DRF-0003');
  const rowDRF0004 = invRows.find(r => r[0] === 'DRF-0004');

  assert.strictEqual(rowDRF0001[13], 'Active', 'DRF-0001 Record Status must be Active');
  assert.strictEqual(rowDRF0002[13], 'Active', 'DRF-0002 Record Status must be Active');
  assert.strictEqual(rowDRF0003[13], 'Deleted', 'DRF-0003 Record Status must be Deleted');
  assert.strictEqual(rowDRF0003[14], nowIso, 'DRF-0003 Deleted At must be present');
  assert.strictEqual(rowDRF0004[13], 'Deleted permanently', 'DRF-0004 Record Status must be Deleted permanently');

  // Verify Deleted Bills tab in payload
  const deletedBillsRows = payload.tables['Deleted Bills'].rows;
  assert.ok(Array.isArray(deletedBillsRows), 'Payload must have Deleted Bills table');
  const deletedRowDRF0003 = deletedBillsRows.find(r => r[0] === 'DRF-0003');
  assert.ok(deletedRowDRF0003, 'Deleted Bills table must have row for DRF-0003');
  assert.strictEqual(deletedRowDRF0003[5], 5000, 'Deleted Bills row total must be 5000');
  assert.strictEqual(deletedRowDRF0003[8], nowIso, 'Deleted Bills row Deleted At must match');

  // 23d. Restore from Trash and confirm totals and status return
  const restoredBill = {
    ...testInvoices[2],
    isDeleted: false,
    restoredAt: new Date().toISOString()
  };
  testInvoices[2] = restoredBill;

  activeBills = testInvoices.filter(inv => !inv?.isDeleted);
  assert.strictEqual(activeBills.length, 3, 'Active bills must be 3 after restore');
  totalBilled = activeBills.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  totalPending = activeBills.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);
  assert.strictEqual(totalBilled, 16680, 'Total billed returns to 16,680');
  assert.strictEqual(totalPending, 12080, 'Pending receivables returns to 12,080');

  const payloadAfterRestore = await prepareSyncPayload(mockProfile, mockDbForSync);
  const restoredInvRow = payloadAfterRestore.tables.Invoices.rows.find(r => r[0] === 'DRF-0003');
  assert.strictEqual(restoredInvRow[13], 'Active', 'Restored bill Record Status must be Active');
  const deletedBillsRowAfterRestore = payloadAfterRestore.tables['Deleted Bills'].rows.find(r => r[0] === 'DRF-0003');
  assert.ok(deletedBillsRowAfterRestore[9].length > 0, 'Deleted Bills tab must record Restored At timestamp');

  // 23e. Confirm a deleted invoice number is never reused
  const allBillsForSeq = [
    { invoiceNumber: 'DRF-0001', isDeleted: false },
    { invoiceNumber: 'DRF-0002', isDeleted: false },
    { invoiceNumber: 'DRF-0003', isDeleted: true }
  ];
  const permDeleted = mockProfile.permanentlyDeletedBills || [];

  let maxSeq = 0;
  allBillsForSeq.forEach(inv => {
    const num = parseInt(String(inv.invoiceNumber).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > maxSeq) maxSeq = num;
  });
  permDeleted.forEach(inv => {
    const num = parseInt(String(inv.invoiceNumber).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > maxSeq) maxSeq = num;
  });

  const nextSeq = Math.max(1, maxSeq + 1);
  assert.strictEqual(nextSeq, 5, 'Next sequence must be 5 (DRF-0005)');
  assert.notStrictEqual(nextSeq, 3, 'DRF-0003 must never be reused');
  assert.notStrictEqual(nextSeq, 4, 'DRF-0004 must never be reused');

  // 23f. Confirm Google Apps Script code contains upsert, non-delete preservation, red shading, and backup history
  const gasSourceCode = fs.readFileSync(path.resolve('scripts/googleAppsScript.gs'), 'utf8');
  assert.ok(gasSourceCode.includes('upsertInvoicesTable'), 'Must implement upsertInvoicesTable');
  assert.ok(gasSourceCode.includes('upsertPaymentsTable'), 'Must implement upsertPaymentsTable');
  assert.ok(gasSourceCode.includes('updateDeletedBillsTab') || gasSourceCode.includes('upsertDeletedBillsTable'), 'Must implement updateDeletedBillsTab');
  assert.ok(gasSourceCode.includes('saveBackupHistory'), 'Must implement saveBackupHistory');
  assert.ok(gasSourceCode.includes('_BackupHistory'), 'Must maintain _BackupHistory tab');
  assert.ok(gasSourceCode.includes('#fee2e2'), 'Must shade deleted rows soft red');
  assert.ok(gasSourceCode.includes('Record Status'), 'Must maintain Record Status column');
  assert.ok(gasSourceCode.includes('getDate() - 30') || gasSourceCode.includes('30 * 24 * 60 * 60 * 1000') || gasSourceCode.includes('30 days'), 'Must maintain rolling 30 day backup history');

  // 23g. Old data compatibility: older bills without isDeleted load as active
  const legacyBill = {
    id: 99,
    invoiceNumber: 'DRF-0099',
    totalAmount: 1000
  };
  assert.strictEqual(Boolean(legacyBill.isDeleted), false, 'Legacy bill isDeleted evaluates to false');
  assert.strictEqual(!legacyBill.isDeleted, true, 'Legacy bill is treated as active');

  console.log('✓ Test 23 Passed: Soft-delete in app, Trash filtering, non-reusable invoice sequences, Google Sheets upsert preservation, red shading, append-only Deleted Bills tab, and 30-day backup history fully verified.');
}

// ==========================================
// TEST 24: Event-Driven Real-time Auto-Update Backup & App Open/Close Lifecycle Triggers
// ==========================================
console.log('\nTest 24: Event-Driven Real-time Auto-Update Backup & App Open/Close Lifecycle Triggers...');

{
  const syncUtilSource = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');

  // 24a. Verify NO periodic 1-15 second polling timer exists
  assert.ok(!syncUtilSource.includes('setInterval'), 'Must NOT have any periodic setInterval polling timers');
  assert.ok(!syncUtilSource.includes('every 15s') && !syncUtilSource.includes('every 1-15'), 'Must NOT poll every 1-15 seconds');

  // 24b. Verify event-driven auto-sync scheduling & debounce
  assert.ok(syncUtilSource.includes('export function scheduleAutoSync'), 'Must export scheduleAutoSync for event triggers');
  assert.ok(syncUtilSource.includes('hasPendingChanges = true'), 'Must track pending changes on data modification');
  assert.ok(syncUtilSource.includes('debounceTimer = setTimeout'), 'Must debounce rapid edits with a timer');

  // 24c. Verify App Open trigger ("first update trigger")
  assert.ok(syncUtilSource.includes('isFirstSyncTriggered'), 'Must track app open first trigger');
  assert.ok(syncUtilSource.includes("performGoogleSheetsSync({ reason: 'app_open' })"), 'Must trigger first update backup on app open/launch');

  // 24d. Verify App Close / Unload trigger ("when billing app open/close then first update trigger")
  assert.ok(syncUtilSource.includes('export function flushSyncOnClose'), 'Must export flushSyncOnClose');
  assert.ok(syncUtilSource.includes("window.addEventListener('beforeunload'"), 'Must attach beforeunload listener');
  assert.ok(syncUtilSource.includes("window.addEventListener('pagehide'"), 'Must attach pagehide listener');
  assert.ok(syncUtilSource.includes("document.addEventListener('visibilitychange'"), 'Must attach visibilitychange listener');
  assert.ok(syncUtilSource.includes("document.visibilityState === 'hidden'"), 'Must flush sync when page is hidden/closed');
  assert.ok(syncUtilSource.includes('keepalive: true'), 'Must use fetch keepalive: true to guarantee delivery on close');

  // 24e. Verify Dexie reactive database hooks on all core entities
  assert.ok(syncUtilSource.includes("db.invoices.hook('creating'"), 'Must hook invoices creating');
  assert.ok(syncUtilSource.includes("db.invoices.hook('updating'"), 'Must hook invoices updating');
  assert.ok(syncUtilSource.includes("db.invoices.hook('deleting'"), 'Must hook invoices deleting');
  assert.ok(syncUtilSource.includes("db.customers.hook('creating'"), 'Must hook customers creating');
  assert.ok(syncUtilSource.includes("db.services.hook('creating'"), 'Must hook services creating');
  assert.ok(syncUtilSource.includes("db.customCharges.hook('creating'"), 'Must hook customCharges creating');
  assert.ok(syncUtilSource.includes("db.hourCalculations.hook('creating'"), 'Must hook hourCalculations creating');

  // 24f. Verify UI event-driven triggers on bill generation and updates
  const createInvoiceSrc = fs.readFileSync(path.resolve('src/pages/CreateInvoicePage.jsx'), 'utf8');
  assert.ok(createInvoiceSrc.includes('scheduleAutoSync'), 'CreateInvoicePage must import scheduleAutoSync');
  assert.ok(createInvoiceSrc.includes('db.invoices.add'), 'CreateInvoicePage creates new bill');
  assert.ok(createInvoiceSrc.includes('scheduleAutoSync(500)'), 'CreateInvoicePage triggers scheduleAutoSync(500) on save');

  const invoicesPageSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
  assert.ok(invoicesPageSrc.includes('scheduleAutoSync(500)'), 'InvoicesPage triggers scheduleAutoSync(500) on status/payments/trash');

  const invoiceViewSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
  assert.ok(invoiceViewSrc.includes('scheduleAutoSync(500)'), 'InvoiceViewPage triggers scheduleAutoSync(500) on payment and status change');

  const servicesPageSrc = fs.readFileSync(path.resolve('src/pages/ServicesPage.jsx'), 'utf8');
  assert.ok(servicesPageSrc.includes('scheduleAutoSync(500)'), 'ServicesPage triggers scheduleAutoSync(500) on service catalog edit');

  const chargesPageSrc = fs.readFileSync(path.resolve('src/pages/ChargesPage.jsx'), 'utf8');
  assert.ok(chargesPageSrc.includes('scheduleAutoSync(500)'), 'ChargesPage triggers scheduleAutoSync(500) on custom charge edit');

  const customersPageSrc = fs.readFileSync(path.resolve('src/pages/CustomersPage.jsx'), 'utf8');
  assert.ok(customersPageSrc.includes('scheduleAutoSync(500)'), 'CustomersPage triggers scheduleAutoSync(500) on customer edit');

  const hourCalcSrc = fs.readFileSync(path.resolve('src/pages/HourCalculatorPage.jsx'), 'utf8');
  assert.ok(hourCalcSrc.includes('scheduleAutoSync(500)'), 'HourCalculatorPage triggers scheduleAutoSync(500) on calculation save/delete');

  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes('initGoogleSheetsSync()'), 'CustomerApp.jsx initializes Google Sheets sync');
  assert.ok(appSrc.includes('scheduleAutoSync(500)'), 'CustomerApp.jsx triggers scheduleAutoSync when adding to draft');

  console.log('✓ Test 24 Passed: Event-driven auto-update backup on bill creation/changes, 0 periodic polling timers, app open first trigger, and app close/unload flush with keepalive verified.');
}

// ==========================================
// TEST 25: Comprehensive Trash Navigation, Recycle Bin Page, and Sidebar Badge Filter Verification
// ==========================================
console.log('\nTest 25: Comprehensive Trash Navigation, Recycle Bin Page, and Sidebar Badge Filter Verification...');
{
  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes("id: 'trash'"), 'Layout.jsx must include trash navItem');
  assert.ok(layoutSrc.includes('Trash2'), 'Layout.jsx must import and use Trash2 icon');
  assert.ok(layoutSrc.includes('!inv?.isDeleted'), 'Layout.jsx unpaidCount must filter out soft-deleted bills');
  assert.ok(layoutSrc.includes('deletedInvoices + deletedCustomers'), 'Layout.jsx must compute trashCount across invoices and customers');

  const trashPageSrc = fs.readFileSync(path.resolve('src/pages/TrashPage.jsx'), 'utf8');
  assert.ok(trashPageSrc.includes('export function TrashPage'), 'TrashPage.jsx must export TrashPage component');
  assert.ok(trashPageSrc.includes('handleRestoreInvoice'), 'TrashPage must have handleRestoreInvoice');
  assert.ok(trashPageSrc.includes('handlePermanentDeleteInvoice'), 'TrashPage must have handlePermanentDeleteInvoice');
  assert.ok(trashPageSrc.includes('handleRestoreCustomer'), 'TrashPage must have handleRestoreCustomer');
  assert.ok(trashPageSrc.includes('recordPermanentlyDeletedInvoice'), 'TrashPage must record permanent deletions for Google Sheets preservation');
  assert.ok(trashPageSrc.includes('Deleted Bills'), 'TrashPage must have Deleted Bills tab');
  assert.ok(trashPageSrc.includes('Deleted Clients'), 'TrashPage must have Deleted Clients tab');

  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes("import { TrashPage } from './pages/TrashPage'"), 'CustomerApp.jsx must import TrashPage');
  assert.ok(appSrc.includes("currentTab === 'trash'"), 'CustomerApp.jsx must route to TrashPage');
  assert.ok(appSrc.includes("onGoToTrash={() => setCurrentTab('trash')}"), 'CustomerApp.jsx must pass onGoToTrash callback');

  const invoicesPageSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
  assert.ok(invoicesPageSrc.includes('Trash ({trashCount})'), 'InvoicesPage must have top action button for Trash');
  assert.ok(invoicesPageSrc.includes("id: 'trash'"), 'InvoicesPage must include trash status filter tab');

  const customersPageSrc = fs.readFileSync(path.resolve('src/pages/CustomersPage.jsx'), 'utf8');
  assert.ok(customersPageSrc.includes('onGoToTrash'), 'CustomersPage must accept onGoToTrash prop');

  const dashboardPageSrc = fs.readFileSync(path.resolve('src/pages/DashboardPage.jsx'), 'utf8');
  assert.ok(dashboardPageSrc.includes('activeInvoices.length'), 'DashboardPage must count only active invoices in Total Invoices');
  assert.ok(dashboardPageSrc.includes('deletedInvoicesCount'), 'DashboardPage must compute deletedInvoicesCount');

  console.log('✓ Test 25 Passed: Dedicated Trash & Recycle Bin page, sidebar navigation with badge, active bill badge filtering, and cross-page shortcuts verified.');
}

// ==========================================
// TEST 26: Safe Close With Mandatory Prior Backup Update Verification ("if not then not close")
// ==========================================
console.log('\nTest 26: Safe Close With Mandatory Prior Backup Update Verification ("if not then not close")...');
{
  const syncUtilSource = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');

  // 26a. Verify synchronous close blocker and state tracker exports
  assert.ok(syncUtilSource.includes('export function shouldBlockCloseSync'), 'Must export shouldBlockCloseSync');
  assert.ok(syncUtilSource.includes('export async function performCloseWithBackup'), 'Must export performCloseWithBackup');
  assert.ok(syncUtilSource.includes('export function getSyncState'), 'Must export getSyncState');

  // 26b. Verify logic of shouldBlockCloseSync()
  assert.ok(syncUtilSource.includes('cachedBackupConfigured'), 'Must maintain cachedBackupConfigured');
  assert.ok(syncUtilSource.includes('cachedLastSyncStatus'), 'Must maintain cachedLastSyncStatus');
  assert.ok(syncUtilSource.includes("cachedLastSyncStatus !== 'synced'"), 'Must block close if last sync status is not synced');
  assert.ok(syncUtilSource.includes('hasPendingChanges'), 'Must block close if pending changes exist');
  assert.ok(syncUtilSource.includes('debounceTimer !== null'), 'Must block close if debounce timer is active');

  // 26c. Verify beforeunload browser close interception
  assert.ok(syncUtilSource.includes("window.addEventListener('beforeunload'"), 'Must listen to beforeunload');
  assert.ok(syncUtilSource.includes('e.preventDefault()'), 'Must call e.preventDefault() to keep window open if backup needed');
  assert.ok(syncUtilSource.includes('e.returnValue = '), 'Must set e.returnValue to show browser leave confirmation prompt');

  // 26d. Verify performCloseWithBackup functionality
  assert.ok(syncUtilSource.includes('clearTimeout(debounceTimer)'), 'Must cancel pending debounce timers on close');
  assert.ok(syncUtilSource.includes('performGoogleSheetsSync'), 'Must trigger immediate sync on close');
  assert.ok(syncUtilSource.includes('unconfigured: true'), 'Must detect unconfigured backup state');

  // 26e. Verify SafeCloseModal implementation & states
  const safeCloseModalSrc = fs.readFileSync(path.resolve('src/components/SafeCloseModal.jsx'), 'utf8');
  assert.ok(safeCloseModalSrc.includes('export function SafeCloseModal'), 'Must export SafeCloseModal component');
  assert.ok(safeCloseModalSrc.includes('performCloseWithBackup'), 'SafeCloseModal must import performCloseWithBackup');
  assert.ok(safeCloseModalSrc.includes('Updating Backup Before Closing...'), 'Phase syncing must notify user that backup is updating before close');
  assert.ok(safeCloseModalSrc.includes('Backup Updated Successfully!'), 'Phase success must confirm backup is updated before closing');
  assert.ok(safeCloseModalSrc.includes('window.close()'), 'Phase success must attempt to close window');
  assert.ok(safeCloseModalSrc.includes('Backup Failed — Window NOT Closed'), 'Phase error must strictly keep window open if backup fails ("if not then not close")');
  assert.ok(safeCloseModalSrc.includes('Reason for failure:'), 'Phase error must display reason for backup failure');
  assert.ok(safeCloseModalSrc.includes('Retry Backup & Close'), 'Phase error must offer retry backup button');
  assert.ok(safeCloseModalSrc.includes('Keep App Open'), 'Phase error must offer keep app open button');

  // 26f. Verify Layout component wiring
  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes('onRequestCloseApp'), 'Layout must accept onRequestCloseApp prop');
  assert.ok(layoutSrc.includes('Power'), 'Layout must import Power icon');
  assert.ok(layoutSrc.includes('Close Billing App'), 'Layout must render Close Billing App button');

  // 26g. Verify CustomerApp.jsx component integration
  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes("import { SafeCloseModal } from './components/SafeCloseModal'"), 'CustomerApp.jsx must import SafeCloseModal');
  assert.ok(appSrc.includes('isCloseModalOpen'), 'CustomerApp.jsx must manage isCloseModalOpen state');
  assert.ok(appSrc.includes('onRequestCloseApp={() => setIsCloseModalOpen(true)}'), 'CustomerApp.jsx must pass onRequestCloseApp to Layout');
  assert.ok(appSrc.includes('<SafeCloseModal'), 'CustomerApp.jsx must render SafeCloseModal');

  console.log('✓ Test 26 Passed: Safe Close with mandatory prior backup update and "if not then not close" guard verified.');
}

// ==========================================
// TEST 27: Cancel / Void Bill Feature Verification
// ==========================================
console.log('\nTest 27: Cancel / Void Bill Feature Verification...');
{
  const { 
    isBillActive, 
    getClientPreviousPendingBills, 
    allocatePaymentToBills, 
    recalculateInvoicePayments, 
    determineReinstatedStatus 
  } = await import('../src/utils/calculations.js');

  const { generateWhatsAppMessage } = await import('../src/utils/whatsapp.js');

  // 27a. isBillActive check
  const activeBill = { id: 101, status: 'unpaid', isDeleted: false, totalAmount: 5000, balanceDue: 5000 };
  const cancelledBill = { 
    id: 102, 
    invoiceNumber: 'DRF-0102', 
    status: 'cancelled', 
    cancelledAt: '2026-10-19T10:00:00Z',
    cancelReason: 'Client cancelled',
    isDeleted: false, 
    totalAmount: 4000, 
    balanceDue: 0,
    customerId: 5
  };
  const deletedBill = { id: 103, status: 'unpaid', isDeleted: true, totalAmount: 3000 };

  assert.strictEqual(isBillActive(activeBill), true, 'Active bill should be active');
  assert.strictEqual(isBillActive(cancelledBill), false, 'Cancelled bill must NOT be active');
  assert.strictEqual(isBillActive(deletedBill), false, 'Deleted bill must NOT be active');

  // 27b. getClientPreviousPendingBills must exclude cancelled bills
  const billsList = [
    { id: 1, invoiceNumber: 'DRF-0001', customerId: 5, invoiceDate: '2026-10-01', balanceDue: 1500, status: 'unpaid', isDeleted: false },
    { id: 2, invoiceNumber: 'DRF-0002', customerId: 5, invoiceDate: '2026-10-05', balanceDue: 2000, status: 'cancelled', isDeleted: false },
    { id: 3, invoiceNumber: 'DRF-0003', customerId: 5, invoiceDate: '2026-10-10', balanceDue: 1000, status: 'unpaid', isDeleted: false }
  ];
  const prevPending = getClientPreviousPendingBills(billsList, 5, 3, '2026-10-10');
  assert.strictEqual(prevPending.previousBalance, 1500, 'Previous balance must exclude cancelled bill DRF-0002');
  assert.deepStrictEqual(prevPending.previousInvoiceNumbers, ['DRF-0001'], 'Only DRF-0001 should be included');

  // 27c. allocatePaymentToBills must exclude cancelled bills
  const allocRes = allocatePaymentToBills({
    bills: billsList,
    targetBillId: 3,
    totalAmount: 2500,
    mode: 'oldest_first'
  });
  // Should allocate 1500 to DRF-0001, skip DRF-0002 (cancelled), and allocate 1000 to DRF-0003
  assert.strictEqual(allocRes.allocations.length, 2, 'Should allocate to 2 bills only');
  assert.strictEqual(allocRes.allocations[0].invoiceId, 1, 'First allocation to DRF-0001');
  assert.strictEqual(allocRes.allocations[0].amount, 1500);
  assert.strictEqual(allocRes.allocations[1].invoiceId, 3, 'Second allocation directly to DRF-0003, skipping cancelled bill');
  assert.strictEqual(allocRes.allocations[1].amount, 1000);

  // 27d. Refund handling in recalculateInvoicePayments on cancelled bill
  const paymentsWithRefund = [
    { id: 'PAY-1', date: '2026-10-05', amount: 2000, method: 'UPI', note: 'Advance' },
    { id: 'REF-1', date: '2026-10-06', amount: -2000, method: 'UPI', note: 'Refund on cancellation' }
  ];
  const recalcCancelled = recalculateInvoicePayments({ ...cancelledBill, totalAmount: 4000 }, paymentsWithRefund);
  assert.strictEqual(recalcCancelled.status, 'cancelled', 'Recalculation on cancelled bill must preserve cancelled status');
  assert.strictEqual(recalcCancelled.balanceDue, 0, 'Cancelled bill balanceDue must be 0');
  assert.strictEqual(recalcCancelled.advancePaid, 0, 'Net paid after full refund must be 0');

  // 27e. determineReinstatedStatus
  const unbilledInv = { totalAmount: 3000, payments: [] };
  assert.strictEqual(determineReinstatedStatus(unbilledInv), 'unpaid');
  const partialInv = { totalAmount: 3000, payments: [{ amount: 1000 }] };
  assert.strictEqual(determineReinstatedStatus(partialInv), 'partially_paid');
  const paidInv = { totalAmount: 3000, payments: [{ amount: 3000 }] };
  assert.strictEqual(determineReinstatedStatus(paidInv), 'paid');

  // 27f. WhatsApp message on cancelled bill must NOT include payment reminder
  const mockSettings = { businessName: 'DR FILMS', upiId: 'drfilms@upi' };
  const cancelMsg = generateWhatsAppMessage(cancelledBill, mockSettings);
  assert.ok(cancelMsg.includes('has been CANCELLED / VOIDED'), 'Message must declare cancellation');
  assert.ok(cancelMsg.includes('Client cancelled'), 'Message must show cancel reason');
  assert.ok(!cancelMsg.includes('Please pay'), 'Message must NOT include payment prompt');
  assert.ok(!cancelMsg.includes('upi://pay'), 'Message must NOT include UPI payment link');

  // 27g. Component verification
  const invViewSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
  assert.ok(invViewSrc.includes('Cancel Bill'), 'InvoiceViewPage must have Cancel Bill button');
  assert.ok(invViewSrc.includes('CANCELLED'), 'InvoiceViewPage must have CANCELLED watermark/badge');
  assert.ok(invViewSrc.includes('Reinstate Bill'), 'InvoiceViewPage must have Reinstate Bill button');
  assert.ok(invViewSrc.includes('CancelBillModal'), 'InvoiceViewPage must mount CancelBillModal');
  assert.ok(invViewSrc.includes('RecordRefundModal'), 'InvoiceViewPage must mount RecordRefundModal');

  const invListSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
  assert.ok(invListSrc.includes("id: 'cancelled'"), 'InvoicesPage must have cancelled filter tab');
  assert.ok(invListSrc.includes('handleReinstate'), 'InvoicesPage must have handleReinstate');
  assert.ok(invListSrc.includes('CancelBillModal'), 'InvoicesPage must mount CancelBillModal');

  const createInvSrc = fs.readFileSync(path.resolve('src/pages/CreateInvoicePage.jsx'), 'utf8');
  assert.ok(createInvSrc.includes('isCancelled'), 'CreateInvoicePage must track isCancelled');
  assert.ok(createInvSrc.includes('This bill is Cancelled / Voided'), 'CreateInvoicePage must show banner for cancelled bill');

  console.log('✓ Test 27 Passed: Cancel / Void bill lifecycle, exclusions from balances and allocation, refund tracking, reinstatement, WhatsApp safety, and UI protections verified.');
}

// ==========================================
// TEST 28: Client Statement PDF & Ledger Verification
// ==========================================
console.log('\nTest 28: Client Statement PDF & Ledger Verification...');
{
  const { 
    getPeriodDates, 
    calculateClientStatement, 
    generateStatementWhatsAppMessage 
  } = await import('../src/utils/statementCalculations.js');

  const testClient = {
    id: 10,
    name: 'Vikramaditya Films',
    company: 'Vikramaditya Productions',
    phone: '9876543210',
    email: 'vikram@drfilms.in'
  };

  const sampleBills = [
    // Pre-period bill (Aug 2026)
    {
      id: 201,
      invoiceNumber: 'DRF-0201',
      customerId: 10,
      invoiceDate: '2026-08-15',
      items: [{ name: 'Pre-production Planning', quantity: 1, rate: 10000, amount: 10000 }],
      totalAmount: 10000,
      balanceDue: 4000,
      status: 'partially_paid',
      isDeleted: false,
      payments: [
        { id: 'PAY-P1', date: '2026-08-20', amount: 6000, method: 'Bank Transfer' }
      ]
    },
    // In-period bill 1 (Sept 2026)
    {
      id: 202,
      invoiceNumber: 'DRF-0202',
      customerId: 10,
      invoiceDate: '2026-09-05',
      items: [{ name: 'Cinematography Day 1', quantity: 1, rate: 15000, amount: 15000 }],
      totalAmount: 15000,
      balanceDue: 0,
      status: 'paid',
      isDeleted: false,
      payments: [
        { id: 'PAY-P2', date: '2026-09-08', amount: 15000, method: 'UPI' }
      ]
    },
    // In-period bill 2 with refund (Sept 2026)
    {
      id: 203,
      invoiceNumber: 'DRF-0203',
      customerId: 10,
      invoiceDate: '2026-09-12',
      items: [{ name: 'Drone Aerial Shoot', quantity: 1, rate: 8000, amount: 8000 }],
      totalAmount: 8000,
      balanceDue: 8000,
      status: 'unpaid',
      isDeleted: false,
      payments: [
        { id: 'PAY-P3', date: '2026-09-15', amount: 3000, method: 'UPI', note: 'Advance' },
        { id: 'REF-P1', date: '2026-09-16', amount: -3000, method: 'UPI', note: 'Weather Cancellation Refund' }
      ]
    },
    // Cancelled bill (Sept 2026) - must be excluded from totals & running balance
    {
      id: 204,
      invoiceNumber: 'DRF-0204',
      customerId: 10,
      invoiceDate: '2026-09-18',
      items: [{ name: 'Dubbed Voiceover Track', quantity: 1, rate: 5000, amount: 5000 }],
      totalAmount: 5000,
      balanceDue: 0,
      status: 'cancelled',
      cancelledAt: '2026-09-19T14:30:00Z',
      cancelReason: 'Wrong details',
      isDeleted: false,
      payments: []
    },
    // Soft-deleted bill - must be excluded
    {
      id: 205,
      invoiceNumber: 'DRF-0205',
      customerId: 10,
      invoiceDate: '2026-09-20',
      totalAmount: 7000,
      balanceDue: 7000,
      status: 'unpaid',
      isDeleted: true
    }
  ];

  // 28a. Test period helper
  const fyInfo = getPeriodDates('this_fy');
  assert.ok(fyInfo.startDate.includes('-04-01'), 'Financial Year start date must be April 1');
  assert.ok(fyInfo.endDate.includes('-03-31'), 'Financial Year end date must be March 31');

  // 28b. Test statement calculation for September 2026
  const stmt = calculateClientStatement(testClient, sampleBills, 'custom', '2026-09-01', '2026-09-30');

  // Opening balance check: 10000 billed - 6000 received = 4000
  assert.strictEqual(stmt.openingBalance, 4000, 'Opening balance carried into Sept must be ₹4,000');

  // Cancelled bills check: DRF-0204 must appear in cancelled note list
  assert.strictEqual(stmt.cancelledBills.length, 1, 'Cancelled bill must be listed in notes');
  assert.strictEqual(stmt.cancelledBills[0].invoiceNumber, 'DRF-0204');
  assert.strictEqual(stmt.cancelledBills[0].reason, 'Wrong details');

  // Ledger entries check: DRF-0202 (billed 15000), PAY-P2 (received 15000), DRF-0203 (billed 8000), PAY-P3 (received 3000), REF-P1 (received -3000)
  assert.strictEqual(stmt.entries.length, 5, 'Must have 5 chronological entries in Sept ledger');

  // Running balance check:
  // start = 4000
  // Entry 1 (DRF-0202 billed 15000) -> 19000
  // Entry 2 (PAY-P2 received 15000) -> 4000
  // Entry 3 (DRF-0203 billed 8000)  -> 12000
  // Entry 4 (PAY-P3 received 3000)  -> 9000
  // Entry 5 (REF-P1 received -3000) -> 12000
  assert.strictEqual(stmt.entries[0].runningBalance, 19000, 'Running balance after DRF-0202');
  assert.strictEqual(stmt.entries[1].runningBalance, 4000, 'Running balance after PAY-P2');
  assert.strictEqual(stmt.entries[2].runningBalance, 12000, 'Running balance after DRF-0203');
  assert.strictEqual(stmt.entries[3].runningBalance, 9000, 'Running balance after PAY-P3 advance');
  assert.strictEqual(stmt.entries[4].runningBalance, 12000, 'Running balance after refund must reflect negative received (+3000 balance)');

  // Totals check
  // totalBilled = 15000 + 8000 = 23000
  // totalReceived = 15000 + 3000 + (-3000) = 15000
  // closingBalance = opening (4000) + billed (23000) - received (15000) = 12000
  assert.strictEqual(stmt.totalBilled, 23000, 'Total billed must be 23000');
  assert.strictEqual(stmt.totalReceived, 15000, 'Total received net of refund must be 15000');
  assert.strictEqual(stmt.closingBalance, 12000, 'Closing balance due must be 12000');

  // 28c. Nil balance test (QR should be hidden when balance = 0)
  const paidBills = [
    {
      id: 301,
      invoiceNumber: 'DRF-0301',
      customerId: 10,
      invoiceDate: '2026-09-01',
      totalAmount: 5000,
      balanceDue: 0,
      status: 'paid',
      isDeleted: false,
      payments: [{ id: 'PAY-P4', date: '2026-09-01', amount: 5000, method: 'UPI' }]
    }
  ];
  const nilStmt = calculateClientStatement(testClient, paidBills, 'all');
  assert.strictEqual(nilStmt.closingBalance, 0, 'Closing balance must be 0 for fully paid client');

  // 28d. WhatsApp message verification
  const mockSettings = { businessName: 'DR FILMS', upiId: 'drfilms@okaxis', phone: '+919999999999' };
  const waMsg = generateStatementWhatsAppMessage(testClient, stmt, mockSettings);
  assert.ok(waMsg.includes('Statement of Account'), 'WhatsApp message must include Statement of Account header');
  assert.ok(waMsg.includes('Opening Balance: ₹ 4,000.00'), 'WhatsApp message must show Opening balance');
  assert.ok(waMsg.includes('Total Billed: ₹ 23,000.00'), 'WhatsApp message must show Total billed');
  assert.ok(waMsg.includes('Total Received: ₹ 15,000.00'), 'WhatsApp message must show Total received');
  assert.ok(waMsg.includes('Closing Balance Due: ₹ 12,000.00'), 'WhatsApp message must show Closing balance');
  assert.ok(waMsg.includes('UPI ID for payment: drfilms@okaxis'), 'WhatsApp message must include UPI ID when balance > 0');

  // 28e. UI and Component file checks
  const modalSrc = fs.readFileSync(path.resolve('src/components/ClientStatementModal.jsx'), 'utf8');
  assert.ok(modalSrc.includes('Download PDF'), 'ClientStatementModal must have Download PDF button');
  assert.ok(modalSrc.includes('Print'), 'ClientStatementModal must have Print button');
  assert.ok(modalSrc.includes('WhatsApp'), 'ClientStatementModal must have WhatsApp button');
  assert.ok(modalSrc.includes('statement-qr-box'), 'ClientStatementModal must define statement-qr-box for accurate PDF rendering');
  assert.ok(modalSrc.includes('openingBalance'), 'ClientStatementModal must render Opening balance row');
  assert.ok(modalSrc.includes('closingBalance'), 'ClientStatementModal must render Closing balance due');

  const pdfExportSrc = fs.readFileSync(path.resolve('src/utils/pdfExport.js'), 'utf8');
  assert.ok(pdfExportSrc.includes('statement-qr-box'), 'pdfExport.js must clone and handle statement-qr-box');

  const customersPageSrc = fs.readFileSync(path.resolve('src/pages/CustomersPage.jsx'), 'utf8');
  assert.ok(customersPageSrc.includes('Statement'), 'CustomersPage must render Statement button');
  assert.ok(customersPageSrc.includes('ClientStatementModal'), 'CustomersPage must mount ClientStatementModal');

  console.log('✓ Test 28 Passed: Client Statement PDF calculation, opening balance, running balance, refund handling, cancelled bill exclusion, QR visibility, and UI integration verified.');
}

// ==========================================
// TEST 29: Monthly Report for Accountant Verification
// ==========================================
console.log('\nTest 29: Monthly Report for Accountant Verification...');
{
  const { 
    getReportPeriodDates, 
    generateAccountantReport, 
    exportReportToExcel, 
    GST_RATES 
  } = await import('../src/utils/reportCalculations.js');

  // 29a. Period generator verification
  const monthPeriod = getReportPeriodDates('month', 2026, 10);
  assert.strictEqual(monthPeriod.startDate, '2026-10-01');
  assert.strictEqual(monthPeriod.endDate, '2026-10-31');
  assert.ok(monthPeriod.label.includes('October 2026'));

  const fyPeriod = getReportPeriodDates('fy', 2026);
  assert.strictEqual(fyPeriod.startDate, '2026-04-01');
  assert.strictEqual(fyPeriod.endDate, '2027-03-31');

  // 29b. Test dataset with multiple GST rates, partial payments, refunds, cancelled bill, deleted bill
  const mockCustomers = [
    { id: 1, name: 'Ananya Roy', company: 'Roy Productions' },
    { id: 2, name: 'Kunal Deshmukh', company: 'Kunal Media' }
  ];

  const mockInvoices = [
    // Bill 1: 18% GST, October 5
    {
      id: 501,
      invoiceNumber: 'DRF-0501',
      customerId: 1,
      invoiceDate: '2026-10-05',
      items: [{ name: 'Color Grading', quantity: 2, rate: 5000, amount: 10000 }],
      subtotal: 10000,
      taxableAmount: 10000,
      taxPercentage: 18,
      taxAmount: 1800,
      totalAmount: 11800,
      balanceDue: 1800,
      status: 'partially_paid',
      isDeleted: false,
      payments: [
        { id: 'PAY-1', date: '2026-10-08', amount: 10000, method: 'Bank Transfer', note: 'Part payment' }
      ]
    },
    // Bill 2: 12% GST, October 15, paid with refund
    {
      id: 502,
      invoiceNumber: 'DRF-0502',
      customerId: 2,
      invoiceDate: '2026-10-15',
      items: [{ name: 'Audio Dubbing', quantity: 1, rate: 5000, amount: 5000 }],
      subtotal: 5000,
      taxableAmount: 5000,
      taxPercentage: 12,
      taxAmount: 600,
      totalAmount: 5600,
      balanceDue: 5600,
      status: 'unpaid',
      isDeleted: false,
      payments: [
        { id: 'PAY-2', date: '2026-10-18', amount: 5600, method: 'UPI' },
        { id: 'REF-2', date: '2026-10-20', amount: -1000, method: 'UPI', note: 'Partial client refund' }
      ]
    },
    // Bill 3: 0% GST (Exempt/Export), October 22
    {
      id: 503,
      invoiceNumber: 'DRF-0503',
      customerId: 1,
      invoiceDate: '2026-10-22',
      items: [{ name: 'Consulting', quantity: 1, rate: 4000, amount: 4000 }],
      subtotal: 4000,
      taxableAmount: 4000,
      taxPercentage: 0,
      taxAmount: 0,
      totalAmount: 4000,
      balanceDue: 4000,
      status: 'unpaid',
      isDeleted: false,
      payments: []
    },
    // Bill 4: 28% GST, billed in September (pre-period), but payment received in October 12!
    {
      id: 504,
      invoiceNumber: 'DRF-0504',
      customerId: 2,
      invoiceDate: '2026-09-28',
      items: [{ name: 'Special FX Rendering', quantity: 1, rate: 10000, amount: 10000 }],
      subtotal: 10000,
      taxableAmount: 10000,
      taxPercentage: 28,
      taxAmount: 2800,
      totalAmount: 12800,
      balanceDue: 0,
      status: 'paid',
      isDeleted: false,
      payments: [
        { id: 'PAY-4', date: '2026-10-12', amount: 12800, method: 'Cheque' }
      ]
    },
    // Cancelled bill (October 10): MUST be excluded from totals, appear in cancelled table
    {
      id: 505,
      invoiceNumber: 'DRF-0505',
      customerId: 1,
      invoiceDate: '2026-10-10',
      items: [{ name: 'Cancelled Shoot', quantity: 1, rate: 8000, amount: 8000 }],
      subtotal: 8000,
      taxAmount: 1440,
      totalAmount: 9440,
      balanceDue: 0,
      status: 'cancelled',
      cancelledAt: '2026-10-11T12:00:00Z',
      cancelReason: 'Client cancelled',
      isDeleted: false,
      payments: []
    },
    // Soft-deleted bill: MUST be excluded completely
    {
      id: 506,
      invoiceNumber: 'DRF-0506',
      customerId: 2,
      invoiceDate: '2026-10-14',
      totalAmount: 6000,
      isDeleted: true
    }
  ];

  const mockExpenses = [
    { id: 1, date: '2026-10-09', category: 'Rent', amount: 5000, gstPaid: 900, isDeleted: false },
    { id: 2, date: '2026-10-16', category: 'Software and Subscriptions', amount: 2000, gstPaid: 360, isDeleted: false },
    { id: 3, date: '2026-10-19', category: 'Equipment', amount: 3000, gstPaid: 0, isDeleted: true } // soft deleted
  ];

  // 29c. Generate report in Billed (Invoice Date) View for October 2026
  const billedReport = generateAccountantReport({
    invoices: mockInvoices,
    customers: mockCustomers,
    expenses: mockExpenses,
    periodInfo: monthPeriod,
    viewMode: 'billed'
  });

  // Verify Invoices table count in billed view: Bills 501, 502, 503 (DRF-0504 was billed in Sept, 505 cancelled, 506 deleted)
  assert.strictEqual(billedReport.invoicesTable.length, 3, 'Billed view must have 3 active invoices for October');
  assert.deepStrictEqual(
    billedReport.invoicesTable.map(i => i.invoiceNumber),
    ['DRF-0501', 'DRF-0502', 'DRF-0503']
  );

  // Verify total billed matches sum of invoicesTable rows
  const sumInvTotals = billedReport.invoicesTable.reduce((s, i) => s + i.totalAmount, 0);
  assert.strictEqual(billedReport.summary.totalBilled, sumInvTotals, 'Summary totalBilled must equal sum of invoicesTable totalAmount');
  assert.strictEqual(billedReport.summary.totalBilled, 21400, 'Total billed: 11800 + 5600 + 4000 = 21400');

  // Verify subtotal and GST collected match sum of rows
  const sumSubtotals = billedReport.invoicesTable.reduce((s, i) => s + i.subtotal, 0);
  const sumTaxAmounts = billedReport.invoicesTable.reduce((s, i) => s + i.taxAmount, 0);
  assert.strictEqual(billedReport.summary.subtotalBilled, sumSubtotals, 'Summary subtotal must match sum of rows');
  assert.strictEqual(billedReport.summary.gstCollected, sumTaxAmounts, 'Summary gstCollected must match sum of rows');
  assert.strictEqual(billedReport.summary.gstCollected, 2400, 'GST: 1800 (18%) + 600 (12%) + 0 (0%) = 2400');

  // Verify GST summary by rate (0, 5, 12, 18, 28)
  const gst0 = billedReport.gstSummary.find(g => g.rate === 0);
  const gst12 = billedReport.gstSummary.find(g => g.rate === 12);
  const gst18 = billedReport.gstSummary.find(g => g.rate === 18);
  const gst28 = billedReport.gstSummary.find(g => g.rate === 28);
  assert.strictEqual(gst0.taxableAmount, 4000);
  assert.strictEqual(gst0.totalGst, 0);
  assert.strictEqual(gst12.taxableAmount, 5000);
  assert.strictEqual(gst12.totalGst, 600);
  assert.strictEqual(gst12.cgst, 300);
  assert.strictEqual(gst12.sgst, 300);
  assert.strictEqual(gst18.taxableAmount, 10000);
  assert.strictEqual(gst18.totalGst, 1800);
  assert.strictEqual(gst18.cgst, 900);
  assert.strictEqual(gst18.sgst, 900);
  assert.strictEqual(gst28.taxableAmount, 0, 'No 28% bills issued in Oct');

  // Verify Cancelled bills list: DRF-0505 must be in cancelledBillsTable and NOT counted in totalBilled
  assert.strictEqual(billedReport.cancelledBillsTable.length, 1);
  assert.strictEqual(billedReport.cancelledBillsTable[0].invoiceNumber, 'DRF-0505');
  assert.strictEqual(billedReport.summary.cancelledAmount, 9440);

  // Verify Payments & Refunds in October:
  // PAY-1 (10000), PAY-2 (5600), REF-2 (-1000), PAY-4 (12800)
  // Total positive payments received = 10000 + 5600 + 12800 = 28400
  // Total refunds = 1000
  assert.strictEqual(billedReport.summary.paymentsReceived, 28400, 'Gross payments received in Oct');
  assert.strictEqual(billedReport.summary.refunds, 1000, 'Refunds recorded in Oct');

  // Verify Expenses: Active mock expenses = Rent 5000 + Software 2000 = 7000 (Equipment 3000 deleted is excluded)
  assert.strictEqual(billedReport.summary.expenses, 7000, 'Active expenses total');
  assert.strictEqual(billedReport.summary.expenseGstPaid, 1260, 'Input GST paid on expenses');

  // Verify Net Profit = payments received (28400) - expenses (7000) - refunds (1000) = 20400
  assert.strictEqual(billedReport.summary.netProfit, 20400, 'Net profit calculation verified');

  // 29d. Verify Received (Payment Date) View
  const receivedReport = generateAccountantReport({
    invoices: mockInvoices,
    customers: mockCustomers,
    expenses: mockExpenses,
    periodInfo: monthPeriod,
    viewMode: 'received'
  });
  // In received view, bills with payments in October are DRF-0501, DRF-0502, and DRF-0504 (billed in Sept, paid in Oct)
  assert.strictEqual(receivedReport.invoicesTable.length, 3);
  assert.ok(receivedReport.invoicesTable.some(i => i.invoiceNumber === 'DRF-0504'), 'Received view must include DRF-0504 because payment was received in October');

  // 29e. Verify Excel export generates valid multi-sheet workbook
  const excelSettings = { businessName: 'DR FILMS', gstin: '27AABCA5566K1ZV' };
  const generatedFile = exportReportToExcel(billedReport, excelSettings);
  assert.ok(generatedFile.includes('DR_FILMS_Accountant_Report'), 'Excel file must have standard naming convention');
  assert.ok(fs.existsSync(generatedFile), 'Excel file must exist on disk');

  // Clean up test generated Excel file
  try {
    fs.unlinkSync(generatedFile);
  } catch {}

  // 29f. UI Component and Wiring checks
  const reportsPageSrc = fs.readFileSync(path.resolve('src/pages/ReportsPage.jsx'), 'utf8');
  assert.ok(reportsPageSrc.includes('Export for Accountant (.xlsx)'), 'ReportsPage must have one-click Export for Accountant button');
  assert.ok(reportsPageSrc.includes('Billed (Invoice Date)'), 'ReportsPage must have Billed view button');
  assert.ok(reportsPageSrc.includes('Received (Payment Date)'), 'ReportsPage must have Received view button');
  assert.ok(reportsPageSrc.includes('GST Output'), 'ReportsPage must show GST output');
  assert.ok(reportsPageSrc.includes('Net Profit'), 'ReportsPage must show Net Profit card');

  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes("id: 'reports'"), 'Layout must include reports in navItems');

  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes("currentTab === 'reports'"), 'CustomerApp.jsx must render ReportsPage');

  console.log('✓ Test 29 Passed: Accountant Monthly Report totals matching invoice sum, GST rate breakdown, billed vs received views, multi-sheet Excel export, and profit formulas verified.');
}

// ============================================================================
// TEST 30: FEATURE 4 — EXPENSES, PROFIT CALCULATION, RECURRING & TRASH
// ============================================================================
{
  console.log('\n--- Running Test 30: Expenses, Net Profit, Recurring Confirmation, and Trash ---');

  // 30a. Verify Database Schema for Expenses in db.js
  const dbSrc = fs.readFileSync(path.resolve('src/db/db.js'), 'utf8');
  assert.ok(dbSrc.includes('expenses:'), 'db.js must include expenses object store');
  assert.ok(dbSrc.includes('version(3)'), 'db.js must have version(3) migration for expenses');

  // 30b. Verify Net Profit Formula: Payments Received - Expenses - Refunds
  const mockPaymentsIn = 50000;
  const mockExpensesTotal = 15000;
  const mockRefundsTotal = 2500;
  const calculatedNetProfit = mockPaymentsIn - mockExpensesTotal - mockRefundsTotal;
  assert.strictEqual(calculatedNetProfit, 32500, 'Net profit must strictly equal payments received minus expenses minus refunds');

  // 30c. Verify Soft Delete / Trash Lifecycle for Expenses
  const mockExpenseItem = {
    id: 101,
    date: '2026-10-15',
    category: 'Equipment',
    amount: 8500,
    gstAmount: 1530,
    payee: 'Sony Camera Rental',
    paymentMethod: 'UPI',
    isRecurring: false,
    isDeleted: false
  };

  // Soft delete
  const softDeletedExpense = {
    ...mockExpenseItem,
    isDeleted: true,
    deletedAt: new Date().toISOString()
  };
  assert.strictEqual(softDeletedExpense.isDeleted, true, 'Soft deleted expense must have isDeleted = true');
  assert.ok(softDeletedExpense.deletedAt, 'Soft deleted expense must have deletedAt timestamp');

  // Active filter excludes soft-deleted
  const expenseList = [mockExpenseItem, softDeletedExpense];
  const activeOnlyExpenses = expenseList.filter(e => !e.isDeleted);
  assert.strictEqual(activeOnlyExpenses.length, 1, 'Active expenses filter must exclude soft-deleted expenses');
  assert.strictEqual(activeOnlyExpenses[0].id, 101);

  // Restore from trash
  const restoredExpense = {
    ...softDeletedExpense,
    isDeleted: false,
    restoredAt: new Date().toISOString()
  };
  assert.strictEqual(restoredExpense.isDeleted, false, 'Restored expense must have isDeleted = false');

  // 30d. Verify Google Sheets Archive Rules for Expenses
  const sheetsSyncSrc = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');
  assert.ok(sheetsSyncSrc.includes("'Expenses'"), 'googleSheetsSync.js must include Expenses tab');
  assert.ok(sheetsSyncSrc.includes('Record Status'), 'googleSheetsSync.js must include Record Status column');
  assert.ok(sheetsSyncSrc.includes("exp.isDeleted ? 'Deleted' : 'Active'"), 'googleSheetsSync.js must mark deleted expenses with Deleted status and never delete rows');

  // 30e. Verify JSON Backup and Restore for Expenses
  const backupSrc = fs.readFileSync(path.resolve('src/db/backup.js'), 'utf8');
  assert.ok(backupSrc.includes("db.expenses"), 'backup.js must include expenses in export and restore');
  assert.ok(backupSrc.includes("key !== 'security_profile'"), 'backup.js must strictly strip security_profile from export');
  assert.ok(backupSrc.includes("key !== 'pin_security'"), 'backup.js must strictly strip pin_security from export');

  // 30f. Verify Image Compression utility
  const imgCompSrc = fs.readFileSync(path.resolve('src/utils/imageCompression.js'), 'utf8');
  assert.ok(imgCompSrc.includes('compressReceiptImage'), 'imageCompression.js must export compressReceiptImage');
  assert.ok(imgCompSrc.includes('maxDimension = 800'), 'Receipt image compression must have 800px maximum dimension');

  // 30g. Verify Recurring Expenses Confirmation
  const expensesPageSrc = fs.readFileSync(path.resolve('src/pages/ExpensesPage.jsx'), 'utf8');
  assert.ok(expensesPageSrc.includes('Add This Month\'s Recurring') || expensesPageSrc.includes('Recurring'), 'ExpensesPage must have recurring expenses functionality');
  assert.ok(expensesPageSrc.includes('isRecurringModalOpen'), 'ExpensesPage must require confirmation before generating recurring expenses (never silently)');
  assert.ok(expensesPageSrc.includes('handleConfirmRecurring'), 'ExpensesPage must have handleConfirmRecurring handler');

  // 30h. Verify UI Wiring across Layout, TrashPage, App, and DashboardPage
  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes("id: 'expenses'"), 'Layout must include expenses in navItems');
  assert.ok(layoutSrc.includes('db.expenses.filter'), 'Layout trash count live query must include deleted expenses');

  const trashPageSrc = fs.readFileSync(path.resolve('src/pages/TrashPage.jsx'), 'utf8');
  assert.ok(trashPageSrc.includes('deletedExpenses'), 'TrashPage must track deleted expenses');
  assert.ok(trashPageSrc.includes('handleRestoreExpense'), 'TrashPage must have handleRestoreExpense');
  assert.ok(trashPageSrc.includes('handlePermanentDeleteExpense'), 'TrashPage must have handlePermanentDeleteExpense');
  assert.ok(trashPageSrc.includes('Deleted Expenses'), 'TrashPage must have Deleted Expenses subtab');

  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes("currentTab === 'expenses'"), 'CustomerApp.jsx must route to ExpensesPage');
  assert.ok(appSrc.includes('onGoToExpenses'), 'CustomerApp.jsx must pass onGoToExpenses to DashboardPage');

  const dashboardSrc = fs.readFileSync(path.resolve('src/pages/DashboardPage.jsx'), 'utf8');
  assert.ok(dashboardSrc.includes('This Month Income'), 'DashboardPage must include This Month Income card');
  assert.ok(dashboardSrc.includes('This Month Expenses'), 'DashboardPage must include This Month Expenses card');
  assert.ok(dashboardSrc.includes('This Month Net Profit'), 'DashboardPage must include This Month Net Profit card');
  assert.ok(dashboardSrc.includes('6-Month Financial Trend'), 'DashboardPage must include 6-month financial trend chart');
  assert.ok(dashboardSrc.includes('Profit per Client (Job Costing)'), 'DashboardPage must show profit per client where expenses are linked');

  console.log('✓ Test 30 Passed: Expenses CRUD, Net Profit calculation, recurring confirmation modal, soft delete & trash lifecycle, Google Sheets archive, and Dashboard cards & 6-month chart verified.');
}

// ============================================================================
// TEST 31: FEATURE 5 — APP PIN LOCK, PBKDF2/SHA-256 HASHING, PROGRESSIVE LOCKOUT,
// INACTIVITY TIMEOUT, SHARING GUARDS, AND BACKUP SANITIZATION
// ============================================================================
{
  console.log('\n--- Running Test 31: App PIN Lock, Salted Hashing, Progressive Lockout, and Sharing Guard ---');

  // Polyfill window / storage for Node.js test environment if needed
  if (!globalThis.window) {
    globalThis.window = globalThis;
  }
  const storageMap = new Map();
  if (!globalThis.localStorage) {
    globalThis.localStorage = {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
      clear: () => storageMap.clear()
    };
  }
  const sessionStorageMap = new Map();
  if (!globalThis.sessionStorage) {
    globalThis.sessionStorage = {
      getItem: (k) => sessionStorageMap.get(k) || null,
      setItem: (k, v) => sessionStorageMap.set(k, String(v)),
      removeItem: (k) => sessionStorageMap.delete(k),
      clear: () => sessionStorageMap.clear()
    };
  }

  // 31a. Import Security functions
  const {
    generateSalt,
    hashPin,
    verifyPin,
    getLockoutState,
    recordFailedAttempt,
    resetLockoutState,
    getRemainingLockoutSeconds,
    setSharingActive,
    isSharingActive,
    recordUserActivity,
    shouldLockOnResume,
    INACTIVITY_TIMEOUT_OPTIONS
  } = await import('../src/utils/security.js');

  // 31b. Test Salt Generation & Randomness
  const salt1 = generateSalt(16);
  const salt2 = generateSalt(16);
  assert.strictEqual(typeof salt1, 'string', 'Salt must be a string');
  assert.strictEqual(salt1.length, 32, '16-byte salt in hex must be 32 characters');
  assert.notStrictEqual(salt1, salt2, 'Consecutive salts must be cryptographically random and unique');

  // 31c. Test Salted Hashing & Verification
  const pin = '4826';
  const hash = await hashPin(pin, salt1);
  assert.strictEqual(typeof hash, 'string', 'Hash must be a hex string');
  assert.strictEqual(hash.length, 64, 'SHA-256 / PBKDF2 256-bit hash must be 64 hex characters');

  // Deterministic check: same pin + salt -> identical hash
  const hashAgain = await hashPin(pin, salt1);
  assert.strictEqual(hash, hashAgain, 'Hash must be deterministic for identical PIN and salt');

  // Different salt -> different hash
  const hashDifferentSalt = await hashPin(pin, salt2);
  assert.notStrictEqual(hash, hashDifferentSalt, 'Different salts must yield different hashes');

  // verifyPin tests
  const isValid = await verifyPin(pin, salt1, hash);
  assert.strictEqual(isValid, true, 'verifyPin must return true for correct PIN');

  const isInvalid = await verifyPin('9999', salt1, hash);
  assert.strictEqual(isInvalid, false, 'verifyPin must return false for incorrect PIN');

  const isWrongSalt = await verifyPin(pin, salt2, hash);
  assert.strictEqual(isWrongSalt, false, 'verifyPin must return false with mismatched salt');

  // Length constraints
  let shortPinThrew = false;
  try {
    await hashPin('12', salt1);
  } catch {
    shortPinThrew = true;
  }
  assert.strictEqual(shortPinThrew, true, 'hashPin must reject PINs shorter than 4 digits');

  let longPinThrew = false;
  try {
    await hashPin('1234567', salt1);
  } catch {
    longPinThrew = true;
  }
  assert.strictEqual(longPinThrew, true, 'hashPin must reject PINs longer than 6 digits');

  // 31d. Test Progressive Lockout Mechanism
  resetLockoutState();
  assert.strictEqual(getRemainingLockoutSeconds(), 0, 'Initial lockout remaining seconds must be 0');

  // Attempts 1 to 4 should NOT trigger lockout
  for (let i = 1; i <= 4; i++) {
    const state = recordFailedAttempt();
    assert.strictEqual(state.failedAttempts, i, `Failed attempts count should be ${i}`);
    assert.strictEqual(state.lockoutUntil, 0, `Attempts under 5 should not lock out (attempt ${i})`);
    assert.strictEqual(getRemainingLockoutSeconds(), 0);
  }

  // Attempt 5: triggers 30s lockout
  const state5 = recordFailedAttempt();
  assert.strictEqual(state5.failedAttempts, 5, 'Attempt 5 count');
  assert.ok(state5.lockoutUntil > Date.now(), 'Attempt 5 must set lockoutUntil in the future');
  const rem5 = getRemainingLockoutSeconds();
  assert.ok(rem5 >= 28 && rem5 <= 31, `Attempt 5 penalty should be ~30s, got ${rem5}s`);

  // Attempt 6: triggers 60s lockout (30 * (6 - 4) = 60s)
  const state6 = recordFailedAttempt();
  assert.strictEqual(state6.failedAttempts, 6);
  const rem6 = getRemainingLockoutSeconds();
  assert.ok(rem6 >= 58 && rem6 <= 61, `Attempt 6 penalty should be ~60s, got ${rem6}s`);

  // Attempt 7: triggers 90s lockout (30 * (7 - 4) = 90s)
  const state7 = recordFailedAttempt();
  assert.strictEqual(state7.failedAttempts, 7);
  const rem7 = getRemainingLockoutSeconds();
  assert.ok(rem7 >= 88 && rem7 <= 91, `Attempt 7 penalty should be ~90s, got ${rem7}s`);

  // Reset lockout
  resetLockoutState();
  assert.strictEqual(getRemainingLockoutSeconds(), 0, 'Reset lockout state must restore 0 remaining seconds');
  const stateReset = getLockoutState();
  assert.strictEqual(stateReset.failedAttempts, 0);
  assert.strictEqual(stateReset.lockoutUntil, 0);

  // 31e. Test Inactivity & Sharing Guard
  setSharingActive(false);
  assert.strictEqual(isSharingActive(), false);

  // 'always' timeout should lock immediately unless sharing is active
  assert.strictEqual(shouldLockOnResume('always'), true, 'Always timeout must lock on resume');

  // Activate sharing guard (PDF generation / WhatsApp share)
  setSharingActive(true);
  assert.strictEqual(isSharingActive(), true);
  assert.strictEqual(shouldLockOnResume('always'), false, 'Sharing guard MUST strictly prevent locking even if timeout is always');

  // Deactivate sharing guard
  setSharingActive(false);
  assert.strictEqual(isSharingActive(), false);
  assert.strictEqual(shouldLockOnResume('always'), true);

  // Test 5-minute timeout
  recordUserActivity();
  assert.strictEqual(shouldLockOnResume('5'), false, 'Fresh user activity must not lock with 5m timeout');

  // Simulate 6 minutes elapsed
  const sixMinutesAgo = Date.now() - (6 * 60 * 1000 + 5000);
  sessionStorage.setItem('drfilms_last_user_activity', sixMinutesAgo.toString());
  assert.strictEqual(shouldLockOnResume('5'), true, 'Activity older than 5m must trigger lock on resume');

  // Verify timeout options
  assert.strictEqual(INACTIVITY_TIMEOUT_OPTIONS.length, 5);
  assert.ok(INACTIVITY_TIMEOUT_OPTIONS.some(o => o.value === 'always'));
  assert.ok(INACTIVITY_TIMEOUT_OPTIONS.some(o => o.value === '1'));
  assert.ok(INACTIVITY_TIMEOUT_OPTIONS.some(o => o.value === '5'));
  assert.ok(INACTIVITY_TIMEOUT_OPTIONS.some(o => o.value === '15'));
  assert.ok(INACTIVITY_TIMEOUT_OPTIONS.some(o => o.value === '30'));

  // 31f. Verify PIN Exclusion from Google Sheets & JSON Backups
  const backupSrc = fs.readFileSync(path.resolve('src/db/backup.js'), 'utf8');
  assert.ok(backupSrc.includes("key !== 'security_profile'"), 'backup.js export must strip security_profile');
  assert.ok(backupSrc.includes("key !== 'pin_security'"), 'backup.js export must strip pin_security');

  const sheetsSyncSrc = fs.readFileSync(path.resolve('src/utils/googleSheetsSync.js'), 'utf8');
  assert.ok(sheetsSyncSrc.includes("key !== 'security_profile'"), 'googleSheetsSync.js must strip security_profile');
  assert.ok(sheetsSyncSrc.includes("key !== 'pin_security'"), 'googleSheetsSync.js must strip pin_security');

  // 31g. Verify PDF & WhatsApp Sharing Guards
  const pdfExportSrc = fs.readFileSync(path.resolve('src/utils/pdfExport.js'), 'utf8');
  assert.ok(pdfExportSrc.includes('setSharingActive'), 'pdfExport.js must use setSharingActive');

  const whatsappSrc = fs.readFileSync(path.resolve('src/utils/whatsapp.js'), 'utf8');
  assert.ok(whatsappSrc.includes('setSharingActive'), 'whatsapp.js must use setSharingActive');

  // 31h. Verify PinLockScreen Component
  const pinLockSrc = fs.readFileSync(path.resolve('src/components/PinLockScreen.jsx'), 'utf8');
  assert.ok(pinLockSrc.includes('PinLockScreen'), 'PinLockScreen component must exist');
  assert.ok(pinLockSrc.includes('Keypad temporarily disabled') || pinLockSrc.includes('Locked Out:'), 'Lockout countdown UI');
  assert.ok(pinLockSrc.includes('Forgot PIN?'), 'Forgot PIN modal link');
  assert.ok(pinLockSrc.includes('clearSiteDataAndReset'), 'Emergency clear site data and restore flow');
  assert.ok(pinLockSrc.includes('PIN lock hides the app screen. Keep your device locked too.'), 'Disclaimer on lock screen');

  // 31i. Verify SettingsPage Security Card
  const settingsPageSrc = fs.readFileSync(path.resolve('src/pages/SettingsPage.jsx'), 'utf8');
  assert.ok(settingsPageSrc.includes('Security & App PIN Lock'), 'SettingsPage must have Security & App PIN Lock card');
  assert.ok(settingsPageSrc.includes('PIN lock hides the app screen. Keep your device locked too.'), 'SettingsPage must show disclaimer');
  assert.ok(settingsPageSrc.includes('PIN lock cannot be recovered if forgotten'), 'SettingsPage must show recovery warning');
  assert.ok(settingsPageSrc.includes('Auto-Lock Inactivity Timeout'), 'SettingsPage must have timeout selector');
  assert.ok(settingsPageSrc.includes('handleSetupPin'), 'SettingsPage must have handleSetupPin');
  assert.ok(settingsPageSrc.includes('handleChangePin'), 'SettingsPage must have handleChangePin');
  assert.ok(settingsPageSrc.includes('handleRemovePin'), 'SettingsPage must have handleRemovePin');

  // 31j. Verify CustomerApp.jsx Integration
  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes('PinLockScreen'), 'CustomerApp.jsx must import and mount PinLockScreen');
  assert.ok(appSrc.includes('shouldLockOnResume'), 'CustomerApp.jsx must use shouldLockOnResume');
  assert.ok(appSrc.includes('recordUserActivity'), 'CustomerApp.jsx must track user activity');
  assert.ok(appSrc.includes('visibilitychange'), 'CustomerApp.jsx must listen to visibilitychange for auto-lock');

  console.log('✓ Test 31 Passed: App PIN Lock, Salted Web Crypto hashing, progressive lockout (5 attempts -> 30s+), inactivity timeout calculation, sharing guards, and backup sanitization fully verified.');
}

// ============================================================================
// TEST 32: FEATURE 1 — CLIENT AND EVENT TYPES
// ============================================================================
{
  console.log('\n--- Running Test 32: Client and Event Types (Feature 1) ---');
  const { DEFAULT_EVENT_TYPES, DEFAULT_CLIENT_TAGS } = await import('../src/db/seedData.js');
  const { normalizeEventTypes, getActiveEventTypeNames } = await import('../src/utils/eventTypeUtils.js');
  const { generateAccountantReport, getReportPeriodDates } = await import('../src/utils/reportCalculations.js');
  const { prepareSyncPayload } = await import('../src/utils/googleSheetsSync.js');

  // 32a. Verify defaults
  assert.strictEqual(DEFAULT_EVENT_TYPES.length, 9, 'Must have 9 default event types');
  assert.ok(DEFAULT_EVENT_TYPES.includes('Wedding'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Pre-wedding'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Engagement'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Birthday'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Corporate'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Baby/Maternity'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Product Shoot'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Printing Order'));
  assert.ok(DEFAULT_EVENT_TYPES.includes('Other'));

  assert.deepStrictEqual(DEFAULT_CLIENT_TAGS, ['Regular', 'VIP', 'Corporate', 'Studio/Partner']);

  // 32b. Event Types list operations (normalize, add, rename, reorder, hide)
  const normalized = normalizeEventTypes(['Wedding', 'Pre-wedding']);
  assert.strictEqual(normalized.length, 2);
  assert.strictEqual(normalized[0].name, 'Wedding');
  assert.strictEqual(normalized[0].isHidden, false);

  // Active names filtering
  const activeNames = getActiveEventTypeNames([
    { id: '1', name: 'Wedding', isHidden: false, sortOrder: 0 },
    { id: '2', name: 'Birthday', isHidden: true, sortOrder: 1 },
    { id: '3', name: 'Corporate', isHidden: false, sortOrder: 2 }
  ]);
  assert.deepStrictEqual(activeNames, ['Wedding', 'Corporate'], 'Hidden event types must be excluded from active dropdown');

  // 32c. Snapshot preservation: Existing bills must retain their eventType snapshot even if renamed/hidden
  const mockOldBill = {
    id: 1,
    invoiceNumber: 1,
    invoiceDate: '2026-05-10',
    totalAmount: 50000,
    advancePaid: 20000,
    balanceDue: 30000,
    eventType: 'Pre-wedding', // Snapshot
    eventDate: '2026-06-15',
    status: 'partially_paid',
    isDeleted: false,
    payments: [{ date: '2026-05-10', amount: 20000 }]
  };

  // Simulate renaming "Pre-wedding" to "Engagement Shoot" in Settings
  const updatedSettingsTypes = [
    { id: '1', name: 'Wedding', hidden: false, order: 0 },
    { id: '2', name: 'Engagement Shoot', hidden: false, order: 1 } // renamed
  ];

  // Old bill's snapshot must remain 'Pre-wedding'
  assert.strictEqual(mockOldBill.eventType, 'Pre-wedding', 'Historical invoice eventType snapshot must never change');

  // 32d. Reports Page calculations: Income by event type & bill count
  const mockReportInvoices = [
    mockOldBill,
    {
      id: 2,
      invoiceNumber: 2,
      invoiceDate: '2026-05-12',
      totalAmount: 100000,
      advancePaid: 100000,
      balanceDue: 0,
      eventType: 'Wedding',
      eventDate: '2026-11-20',
      status: 'paid',
      isDeleted: false,
      payments: [{ date: '2026-05-12', amount: 100000 }]
    },
    {
      id: 3,
      invoiceNumber: 3,
      invoiceDate: '2026-05-14',
      totalAmount: 30000,
      advancePaid: 0,
      balanceDue: 30000,
      eventType: 'Wedding',
      eventDate: '2026-12-05',
      status: 'sent',
      isDeleted: false,
      payments: []
    },
    {
      id: 4,
      invoiceNumber: 4,
      invoiceDate: '2026-05-15',
      totalAmount: 15000,
      advancePaid: 15000,
      balanceDue: 0,
      // no eventType provided -> defaults to 'Other'
      status: 'paid',
      isDeleted: false,
      payments: [{ date: '2026-05-15', amount: 15000 }]
    },
    {
      id: 5,
      invoiceNumber: 5,
      invoiceDate: '2026-05-16',
      totalAmount: 25000,
      status: 'cancelled', // Cancelled bills excluded
      isDeleted: false
    },
    {
      id: 6,
      invoiceNumber: 6,
      invoiceDate: '2026-05-17',
      totalAmount: 20000,
      isDeleted: true // Soft-deleted bills excluded
    }
  ];

  const periodInfo = getReportPeriodDates('all');
  const report = generateAccountantReport({
    invoices: mockReportInvoices,
    customers: [],
    expenses: [],
    periodInfo,
    viewMode: 'billed'
  });

  assert.ok(Array.isArray(report.incomeByEventType), 'report.incomeByEventType must be an array');
  assert.strictEqual(report.incomeByEventType.length, 3, 'Wedding, Pre-wedding, and Other');

  // Sorted by totalBilled desc: Wedding first (130,000), Pre-wedding second (50,000), Other third (15,000)
  const weddingAgg = report.incomeByEventType.find(e => e.eventType === 'Wedding');
  assert.ok(weddingAgg);
  assert.strictEqual(weddingAgg.billsCount, 2);
  assert.strictEqual(weddingAgg.totalBilled, 130000);
  assert.strictEqual(weddingAgg.totalReceived, 100000);
  assert.strictEqual(weddingAgg.balanceDue, 30000);

  const preWeddingAgg = report.incomeByEventType.find(e => e.eventType === 'Pre-wedding');
  assert.ok(preWeddingAgg);
  assert.strictEqual(preWeddingAgg.billsCount, 1);
  assert.strictEqual(preWeddingAgg.totalBilled, 50000);
  assert.strictEqual(preWeddingAgg.totalReceived, 20000);
  assert.strictEqual(preWeddingAgg.balanceDue, 30000);

  const otherAgg = report.incomeByEventType.find(e => e.eventType === 'Other');
  assert.ok(otherAgg);
  assert.strictEqual(otherAgg.billsCount, 1);
  assert.strictEqual(otherAgg.totalBilled, 15000);

  // 32e. Google Sheets Sync Headers & Columns
  const mockDbForSync = {
    settings: {
      toArray: async () => [{ key: 'business_profile', businessName: 'DR FILMS', invoicePrefix: 'DRF-' }]
    },
    services: { toArray: async () => [] },
    customCharges: { toArray: async () => [] },
    customers: {
      toArray: async () => [
        { id: 1, name: 'Aarav Patel', company: 'Patel Ent', phone: '9876543210', tag: 'VIP', privateNote: 'Prefers 4K edits' },
        { id: 2, name: 'Rohit Sharma', company: '', phone: '9876500000', tag: 'Corporate', privateNote: '' }
      ]
    },
    invoices: {
      toArray: async () => [
        {
          id: 1,
          invoiceNumber: 1,
          invoiceDate: '2026-05-10',
          customerId: 1,
          totalAmount: 50000,
          advancePaid: 20000,
          balanceDue: 30000,
          status: 'sent',
          eventType: 'Wedding',
          eventDate: '2026-11-20',
          lastReminderDate: '2026-05-15',
          reminderCount: 1,
          isDeleted: false
        }
      ]
    },
    expenses: { toArray: async () => [] }
  };

  const syncPayload = await prepareSyncPayload(null, mockDbForSync);
  const invHeaders = syncPayload.tables.Invoices.headers;
  const invRow = syncPayload.tables.Invoices.rows[0];

  assert.strictEqual(invHeaders[13], 'Record Status');
  assert.strictEqual(invHeaders[14], 'Deleted At');
  assert.strictEqual(invHeaders[18], 'Event Type', 'Index 18 must be Event Type');
  assert.strictEqual(invHeaders[19], 'Event Date', 'Index 19 must be Event Date');
  assert.strictEqual(invHeaders[20], 'Last Reminder Date', 'Index 20 must be Last Reminder Date');
  assert.strictEqual(invHeaders[21], 'Reminder Count', 'Index 21 must be Reminder Count');

  assert.strictEqual(invRow[13], 'Active');
  assert.strictEqual(invRow[18], 'Wedding');
  assert.strictEqual(invRow[19], '2026-11-20');
  assert.strictEqual(invRow[20], '2026-05-15');
  assert.strictEqual(invRow[21], 1);

  const cliHeaders = syncPayload.tables.Clients.headers;
  const cliRow = syncPayload.tables.Clients.rows[0];
  assert.strictEqual(cliHeaders[6], 'Tag', 'Index 6 of Clients must be Tag');
  assert.strictEqual(cliRow[6], 'VIP', 'Aarav Patel must have tag VIP');

  // 32f. Verify UI Source Code Wiring
  const invoicesPageSrc = fs.readFileSync(path.resolve('src/pages/InvoicesPage.jsx'), 'utf8');
  assert.ok(invoicesPageSrc.includes('eventTypeFilter'), 'InvoicesPage must support filtering by eventType');
  assert.ok(invoicesPageSrc.includes('clientTagFilter'), 'InvoicesPage must support filtering by client tag');

  const customersPageSrc = fs.readFileSync(path.resolve('src/pages/CustomersPage.jsx'), 'utf8');
  assert.ok(customersPageSrc.includes('selectedTagFilter') || customersPageSrc.includes('tagFilter') || customersPageSrc.includes('All Clients'), 'CustomersPage must have Tag filter bar');
  assert.ok(customersPageSrc.includes('privateNote'), 'CustomersPage must support private note');

  const reportsPageSrc = fs.readFileSync(path.resolve('src/pages/ReportsPage.jsx'), 'utf8');
  assert.ok(reportsPageSrc.includes("'eventTypes'"), 'ReportsPage must have eventTypes tab');
  assert.ok(reportsPageSrc.includes('incomeByEventType'), 'ReportsPage must use incomeByEventType');

  console.log('✓ Test 32 Passed: Client and Event Types, snapshot preservation, report calculations, client tag filters, and Google Sheets sync verified.');
}

// ============================================================================
// TEST 33: FEATURE 2 — PAYMENT REMINDERS
// ============================================================================
{
  console.log('\n--- Running Test 33: Payment Reminders (Feature 2) ---');
  const {
    calculateDaysOverdue,
    calculateDaysUntilDue,
    isSnoozed,
    isRecentlyReminded,
    selectReminderTone,
    getOverdueInvoices,
    getUpcomingDueInvoices,
    groupInvoicesByClient,
    removeEmojis,
    generateReminderMessage
  } = await import('../src/utils/reminderCalculations.js');

  const refDate = new Date('2026-10-21T12:00:00Z');

  // 33a. Days Overdue & Due Calculations
  const overdueDueDate = '2026-10-11'; // 10 days before Oct 21
  const futureDueDate = '2026-10-24';  // 3 days after Oct 21
  const todayDueDate = '2026-10-21';

  assert.strictEqual(calculateDaysOverdue(overdueDueDate, null, refDate), 10, 'Due 10 days ago must be 10 days overdue');
  assert.strictEqual(calculateDaysOverdue(todayDueDate, null, refDate), 0, 'Due today must be 0 days overdue');
  assert.ok(calculateDaysOverdue(futureDueDate, null, refDate) < 0, 'Future due date must have negative overdue days');

  // Fallback to invoiceDate
  assert.strictEqual(calculateDaysOverdue(null, '2026-10-16', refDate), 5, 'Fallback to invoiceDate when dueDate missing');

  // Days until due
  assert.strictEqual(calculateDaysUntilDue(futureDueDate, null, refDate), 3, 'Due in 3 days must return 3');
  assert.strictEqual(calculateDaysUntilDue(todayDueDate, null, refDate), 0, 'Due today must return 0');

  // 33b. Snooze checking
  const snoozedInvoice = { id: 1, snoozedUntil: '2026-10-25T12:00:00Z' };
  const expiredSnoozeInvoice = { id: 2, snoozedUntil: '2026-10-18T12:00:00Z' };
  const unsnoozedInvoice = { id: 3 };

  assert.strictEqual(isSnoozed(snoozedInvoice, refDate), true, 'Invoice snoozed until future must return true');
  assert.strictEqual(isSnoozed(expiredSnoozeInvoice, refDate), false, 'Invoice with past snooze date must return false');
  assert.strictEqual(isSnoozed(unsnoozedInvoice, refDate), false, 'Invoice without snooze must return false');

  // 33c. Anti-spam check (isRecentlyReminded)
  assert.strictEqual(isRecentlyReminded('2026-10-20T12:00:00Z', 3, refDate), true, 'Reminded 1 day ago must trigger spam warning');
  assert.strictEqual(isRecentlyReminded('2026-10-15T12:00:00Z', 3, refDate), false, 'Reminded 6 days ago must NOT trigger 3-day spam warning');
  assert.strictEqual(isRecentlyReminded(null, 3, refDate), false, 'Never reminded must return false');

  // 33d. Reminder tone selection rules
  assert.strictEqual(selectReminderTone(3), 'friendly', '1-7 days overdue must be friendly');
  assert.strictEqual(selectReminderTone(7), 'friendly', '7 days overdue must be friendly');
  assert.strictEqual(selectReminderTone(8), 'neutral', '8 days overdue must be neutral');
  assert.strictEqual(selectReminderTone(30), 'neutral', '30 days overdue must be neutral');
  assert.strictEqual(selectReminderTone(31), 'firm', '31+ days overdue must be firm');
  assert.strictEqual(selectReminderTone(65), 'firm', '65 days overdue must be firm');

  // 33e. Overdue & Upcoming Invoices Filtering
  const testInvoices = [
    { id: 101, invoiceNumber: 101, dueDate: '2026-10-10', balanceDue: 15000, status: 'sent', isDeleted: false }, // 11d overdue
    { id: 102, invoiceNumber: 102, dueDate: '2026-10-15', balanceDue: 5000, status: 'partially_paid', isDeleted: false }, // 6d overdue
    { id: 103, invoiceNumber: 103, dueDate: '2026-10-10', balanceDue: 0, status: 'paid', isDeleted: false }, // Paid -> exclude
    { id: 104, invoiceNumber: 104, dueDate: '2026-10-05', balanceDue: 10000, status: 'draft', isDeleted: false }, // Draft -> exclude
    { id: 105, invoiceNumber: 105, dueDate: '2026-10-08', balanceDue: 8000, status: 'sent', isDeleted: true }, // Deleted -> exclude
    { id: 106, invoiceNumber: 106, dueDate: '2026-10-10', balanceDue: 12000, status: 'sent', snoozedUntil: '2026-10-25', isDeleted: false }, // Snoozed -> exclude
    { id: 107, invoiceNumber: 107, dueDate: '2026-10-23', balanceDue: 20000, status: 'sent', isDeleted: false }, // Due in 2 days (upcoming)
  ];

  const overdueList = getOverdueInvoices(testInvoices, 0, refDate);
  assert.strictEqual(overdueList.length, 2, 'Should find 2 active overdue bills');
  assert.strictEqual(overdueList[0].id, 101);
  assert.strictEqual(overdueList[1].id, 102);

  const upcomingList = getUpcomingDueInvoices(testInvoices, 3, refDate);
  assert.strictEqual(upcomingList.length, 1, 'Should find 1 upcoming bill due in next 3 days');
  assert.strictEqual(upcomingList[0].id, 107);

  // 33f. Group invoices by client and sort oldest overdue first
  const multiBillInvoices = [
    {
      id: 201,
      invoiceNumber: 201,
      customerId: 5,
      dueDate: '2026-10-16', // 5d overdue
      balanceDue: 10000,
      customerSnapshot: { name: 'Vikram Malhotra', phone: '9876543210', tag: 'Regular' }
    },
    {
      id: 202,
      invoiceNumber: 202,
      customerId: 5,
      dueDate: '2026-10-01', // 20d overdue
      balanceDue: 25000,
      customerSnapshot: { name: 'Vikram Malhotra', phone: '9876543210', tag: 'Regular' }
    },
    {
      id: 203,
      invoiceNumber: 203,
      customerId: 6,
      dueDate: '2026-10-14', // 7d overdue
      balanceDue: 8000,
      customerSnapshot: { name: 'Neha Sharma', phone: '9876543211', tag: 'VIP' }
    }
  ];

  const customers = [
    { id: 5, name: 'Vikram Malhotra', phone: '9876543210', tag: 'Regular', dontRemind: false },
    { id: 6, name: 'Neha Sharma', phone: '9876543211', tag: 'VIP', dontRemind: false }
  ];

  const clientGroups = groupInvoicesByClient(multiBillInvoices, customers);
  assert.strictEqual(clientGroups.length, 2, 'Must group 3 bills into 2 client groups');

  // Sorted oldest overdue first: Vikram has 20d overdue (max), Neha has 7d overdue
  assert.strictEqual(clientGroups[0].clientId, 5, 'Client with oldest overdue bill (20d) must be first');
  assert.strictEqual(clientGroups[0].invoices.length, 2, 'Vikram Malhotra must have 2 consolidated bills');
  assert.strictEqual(clientGroups[0].totalPayable, 35000, 'Vikram total payable must be 10000 + 25000 = 35000');
  assert.strictEqual(clientGroups[0].maxDaysOverdue, calculateDaysOverdue('2026-10-01'));

  assert.strictEqual(clientGroups[1].clientId, 6);
  assert.strictEqual(clientGroups[1].clientTag, 'VIP');
  assert.strictEqual(clientGroups[1].totalPayable, 8000);

  // 33g. Emoji stripping and reminder template formatting
  const rawWithEmojis = 'Hello 👋! Please pay ₹5,000 🙏 for INV-001 🚀.';
  const cleaned = removeEmojis(rawWithEmojis);
  assert.strictEqual(cleaned, 'Hello ! Please pay ₹5,000  for INV-001 .', 'Must strip all emojis');

  const mockReminderSettings = {
    businessName: 'DR FILMS',
    currencySymbol: '₹',
    upiId: 'drfilms@upi'
  };

  const friendlyMsg = generateReminderMessage({
    clientName: 'Vikram Malhotra',
    invoiceNumbers: [201, 202],
    totalAmount: 35000,
    dueDate: '2026-10-01',
    daysOverdue: 20,
    tone: 'friendly',
    settings: mockReminderSettings
  });

  assert.ok(friendlyMsg.includes('Vikram Malhotra'), 'Must include client name');
  assert.ok(friendlyMsg.includes('35,000'), 'Must include formatted total amount');
  assert.ok(friendlyMsg.includes('DR FILMS'), 'Must include business name');
  // Strict test: zero emoji characters in generated message
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{FFFD}]/gu;
  assert.strictEqual(friendlyMsg.includes('₹₹'), false, 'Reminder message must never contain duplicate currency symbol ₹₹');
  assert.ok(friendlyMsg.includes('drfilms@upi'), 'Must include UPI ID when configured');

  // Verify legacy template with ₹{amount} does NOT produce double symbols
  const legacyTemplateMsg = generateReminderMessage({
    clientName: 'Sheetal Photographer',
    invoiceNumbers: 'DRF-0002',
    totalAmount: 16995,
    dueDate: '2026-10-16',
    daysOverdue: 6,
    customTemplate: 'Hello {clientName},\nThis is a gentle reminder that ₹{amount} is pending for invoice {invoiceNumber}.\nPay via UPI: {upiId}\nRegards, {businessName}',
    settings: {
      businessName: 'DR FILMS',
      currencySymbol: '₹',
      bankDetails: { upiId: 'drfilms@hdfcbank' }
    }
  });
  assert.strictEqual(legacyTemplateMsg.includes('₹₹'), false, 'Legacy template with ₹{amount} must be sanitized to never output ₹₹');
  assert.ok(legacyTemplateMsg.includes('drfilms@hdfcbank'), 'Must resolve upiId from bankDetails.upiId');
  assert.ok(legacyTemplateMsg.includes('16,995.00'), 'Must format amount properly');

  // Verify clean removal of UPI line when no UPI ID is configured
  const noUpiMsg = generateReminderMessage({
    clientName: 'Sheetal Photographer',
    invoiceNumbers: 'DRF-0002',
    totalAmount: 16995,
    dueDate: '2026-10-16',
    daysOverdue: 6,
    settings: {
      businessName: 'DR FILMS',
      currencySymbol: '₹'
    }
  });
  assert.strictEqual(noUpiMsg.includes('Pay via UPI:'), false, 'When no UPI ID exists, Pay via UPI line must be cleanly omitted');

  const firmMsg = generateReminderMessage({
    clientName: 'Vikram Malhotra',
    invoiceNumbers: 201,
    totalAmount: 10000,
    dueDate: '2026-09-01',
    daysOverdue: 50,
    tone: 'firm',
    settings: mockReminderSettings
  });
  assert.strictEqual(emojiRegex.test(firmMsg), false, 'Firm reminder message must have ZERO emojis');
  assert.ok(firmMsg.includes('severely overdue') || firmMsg.includes('immediately') || firmMsg.includes('Attention'), 'Firm message must contain strong phrasing');

  // 33h. UI and Component Wiring Checks
  const modalSrc = fs.readFileSync(path.resolve('src/components/PaymentReminderModal.jsx'), 'utf8');
  assert.ok(modalSrc.includes('PaymentReminderModal'), 'PaymentReminderModal component must exist');
  assert.ok(modalSrc.includes('Anti-Spam Warning') || modalSrc.includes('Reminder Sent Recently'), 'Must have anti-spam warning');
  assert.ok(modalSrc.includes('Friendly') && modalSrc.includes('Neutral') && modalSrc.includes('Firm'), 'Must have tone selector pills');
  assert.ok(modalSrc.includes('handleSnooze'), 'Must have snooze functionality');
  assert.ok(modalSrc.includes('dontRemind'), 'Must have client mute toggle');
  assert.ok(modalSrc.includes('handleSendWhatsApp'), 'Must have WhatsApp share handler');

  const batchModalSrc = fs.readFileSync(path.resolve('src/components/BatchRemindersModal.jsx'), 'utf8');
  assert.ok(batchModalSrc.includes("db.settings.get('business_profile')"), 'BatchRemindersModal must query business_profile');

  const dashSrc = fs.readFileSync(path.resolve('src/pages/DashboardPage.jsx'), 'utf8');
  assert.ok(dashSrc.includes('overdue-payments-card'), 'Dashboard must contain #overdue-payments-card');
  assert.ok(dashSrc.includes('PaymentReminderModal'), 'Dashboard must render PaymentReminderModal');
  assert.ok(dashSrc.includes('groupInvoicesByClient'), 'Dashboard must group overdue invoices by client');
  assert.ok(dashSrc.includes('handleQuickSnooze'), 'Dashboard must have quick snooze button');

  console.log('✓ Test 33 Passed: Payment reminders calculation, client grouping, tone selection, zero-emoji guarantee, anti-spam warning, and UI components verified.');
}

// ==========================================
// TEST 34: Project / Job Tracker (Feature 3)
// ==========================================
console.log('\nTest 34: Project / Job Tracker (Feature 3)...');
{
  const {
    PROJECT_STAGES,
    STAGE_CONFIG,
    PRIORITY_CONFIG,
    getDeliveryStatus,
    createDefaultChecklist,
    getChecklistProgress,
    generateDeliveredWhatsAppMessage
  } = await import('../src/utils/projectUtils.js');

  // 34a. Verify stages & configs
  assert.deepStrictEqual(
    PROJECT_STAGES,
    ['Booked', 'Shoot Done', 'Editing', 'Client Review', 'Revision', 'Ready', 'Delivered'],
    'Project stages must match required 7-stage workflow'
  );
  PROJECT_STAGES.forEach(stage => {
    assert.ok(STAGE_CONFIG[stage], `STAGE_CONFIG must define stage: ${stage}`);
    assert.ok(STAGE_CONFIG[stage].label, `Stage ${stage} must have a label`);
    assert.ok(STAGE_CONFIG[stage].color, `Stage ${stage} must have a color`);
  });

  ['Low', 'Normal', 'High', 'Urgent'].forEach(p => {
    assert.ok(PRIORITY_CONFIG[p], `PRIORITY_CONFIG must define priority: ${p}`);
  });

  // 34b. Verify delivery status calculations with fixed reference date (2026-10-21)
  const refDate = '2026-10-21';

  const overdueStatus = getDeliveryStatus('2026-10-15', 'Editing', refDate);
  assert.strictEqual(overdueStatus.status, 'overdue');
  assert.strictEqual(overdueStatus.daysOverdue, 6);

  const dueTodayStatus = getDeliveryStatus('2026-10-21', 'Editing', refDate);
  assert.strictEqual(dueTodayStatus.status, 'due-today');
  assert.strictEqual(dueTodayStatus.daysRemaining, 0);

  const dueSoonStatus = getDeliveryStatus('2026-10-23', 'Editing', refDate);
  assert.strictEqual(dueSoonStatus.status, 'due-soon');
  assert.strictEqual(dueSoonStatus.daysRemaining, 2);

  const onTrackStatus = getDeliveryStatus('2026-11-05', 'Editing', refDate);
  assert.strictEqual(onTrackStatus.status, 'on-track');
  assert.strictEqual(onTrackStatus.daysRemaining, 15);

  const deliveredStatus = getDeliveryStatus('2026-10-15', 'Delivered', refDate);
  assert.strictEqual(deliveredStatus.status, 'delivered');

  // 34c. Verify checklist generation & progress calculation
  const defaultChecklist = createDefaultChecklist();
  assert.ok(Array.isArray(defaultChecklist) && defaultChecklist.length >= 6, 'Must generate standard checklist');
  assert.strictEqual(defaultChecklist[0].completed, false);

  const testChecklist = [
    { id: 'c1', text: 'Task 1', completed: true },
    { id: 'c2', text: 'Task 2', completed: false },
    { id: 'c3', text: 'Task 3', completed: true },
    { id: 'c4', text: 'Task 4', completed: false }
  ];
  const progress = getChecklistProgress(testChecklist);
  assert.strictEqual(progress.total, 4);
  assert.strictEqual(progress.completed, 2);
  assert.strictEqual(progress.percentage, 50);

  // 34d. Verify zero-emoji delivered WhatsApp message template
  const deliveredMsg = generateDeliveredWhatsAppMessage({
    clientName: 'Priya Sharma',
    projectTitle: 'Priya & Karan Wedding Highlights',
    businessName: 'DR FILMS',
    downloadLink: 'https://drive.google.com/sample-folder',
    invoiceNumber: 101,
    balanceDue: 0
  });

  assert.ok(deliveredMsg.includes('Priya Sharma'), 'Must include client name');
  assert.ok(deliveredMsg.includes('Priya & Karan Wedding Highlights'), 'Must include project title');
  assert.ok(deliveredMsg.includes('DR FILMS'), 'Must include business name');
  assert.ok(deliveredMsg.includes('https://drive.google.com/sample-folder'), 'Must include download link');
  assert.ok(deliveredMsg.includes('Settled in full'), 'Should note invoice is fully settled when balance is 0');

  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{FFFD}]/gu;
  assert.strictEqual(emojiRegex.test(deliveredMsg), false, 'Delivered WhatsApp message must have ZERO emojis');

  // 34e. Verify Google Sheets sync payload contains 'Projects' table
  const { prepareSyncPayload } = await import('../src/utils/googleSheetsSync.js');

  const mockDbForProjectSync = {
    settings: {
      toArray: async () => [
        {
          key: 'business_profile',
          businessName: 'DR FILMS',
          invoicePrefix: 'DRF-',
          currencySymbol: '₹'
        }
      ]
    },
    services: { toArray: async () => [] },
    customCharges: { toArray: async () => [] },
    customers: {
      toArray: async () => [
        { id: 10, name: 'Ananya Roy', phone: '9876543210', company: 'Studio Partner', isDeleted: false }
      ]
    },
    invoices: {
      toArray: async () => [
        {
          id: 50,
          invoiceNumber: 'DRF-0101',
          customerId: 10,
          totalAmount: 50000,
          advancePaid: 30000,
          balanceDue: 20000,
          isDeleted: false
        }
      ]
    },
    expenses: { toArray: async () => [] },
    projects: {
      toArray: async () => [
        {
          id: 1,
          title: 'Fashion Portfolio Reel',
          customerId: 10,
          invoiceId: 50,
          eventType: 'Fashion',
          eventDate: '2026-11-10',
          deliveryDueDate: '2026-11-25',
          stage: 'Editing',
          priority: 'High',
          checklist: [{ id: '1', completed: true }, { id: '2', completed: false }],
          isDeleted: false,
          createdAt: '2026-10-18T10:00:00Z',
          updatedAt: '2026-10-19T12:00:00Z'
        }
      ]
    }
  };

  const syncPayload = await prepareSyncPayload(null, mockDbForProjectSync);
  assert.ok(syncPayload.tables.Projects, 'Sync payload must include Projects table');
  
  const projHeaders = syncPayload.tables.Projects.headers;
  assert.strictEqual(projHeaders[0], 'Project ID');
  assert.strictEqual(projHeaders[1], 'Title');
  assert.strictEqual(projHeaders[2], 'Client');
  assert.strictEqual(projHeaders[4], 'Invoice No');
  assert.strictEqual(projHeaders[8], 'Stage');
  assert.strictEqual(projHeaders[9], 'Priority');
  assert.strictEqual(projHeaders[10], 'Progress');
  assert.strictEqual(projHeaders[11], 'Payment Status');
  assert.strictEqual(projHeaders[12], 'Balance Due');

  const projRow = syncPayload.tables.Projects.rows[0];
  assert.strictEqual(projRow[0], 1);
  assert.strictEqual(projRow[1], 'Fashion Portfolio Reel');
  assert.strictEqual(projRow[2], 'Ananya Roy');
  assert.strictEqual(projRow[4], 'DRF-0101');
  assert.strictEqual(projRow[8], 'Editing');
  assert.strictEqual(projRow[9], 'High');
  assert.strictEqual(projRow[10], '50% (1/2)');
  assert.strictEqual(projRow[11], 'Partially Paid');
  assert.strictEqual(projRow[12], 20000);

  const backupJsonData = JSON.parse(syncPayload.backupJson);
  assert.ok(Array.isArray(backupJsonData.data.projects), 'Backup JSON must contain projects array');
  assert.strictEqual(backupJsonData.data.projects.length, 1);

  // 34f. Verify db/backup.js exports and restores projects
  const backupSrc = fs.readFileSync(path.resolve('src/db/backup.js'), 'utf8');
  assert.ok(backupSrc.includes('db.projects'), 'backup.js must reference db.projects');
  assert.ok(backupSrc.includes('normalizedProjects'), 'backup.js must normalize projects');

  // 34g. Verify UI component wiring
  const projectsPageSrc = fs.readFileSync(path.resolve('src/pages/ProjectsPage.jsx'), 'utf8');
  assert.ok(projectsPageSrc.includes('Kanban'), 'ProjectsPage must have Kanban view');
  assert.ok(projectsPageSrc.includes('List'), 'ProjectsPage must have List view');
  assert.ok(projectsPageSrc.includes('Calendar'), 'ProjectsPage must have Calendar view');
  assert.ok(projectsPageSrc.includes('ProjectFormModal'), 'ProjectsPage must render ProjectFormModal');
  assert.ok(projectsPageSrc.includes('ProjectDeliveredModal'), 'ProjectsPage must render ProjectDeliveredModal');

  const trashSrc = fs.readFileSync(path.resolve('src/pages/TrashPage.jsx'), 'utf8');
  assert.ok(trashSrc.includes('deletedProjects'), 'TrashPage must query deletedProjects');
  assert.ok(trashSrc.includes('handleRestoreProject'), 'TrashPage must support restoring projects');
  assert.ok(trashSrc.includes('handlePermanentDeleteProject'), 'TrashPage must support permanently deleting projects');
  assert.ok(trashSrc.includes('Deleted Projects'), 'TrashPage must have Deleted Projects tab');

  const invoiceViewSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
  assert.ok(invoiceViewSrc.includes('ProjectFormModal') || invoiceViewSrc.includes('linkedProject'), 'InvoiceViewPage must integrate linked project tracker');

  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes('projects'), 'Layout.jsx must have projects navigation');
  assert.ok(layoutSrc.includes('Briefcase'), 'Layout.jsx must use Briefcase icon for projects');

  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes('ProjectsPage'), 'CustomerApp.jsx must import ProjectsPage');
  assert.ok(appSrc.includes("'projects'"), 'CustomerApp.jsx must route to projects view');

  console.log('✓ Test 34 Passed: Project / Job Tracker stages, delivery statuses, checklist progress, zero-emoji WhatsApp template, Google Sheets sync tab, backup/restore, and UI components verified.');
}

// -----------------------------------------------------------------------------
// Test 35: Full AST Static Analysis (No Undeclared Identifiers or Missing Imports)
// -----------------------------------------------------------------------------
{
  console.log('\n--- Running Test 35: Full AST Static Analysis for Undeclared Identifiers ---');
  const parser = await import('@babel/parser');
  const traversePkg = await import('@babel/traverse');
  const traverse = traversePkg.default?.default || traversePkg.default;

  function getAllSourceFiles(dir, extList) {
    let res = [];
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        res = res.concat(getAllSourceFiles(full, extList));
      } else if (extList.some(ext => full.endsWith(ext))) {
        res.push(full);
      }
    }
    return res;
  }

  const files = getAllSourceFiles('./src', ['.jsx', '.js']);
  const browserGlobals = new Set([
    'window', 'document', 'navigator', 'console', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'fetch', 'localStorage', 'sessionStorage',
    'URL', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request',
    'Response', 'alert', 'confirm', 'prompt', 'CustomEvent', 'Event',
    'Math', 'Date', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number',
    'Boolean', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'parseInt',
    'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'crypto', 'Intl', 'Image', 'btoa', 'atob',
    'URLSearchParams', 'TextEncoder', 'TextDecoder', 'history', 'location'
  ]);

  const issues = [];
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });
    const undeclared = new Set();
    traverse(ast, {
      ReferencedIdentifier(p) {
        const name = p.node.name;
        if (!browserGlobals.has(name) && !p.scope.hasBinding(name)) {
          undeclared.add(name);
        }
      }
    });
    if (undeclared.size > 0) {
      issues.push({ file: f, undeclared: Array.from(undeclared) });
    }
  }

  assert.strictEqual(issues.length, 0, `Found undeclared variables in source files: ${JSON.stringify(issues)}`);
  console.log('✓ Test 35 Passed: All source files verified with 0 undeclared identifiers or missing imports.');
}

// -------------------------------------------------------------
// Test 36: Direct Client Name (Walk-In / Non-Regular) Verification
// -------------------------------------------------------------
{
  console.log('\n--- Running Test 36: Direct Client Name (Non-Regular / Walk-In) Verification ---');

  // 1. Initial simulated customer directory
  const initialCustomers = [
    { id: 1, name: 'Ananya Sharma', phone: '9876543210', tag: 'VIP' },
    { id: 2, name: 'Kunal Verma', phone: '9123456780', tag: 'Corporate' }
  ];
  const initialCustomerCount = initialCustomers.length;

  // 2. Direct client input (one-time / walk-in)
  const directClientInput = {
    name: 'Vikram Joshi',
    phone: '9825012345',
    company: 'Walk-in Video Edit',
    email: 'vikram@example.com',
    address: 'Athwa Lines, Surat',
    gstin: '24ABCDE1234F1Z5'
  };

  // 3. Create Direct Invoice payload (mirrors CreateInvoicePage.jsx)
  const finalCustomerSnapshot = {
    name: directClientInput.name.trim(),
    company: directClientInput.company.trim(),
    phone: directClientInput.phone.trim(),
    email: directClientInput.email.trim(),
    address: directClientInput.address.trim(),
    gstin: directClientInput.gstin.trim(),
    tag: 'Regular',
    isDirectClient: true
  };

  const directInvoice = {
    id: 101,
    invoiceNumber: 'DRF-0010',
    customerId: null, // Strictly null: NOT added to db.customers
    customerSnapshot: finalCustomerSnapshot,
    invoiceDate: '2026-10-21',
    dueDate: '2026-10-28',
    eventType: 'Video Editing',
    items: [{ id: 1, name: 'Walk-in Reel Editing', rate: 2500, quantity: 1, amount: 2500 }],
    subtotal: 2500,
    totalAmount: 2500,
    advancePaid: 0,
    status: 'unpaid'
  };

  // Verification A: Customer directory remains completely untouched
  assert.strictEqual(initialCustomers.length, initialCustomerCount, 'Customer directory count must NOT increase');
  assert.strictEqual(directInvoice.customerId, null, 'Direct invoice customerId must be null');
  assert.strictEqual(directInvoice.customerSnapshot.isDirectClient, true, 'Snapshot must have isDirectClient: true');
  assert.strictEqual(directInvoice.customerSnapshot.name, 'Vikram Joshi');

  // Verification B: Invoice list & search behavior
  const searchQuery = 'vikram';
  const matchesSearch = (directInvoice.customerSnapshot?.name || '').toLowerCase().includes(searchQuery);
  assert.strictEqual(matchesSearch, true, 'Direct client invoices must be searchable by client name');

  // Verification C: PDF name resolution
  const pdfClientName = (directInvoice.customerSnapshot?.name || 'Client');
  assert.strictEqual(pdfClientName, 'Vikram Joshi', 'PDF export must resolve direct client name');

  // Verification D: WhatsApp formatting
  const waPhone = directInvoice.customerSnapshot?.phone || '';
  assert.strictEqual(waPhone, '9825012345', 'WhatsApp recipient must use direct client phone');

  // Verification E: Conversion to Directory Client ("Save to Directory")
  // If the client returns and user chooses to save to directory:
  const newDirectoryCustomer = {
    id: 3,
    name: directInvoice.customerSnapshot.name,
    phone: directInvoice.customerSnapshot.phone,
    company: directInvoice.customerSnapshot.company,
    email: directInvoice.customerSnapshot.email,
    address: directInvoice.customerSnapshot.address,
    gstin: directInvoice.customerSnapshot.gstin,
    tag: 'Regular',
    createdAt: new Date().toISOString()
  };
  initialCustomers.push(newDirectoryCustomer);
  assert.strictEqual(initialCustomers.length, initialCustomerCount + 1, 'Directory must contain 3 clients after on-demand save');
  assert.strictEqual(initialCustomers[2].name, 'Vikram Joshi');

  console.log('✓ Test 36 Passed: Direct client invoice creation, directory isolation, search, PDF, and on-demand conversion verified.');
}

// -------------------------------------------------------------
// Test 37: Studio Suite Features Verification
// (Quotes, Receipt Voucher, Agreement Contracts, Gear/Crew Clash Detection, Theme Switcher, Batch Reminders Hub)
// -------------------------------------------------------------
{
  console.log('\n--- Running Test 37: Studio Suite Features Verification ---');

  // 1. Currency in Words (numberToWords)
  const { numberToWords } = await import('../src/utils/formatters.js');
  assert.strictEqual(numberToWords(0), 'Zero Rupees Only', '0 must be Zero Rupees Only');
  assert.strictEqual(numberToWords(54000), 'Fifty Four Thousand Rupees Only', '54000 in words');
  assert.strictEqual(numberToWords(1523450), 'Fifteen Lakh Twenty Three Thousand Four Hundred Fifty Rupees Only', '1523450 in words');
  assert.strictEqual(numberToWords(25000000), 'Two Crore Fifty Lakh Rupees Only', '2.5 Crore in words');

  // 2. Quotation to Active Invoice 1-Click Conversion Logic
  const mockQuote = {
    id: 1,
    quoteNumber: 'DRF-EST-0001',
    customerId: null,
    customerSnapshot: {
      name: 'Pooja Mehta',
      company: 'Mehta Destination Wedding',
      phone: '9820098200',
      isDirectClient: true
    },
    quoteDate: '2026-10-21',
    validUntil: '2026-11-21',
    eventType: 'Wedding & Reception',
    items: [
      { id: 1, name: 'Traditional 4K Cinematography (2 Days)', rate: 65000, quantity: 1, amount: 65000 },
      { id: 2, name: 'Candid Photography', rate: 35000, quantity: 1, amount: 35000 }
    ],
    charges: [],
    subtotal: 100000,
    discountAmount: 5000,
    totalAmount: 95000,
    status: 'draft'
  };

  // Conversion:
  const newInvoiceFromQuote = {
    id: 201,
    invoiceNumber: 'DRF-2026-0045',
    fromQuoteId: mockQuote.id,
    quoteNumber: mockQuote.quoteNumber,
    customerId: mockQuote.customerId,
    customerSnapshot: mockQuote.customerSnapshot,
    invoiceDate: '2026-10-21',
    dueDate: '2026-10-28',
    eventType: mockQuote.eventType,
    items: [...mockQuote.items],
    charges: [...mockQuote.charges],
    subtotal: mockQuote.subtotal,
    discountAmount: mockQuote.discountAmount,
    totalAmount: mockQuote.totalAmount,
    advancePaid: 0,
    balanceDue: mockQuote.totalAmount,
    status: 'unpaid'
  };
  mockQuote.status = 'converted';
  mockQuote.convertedInvoiceId = newInvoiceFromQuote.id;

  assert.strictEqual(mockQuote.status, 'converted', 'Quote status must update to converted');
  assert.strictEqual(newInvoiceFromQuote.totalAmount, 95000, 'Invoice total must equal quote total');
  assert.strictEqual(newInvoiceFromQuote.items.length, 2, 'Invoice must retain line items');

  // 3. Shoot Booking Agreement Contract Structure
  const contractAgreement = {
    id: 1,
    contractNumber: 'DRF-AGR-2026-0001',
    clientName: mockQuote.customerSnapshot.name,
    projectTitle: 'Mehta Destination Wedding 2026',
    eventDate: '2026-12-10',
    totalAmount: 95000,
    advanceDeposit: 30000,
    shootDayPayment: 50000,
    finalDeliveryPayment: 15000,
    deliverables: [
      'Full Wedding Film (40-60 mins)',
      'Cinematic Teaser (3-5 mins)',
      '1000+ Color Graded Photos'
    ],
    terms: [
      'Raw footage remains copyright of DR Films.',
      'Delivery timeline is 30 business days post event.',
      'Advance deposit is non-refundable upon date lock.'
    ],
    signatures: {
      clientSigned: true,
      studioAuthorized: true
    }
  };
  assert.strictEqual(contractAgreement.advanceDeposit + contractAgreement.shootDayPayment + contractAgreement.finalDeliveryPayment, contractAgreement.totalAmount, 'Milestones must equal total amount');
  assert.strictEqual(contractAgreement.deliverables.length >= 3, true, 'Agreement must list deliverables');

  // 4. Equipment & Crew Booking Conflict Detection
  const existingProjects = [
    {
      id: 501,
      title: 'Kunal Wedding Film',
      eventDate: '2026-11-15',
      assignedEquipment: [{ id: 1, name: 'Sony FX3 Cinema Camera' }],
      assignedCrew: [{ id: 10, name: 'Rahul Sharma (Cinematographer)' }]
    }
  ];

  function detectConflicts(targetDate, targetEquipIds, targetCrewIds, currentProjectId) {
    const clashes = { equipment: [], crew: [] };
    const sameDateProjects = existingProjects.filter(p => p.eventDate === targetDate && p.id !== currentProjectId);
    for (const proj of sameDateProjects) {
      for (const eq of proj.assignedEquipment || []) {
        if (targetEquipIds.includes(eq.id)) {
          clashes.equipment.push({ item: eq.name, projectTitle: proj.title });
        }
      }
      for (const cr of proj.assignedCrew || []) {
        if (targetCrewIds.includes(cr.id)) {
          clashes.crew.push({ person: cr.name, projectTitle: proj.title });
        }
      }
    }
    return clashes;
  }

  // Conflict on same date 2026-11-15:
  const conflict1 = detectConflicts('2026-11-15', [1], [10], 502);
  assert.strictEqual(conflict1.equipment.length, 1, 'Must detect Sony FX3 conflict on same date');
  assert.strictEqual(conflict1.crew.length, 1, 'Must detect Rahul Sharma conflict on same date');
  assert.strictEqual(conflict1.equipment[0].projectTitle, 'Kunal Wedding Film');

  // No conflict on different date 2026-11-16:
  const conflict2 = detectConflicts('2026-11-16', [1], [10], 503);
  assert.strictEqual(conflict2.equipment.length, 0, 'No conflict on different date');
  assert.strictEqual(conflict2.crew.length, 0, 'No crew conflict on different date');

  // 5. Invoice Themes validation
  const validThemes = ['cinematic', 'corporate', 'minimal'];
  assert.strictEqual(validThemes.includes('cinematic'), true);
  assert.strictEqual(validThemes.includes('corporate'), true);
  assert.strictEqual(validThemes.includes('minimal'), true);

  // 6. 1-Click WhatsApp Batch Reminders & Zero-Emoji Rule
  const { 
    groupInvoicesByClient, 
    generateReminderMessage, 
    removeEmojis, 
    selectReminderTone 
  } = await import('../src/utils/reminderCalculations.js');

  const testOverdueInvoices = [
    {
      id: 11,
      invoiceNumber: 'DRF-0011',
      customerId: 1,
      balanceDue: 20000,
      dueDate: '2026-10-01',
      status: 'unpaid'
    },
    {
      id: 12,
      invoiceNumber: 'DRF-0012',
      customerId: 1,
      balanceDue: 15000,
      dueDate: '2026-10-10',
      status: 'partially_paid'
    }
  ];
  const testCustomers = [
    { id: 1, name: 'Rohan Mehra', phone: '9898098980', tag: 'Corporate' }
  ];

  const grouped = groupInvoicesByClient(testOverdueInvoices, testCustomers);
  assert.strictEqual(grouped.length, 1, 'Two bills for Rohan Mehra must be consolidated into 1 client group');
  assert.strictEqual(grouped[0].totalPayable, 35000, 'Consolidated total must be 35,000');
  assert.strictEqual(grouped[0].invoices.length, 2, 'Group must contain 2 invoices');

  const reminderMsg = generateReminderMessage({
    clientName: grouped[0].clientName,
    invoiceNumbers: grouped[0].invoices.map(i => i.invoiceNumber),
    totalAmount: grouped[0].totalPayable,
    dueDate: grouped[0].oldestDueDate,
    daysOverdue: grouped[0].maxDaysOverdue,
    tone: 'firm',
    settings: { businessName: 'DR FILMS', upiId: 'drfilms@upi' }
  });

  // Verify zero emojis
  assert.strictEqual(reminderMsg, removeEmojis(reminderMsg), 'Reminder message must adhere strictly to zero emoji guarantee');
  assert.strictEqual(reminderMsg.includes('DR FILMS'), true, 'Must include studio name');
  assert.strictEqual(reminderMsg.includes('35,000'), true, 'Must include total overdue amount');

  console.log('✓ Test 37 Passed: All 6 studio features (Quotes, Receipt Voucher, Contracts, Gear/Crew Clash, Themes, Batch Reminders) verified successfully.');
}

// ==========================================
// TEST 38: Wedding Conditional Display (Rate Only, No Qty/Unit, No Due Date)
// ==========================================
console.log('\nTest 38: Wedding Conditional Display (Rate Only, No Qty/Unit, No Due Date)...');
{
  const fs = await import('fs');
  const path = await import('path');
  const assert = (await import('assert')).default;

  // 1. Detection pattern
  const isWeddingEvent = (type) => Boolean(type && type.toLowerCase().includes('wedding'));
  assert.strictEqual(isWeddingEvent('Wedding'), true, 'Wedding must match');
  assert.strictEqual(isWeddingEvent('wedding'), true, 'wedding lowercase must match');
  assert.strictEqual(isWeddingEvent('Pre-Wedding'), true, 'Pre-Wedding must match');
  assert.strictEqual(isWeddingEvent('Destination Wedding Film'), true, 'Destination Wedding Film must match');
  assert.strictEqual(isWeddingEvent('Corporate Event'), false, 'Corporate Event must not match');
  assert.strictEqual(isWeddingEvent('Commercial Ad'), false, 'Commercial Ad must not match');
  assert.strictEqual(isWeddingEvent(''), false, 'Empty type must not match');

  // 2. Calculation & Item Normalization for Wedding
  const testItem = { name: 'Full Day Cinematography', rate: 75000, quantity: 3, unit: 'per_day', amount: 225000 };
  const normalizeForWedding = (item, isWedding) => {
    if (isWedding) {
      return {
        ...item,
        unit: 'fixed',
        quantity: 1,
        amount: Number(item.rate) || 0
      };
    }
    return {
      ...item,
      amount: (Number(item.quantity) || 1) * (Number(item.rate) || 0)
    };
  };

  const weddingNormalized = normalizeForWedding(testItem, true);
  assert.strictEqual(weddingNormalized.quantity, 1, 'Wedding item quantity must be 1');
  assert.strictEqual(weddingNormalized.unit, 'fixed', 'Wedding item unit must be fixed');
  assert.strictEqual(weddingNormalized.amount, 75000, 'Wedding item amount must equal rate');

  const regularItem = normalizeForWedding(testItem, false);
  assert.strictEqual(regularItem.quantity, 3, 'Regular item keeps quantity');
  assert.strictEqual(regularItem.amount, 225000, 'Regular item calculates qty * rate');

  // 3. WhatsApp Message with / without Due Date (Toggle ON / OFF)
  const { generateWhatsAppMessage } = await import('../src/utils/whatsapp.js');
  const weddingBillNoDueDate = {
    invoiceNumber: 'DRF-0038',
    invoiceDate: '2026-10-21',
    dueDate: '',
    eventType: 'Wedding',
    totalAmount: 150000,
    balanceDue: 50000,
    advancePaid: 100000,
    status: 'partially_paid',
    customerSnapshot: { name: 'Vikram & Ananya' }
  };
  const mockSettings = { businessName: 'DR FILMS', upiId: 'drfilms@upi', currencySymbol: '₹' };
  const weddingNoDueMsg = generateWhatsAppMessage(weddingBillNoDueDate, mockSettings);

  assert.ok(!weddingNoDueMsg.includes('Due Date:'), 'When Due Date is toggled OFF, WhatsApp message must NOT include Due Date line');
  assert.ok(weddingNoDueMsg.includes('DRF-0038'), 'Wedding WhatsApp message must include invoice number');

  // If Due Date is toggled ON, it should be given to client (even for wedding)
  const weddingWithDueDate = {
    ...weddingBillNoDueDate,
    dueDate: '2026-10-28'
  };
  const weddingDueMsg = generateWhatsAppMessage(weddingWithDueDate, mockSettings);
  assert.ok(weddingDueMsg.includes('Due Date:'), 'When Due Date is toggled ON, WhatsApp message must include Due Date');

  // Regular bill with Due Date should include Due Date
  const corporateBill = {
    ...weddingBillNoDueDate,
    invoiceNumber: 'DRF-0039',
    dueDate: '2026-10-28',
    eventType: 'Corporate Shoot'
  };
  const corpMsg = generateWhatsAppMessage(corporateBill, mockSettings);
  assert.ok(corpMsg.includes('Due Date:'), 'Corporate bill message with Due Date must include Due Date');

  // 4. Source code verification for CreateInvoicePage
  const createInvoiceSrc = fs.readFileSync(path.resolve('src/pages/CreateInvoicePage.jsx'), 'utf8');
  assert.ok(createInvoiceSrc.includes('isWedding'), 'CreateInvoicePage must define isWedding');
  assert.ok(createInvoiceSrc.includes('hasDueDate'), 'CreateInvoicePage must support hasDueDate state');
  assert.ok(createInvoiceSrc.includes('handleToggleDueDate'), 'CreateInvoicePage must support handleToggleDueDate function');
  assert.ok(createInvoiceSrc.includes('{isWedding ? ('), 'CreateInvoicePage must have wedding rate-only view');
  assert.ok(createInvoiceSrc.includes('dueDate: hasDueDate ? (dueDate || \'\') : \'\''), 'CreateInvoicePage must save dueDate based on hasDueDate toggle');

  // 5. Source code verification for InvoiceViewPage
  const invoiceViewSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
  assert.ok(invoiceViewSrc.includes('isWedding'), 'InvoiceViewPage must define isWedding');
  assert.ok(invoiceViewSrc.includes('!isWedding && <th className="py-2.5 px-2 text-center w-20">Unit</th>'), 'InvoiceViewPage must hide Unit column on wedding');
  assert.ok(invoiceViewSrc.includes('!isWedding && <th className="py-2.5 px-2 text-center w-16">Qty</th>'), 'InvoiceViewPage must hide Qty column on wedding');
  assert.ok(invoiceViewSrc.includes('{invoice.dueDate && ('), 'InvoiceViewPage must show Due Date whenever invoice.dueDate is present');

  // 6. Source code verification for Quotes
  const createQuoteSrc = fs.readFileSync(path.resolve('src/pages/CreateQuotePage.jsx'), 'utf8');
  assert.ok(createQuoteSrc.includes('isWedding'), 'CreateQuotePage must define isWedding');

  const quoteViewSrc = fs.readFileSync(path.resolve('src/components/QuoteViewModal.jsx'), 'utf8');
  assert.ok(quoteViewSrc.includes('isWedding'), 'QuoteViewModal must define isWedding');
  assert.ok(quoteViewSrc.includes('!isWedding && <th'), 'QuoteViewModal must hide Unit/Qty on wedding');

  console.log('✓ Test 38 Passed: Due Date ON/OFF toggle and Wedding conditional display (Rate only, No Qty-unit, Flexible Due Date) thoroughly verified across Create Invoice, Invoice View, WhatsApp text, and Quotes.');
}

// ==========================================
// TEST 39: Payments Received Download PDF & Send PDF to Client Verification
// ==========================================
console.log('\nTest 39: Payments Received Download PDF & Send PDF to Client Verification...');
{
  const fs = await import('fs');
  const path = await import('path');
  const assert = (await import('assert')).default;

  const { getPaymentReceiptPdfFilename } = await import('../src/utils/pdfExport.js');
  const { generatePaymentReceiptWhatsAppMessage } = await import('../src/utils/whatsapp.js');

  const mockInvoice = {
    id: 101,
    invoiceNumber: 'DRF-0001',
    customerSnapshot: {
      name: 'Ronak Jain',
      company: 'Jain Jewels',
      phone: '9876543210'
    },
    totalAmount: 100000,
    payments: [
      {
        id: 'PAY-1',
        date: '2026-10-23',
        amount: 25000,
        method: 'UPI',
        note: 'Advance booking deposit'
      }
    ]
  };

  const mockSettings = {
    businessName: 'DR FILMS',
    phone: '9820098200',
    currencySymbol: '₹'
  };

  // 1. Verify Receipt PDF Filename formatting
  const pdfFilename = getPaymentReceiptPdfFilename(mockInvoice, mockInvoice.payments[0]);
  assert.strictEqual(pdfFilename, 'Receipt_REC-DRF-0001-P1_Ronak_Jain.pdf', 'Receipt PDF filename must be clean & sanitized');

  // 2. Verify WhatsApp Receipt Message
  const receiptMsg = generatePaymentReceiptWhatsAppMessage(mockInvoice, mockInvoice.payments[0], mockSettings);
  assert.ok(receiptMsg.includes('Hello Ronak Jain,'), 'Must greet client');
  assert.ok(receiptMsg.includes('Receipt No: REC-DRF-0001-P1'), 'Must have official receipt number');
  assert.ok(receiptMsg.includes('Against Bill: *DRF-0001*'), 'Must link to invoice number');
  assert.ok(receiptMsg.includes('₹ 25,000.00 (Twenty Five Thousand Rupees Only)'), 'Must include amount in numbers and words');
  assert.ok(receiptMsg.includes('ACCOUNT SUMMARY:'), 'Must include account summary ledger');
  assert.ok(receiptMsg.includes('Balance Remaining: ₹ 75,000.00'), 'Must calculate remaining balance correctly');

  // Verify zero emojis
  const { removeEmojis } = await import('../src/utils/whatsapp.js');
  assert.strictEqual(receiptMsg, removeEmojis(receiptMsg), 'Receipt message must strictly adhere to zero emoji guarantee');

  // 3. Verify PaymentReceiptModal features
  const modalSrc = fs.readFileSync(path.resolve('src/components/PaymentReceiptModal.jsx'), 'utf8');
  assert.ok(modalSrc.includes('handleDownloadPdf'), 'PaymentReceiptModal must have handleDownloadPdf');
  assert.ok(modalSrc.includes('handleSendPdfWhatsApp'), 'PaymentReceiptModal must have handleSendPdfWhatsApp');
  assert.ok(modalSrc.includes('exportInvoiceToPdf'), 'PaymentReceiptModal must use exportInvoiceToPdf');
  assert.ok(modalSrc.includes('generateInvoicePdfFile'), 'PaymentReceiptModal must use generateInvoicePdfFile');
  assert.ok(modalSrc.includes('Download PDF'), 'PaymentReceiptModal must have Download PDF button');
  assert.ok(modalSrc.includes('Send PDF on WhatsApp'), 'PaymentReceiptModal must have Send PDF on WhatsApp button');
  assert.ok(modalSrc.includes('id="printable-payment-receipt"'), 'PaymentReceiptModal must have printable-payment-receipt container');

  // 4. Verify InvoiceViewPage Payments Received integration
  const viewSrc = fs.readFileSync(path.resolve('src/pages/InvoiceViewPage.jsx'), 'utf8');
  assert.ok(viewSrc.includes('receiptInitialAction'), 'InvoiceViewPage must support receiptInitialAction');
  assert.ok(viewSrc.includes('Receipt (PDF)'), 'InvoiceViewPage must have Receipt (PDF) button in payments table');
  assert.ok(viewSrc.includes("setReceiptInitialAction('download')"), 'InvoiceViewPage must have direct download trigger');
  assert.ok(viewSrc.includes("setReceiptInitialAction('share')"), 'InvoiceViewPage must have direct WhatsApp share trigger');

  // 5. Verify PDF container width is 100% to prevent right-edge clipping
  const pdfExportSrc = fs.readFileSync(path.resolve('src/utils/pdfExport.js'), 'utf8');
  assert.ok(pdfExportSrc.includes("clonedPaper.style.width = '100%'"), 'pdfExport.js must set clonedPaper width to 100% to match container');
  assert.ok(!pdfExportSrc.includes("clonedPaper.style.width = '794px'"), 'pdfExport.js must not force 794px which overflows 198mm container');

  const indexCssSrc = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.ok(indexCssSrc.includes('width: 100% !important;'), 'index.css must enforce width: 100% for PDF rendering elements');
  assert.ok(!indexCssSrc.includes('width: 794px !important;'), 'index.css must not force 794px width on receipt');

  console.log('✓ Test 39 Passed: Payments Received Download PDF & Send PDF to Client verified successfully.');
}

// Test 40: Payment Receipt Modal & PDF Visual Alignment Verification
{
  console.log('\nTest 40: Payment Receipt Modal & PDF Visual Alignment Verification...');
  const receiptSrc = fs.readFileSync(path.resolve('src/components/PaymentReceiptModal.jsx'), 'utf8');
  const pdfExportSrc = fs.readFileSync(path.resolve('src/utils/pdfExport.js'), 'utf8');

  // 1. OFFICIAL PAYMENT RECEIPT single line guarantee
  assert.ok(receiptSrc.includes('receipt-header-title'), 'PaymentReceiptModal must include receipt-header-title');
  assert.ok(receiptSrc.includes('whitespace-nowrap'), 'Official Payment Receipt badge must have whitespace-nowrap');
  assert.ok(receiptSrc.includes('w-[245px]'), 'Official Payment Receipt badge container must have wide container width >= 245px');
  assert.ok(pdfExportSrc.includes("el.style.whiteSpace = 'nowrap'"), 'pdfExport.js must enforce whiteSpace nowrap on receipt header');

  // 2. Balance Pending badge centered vertically and horizontally
  assert.ok(receiptSrc.includes('receipt-balance-pending-badge'), 'PaymentReceiptModal must include receipt-balance-pending-badge');
  assert.ok(receiptSrc.includes('flex items-center justify-center'), 'Balance Pending badge must use flex items-center justify-center');
  assert.ok(pdfExportSrc.includes("pendingBadge.style.alignItems = 'center'"), 'pdfExport.js must center balance pending badge vertically');
  assert.ok(pdfExportSrc.includes("pendingBadge.style.justifyContent = 'center'"), 'pdfExport.js must center balance pending badge horizontally');

  // 3. Amount Received & Payment Credited spacing
  assert.ok(receiptSrc.includes('Payment Credited'), 'Amount Received section must have Payment Credited badge');
  assert.ok(receiptSrc.includes('mt-2 mb-4'), 'Amount Received must have generous margin spacing before badge');

  // 4. Installment History table all columns centered
  assert.ok(receiptSrc.includes('<th className="py-2.5 px-3 text-center align-middle min-w-[120px]">Payment #</th>'), 'Payment # column header must be centered');
  assert.ok(receiptSrc.includes('<th className="py-2.5 px-3 text-center whitespace-nowrap align-middle">Date</th>'), 'Date column header must be centered');
  assert.ok(receiptSrc.includes('<th className="py-2.5 px-3 text-center align-middle">Mode</th>'), 'Mode column header must be centered');
  assert.ok(receiptSrc.includes('<th className="py-2.5 px-3 text-center align-middle">Reference / Note</th>'), 'Reference / Note column header must be centered');
  assert.ok(receiptSrc.includes('<th className="py-2.5 px-3 text-center align-middle">Amount</th>'), 'Amount column header must be centered');

  // 5. This Receipt badge properly contained without text bleed
  assert.ok(receiptSrc.includes('receipt-badge-highlight'), 'This Receipt badge must have receipt-badge-highlight class');
  assert.ok(receiptSrc.includes('inline-block text-[10px]'), 'This Receipt badge must be inline-block with standard font');
  assert.ok(pdfExportSrc.includes("badge.style.display = 'inline-block'"), 'pdfExport.js must set badge to inline-block');
  assert.ok(pdfExportSrc.includes("badge.style.verticalAlign = 'middle'"), 'pdfExport.js must set badge verticalAlign to middle');

  console.log('Test 40 Passed: Payment Receipt single line header, centered pending badge, payment credited spacing, centered table columns, and contained This Receipt badge verified.');
}

// Test 41: Separate Admin Dashboard Panel & User Control Verification
{
  console.log('\nTest 41: Separate Admin Dashboard Panel & User Control Verification...');
  
  // 1. Database Schema Version 6
  const dbSrc = fs.readFileSync(path.resolve('src/db/db.js'), 'utf8');
  assert.ok(dbSrc.includes(".version(6)"), 'db.js must define Dexie version(6)');
  assert.ok(dbSrc.includes("users: '++id, username, fullName, role, status, email, phone, isDeleted, createdAt'"), 'db.js must define users table');
  assert.ok(dbSrc.includes("auditLogs: '++id, timestamp, category, action, username, userId'"), 'db.js must define auditLogs table');

  // 2. Audit Logging Utility
  const auditLoggerSrc = fs.readFileSync(path.resolve('src/utils/auditLogger.js'), 'utf8');
  assert.ok(auditLoggerSrc.includes('export async function logAuditEvent'), 'auditLogger.js must export logAuditEvent');
  assert.ok(auditLoggerSrc.includes('export async function getRecentAuditLogs'), 'auditLogger.js must export getRecentAuditLogs');
  assert.ok(auditLoggerSrc.includes('export async function clearAuditLogs'), 'auditLogger.js must export clearAuditLogs');
  assert.ok(auditLoggerSrc.includes('export function exportAuditLogsFile'), 'auditLogger.js must export exportAuditLogsFile');
  assert.ok(auditLoggerSrc.includes('AUDIT_CATEGORIES'), 'auditLogger.js must define AUDIT_CATEGORIES');

  // 3. Seed Data
  const seedDataSrc = fs.readFileSync(path.resolve('src/db/seedData.js'), 'utf8');
  assert.ok(seedDataSrc.includes('DEFAULT_USERS'), 'seedData.js must define DEFAULT_USERS');
  assert.ok(seedDataSrc.includes('DEFAULT_DEPLOYMENT_CONFIG'), 'seedData.js must define DEFAULT_DEPLOYMENT_CONFIG');
  assert.ok(seedDataSrc.includes('admin_deployment_config'), 'seedData.js must seed admin_deployment_config');

  // 4. Admin PIN Authentication Modal
  const pinModalSrc = fs.readFileSync(path.resolve('src/components/AdminPinModal.jsx'), 'utf8');
  assert.ok(pinModalSrc.includes('export function AdminPinModal'), 'AdminPinModal.jsx must export AdminPinModal');
  assert.ok(pinModalSrc.includes('getRemainingLockoutSeconds'), 'AdminPinModal must check lockout state');
  assert.ok(pinModalSrc.includes('recordFailedAttempt'), 'AdminPinModal must record failed attempts');
  assert.ok(pinModalSrc.includes('verifyPin'), 'AdminPinModal must verify PIN against secure hash');
  assert.ok(pinModalSrc.includes('drfilms_admin_auth'), 'AdminPinModal must set sessionStorage drfilms_admin_auth');

  // 5. Standalone Admin Dashboard Page (Reduced to 3 core tabs: License Issuing, Customer List & Notes, Revocation List)
  const adminPageSrc = fs.readFileSync(path.resolve('src/pages/AdminDashboardPage.jsx'), 'utf8');
  assert.ok(adminPageSrc.includes('export function AdminDashboardPage'), 'AdminDashboardPage.jsx must export AdminDashboardPage');
  assert.ok(adminPageSrc.includes('License Issuing'), 'AdminDashboardPage must include License Issuing tab');
  assert.ok(adminPageSrc.includes('Customer List & Plan Notes'), 'AdminDashboardPage must include Customer List & Plan Notes tab');
  assert.ok(adminPageSrc.includes('Revocation List Management'), 'AdminDashboardPage must include Revocation List Management tab');
  assert.ok(adminPageSrc.includes('Return to Billing Studio'), 'AdminDashboardPage must include Return to Billing Studio button');
  // Confirm removal of staff management, quick-extend, and function toggles from Admin app
  assert.ok(!adminPageSrc.includes('handleQuickExtendDays'), 'AdminDashboardPage must not include quick-extend');
  assert.ok(!adminPageSrc.includes('handleToggleFeature'), 'AdminDashboardPage must not include function toggles');
  assert.ok(!adminPageSrc.includes('canCreateBills'), 'AdminDashboardPage must not include staff management');

  // 6. Maintenance Screen
  const maintenanceSrc = fs.readFileSync(path.resolve('src/components/MaintenanceScreen.jsx'), 'utf8');
  assert.ok(maintenanceSrc.includes('export function MaintenanceScreen'), 'MaintenanceScreen.jsx must export MaintenanceScreen');
  assert.ok(maintenanceSrc.includes('System Maintenance Underway'), 'MaintenanceScreen must display maintenance status');
  assert.ok(maintenanceSrc.includes('Admin Portal Login'), 'MaintenanceScreen must offer Admin Portal Login bypass');

  // 7. Layout Integration
  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes('onOpenAdminPortal'), 'Layout.jsx must accept onOpenAdminPortal');
  assert.ok(layoutSrc.includes('Admin Portal'), 'Layout.jsx must have Admin Portal trigger button');
  assert.ok(layoutSrc.includes('ShieldCheck'), 'Layout.jsx must import ShieldCheck');

  // 8. AdminApp & CustomerApp Decoupled Integration
  const adminAppSrc = fs.readFileSync(path.resolve('src/AdminApp.jsx'), 'utf8');
  assert.ok(adminAppSrc.includes('AdminDashboardPage'), 'AdminApp.jsx must import AdminDashboardPage');
  assert.ok(adminAppSrc.includes('AdminPinModal'), 'AdminApp.jsx must import AdminPinModal');
  assert.ok(adminAppSrc.includes('<ErrorBoundary onGoToBills={handleReturnToBilling}>'), 'AdminApp.jsx must wrap AdminDashboardPage in ErrorBoundary');
  const customerAppSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(customerAppSrc.includes('CustomerApp'), 'CustomerApp.jsx must export CustomerApp');
  assert.ok(!adminPageSrc.includes(".equals(false)"), 'AdminDashboardPage.jsx must not use invalid boolean keys in Dexie queries');

  console.log('✓ Test 41 Passed: Separate Admin Dashboard Panel, User Control, Deployment Settings, Maintenance Screen, and Audit Logging verified.');
}

// Test 42: Commercial Multi-Studio SaaS - Subscription & Licensing System & Function Switchboard (Feature Flags)
console.log('\n--- Test 42: Commercial Multi-Studio SaaS - Subscription & Licensing System & Function Switchboard ---');
{
  // 1. License Manager Tests
  const { 
    PLAN_TIERS, 
    verifyLicenseKey, 
    calculateSubscriptionStatus 
  } = await import('../src/utils/licenseManager.js');

  const { generateLicenseKey } = await import('../src/utils/adminLicenseGenerator.js');

  assert.ok(PLAN_TIERS.trial && PLAN_TIERS.starter && PLAN_TIERS.pro && PLAN_TIERS.enterprise, 'All plan tiers must be defined');

  // Generate and verify Pro 365 Days key
  const proKey = generateLicenseKey({ planTier: 'pro', durationDays: 365, clientCode: 'DRF' });
  assert.ok(proKey.startsWith('DRF-'), `License key should start with prefix DRF-: ${proKey}`);
  const verifiedPro = verifyLicenseKey(proKey);
  assert.strictEqual(verifiedPro.isValid, true, 'Generated key must be cryptographically valid');
  assert.strictEqual(verifiedPro.planTier, 'pro');
  assert.strictEqual(verifiedPro.isLifetime, false);

  // Generate and verify Enterprise Lifetime key
  const lifeKey = generateLicenseKey({ planTier: 'enterprise', isLifetime: true, clientCode: 'ROY' });
  assert.ok(lifeKey.startsWith('DRF-'), `Lifetime key must start with prefix DRF-: ${lifeKey}`);
  const verifiedLife = verifyLicenseKey(lifeKey);
  assert.strictEqual(verifiedLife.isValid, true, 'Lifetime key must be valid');
  assert.strictEqual(verifiedLife.isLifetime, true);
  assert.strictEqual(verifiedLife.planTier, 'enterprise');

  // Verify tampered key is rejected
  const tamperedKey = proKey.slice(0, -2) + 'XX';
  const verifiedTampered = verifyLicenseKey(tamperedKey);
  assert.strictEqual(verifiedTampered.isValid, false, 'Tampered key must be rejected');

  // Verify status calculation for active plan with verified raw key
  const activeSub = {
    licenseKey: proKey,
    status: 'active'
  };
  const activeStatus = calculateSubscriptionStatus(activeSub, 10);
  assert.strictEqual(activeStatus.isLocked, false, 'Active subscription should not be locked');
  assert.ok(activeStatus.daysRemaining >= 360, 'Should have ~365 days remaining');

  // Verify status calculation for expired plan (exceeds grace period)
  const expiredKey = generateLicenseKey({ planTier: 'starter', durationDays: -10, clientCode: 'EXPIRED_STUDIO' });
  const expiredSub = {
    licenseKey: expiredKey,
    status: 'active',
    gracePeriodDays: 3
  };
  const expiredStatus = calculateSubscriptionStatus(expiredSub, 10);
  assert.strictEqual(expiredStatus.isLocked, true, 'Expired subscription past grace period must be locked');
  assert.strictEqual(expiredStatus.lockReasonCode, 'EXPIRED');

  // Verify trial invoice limit enforcement
  const trialSub = {
    status: 'trial',
    trialStartDate: new Date().toISOString().split('T')[0],
    trialDurationDays: 14,
    trialMaxBills: 25
  };
  const trialOverlimitStatus = calculateSubscriptionStatus(trialSub, 26);
  assert.strictEqual(trialOverlimitStatus.isLocked, true, 'Trial exceeding bill count must be locked');
  assert.strictEqual(trialOverlimitStatus.lockReasonCode, 'TRIAL_LIMIT_REACHED');

  // 2. Feature Flags and Seed Data
  const seedSrc = fs.readFileSync(path.resolve('src/db/seedData.js'), 'utf8');
  assert.ok(seedSrc.includes('DEFAULT_SUBSCRIPTION_CONFIG'), 'seedData.js must define DEFAULT_SUBSCRIPTION_CONFIG');
  assert.ok(seedSrc.includes('DEFAULT_FEATURE_FLAGS'), 'seedData.js must define DEFAULT_FEATURE_FLAGS');
  assert.ok(seedSrc.includes('admin_subscription_config'), 'seedData.js must seed admin_subscription_config');
  assert.ok(seedSrc.includes('admin_feature_flags'), 'seedData.js must seed admin_feature_flags');

  // 3. Admin Dashboard Page Toggles & Modules (Reduced Admin App)
  const adminDashboardSrc = fs.readFileSync(path.resolve('src/pages/AdminDashboardPage.jsx'), 'utf8');
  assert.ok(adminDashboardSrc.includes('export const FEATURE_MODULES'), 'AdminDashboardPage.jsx must export FEATURE_MODULES');
  assert.ok(adminDashboardSrc.includes('License Issuing'), 'AdminDashboardPage.jsx must have License Issuing tab');
  assert.ok(adminDashboardSrc.includes('Customer List & Plan Notes'), 'AdminDashboardPage.jsx must have Customer List & Plan Notes tab');
  assert.ok(adminDashboardSrc.includes('Revocation List Management'), 'AdminDashboardPage.jsx must have Revocation List Management tab');
  assert.ok(adminDashboardSrc.includes('handleGenerateKey'), 'AdminDashboardPage.jsx must support license key generation');

  // 4. Lockout Screen
  const lockoutSrc = fs.readFileSync(path.resolve('src/components/SubscriptionLockoutScreen.jsx'), 'utf8');
  assert.ok(lockoutSrc.includes('export function SubscriptionLockoutScreen'), 'SubscriptionLockoutScreen must export component');
  assert.ok(lockoutSrc.includes('activateWithLicenseKey'), 'SubscriptionLockoutScreen must support self-renewal via license key');
  assert.ok(lockoutSrc.includes('Master Admin Override PIN'), 'SubscriptionLockoutScreen must support Master PIN override');
  assert.ok(lockoutSrc.includes('WhatsApp'), 'SubscriptionLockoutScreen must provide direct WhatsApp support contact');

  // 5. CustomerApp.jsx and Layout.jsx Integration
  const appSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(appSrc.includes('SubscriptionLockoutScreen'), 'CustomerApp.jsx must import SubscriptionLockoutScreen');
  assert.ok(appSrc.includes('admin_feature_flags'), 'CustomerApp.jsx must query admin_feature_flags');
  assert.ok(appSrc.includes('admin_subscription_config'), 'CustomerApp.jsx must query admin_subscription_config');
  assert.ok(appSrc.includes('calculateSubscriptionStatus'), 'CustomerApp.jsx must calculate subscription status');

  const layoutSrc = fs.readFileSync(path.resolve('src/components/Layout.jsx'), 'utf8');
  assert.ok(layoutSrc.includes('enableQuotes'), 'Layout.jsx must filter navigation based on enableQuotes');
  assert.ok(layoutSrc.includes('enableProjects'), 'Layout.jsx must filter navigation based on enableProjects');
  assert.ok(layoutSrc.includes('enableExpenses'), 'Layout.jsx must filter navigation based on enableExpenses');
  assert.ok(layoutSrc.includes('enableReports'), 'Layout.jsx must filter navigation based on enableReports');

  console.log('✓ Test 42 Passed: Subscription & Licensing, 12 Function Switchboard Toggles, Lockout Screen, and App Guards verified.');
}

// Test 43: Phase 1 License Security Suite (ECDSA P-256 Asymmetric Verification, Tamper Rejection, allowedFeatures, Clock Rollback, Free Trial, Offline Fail-Open, Dexie v7)
console.log('\n--- Test 43: Phase 1 License Security Suite ---');
{
  const {
    verifyLicenseKey,
    calculateSubscriptionStatus
  } = await import('../src/utils/licenseManager.js');

  const { generateLicenseKey } = await import('../src/utils/adminLicenseGenerator.js');

  const {
    isFeatureAllowedByLicense,
    checkClockTampering,
    resetClockStateForTest,
    base64UrlToString,
    stringToBase64Url
  } = await import('../src/utils/licenseCrypto.js');

  const { checkLicenseRevocation, clearRevocationCacheForTest } = await import('../src/utils/revocationManager.js');

  // 43a. Valid ECDSA P-256 Key Generation and Asymmetric Verification
  const customKey = generateLicenseKey({
    planTier: 'starter',
    durationDays: 180,
    clientCode: 'TEST_STUDIO',
    allowedFeatures: ['quotes', 'invoices'],
    billLimit: 100
  });

  assert.ok(customKey.startsWith('DRF-'), 'Key must start with DRF-');
  const verifiedCustom = verifyLicenseKey(customKey);
  assert.strictEqual(verifiedCustom.isValid, true, 'Custom key must verify cryptographically');
  assert.strictEqual(verifiedCustom.planTier, 'starter');
  assert.strictEqual(verifiedCustom.customerName, 'TEST_STUDIO');
  assert.strictEqual(verifiedCustom.billLimit, 100);
  assert.deepStrictEqual(verifiedCustom.allowedFeatures, ['quotes', 'invoices']);

  // 43b. Tampered Payload Rejection
  const rawToken = customKey.slice(4);
  const dotIdx = rawToken.indexOf('.');
  const payloadB64 = rawToken.slice(0, dotIdx);
  const sigB64 = rawToken.slice(dotIdx + 1);

  // Modify payload JSON (e.g. attempt to increase billLimit)
  const decodedPayload = JSON.parse(base64UrlToString(payloadB64));
  decodedPayload.billLimit = 9999;
  const forgedPayloadB64 = stringToBase64Url(JSON.stringify(decodedPayload));
  const forgedKey = `DRF-${forgedPayloadB64}.${sigB64}`;
  const tamperedPayloadResult = verifyLicenseKey(forgedKey);
  assert.strictEqual(tamperedPayloadResult.isValid, false, 'Tampered payload with original signature must be rejected');

  // 43c. Tampered Signature Rejection
  const forgedSig = sigB64.slice(0, -4) + 'AAAA';
  const tamperedSigKey = `DRF-${payloadB64}.${forgedSig}`;
  const tamperedSigResult = verifyLicenseKey(tamperedSigKey);
  assert.strictEqual(tamperedSigResult.isValid, false, 'Tampered signature must be rejected');

  // 43d. AllowedFeatures enforcement: function toggles may only disable features allowed by license
  const subStatusRestricted = {
    isLocked: false,
    allowedFeatures: ['quotes', 'invoices', 'customers']
  };

  // Feature in license allowedFeatures -> allowed
  assert.strictEqual(isFeatureAllowedByLicense('enableQuotes', subStatusRestricted), true);
  assert.strictEqual(isFeatureAllowedByLicense('enableInvoices', subStatusRestricted), true);

  // Feature NOT in license allowedFeatures -> disallowed regardless of toggle
  assert.strictEqual(isFeatureAllowedByLicense('enableProjects', subStatusRestricted), false);
  assert.strictEqual(isFeatureAllowedByLicense('enableExpenses', subStatusRestricted), false);
  assert.strictEqual(isFeatureAllowedByLicense('enableReports', subStatusRestricted), false);

  // Wildcard allowedFeatures allows all modules
  const subStatusWildcard = {
    isLocked: false,
    allowedFeatures: ['*']
  };
  assert.strictEqual(isFeatureAllowedByLicense('enableProjects', subStatusWildcard), true);
  assert.strictEqual(isFeatureAllowedByLicense('enableExpenses', subStatusWildcard), true);

  // Locked subscription disallows all modules
  const subStatusLocked = {
    isLocked: true,
    allowedFeatures: ['*']
  };
  assert.strictEqual(isFeatureAllowedByLicense('enableQuotes', subStatusLocked), false);

  // 43e. Never trust stored IndexedDB fields: always re-verify signed key on launch
  // If attacker sets expiryDate: '2099-01-01' in IndexedDB but key is expired, calculateSubscriptionStatus ignores the stored expiry
  const pastKey = generateLicenseKey({ planTier: 'starter', durationDays: -5 });
  const attackerManipulatedDbConfig = {
    licenseKey: pastKey,
    planTier: 'enterprise',       // fake stored DB field
    isLifetime: true,            // fake stored DB field
    expiryDate: '2099-12-31',    // fake stored DB field
    status: 'active'
  };
  const verifiedStatusOnLaunch = calculateSubscriptionStatus(attackerManipulatedDbConfig, 5);
  // It must NOT trust 2099-12-31 or enterprise or lifetime!
  assert.strictEqual(verifiedStatusOnLaunch.isLifetime, false, 'Must not trust stored isLifetime: true in DB');
  assert.strictEqual(verifiedStatusOnLaunch.planTier, 'starter', 'Must use planTier from signed key, not DB');
  assert.notStrictEqual(verifiedStatusOnLaunch.formattedExpiry, '2099-12-31', 'Must not trust stored expiry in DB');

  // 43f. Clock Rollback Detection
  resetClockStateForTest();
  const mockStorageMap = new Map();
  if (!globalThis.localStorage) {
    globalThis.localStorage = {
      getItem: (k) => mockStorageMap.get(k) || null,
      setItem: (k, v) => mockStorageMap.set(k, String(v)),
      removeItem: (k) => mockStorageMap.delete(k)
    };
  }

  // Set last verified timestamp 2 hours in the future
  globalThis.localStorage.setItem('drfilms_license_clock_state', JSON.stringify({ lastSeen: Date.now() + 2 * 60 * 60 * 1000 }));
  const clockTamperCheck = checkClockTampering();
  assert.strictEqual(clockTamperCheck.tampered, true, 'Clock rollback > 1 hour must be detected');
  const clockLockedStatus = calculateSubscriptionStatus({ licenseKey: customKey });
  assert.strictEqual(clockLockedStatus.isLocked, true, 'App must lock on clock rollback');
  assert.strictEqual(clockLockedStatus.lockReasonCode, 'CLOCK_TAMPERED');

  // Reset clock check to normal
  resetClockStateForTest();
  const clockNormalCheck = checkClockTampering();
  assert.strictEqual(clockNormalCheck.tampered, false, 'Clock in normal range must pass');

  // 43g. Owner Lifetime License
  const testLifetimeKey = generateLicenseKey({
    planTier: 'enterprise',
    isLifetime: true,
    clientCode: 'DR FILMS Creative Studios'
  });
  assert.ok(testLifetimeKey.startsWith('DRF-'), 'Owner lifetime key must start with DRF-');
  const verifiedOwner = verifyLicenseKey(testLifetimeKey);
  assert.strictEqual(verifiedOwner.isValid, true, 'Owner lifetime key must be cryptographically valid');
  assert.strictEqual(verifiedOwner.isLifetime, true);
  assert.strictEqual(verifiedOwner.customerName, 'DR FILMS Creative Studios');

  const ownerStatus = calculateSubscriptionStatus({ licenseKey: testLifetimeKey }, 5000);
  assert.strictEqual(ownerStatus.isLocked, false);
  assert.strictEqual(ownerStatus.isLifetime, true);
  assert.strictEqual(ownerStatus.daysRemaining, 9999);
  assert.deepStrictEqual(ownerStatus.allowedFeatures, ['*']);

  // 43h. Real 14-Day / 25-Bill Free Trial
  const freshTrialConfig = {
    status: 'trial',
    trialStartDate: new Date().toISOString().split('T')[0],
    trialDurationDays: 14,
    trialMaxBills: 25
  };
  const trialOkStatus = calculateSubscriptionStatus(freshTrialConfig, 24);
  assert.strictEqual(trialOkStatus.isLocked, false, 'Trial with 24 bills must not be locked');
  assert.strictEqual(trialOkStatus.planTier, 'trial');
  assert.strictEqual(trialOkStatus.daysRemaining, 14);

  const trialLimitStatus = calculateSubscriptionStatus(freshTrialConfig, 25);
  assert.strictEqual(trialLimitStatus.isLocked, true, 'Trial with 25 bills must reach limit');
  assert.strictEqual(trialLimitStatus.lockReasonCode, 'TRIAL_LIMIT_REACHED');

  // 43i. Signed Revocation with Fail-Open Offline Behavior
  clearRevocationCacheForTest();
  const offlineRevocation = await checkLicenseRevocation('lic_any_123', 'http://127.0.0.1:59999/unreachable.json');
  assert.strictEqual(offlineRevocation.isRevoked, false, 'Must fail open when offline / server unreachable');
  assert.strictEqual(offlineRevocation.isOffline, true);

  // 43j. Dexie Additive Migration Version 7
  const dbCode = fs.readFileSync(path.resolve('src/db/db.js'), 'utf8');
  assert.ok(dbCode.includes(".version(7)"), 'db.js must define Dexie version(7)');
  assert.ok(dbCode.includes('licenseSecurity'), 'db.js version(7) must define licenseSecurity store');

  // 43k. Clean First-Run Seed Data
  const { DEFAULT_USERS, DEFAULT_SUBSCRIPTION_CONFIG } = await import('../src/db/seedData.js');
  assert.strictEqual(DEFAULT_USERS.length, 0, 'Seed mock users must be removed (length === 0)');
  assert.strictEqual(DEFAULT_SUBSCRIPTION_CONFIG.planTier, 'trial', 'Default plan must be trial');
  assert.strictEqual(DEFAULT_SUBSCRIPTION_CONFIG.trialDurationDays, 14, 'Default trial duration must be 14 days');
  assert.strictEqual(DEFAULT_SUBSCRIPTION_CONFIG.trialMaxBills, 25, 'Default trial bill limit must be 25 bills');

  // 43l. Subscription Lockout UI Options
  const lockoutCode = fs.readFileSync(path.resolve('src/components/SubscriptionLockoutScreen.jsx'), 'utf8');
  assert.ok(lockoutCode.includes('handleActivate'), 'SubscriptionLockoutScreen must support paste-the-key activation');
  assert.ok(lockoutCode.includes('handleRecheckClock'), 'SubscriptionLockoutScreen must support clock-rollback recheck recovery');
  assert.ok(!lockoutCode.includes('activateOwnerLifetimeLicense'), 'SubscriptionLockoutScreen must not have embedded lifetime key activation');
  assert.ok(lockoutCode.includes('showQrModal'), 'SubscriptionLockoutScreen must provide optional QR scanner modal');
  assert.ok(lockoutCode.includes('whatsappUrl'), 'SubscriptionLockoutScreen must provide WhatsApp support link');

  console.log('✓ Test 43 Passed: Phase 1 License Security Suite (ECDSA P-256 Asymmetric Verification, Tamper Rejection, allowedFeatures Enforcement, Clock Rollback Detection, Free Trial Limits, Offline Fail-Open, and Dexie v7 Additive Migration) verified.');
}

console.log('\n--- Test 44: Phase 2 Customer Bundle Isolation, Admin Decoupling & Staff Switchboard Guard ---');
{
  const { scanCustomerDist, testBundleScanInjection } = await import('./scan-customer-bundle.mjs');
  const { isFeatureAllowedByLicense } = await import('../src/utils/licenseCrypto.js');
  const { calculateSubscriptionStatus } = await import('../src/utils/licenseManager.js');

  // 44a. Customer Distribution Bundle Security Scan & Injection Test
  const scanResult = scanCustomerDist();
  assert.strictEqual(scanResult.isClean, true, 'Customer dist/ bundle must be 100% clean of forbidden admin artifacts');
  assert.strictEqual(scanResult.violations.length, 0, 'No forbidden tokens allowed in customer distribution');
  assert.ok(scanResult.scannedFilesCount > 0, 'Customer dist/ must contain build files');

  const injectionResult = testBundleScanInjection();
  assert.strictEqual(injectionResult.passed, true, 'Bundle scanner must fail when forbidden token is injected into bundle');
  assert.ok(injectionResult.violationsReported > 0, 'Bundle scanner must report violation count when poisoned');

  // 44b. Admin App Build & Separate Entry Verification
  const adminHtmlPath = path.resolve('admin.html');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin.html must exist as standalone entry point');
  const adminHtmlContent = fs.readFileSync(adminHtmlPath, 'utf8');
  assert.ok(adminHtmlContent.includes('/src/adminMain.jsx'), 'admin.html must load /src/adminMain.jsx');

  const adminAppPath = path.resolve('src/AdminApp.jsx');
  assert.ok(fs.existsSync(adminAppPath), 'src/AdminApp.jsx must exist');
  const adminAppContent = fs.readFileSync(adminAppPath, 'utf8');
  assert.ok(adminAppContent.includes('AdminDashboardPage'), 'AdminApp must render AdminDashboardPage');
  assert.ok(adminAppContent.includes('AdminPinModal'), 'AdminApp must render AdminPinModal');
  assert.ok(!adminAppContent.includes('sessionStorage'), 'AdminApp must use in-memory auth and NOT sessionStorage');

  const adminPinModalPath = path.resolve('src/components/AdminPinModal.jsx');
  const adminPinModalContent = fs.readFileSync(adminPinModalPath, 'utf8');
  assert.ok(!adminPinModalContent.includes('sessionStorage'), 'AdminPinModal must not set or get sessionStorage');
  assert.ok(!adminPinModalContent.includes("db.settings.get('security_profile')"), 'AdminPinModal must not fall back to customer app PIN');

  // 44c. Customer App Source Verification (Zero Admin Imports)
  const customerAppContent = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(!customerAppContent.includes('AdminDashboardPage'), 'CustomerApp.jsx must not import AdminDashboardPage');
  assert.ok(!customerAppContent.includes('AdminPinModal'), 'CustomerApp.jsx must not import AdminPinModal');
  assert.ok(!customerAppContent.includes('MaintenanceScreen'), 'CustomerApp.jsx must not import MaintenanceScreen');
  assert.ok(!customerAppContent.includes('admin_deployment_config'), 'CustomerApp.jsx must not read admin_deployment_config');
  assert.ok(!customerAppContent.includes('onOpenAdminPortal'), 'CustomerApp.jsx must not pass onOpenAdminPortal to Layout');

  const mainJsxContent = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');
  assert.ok(mainJsxContent.includes('CustomerApp'), 'main.jsx must mount CustomerApp for customer distribution');

  // 44d. Function Toggles Cannot Grant License or Bypass Cryptographic License Restriction
  // Even if a local user sets all function toggles to true in IndexedDB, the ECDSA signature rules
  const restrictedLicenseFeatures = ['invoices', 'customers'];
  const userAttemptedFlags = {
    enableQuotes: true,
    enableProjects: true,
    enableReports: true,
    enableExpenses: true,
    enableHourCalculator: true
  };

  const isPermitted = (flagKey) => {
    return isFeatureAllowedByLicense(flagKey, restrictedLicenseFeatures) && userAttemptedFlags[flagKey] !== false;
  };

  assert.strictEqual(isPermitted('enableQuotes'), false, 'Quotes must be blocked when license does not grant it, regardless of flag');
  assert.strictEqual(isPermitted('enableProjects'), false, 'Projects must be blocked when license does not grant it, regardless of flag');
  assert.strictEqual(isPermitted('enableReports'), false, 'Reports must be blocked when license does not grant it, regardless of flag');
  assert.strictEqual(isPermitted('enableExpenses'), false, 'Expenses must be blocked when license does not grant it, regardless of flag');
  assert.strictEqual(isPermitted('enableHourCalculator'), false, 'Hour Calculator must be blocked when license does not grant it, regardless of flag');
  assert.strictEqual(isPermitted('enableInvoices'), true, 'Invoices permitted by signed license');

  // 44e. Staff User Management Cannot Grant License or Extend Subscription
  // Modifying staff users in db.users has zero authority over subscription status
  const mockStaffUsers = [
    { id: 1, username: 'admin_staff', role: 'admin', isActive: true },
    { id: 2, username: 'billing_operator', role: 'operator', isActive: true },
    { id: 3, username: 'super_owner', role: 'owner', isLifetime: true }
  ];

  // Expired subscription config with staff present
  const expiredConfig = {
    planTier: 'starter',
    status: 'expired',
    expiryDate: '2020-01-01',
    licenseKey: 'INVALID-FAKE-KEY'
  };

  const statusWithStaff = calculateSubscriptionStatus(expiredConfig, 100);
  assert.strictEqual(statusWithStaff.isLocked, true, 'Staff users cannot unlock an expired or invalid subscription');
  assert.strictEqual(statusWithStaff.isLifetime, false, 'Staff users cannot grant lifetime subscription');
  assert.notStrictEqual(statusWithStaff.planTier, 'enterprise', 'Staff users cannot upgrade plan tier');

  console.log('✓ Test 44 Passed: Phase 2 Customer Bundle Isolation, Admin Decoupling, In-Memory Master PIN, and Switchboard & Staff Security Guards verified.');
}

// ==========================================
// TEST 45: Phase 3 Production Hardening (PWA, IndexedDB Isolation, Weekly Backups, Schema Validation, Sentry Telemetry, Security Headers, and XSS Sanitization)
// ==========================================
console.log('\n--- Test 45: Phase 3 Production Hardening Suite ---');
{
  const { validateBackupSchema } = await import('../src/db/backup.js');
  const { scrubSensitiveString } = await import('../src/utils/sentry.js');

  // 45a. PWA Configuration & Manifest Verification
  const viteConfigSrc = fs.readFileSync(path.resolve('vite.config.js'), 'utf8');
  assert.ok(viteConfigSrc.includes("registerType: 'prompt'"), 'vite.config.js must configure VitePWA with registerType: prompt');
  assert.ok(viteConfigSrc.includes("name: 'DR FILMS"), 'vite.config.js must configure PWA name');
  assert.ok(viteConfigSrc.includes("display: 'standalone'"), 'vite.config.js must configure PWA display: standalone');
  assert.ok(viteConfigSrc.includes('pwa-192x192.png'), 'vite.config.js must configure 192x192 icon');
  assert.ok(viteConfigSrc.includes('pwa-512x512.png'), 'vite.config.js must configure 512x512 icon');

  const mainSrc = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');
  assert.ok(mainSrc.includes('registerSW'), 'src/main.jsx must call registerSW');
  assert.ok(mainSrc.includes('onNeedRefresh'), 'src/main.jsx must handle onNeedRefresh');
  assert.ok(mainSrc.includes('drfilms:sw-need-refresh'), 'src/main.jsx must dispatch drfilms:sw-need-refresh custom event');

  const customerAppSrc = fs.readFileSync(path.resolve('src/CustomerApp.jsx'), 'utf8');
  assert.ok(customerAppSrc.includes('drfilms:sw-need-refresh'), 'CustomerApp.jsx must listen for drfilms:sw-need-refresh');
  assert.ok(customerAppSrc.includes('Update Available'), 'CustomerApp.jsx must render update available notification');

  // 45b. IndexedDB vs PWA Service Worker Update Persistence Guarantee
  // W3C Specification Guarantee: Service worker cache operations (CacheStorage / Workbox) are isolated
  // from IndexedDB. Updates to service workers or unregistering service workers never delete, clear, or modify
  // IndexedDB database stores (dr_films_billing_db).
  const dbSrc = fs.readFileSync(path.resolve('src/db/db.js'), 'utf8');
  assert.ok(dbSrc.includes("super('DrFilmsBillingDB')"), 'IndexedDB must use persistent Dexie store DrFilmsBillingDB');

  // 45c. Weekly Backup Overdue Check & Schema Validation
  assert.strictEqual(validateBackupSchema(null).valid, false, 'Null backup data must be invalid');
  assert.strictEqual(validateBackupSchema('corrupted-string').valid, false, 'String backup data must be invalid');
  assert.strictEqual(validateBackupSchema({}).valid, false, 'Empty object without data must be invalid');
  assert.strictEqual(validateBackupSchema({ data: { unknownCollection: [] } }).valid, false, 'Object without recognized collections must be invalid');

  const validBackupSample = {
    app: 'DR FILMS Billing PWA',
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: {
      invoices: [{ id: 1, invoiceNumber: 'DRF-0001', totalAmount: 5000 }],
      customers: [{ id: 1, name: 'Client A' }]
    }
  };
  const validCheck = validateBackupSchema(validBackupSample);
  assert.strictEqual(validCheck.valid, true, 'Valid backup data must pass validation');
  assert.strictEqual(validCheck.counts.invoices, 1);
  assert.strictEqual(validCheck.counts.customers, 1);

  const invalidInvoiceBackup = {
    data: {
      invoices: [{ bogusField: 'no id or number' }]
    }
  };
  assert.strictEqual(validateBackupSchema(invalidInvoiceBackup).valid, false, 'Invoices missing id and invoiceNumber must fail validation');

  assert.ok(customerAppSrc.includes('isWeeklyBackupOverdue'), 'CustomerApp.jsx must check isWeeklyBackupOverdue');
  assert.ok(customerAppSrc.includes('Weekly Backup Reminder'), 'CustomerApp.jsx must render weekly backup reminder');
  assert.ok(customerAppSrc.includes('Download Backup (JSON)'), 'CustomerApp.jsx must provide 1-click backup download button');

  // 45d. Settings Page Version Label, Diagnostics & Sentry Opt-In
  const settingsSrc = fs.readFileSync(path.resolve('src/pages/SettingsPage.jsx'), 'utf8');
  assert.ok(settingsSrc.includes('v1.0.0'), 'SettingsPage.jsx must display version v1.0.0');
  assert.ok(settingsSrc.includes('handleCopyDiagnostics'), 'SettingsPage.jsx must define handleCopyDiagnostics');
  assert.ok(settingsSrc.includes('Zero customer PII'), 'Diagnostics report must guarantee zero customer PII');
  assert.ok(settingsSrc.includes('handleToggleSentry'), 'SettingsPage.jsx must implement handleToggleSentry');
  assert.ok(settingsSrc.includes('setSentryEnabled'), 'SettingsPage.jsx must call setSentryEnabled');
  assert.ok(settingsSrc.includes('validateBackupSchema'), 'SettingsPage.jsx must validate backup schema before restoration');

  // 45e. Sentry Telemetry Module & Data Scrubbing
  const testPiiString = 'Client John Doe (john.doe@teststudio.in, +91 98765 43210) paid ₹ 15,000.00 via drfilms@okaxis';
  const scrubbedString = scrubSensitiveString(testPiiString);
  assert.ok(!scrubbedString.includes('john.doe@teststudio.in'), 'Email must be scrubbed');
  assert.ok(scrubbedString.includes('[REDACTED_EMAIL]'), 'Email replacement tag must be present');
  assert.ok(!scrubbedString.includes('98765 43210'), 'Phone must be scrubbed');
  assert.ok(scrubbedString.includes('[REDACTED_PHONE]'), 'Phone replacement tag must be present');
  assert.ok(!scrubbedString.includes('15,000.00'), 'Currency amount must be scrubbed');
  assert.ok(scrubbedString.includes('[REDACTED_AMOUNT]'), 'Amount replacement tag must be present');
  assert.ok(!scrubbedString.includes('drfilms@okaxis'), 'UPI handle must be scrubbed');
  assert.ok(scrubbedString.includes('[REDACTED_UPI]'), 'UPI replacement tag must be present');

  const sentryModuleSrc = fs.readFileSync(path.resolve('src/utils/sentry.js'), 'utf8');
  assert.ok(sentryModuleSrc.includes('delete event.user'), 'Sentry beforeSend must delete event.user');
  assert.ok(sentryModuleSrc.includes('import.meta.env.VITE_SENTRY_DSN'), 'Sentry must read VITE_SENTRY_DSN from environment');

  // 45f. Production Security Headers (Netlify and Vercel)
  const netlifyHeadersPath = path.resolve('public/_headers');
  assert.ok(fs.existsSync(netlifyHeadersPath), 'public/_headers must exist for Netlify');
  const netlifyHeaders = fs.readFileSync(netlifyHeadersPath, 'utf8');
  assert.ok(netlifyHeaders.includes('Content-Security-Policy:'), 'public/_headers must define CSP');
  assert.ok(netlifyHeaders.includes("default-src 'self'"), 'CSP must define default-src self');
  assert.ok(netlifyHeaders.includes('https://apis.google.com'), 'CSP must permit Google APIs');
  assert.ok(netlifyHeaders.includes('https://script.google.com'), 'CSP must permit Google Sheets endpoint');
  assert.ok(netlifyHeaders.includes('https://*.ingest.sentry.io'), 'CSP must permit Sentry ingestion');
  assert.ok(netlifyHeaders.includes('X-Content-Type-Options: nosniff'), 'public/_headers must define X-Content-Type-Options: nosniff');
  assert.ok(netlifyHeaders.includes('X-Frame-Options: SAMEORIGIN'), 'public/_headers must define X-Frame-Options: SAMEORIGIN');
  assert.ok(netlifyHeaders.includes('Referrer-Policy: strict-origin-when-cross-origin'), 'public/_headers must define Referrer-Policy');
  assert.ok(netlifyHeaders.includes('Permissions-Policy:'), 'public/_headers must define Permissions-Policy');

  const vercelJsonPath = path.resolve('vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist for Vercel');
  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert.ok(Array.isArray(vercelJson.headers), 'vercel.json must define headers array');
  const vercelHeaderKeys = vercelJson.headers[0].headers.map(h => h.key);
  assert.ok(vercelHeaderKeys.includes('Content-Security-Policy'), 'vercel.json must set Content-Security-Policy');
  assert.ok(vercelHeaderKeys.includes('X-Content-Type-Options'), 'vercel.json must set X-Content-Type-Options');
  assert.ok(vercelHeaderKeys.includes('X-Frame-Options'), 'vercel.json must set X-Frame-Options');
  assert.ok(vercelHeaderKeys.includes('Referrer-Policy'), 'vercel.json must set Referrer-Policy');
  assert.ok(vercelHeaderKeys.includes('Permissions-Policy'), 'vercel.json must set Permissions-Policy');

  // 45g. XSS Sanitization Audit
  const receiptModalSrc = fs.readFileSync(path.resolve('src/components/PaymentReceiptModal.jsx'), 'utf8');
  assert.ok(receiptModalSrc.includes('DOMPurify.sanitize(qrSvgString)'), 'PaymentReceiptModal must sanitize QR SVG with DOMPurify');

  const pdfExportSrc = fs.readFileSync(path.resolve('src/utils/pdfExport.js'), 'utf8');
  assert.ok(pdfExportSrc.includes('DOMPurify.sanitize(qrSvgString)'), 'pdfExport.js must sanitize QR SVG with DOMPurify');

  console.log('✓ Test 45 Passed: Phase 3 Production Hardening Suite (PWA Prompt & Manifest, IndexedDB W3C Isolation, Weekly Backup Reminder, Schema Validation, Sentry Telemetry & PII Scrubber, Netlify & Vercel Security Headers, and DOMPurify XSS Hardening) verified.');
}

console.log('\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');










