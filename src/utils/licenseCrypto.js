/**
 * Cryptographic License Verification Utility for DR FILMS Billing Suite.
 *
 * Implements:
 * - Asymmetric signature verification using ECDSA P-256 + SHA-256
 * - Public key verification via Web Crypto API (SubtleCrypto)
 * - Node.js fallback for offline verification suite
 * - Monotonic clock-tampering detection
 * - Feature-level permission checks based on allowedFeatures
 */

import { LICENSE_PUBLIC_KEY } from '../config/licensePublicKey.js';

// Base64URL encoding/decoding without external dependencies
export function bytesToBase64Url(bytes) {
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  if (NodeBuffer) {
    return NodeBuffer.from(bytes).toString('base64url');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(b64url) {
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  if (NodeBuffer) {
    return new Uint8Array(NodeBuffer.from(b64url, 'base64url'));
  }
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function stringToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64Url(bytes);
}

export function base64UrlToString(b64url) {
  const bytes = base64UrlToBytes(b64url);
  return new TextDecoder().decode(bytes);
}

/**
 * Cache for imported Web Crypto CryptoKey instance
 */
let cachedCryptoKey = null;

async function getSubtleVerifyKey() {
  if (cachedCryptoKey) return cachedCryptoKey;

  const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle
    : null;

  if (!cryptoSubtle) {
    return null;
  }

  cachedCryptoKey = await cryptoSubtle.importKey(
    'jwk',
    LICENSE_PUBLIC_KEY,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['verify']
  );

  return cachedCryptoKey;
}

/**
 * Asynchronously verifies a signed DRF license key.
 * Expected format: DRF-<base64url(payload)>.<base64url(signature)>
 */
export async function verifyLicenseKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return { valid: false, isValid: false, error: 'License key is required' };
  }

  const cleanKey = keyString.trim();
  if (!cleanKey.startsWith('DRF-')) {
    return { valid: false, isValid: false, error: 'Invalid license key format. Must start with DRF-' };
  }

  const rawToken = cleanKey.slice(4);
  const dotIndex = rawToken.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, isValid: false, error: 'Malformed license key: missing signature delimiter' };
  }

  const payloadB64 = rawToken.slice(0, dotIndex);
  const signatureB64 = rawToken.slice(dotIndex + 1);

  if (!payloadB64 || !signatureB64) {
    return { valid: false, isValid: false, error: 'Malformed license key: missing payload or signature' };
  }

  let payload;
  try {
    const payloadJson = base64UrlToString(payloadB64);
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, isValid: false, error: 'Invalid license key payload: JSON parsing failed' };
  }

  // Validate required payload fields
  if (!payload.licenseId || !payload.customerName || !payload.planTier) {
    return { valid: false, isValid: false, error: 'Invalid license payload structure' };
  }

  const dataToVerify = new TextEncoder().encode(payloadB64);
  const signatureBytes = base64UrlToBytes(signatureB64);

  // 1. Try Web Crypto Subtle verification
  const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle
    : null;

  let isSignatureValid = false;

  if (cryptoSubtle) {
    try {
      const verifyKey = await getSubtleVerifyKey();
      isSignatureValid = await cryptoSubtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        verifyKey,
        signatureBytes,
        dataToVerify
      );
    } catch (subtleErr) {
      console.warn('SubtleCrypto verification failed, trying fallback:', subtleErr?.message);
    }
  }

  // 2. Node.js native crypto fallback for CLI and unit tests
  const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  if (!isSignatureValid && nodeProc && nodeProc.versions && nodeProc.versions.node && NodeBuffer) {
    try {
      const nodeCrypto = nodeProc.getBuiltinModule
        ? nodeProc.getBuiltinModule('node:crypto')
        : (typeof globalThis !== 'undefined' && globalThis['require'] ? globalThis['require']('node:crypto') : null);
      if (nodeCrypto) {
        const pubKeyObj = nodeCrypto.createPublicKey({ key: LICENSE_PUBLIC_KEY, format: 'jwk' });
        isSignatureValid = nodeCrypto.verify(
          'SHA256',
          NodeBuffer.from(payloadB64),
          { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
          NodeBuffer.from(signatureBytes)
        );
      }
    } catch (nodeErr) {
      console.warn('Node crypto verification failed:', nodeErr?.message);
    }
  }

  if (!isSignatureValid) {
    return {
      valid: false,
      isValid: false,
      error: 'Cryptographic signature is invalid or key has been tampered with'
    };
  }

  return {
    valid: true,
    isValid: true,
    payload,
    key: cleanKey,
    planTier: payload.planTier,
    customerName: payload.customerName,
    expiryDate: payload.expiryDate,
    isLifetime: Boolean(payload.isLifetime),
    billLimit: payload.billLimit || null,
    allowedFeatures: Array.isArray(payload.allowedFeatures) ? payload.allowedFeatures : ['*'],
    licenseId: payload.licenseId
  };
}

/**
 * Synchronous verification helper exclusively for Node.js test suites.
 */
