/**
 * Security & PIN Lock Utility for DR FILMS Billing Suite
 *
 * Implements:
 * - PBKDF2 / Salted SHA-256 via Web Crypto API (SubtleCrypto)
 * - Salt generation using crypto.getRandomValues
 * - Progressive lockout state (5 failed attempts = 30s lock, increasing each time)
 * - Inactivity checking (Always, 1m, 5m, 15m, 30m)
 * - Sharing guard flag to prevent lockouts during PDF generation or WhatsApp sharing
 * - Optional WebAuthn biometrics (Fingerprint / Face ID)
 * - Explicit exclusion from Google Sheets and JSON backups
 */

import { db } from '../db/db.js';

export const INACTIVITY_TIMEOUT_OPTIONS = [
  { value: 'always', label: 'Always (Lock immediately on background)' },
  { value: '1', label: '1 Minute' },
  { value: '5', label: '5 Minutes (Recommended)' },
  { value: '15', label: '15 Minutes' },
  { value: '30', label: '30 Minutes' }
];

const LOCKOUT_STORAGE_KEY = 'drfilms_pin_lockout_state';
const LAST_ACTIVITY_KEY = 'drfilms_last_user_activity';

// ============================================================================
// 1. CRYPTOGRAPHIC PRIMITIVES (Web Crypto API)
// ============================================================================

/**
 * Generate a cryptographically secure random salt in hex string format
 */
export function generateSalt(length = 16) {
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : globalThis.crypto;
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    // Fallback pseudo-random for tests if crypto is missing
    let result = '';
    const hex = '0123456789abcdef';
    for (let i = 0; i < length * 2; i++) {
      result += hex[Math.floor(Math.random() * 16)];
    }
    return result;
  }
  const bytes = new Uint8Array(length);
  cryptoObj.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert ArrayBuffer or Uint8Array to hex string
 */
function bytesToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a 4-6 digit PIN with salt using Web Crypto PBKDF2 (SHA-256 with 100,000 iterations)
 * or salted SHA-256 digest fallback. Never stores or logs the plain PIN.
 */
export async function hashPin(pin, saltHex) {
  if (!pin || typeof pin !== 'string') {
    throw new Error('PIN must be a non-empty string');
  }
  const cleanPin = pin.trim();
  if (cleanPin.length < 4 || cleanPin.length > 6) {
    throw new Error('PIN must be between 4 and 6 digits');
  }

  const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle
    : null;

  const encoder = new TextEncoder();

  if (!cryptoSubtle) {
    // Basic fallback for mock/node environments without SubtleCrypto
    let hash = 0;
    const combined = `${saltHex}:${cleanPin}:drfilms`;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  try {
    const pinBuffer = encoder.encode(cleanPin);
    const keyMaterial = await cryptoSubtle.importKey(
      'raw',
      pinBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const saltBuffer = hexToBytes(saltHex);
    const derivedBits = await cryptoSubtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    return bytesToHex(derivedBits);
  } catch (err) {
    // Direct SHA-256 digest fallback
    const combined = encoder.encode(`DR_FILMS_SALT:${saltHex}:${cleanPin}`);
    const digest = await cryptoSubtle.digest('SHA-256', combined);
    return bytesToHex(digest);
  }
}

/**
 * Verify an entered PIN against a stored salted hash
 */
export async function verifyPin(enteredPin, saltHex, storedHash) {
  if (!enteredPin || !saltHex || !storedHash) return false;
  try {
    const computedHash = await hashPin(enteredPin, saltHex);
    return computedHash === storedHash;
  } catch {
    return false;
  }
}

// ============================================================================
// 2. PROGRESSIVE LOCKOUT STATE (5 wrong attempts -> 30s lock, increasing)
// ============================================================================

export function getLockoutState() {
  if (typeof window === 'undefined') return { failedAttempts: 0, lockoutUntil: 0 };
  try {
    const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!raw) return { failedAttempts: 0, lockoutUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failedAttempts: Number(parsed.failedAttempts) || 0,
      lockoutUntil: Number(parsed.lockoutUntil) || 0
    };
  } catch {
    return { failedAttempts: 0, lockoutUntil: 0 };
  }
}

export function recordFailedAttempt() {
  if (typeof window === 'undefined') return { failedAttempts: 1, lockoutUntil: 0 };
  const current = getLockoutState();
  const nextAttempts = current.failedAttempts + 1;
  let lockoutUntil = 0;

  // 5 or more failed attempts triggers progressive lockout:
  // Attempt 5: 30s
  // Attempt 6: 60s
  // Attempt 7: 90s, etc.
  if (nextAttempts >= 5) {
    const penaltySeconds = 30 * (nextAttempts - 4);
    lockoutUntil = Date.now() + penaltySeconds * 1000;
  }

  const newState = { failedAttempts: nextAttempts, lockoutUntil };
  try {
    localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(newState));
  } catch {}
  return newState;
}

export function resetLockoutState() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LOCKOUT_STORAGE_KEY);
  } catch {}
}

