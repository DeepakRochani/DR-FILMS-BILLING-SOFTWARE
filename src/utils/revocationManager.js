/**
 * Revocation Verification Utility for DR FILMS Billing Suite.
 *
 * Implements:
 * - Online verification of signed revoked.json
 * - ECDSA P-256 signature verification on revocation payload
 * - Fail-open design: if offline, returns isRevoked: false
 * - Caching mechanism to prevent excessive network requests
 */

import { LICENSE_PUBLIC_KEY } from '../config/licensePublicKey.js';
import { base64UrlToBytes, base64UrlToString } from './licenseCrypto.js';

let revocationCache = {
  lastChecked: 0,
  revokedIds: new Set()
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export async function checkLicenseRevocation(licenseId, customUrl = null) {
  if (!licenseId) return { isRevoked: false, isOffline: true };

  // Check cache first
  const now = Date.now();
  if (now - revocationCache.lastChecked < CACHE_TTL_MS) {
    if (revocationCache.revokedIds.has(licenseId)) {
      return { isRevoked: true, reason: 'This license has been revoked.' };
    }
    return { isRevoked: false, isOffline: false };
  }

  // Determine revocation endpoint
  const endpoint = customUrl || 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REVOCATION_URL) ||
    'https://billing.drfilms.studio/revoked.json';

  try {
    const ControllerClass = (typeof window !== 'undefined' && window.AbortController) || 
      (typeof globalThis !== 'undefined' && globalThis['AbortController']) || 
      null;
    const controller = ControllerClass ? new ControllerClass() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout
    }

    const fetchOptions = {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    };
    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    const response = await fetch(endpoint, fetchOptions);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Server returned 404 or 500: fail open
      return { isRevoked: false, isOffline: true };
    }

    const data = await response.json();
    if (!data || !data.payload || !data.signature) {
      // Malformed response: fail open
      return { isRevoked: false, isOffline: true };
    }

    // Verify cryptographic signature of the revocation list
    const payloadBytes = new TextEncoder().encode(JSON.stringify(data.payload));
    const signatureBytes = base64UrlToBytes(data.signature);

    const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
      ? globalThis.crypto.subtle
      : null;

    let isSigValid = false;
    if (cryptoSubtle) {
      const verifyKey = await cryptoSubtle.importKey(
        'jwk',
        LICENSE_PUBLIC_KEY,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      isSigValid = await cryptoSubtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        verifyKey,
        signatureBytes,
        payloadBytes
      );
    }

    if (!isSigValid) {
      console.warn('Revocation file signature invalid. Ignoring untrusted list.');
      return { isRevoked: false, isOffline: false, warning: 'Untrusted revocation list' };
    }

    // Update cache
    const idList = Array.isArray(data.payload.revokedIds) ? data.payload.revokedIds : [];
    revocationCache = {
      lastChecked: now,
      revokedIds: new Set(idList)
    };

    if (revocationCache.revokedIds.has(licenseId)) {
      return { isRevoked: true, reason: 'This license has been revoked.' };
    }

    return { isRevoked: false, isOffline: false };
  } catch (err) {
    // Network failure, DNS failure, or aborted: fail open
    return { isRevoked: false, isOffline: true };
  }
}

export function clearRevocationCacheForTest() {
  revocationCache = {
    lastChecked: 0,
    revokedIds: new Set()
  };
}
