import QRCode from 'qrcode';

/**
 * Generate UPI Payment Link
 */
export function buildUpiLink({ upiId, payeeName, amount, invoiceNumber }) {
  if (!upiId) return '';
  const cleanUpi = upiId.trim();
  const cleanName = encodeURIComponent((payeeName || 'DR FILMS').trim());
  const cleanInv = encodeURIComponent((invoiceNumber || 'BILL').trim());
  const amt = amount > 0 ? Number(amount).toFixed(2) : '';

  let link = `upi://pay?pa=${cleanUpi}&pn=${cleanName}&tr=${cleanInv}&tn=Invoice_${cleanInv}&cu=INR`;
  if (amt) {
    link += `&am=${amt}`;
  }
  return link;
}

/**
 * Generate Offline Data URL for QR Code
 * Hard-coded pure black (#000000) and white (#FFFFFF) colors to ensure high-contrast PDF capture
 */
export async function generateQrDataUrl(text, options = {}) {
  if (!text) return '';
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: options.width || 400,
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M',
      type: 'image/png'
    });

    // Preload image in memory before returning
    if (typeof Image !== 'undefined' && dataUrl) {
      const img = new Image();
      img.src = dataUrl;
      if (typeof img.decode === 'function') {
        await img.decode().catch(() => {});
      }
    }

    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR Code data URL:', err);
    return '';
  }
}

/**
 * Generate Inline SVG for QR Code
 * Pure vector SVG that renders cleanly inside html2canvas and jsPDF without image decoding delays
 */
export async function generateQrSvgString(text, options = {}) {
  if (!text) return '';
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      width: options.width || 96,
      margin: options.margin || 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    return svg;
  } catch (err) {
    console.error('Failed to generate QR SVG:', err);
    return '';
  }
}
