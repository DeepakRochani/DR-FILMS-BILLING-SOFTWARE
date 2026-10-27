import { setSharingActive } from './security.js';
import DOMPurify from 'dompurify';

let cachedHtml2Pdf = null;
async function getHtml2Pdf() {
  if (cachedHtml2Pdf) return cachedHtml2Pdf;
  const mod = await import('html2pdf.js');
  cachedHtml2Pdf = mod.default || mod;
  return cachedHtml2Pdf;
}

export const DEFAULT_PDF_OPT = {
  margin: [5, 6, 5, 6], // top, left, bottom, right in mm
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: true,
    scrollX: 0,
    scrollY: 0,
    backgroundColor: '#ffffff'
  },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
};

/**
 * Format standard clean PDF filename like DRF-0001_Ronak_Jain.pdf
 */
import { formatInvoiceNumber } from './formatters.js';

export function getInvoicePdfFilename(invoice) {
  const formattedNumber = invoice?.invoiceNumber ? formatInvoiceNumber(invoice.invoiceNumber) : 'INV';
  const invoiceNum = formattedNumber
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const clientName = (invoice?.customerSnapshot?.name || 'Client')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${invoiceNum || 'INV'}_${clientName || 'Client'}.pdf`;
}

/**
 * Format standard clean Receipt PDF filename like Receipt_REC-DRF-0001-P1_Ronak_Jain.pdf
 */
export function getPaymentReceiptPdfFilename(invoice, payment) {
  const formattedNumber = invoice?.invoiceNumber ? formatInvoiceNumber(invoice.invoiceNumber) : 'INV';
  const allPayments = (Array.isArray(invoice?.payments) ? invoice.payments : []).filter(p => !p?.isDeleted);
  const paymentIndex = allPayments.findIndex(p => p?.id === payment?.id);
  const receiptNum = `REC-${formattedNumber}-P${paymentIndex >= 0 ? paymentIndex + 1 : 1}`
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const clientName = (invoice?.customerSnapshot?.name || 'Client')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `Receipt_${receiptNum || 'REC'}_${clientName || 'Client'}.pdf`;
}

/**
 * Wait for all images inside an element (especially QR data URL img) to be fully loaded and decoded
 */
export async function waitForElementImages(element) {
  if (!element) return;
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) {
        if (typeof img.decode === 'function') {
          return img.decode().catch(() => {});
        }
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const onFinish = () => {
          img.removeEventListener('load', onFinish);
          img.removeEventListener('error', onFinish);
          if (typeof img.decode === 'function') {
            img.decode().catch(() => {}).then(resolve);
          } else {
            resolve();
          }
        };
        img.addEventListener('load', onFinish);
        img.addEventListener('error', onFinish);
        setTimeout(resolve, 1500); // 1.5s max wait per image
      });
    })
  );
}

/**
 * Helper: Measure QR position inside onclone using the CLONED document, not the live one.
 * (IF AND ONLY IF a manual overlay is ever needed).
 * - rootRect = clonedRoot.getBoundingClientRect()
 * - boxRect  = clonedBox.getBoundingClientRect()
 * - relX = boxRect.left - rootRect.left, relY = boxRect.top - rootRect.top
 * - scale = (210 - marginLeft - marginRight) / rootRoot.width
 * - draw at (marginLeft + relX*scale, marginTop + relY*scale) with
 *   a SQUARE size = min(boxRect.width, boxRect.height) * scale.
 */
export function measureClonedQrBox(clonedRoot, clonedBox, margins = [8, 8, 8, 8]) {
  if (!clonedRoot || !clonedBox) return null;
  const rootRect = clonedRoot.getBoundingClientRect();
  const boxRect = clonedBox.getBoundingClientRect();
  const relX = boxRect.left - rootRect.left;
  const relY = boxRect.top - rootRect.top;
  const marginLeft = margins[1] || 8;
  const marginRight = margins[3] !== undefined ? margins[3] : (margins[1] || 8);
  const marginTop = margins[0] || 8;
  const printableWidth = 210 - marginLeft - marginRight;
  const scale = rootRect.width > 0 ? printableWidth / rootRect.width : 0.2375;
  const squareSize = Math.min(boxRect.width, boxRect.height) * scale;
  return {
    x: marginLeft + relX * scale,
    y: marginTop + relY * scale,
    size: squareSize
  };
}

/**
 * Unified PDF generator that renders the invoice directly via html2canvas & jsPDF:
 * 1. Does not use manual coordinates or live DOM getBoundingClientRect math.
 * 2. Renders the QR code directly inside the 140x140px white box in document flow.
 * 3. Enforces onclone styling for #upi-qr and #invoice-qr-box in the cloned document.
 * 4. Provides inline SVG fallback if image is ever blank.
 * 5. Guarantees exactly ONE QR code in the PDF.
 */
export async function buildInvoicePdf(elementId, filename = 'invoice.pdf', qrDataUrl = '', qrSvgString = '') {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element #${elementId} not found for PDF export.`);
  }

  // If qrDataUrl wasn't passed directly, check if the DOM has the QR image data URL
  let activeQr = qrDataUrl;
  if (!activeQr) {
    const domImg = element.querySelector('#upi-qr') || element.querySelector('#invoice-qr-image');
    if (domImg && domImg.src && domImg.src.startsWith('data:image/')) {
      activeQr = domImg.src;
    }
  }

  // Await decode of live QR image if present in DOM
  const qrDomImg = element.querySelector('#upi-qr') || element.querySelector('#invoice-qr-image');
  if (qrDomImg && typeof qrDomImg.decode === 'function') {
    try {
      await qrDomImg.decode();
    } catch (_) {}
  }

  const opt = {
    ...DEFAULT_PDF_OPT,
    filename: filename,
    html2canvas: {
      ...DEFAULT_PDF_OPT.html2canvas,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: true,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        // Enforce standard container width on the cloned paper for 100% consistent PDF output without right-edge overflow
        const clonedPaper = clonedDoc.getElementById(elementId);
        if (clonedPaper) {
          clonedPaper.style.boxSizing = 'border-box';
          clonedPaper.style.width = '100%';
          clonedPaper.style.minWidth = '0px';
          clonedPaper.style.maxWidth = '100%';
          if (elementId === 'printable-payment-receipt') {
            clonedPaper.style.minHeight = '1040px';
            clonedPaper.style.padding = '24px 28px';
            clonedPaper.style.borderRadius = '0px';
            clonedPaper.style.boxShadow = 'none';
            clonedPaper.style.border = 'none';
            clonedPaper.style.margin = '0 auto';
            clonedPaper.style.display = 'flex';
            clonedPaper.style.flexDirection = 'column';
            clonedPaper.style.justifyContent = 'space-between';

            // Ensure no text clipping on cloned elements
            clonedPaper.querySelectorAll('.truncate').forEach(el => {
              el.classList.remove('truncate');
              el.style.overflow = 'visible';
              el.style.whiteSpace = 'normal';
              el.style.textOverflow = 'clip';
              el.style.lineHeight = '1.5';
            });

            // Enforce single-line official payment receipt badge
            clonedPaper.querySelectorAll('.receipt-header-title').forEach(el => {
              el.style.whiteSpace = 'nowrap';
              el.style.display = 'block';
              el.style.width = '100%';
              el.style.textAlign = 'center';
              el.style.lineHeight = '1.2';
            });

            // Enforce vertically centered Balance Pending badge in PDF
            const pendingBadge = clonedPaper.querySelector('#receipt-balance-pending-badge');
            if (pendingBadge) {
              pendingBadge.style.display = 'flex';
              pendingBadge.style.alignItems = 'center';
              pendingBadge.style.justifyContent = 'center';
              pendingBadge.style.textAlign = 'center';
              pendingBadge.style.lineHeight = '1.1';
              pendingBadge.style.paddingTop = '6px';
              pendingBadge.style.paddingBottom = '6px';
            }

            // Enforce properly contained and vertically centered 'This Receipt' badge in PDF
            clonedPaper.querySelectorAll('.receipt-badge-highlight').forEach(badge => {
              badge.style.display = 'inline-block';
              badge.style.verticalAlign = 'middle';
              badge.style.lineHeight = '13px';
              badge.style.padding = '3px 8px 3px 8px';
              badge.style.boxSizing = 'border-box';
              badge.style.fontSize = '10px';
              badge.style.fontWeight = '900';
              badge.style.backgroundColor = '#fde68a';
              badge.style.borderColor = '#fbbf24';
              badge.style.color = '#451a03';
              badge.style.textAlign = 'center';
              badge.style.borderRadius = '4px';
              badge.style.margin = '0';
            });

            clonedPaper.querySelectorAll('.receipt-badge-container').forEach(container => {
              container.style.display = 'inline-flex';
              container.style.alignItems = 'center';
              container.style.justifyContent = 'center';
              container.style.verticalAlign = 'middle';
            });
          } else {
            clonedPaper.style.padding = '16px 24px';
            clonedPaper.style.borderRadius = '0px';
            clonedPaper.style.boxShadow = 'none';
            clonedPaper.style.border = 'none';
            clonedPaper.style.margin = '0 auto';
          }
        }

        // Find QR box in cloned document and enforce fixed 140x140px flex container
        const clonedBox = clonedDoc.getElementById('invoice-qr-box') || 
                          clonedDoc.getElementById('statement-qr-box') ||
                          clonedDoc.getElementById('receipt-qr-box');
        if (clonedBox) {
          clonedBox.style.width = '140px';
          clonedBox.style.height = '140px';
          clonedBox.style.minWidth = '140px';
          clonedBox.style.minHeight = '140px';
          clonedBox.style.maxWidth = '140px';
          clonedBox.style.maxHeight = '140px';
          clonedBox.style.display = 'flex';
          clonedBox.style.alignItems = 'center';
          clonedBox.style.justifyContent = 'center';
          clonedBox.style.position = 'relative';
          clonedBox.style.backgroundColor = '#ffffff';
          clonedBox.style.overflow = 'visible';
          clonedBox.style.transform = 'none';
          clonedBox.style.animation = 'none';
          clonedBox.style.filter = 'none';
          clonedBox.style.opacity = '1';
        }

        // Find #upi-qr in cloned document and enforce attributes
        const clonedQr = clonedDoc.getElementById('upi-qr') ||
                         clonedDoc.getElementById('statement-upi-qr') ||
                         clonedDoc.getElementById('invoice-qr-image') ||
                         clonedDoc.getElementById('receipt-upi-qr') ||
                         (clonedBox ? clonedBox.querySelector('img') : null);

        if (clonedQr) {
          if (activeQr) {
            clonedQr.src = activeQr;
          }
          clonedQr.width = 120;
          clonedQr.height = 120;
          clonedQr.style.width = '120px';
          clonedQr.style.height = '120px';
          clonedQr.style.display = 'block';
          clonedQr.style.margin = 'auto';
          clonedQr.style.opacity = '1';
          clonedQr.style.filter = 'none';
          clonedQr.style.transform = 'none';
          clonedQr.style.animation = 'none';
          clonedQr.style.mixBlendMode = 'normal';

          // If QR image is blank or activeQr missing, replace <img> with inline SVG QR inside the box
          if ((!clonedQr.src || clonedQr.src === '') && qrSvgString && clonedBox) {
            console.log('[DR FILMS PDF] Cloned QR img blank; injecting reliable inline SVG QR fallback into box.');
            clonedBox.innerHTML = DOMPurify.sanitize(qrSvgString);
            const svgEl = clonedBox.querySelector('svg');
            if (svgEl) {
              svgEl.setAttribute('width', '120');
              svgEl.setAttribute('height', '120');
              svgEl.style.width = '120px';
              svgEl.style.height = '120px';
              svgEl.style.display = 'block';
              svgEl.style.margin = 'auto';
            }
          }
        } else if (clonedBox && qrSvgString) {
          // If <img> is not present at all, render the inline SVG QR
          clonedBox.innerHTML = DOMPurify.sanitize(qrSvgString);
          const svgEl = clonedBox.querySelector('svg');
          if (svgEl) {
            svgEl.setAttribute('width', '120');
            svgEl.setAttribute('height', '120');
            svgEl.style.width = '120px';
            svgEl.style.height = '120px';
            svgEl.style.display = 'block';
            svgEl.style.margin = 'auto';
          }
        }
      }
    }
  };

  element.classList.add('pdf-rendering');
  setSharingActive(true);
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {}
    }
    await waitForElementImages(element);

    const html2pdf = await getHtml2Pdf();
    const pdf = await html2pdf()
      .set(opt)
      .from(element)
      .toPdf()
      .get('pdf');

    // Post-generation guard: prune accidental blank trailing page
    const totalPages = pdf.internal.getNumberOfPages();
    if (totalPages > 1) {
      const elementHeight = element.scrollHeight || element.offsetHeight || 0;
      // In 794px coordinate space, a single A4 page accommodates up to ~1140px.
      // If content height fits within 1 page (<= 1200px) or was barely overflowing
      // due to sub-pixel calculation, remove the trailing blank ghost page.
      if (elementHeight <= 1200 || (totalPages === 2 && elementHeight <= 1300)) {
        console.log(`[DR FILMS PDF] Detected accidental trailing page (${totalPages} pages for height ${elementHeight}px). Pruning blank trailing page.`);
        pdf.deletePage(totalPages);
      }
    }

    return pdf;
  } finally {
    element.classList.remove('pdf-rendering');
    setTimeout(() => setSharingActive(false), 2000);
  }
}

/**
 * Generate & Download Clean PDF from an HTML element
 */
export async function exportInvoiceToPdf(elementId, filename = 'invoice.pdf', qrDataUrl = '', qrSvgString = '') {
  setSharingActive(true);
  try {
    const pdf = await buildInvoicePdf(elementId, filename, qrDataUrl, qrSvgString);
    pdf.save(filename);
    return true;
  } catch (err) {
    console.error('PDF export error:', err);
    window.print();
    return false;
  } finally {
    setTimeout(() => setSharingActive(false), 3000);
  }
}

/**
 * Generate a PDF File object in memory for Web Share API (mobile sharing) & offline download
 */
export async function generateInvoicePdfFile(elementId, filename = 'invoice.pdf', qrDataUrl = '', qrSvgString = '') {
  setSharingActive(true);
  try {
    const pdf = await buildInvoicePdf(elementId, filename, qrDataUrl, qrSvgString);
    const pdfBlob = pdf.output('blob');
    return new File([pdfBlob], filename, { type: 'application/pdf' });
  } finally {
    setTimeout(() => setSharingActive(false), 5000);
  }
}