export function getRemainingLockoutSeconds() {
  const { lockoutUntil } = getLockoutState();
  if (!lockoutUntil) return 0;
  const remainingMs = lockoutUntil - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

// ============================================================================
// 3. INACTIVITY & SHARING GUARD
// ============================================================================

/**
 * Flag to indicate a PDF download, print, or WhatsApp share is active.
 * Lockout MUST NOT interrupt sharing workflows.
 */
export function setSharingActive(active = true) {
  if (typeof window !== 'undefined') {
    window.__DRFILMS_SHARING_ACTIVE = Boolean(active);
  }
}

export function isSharingActive() {
  if (typeof window !== 'undefined') {
    return Boolean(window.__DRFILMS_SHARING_ACTIVE);
  }
  return false;
}

/**
 * Record current user activity timestamp
 */
export function recordUserActivity() {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    } catch {}
  }
}

export function getLastActivityTimestamp() {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    return raw ? parseInt(raw, 10) : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Check if the app should lock on return from background or inactivity
 *
 * @param {string} timeoutMinutes - 'always' | '1' | '5' | '15' | '30'
 * @returns {boolean}
 */
export function shouldLockOnResume(timeoutMinutes = '5') {
  if (isSharingActive()) {
    // Guard: Never lock while sharing or printing
    return false;
  }

  if (timeoutMinutes === 'always') {
    return true;
  }

  const lastActivity = getLastActivityTimestamp();
  const minutes = parseInt(timeoutMinutes, 10) || 5;
  const elapsedMs = Date.now() - lastActivity;
  const timeoutMs = minutes * 60 * 1000;

  return elapsedMs >= timeoutMs;
}

// ============================================================================
// 4. DATABASE SECURITY PROFILE (Stored locally in IndexedDB, never in Sheet/JSON)
// ============================================================================

export async function getSecurityProfile() {
  try {
    const prof = await db.settings.get('security_profile');
    if (prof && prof.isEnabled && prof.pinHash && prof.salt) {
      return prof;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSecurityProfile({
  isEnabled = true,
  pinHash,
  salt,
  timeoutMinutes = '5',
  biometricsEnabled = false,
  credentialId = null
}) {
  const profile = {
    key: 'security_profile',
    isEnabled: Boolean(isEnabled),
    pinHash,
    salt,
    timeoutMinutes: String(timeoutMinutes),
    biometricsEnabled: Boolean(biometricsEnabled),
    credentialId: credentialId || null,
    updatedAt: new Date().toISOString()
  };

  await db.settings.put(profile, 'security_profile');
  resetLockoutState();
  return profile;
}

export async function removeSecurityProfile() {
  try {
    await db.settings.delete('security_profile');
    resetLockoutState();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 5. WEBAUTHN BIOMETRICS (Fingerprint / Face ID)
// ============================================================================

export async function isWebAuthnAvailable() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

export async function enrollBiometrics(username = 'DR FILMS Studio') {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn biometrics not supported on this device/browser');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userId = new Uint8Array(16);
  window.crypto.getRandomValues(userId);

  const creationOptions = {
    publicKey: {
      challenge,
      rp: {
        name: 'DR FILMS Billing PWA',
        id: window.location.hostname || 'localhost'
      },
      user: {
        id: userId,
        name: 'studio_admin',
        displayName: username
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        requireResidentKey: false
      },
      timeout: 60000,
      attestation: 'none'
    }
  };

  const credential = await navigator.credentials.create(creationOptions);
  if (!credential) {
    throw new Error('Biometric registration was cancelled or timed out');
  }

  // Base64 encode credential ID
  const rawId = new Uint8Array(credential.rawId);
  const base64Id = btoa(String.fromCharCode(...rawId));
  return base64Id;
}

export async function verifyBiometrics(credentialId) {
  if (!window.PublicKeyCredential) return false;

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const getOptions = {
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'preferred',
        rpId: window.location.hostname || 'localhost'
      }
    };

    if (credentialId) {
      const rawIdBytes = Uint8Array.from(atob(credentialId), c => c.charCodeAt(0));
      getOptions.publicKey.allowCredentials = [{
        id: rawIdBytes,
        type: 'public-key',
        transports: ['internal']
      }];
    }

    const assertion = await navigator.credentials.get(getOptions);
    return Boolean(assertion);
  } catch (err) {
    console.warn('Biometric authentication failed or was cancelled:', err);
    return false;
  }
}

// ============================================================================
// 6. EMERGENCY RECOVERY HELPER
// ============================================================================

export async function clearSiteDataAndReset() {
  const confirmed = window.confirm(
    'WARNING: This will clear this browser\'s local storage and reset the app PIN.\n\n' +
    'Your bills, clients, and services are safe in your Google Sheets cloud backup.\n\n' +
    'After the reset, you can restore all your data in one click from Settings using your Google Sheet or a JSON backup file.\n\n' +
    'Do you want to proceed with clearing local site data?'
  );

  if (!confirmed) return false;

  try {
    // Clear localStorage & sessionStorage
    localStorage.clear();
    sessionStorage.clear();

    // Delete IndexedDB database
    if (window.indexedDB && window.indexedDB.deleteDatabase) {
      await new Promise((resolve) => {
        const req = window.indexedDB.deleteDatabase('DRFilmsBillingDB');
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
        setTimeout(() => resolve(true), 2000);
      });
    }

    // Reload page to start clean
    window.location.reload();
    return true;
  } catch (err) {
    alert('Failed to automatically clear database: ' + err.message + '\nPlease clear site cookies and data in your browser settings.');
    return false;
  }
}