export function verifyLicenseKeySync(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return { valid: false, isValid: false, error: 'License key is required' };
  }

  const cleanKey = keyString.trim();
  if (!cleanKey.startsWith('DRF-')) {
    return { valid: false, isValid: false, error: 'Invalid license key format. Must start with DRF-' };
  }

  const rawToken = cleanKey.slice(4);
  const dotIndex = rawToken.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, isValid: false, error: 'Malformed license key: missing signature delimiter' };
  }

  const payloadB64 = rawToken.slice(0, dotIndex);
  const signatureB64 = rawToken.slice(dotIndex + 1);

  let payload;
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  try {
    const payloadJson = NodeBuffer 
      ? NodeBuffer.from(payloadB64, 'base64url').toString('utf8')
      : base64UrlToString(payloadB64);
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, isValid: false, error: 'Invalid license key payload: JSON parsing failed' };
  }

  try {
    // Requires Node.js
    const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
    const crypto = nodeProc?.getBuiltinModule ? nodeProc.getBuiltinModule('node:crypto') : null;
    if (!crypto || !NodeBuffer) {
      return { valid: false, isValid: false, error: 'Synchronous verification only available in Node environment' };
    }
    const pubKeyObj = crypto.createPublicKey({ key: LICENSE_PUBLIC_KEY, format: 'jwk' });
    const isSignatureValid = crypto.verify(
      'SHA256',
      NodeBuffer.from(payloadB64),
      { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
      NodeBuffer.from(signatureB64, 'base64url')
    );

    if (!isSignatureValid) {
      return { valid: false, isValid: false, error: 'Cryptographic signature is invalid' };
    }

    return {
      valid: true,
      isValid: true,
      payload,
      key: cleanKey,
      planTier: payload.planTier,
      customerName: payload.customerName,
      expiryDate: payload.expiryDate,
      isLifetime: Boolean(payload.isLifetime),
      billLimit: payload.billLimit || null,
      allowedFeatures: Array.isArray(payload.allowedFeatures) ? payload.allowedFeatures : ['*'],
      licenseId: payload.licenseId
    };
  } catch (err) {
    return { valid: false, isValid: false, error: err.message };
  }
}

/**
 * Checks whether a specific feature flag is permitted by the signed license payload.
 * Accepts either an array of allowed feature strings or a subscription status object.
 */
export function isFeatureAllowedByLicense(flagKey, allowedOrStatus = ['*']) {
  if (!flagKey) return true;
  if (!allowedOrStatus) return false;

  let allowedFeatures = ['*'];
  if (Array.isArray(allowedOrStatus)) {
    allowedFeatures = allowedOrStatus;
  } else if (typeof allowedOrStatus === 'object') {
    if (allowedOrStatus.isLocked) {
      return false;
    }
    allowedFeatures = Array.isArray(allowedOrStatus.allowedFeatures) 
      ? allowedOrStatus.allowedFeatures 
      : ['*'];
  }

  if (allowedFeatures.includes('*')) {
    return true;
  }

  const cleanFlag = flagKey.toLowerCase();
  const normalized = cleanFlag.replace(/^enable/, '');

  return allowedFeatures.some(allowed => {
    const cleanAllowed = String(allowed).toLowerCase().replace(/_/g, '');
    return (
      cleanAllowed === cleanFlag ||
      cleanAllowed === normalized ||
      cleanAllowed === cleanFlag.replace(/_/g, '') ||
      cleanFlag.includes(cleanAllowed)
    );
  });
}

/**
 * Clock Tampering Detector:
 * Checks if the system clock has moved backwards beyond the threshold (1 hour).
 */
const CLOCK_STORAGE_KEY = 'drfilms_license_clock_state';
const ROLLBACK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour tolerance

export function checkClockTampering(nowMs = Date.now()) {
  if (typeof window === 'undefined' && typeof globalThis.localStorage === 'undefined') {
    return { tampered: false };
  }

  const storage = typeof window !== 'undefined' ? window.localStorage : globalThis.localStorage;
  if (!storage) return { tampered: false };

  try {
    const raw = storage.getItem(CLOCK_STORAGE_KEY);
    if (!raw) {
      // First recorded timestamp
      storage.setItem(CLOCK_STORAGE_KEY, JSON.stringify({ lastSeen: nowMs }));
      return { tampered: false };
    }

    const { lastSeen } = JSON.parse(raw);
    if (typeof lastSeen === 'number') {
      if (nowMs < lastSeen - ROLLBACK_THRESHOLD_MS) {
        return {
          tampered: true,
          lastSeenDate: new Date(lastSeen).toISOString(),
          currentDate: new Date(nowMs).toISOString(),
          differenceHours: Math.round((lastSeen - nowMs) / (1000 * 60 * 60))
        };
      }
    }

    // Monotonically advance last seen timestamp
    const updatedLastSeen = Math.max(lastSeen || 0, nowMs);
    storage.setItem(CLOCK_STORAGE_KEY, JSON.stringify({ lastSeen: updatedLastSeen }));
    return { tampered: false };
  } catch {
    return { tampered: false };
  }
}

export function resetClockStateForTest() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(CLOCK_STORAGE_KEY);
  } else if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.removeItem(CLOCK_STORAGE_KEY);
  }
}
