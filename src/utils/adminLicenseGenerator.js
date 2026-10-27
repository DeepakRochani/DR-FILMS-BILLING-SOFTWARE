/**
 * DR FILMS Billing & Studio Management Suite - Admin License & Revocation Engine
 *
 * Isolated administrative utilities for ECDSA P-256 license generation and revocation signing.
 * THIS MODULE IS STRICTLY ISOLATED TO THE ADMIN BUILD AND NODE CLI TOOLS.
 * IT MUST NEVER BE IMPORTED BY THE CUSTOMER APPLICATION.
 *
 * Security Guarantee:
 * Private keys are handled strictly in-memory per session or loaded via local file picker.
 * Private key material is NEVER persisted to IndexedDB, localStorage, or sessionStorage.
 */

import { bytesToBase64Url, stringToBase64Url, base64UrlToBytes } from './licenseCrypto.js';
import { LICENSE_PUBLIC_KEY } from '../config/licensePublicKey.js';

/**
 * Parses and imports an ECDSA P-256 private key into an unextractable Web Crypto CryptoKey.
 * Accepts JWK JSON (string or object) or PKCS#8 PEM string.
 */
export async function importPrivateKeyInMemory(keyInput) {
  if (!keyInput) {
    throw new Error('Private key input is required');
  }

  const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle
    : null;

  if (!cryptoSubtle) {
    throw new Error('Web Crypto API (subtle) is not available in this environment');
  }

  // Already a CryptoKey
  const hasCryptoKeyClass = typeof globalThis !== 'undefined' && globalThis['CryptoKey'];
  if (keyInput?.type === 'private' || keyInput?.constructor?.name === 'CryptoKey' || (hasCryptoKeyClass && keyInput instanceof globalThis['CryptoKey'])) {
    return keyInput;
  }

  let jwk = null;
  if (typeof keyInput === 'string') {
    const trimmed = keyInput.trim();
    if (trimmed.startsWith('{')) {
      try {
        jwk = JSON.parse(trimmed);
      } catch (err) {
        throw new Error('Failed to parse private key JSON JWK: ' + err.message);
      }
    } else if (trimmed.includes('BEGIN')) {
      // PKCS#8 PEM format
      const cleanBase64 = trimmed
        .replace(/-----BEGIN [A-Z0-9 ]+-----/g, '')
        .replace(/-----END [A-Z0-9 ]+-----/g, '')
        .replace(/\s+/g, '');
      const derBytes = base64UrlToBytes(cleanBase64.replace(/\+/g, '-').replace(/\//g, '_'));
      return await cryptoSubtle.importKey(
        'pkcs8',
        derBytes,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, // non-extractable in memory
        ['sign']
      );
    } else {
      throw new Error('Unrecognized private key format. Provide JWK JSON or PKCS#8 PEM.');
    }
  } else if (typeof keyInput === 'object') {
    jwk = keyInput;
  }

  if (jwk) {
    return await cryptoSubtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, // non-extractable in memory
      ['sign']
    );
  }

  throw new Error('Invalid private key structure');
}

function getLocalKeyPath(pathMod, osMod) {
  const segs = ['license', 'private', 'key.json'];
  return pathMod.join(osMod.homedir(), '.drfilms', segs.join('-'));
}

/**
 * Generates an authentic ECDSA P-256 signed license key.
 * Can use an in-memory private key (WebCrypto) or read from local owner file in Node.js.
 */
export async function generateLicenseKeyAsync({
  privateKey = null,
  planTier = 'pro',
  durationDays = 365,
  isLifetime = false,
  clientCode = 'DRF',
  allowedFeatures = ['*'],
  billLimit = null,
  notes = ''
} = {}) {
  const today = new Date().toISOString().split('T')[0];
  let expiryDate = null;
  if (!isLifetime && planTier !== 'enterprise') {
    const exp = new Date(Date.now() + (Number(durationDays) || 365) * 24 * 60 * 60 * 1000);
    expiryDate = exp.toISOString().split('T')[0];
  }

  const payload = {
    licenseId: `lic_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
    customerName: clientCode || 'DR FILMS Studio',
    planTier: isLifetime ? 'enterprise' : planTier,
    issueDate: today,
    expiryDate: isLifetime ? null : expiryDate,
    isLifetime: Boolean(isLifetime || planTier === 'enterprise'),
    billLimit: billLimit !== null ? billLimit : (planTier === 'trial' ? 25 : null),
    allowedFeatures: Array.isArray(allowedFeatures) ? allowedFeatures : ['*']
  };

  const payloadB64 = stringToBase64Url(JSON.stringify(payload));
  const payloadBytes = new TextEncoder().encode(payloadB64);

  // 1. If in-memory privateKey is supplied, use WebCrypto
  if (privateKey) {
    const subtleKey = await importPrivateKeyInMemory(privateKey);
    const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : globalThis.crypto.subtle;
    const sigBuffer = await cryptoSubtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      subtleKey,
      payloadBytes
    );
    const sigB64 = bytesToBase64Url(new Uint8Array(sigBuffer));
    return {
      key: `DRF-${payloadB64}.${sigB64}`,
      payload,
      notes
    };
  }

  // 2. Node.js local file fallback (CLI tools and verification tests)
  const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  const nodeRequire = typeof globalThis !== 'undefined' ? globalThis['require'] : null;

  if (nodeProc && nodeProc.versions && nodeProc.versions.node && NodeBuffer) {
    const getModule = nodeProc.getBuiltinModule ? (m) => nodeProc.getBuiltinModule(m) : ((m) => null);
    const fs = getModule('node:fs') || (nodeRequire ? nodeRequire('node:fs') : null);
    const path = getModule('node:path') || (nodeRequire ? nodeRequire('node:path') : null);
    const os = getModule('node:os') || (nodeRequire ? nodeRequire('node:os') : null);
    const crypto = getModule('node:crypto') || (nodeRequire ? nodeRequire('node:crypto') : null);

    if (fs && path && os && crypto) {
      const keyPath = getLocalKeyPath(path, os);
      if (fs.existsSync(keyPath)) {
        const jwk = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        const privKeyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
        const sig = crypto.sign('SHA256', NodeBuffer.from(payloadB64), { key: privKeyObj, dsaEncoding: 'ieee-p1363' });
        const sigB64 = NodeBuffer.from(sig).toString('base64url');
        return {
          key: `DRF-${payloadB64}.${sigB64}`,
          payload,
          notes
        };
      }
    }
  }

  throw new Error('Private key required. Please paste or upload your private key into memory.');
}

/**
 * Synchronous wrapper for Node.js test suites.
 */
export function generateLicenseKey(options = {}) {
  const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  const nodeRequire = typeof globalThis !== 'undefined' ? globalThis['require'] : null;

  if (nodeProc && nodeProc.versions && nodeProc.versions.node && NodeBuffer) {
    const getModule = nodeProc.getBuiltinModule ? (m) => nodeProc.getBuiltinModule(m) : ((m) => null);
    const fs = getModule('node:fs') || (nodeRequire ? nodeRequire('node:fs') : null);
    const path = getModule('node:path') || (nodeRequire ? nodeRequire('node:path') : null);
    const os = getModule('node:os') || (nodeRequire ? nodeRequire('node:os') : null);
    const crypto = getModule('node:crypto') || (nodeRequire ? nodeRequire('node:crypto') : null);

    if (fs && path && os && crypto) {
      const keyPath = getLocalKeyPath(path, os);
      if (fs.existsSync(keyPath)) {
        const jwk = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        const privKeyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });

        const today = new Date().toISOString().split('T')[0];
        let expiryDate = null;
        const isLifetime = Boolean(options.isLifetime || options.planTier === 'enterprise');
        if (!isLifetime && options.planTier !== 'enterprise') {
          const exp = new Date(Date.now() + (Number(options.durationDays) || 365) * 24 * 60 * 60 * 1000);
          expiryDate = exp.toISOString().split('T')[0];
        }

        const payload = {
          licenseId: `lic_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
          customerName: options.clientCode || 'DR FILMS Studio',
          planTier: isLifetime ? 'enterprise' : (options.planTier || 'pro'),
          issueDate: today,
          expiryDate: isLifetime ? null : expiryDate,
          isLifetime,
          billLimit: options.billLimit !== undefined && options.billLimit !== null ? options.billLimit : (options.planTier === 'trial' ? 25 : null),
          allowedFeatures: Array.isArray(options.allowedFeatures) ? options.allowedFeatures : ['*']
        };

        const payloadB64 = NodeBuffer.from(JSON.stringify(payload)).toString('base64url');
        const sig = crypto.sign('SHA256', NodeBuffer.from(payloadB64), { key: privKeyObj, dsaEncoding: 'ieee-p1363' });
        const sigB64 = NodeBuffer.from(sig).toString('base64url');

        return `DRF-${payloadB64}.${sigB64}`;
      }
    }
  }

  throw new Error('Private key not found in owner configuration directory. Keys must be issued on owner machine with private key present.');
}

/**
 * Signs a revocation list payload with ECDSA P-256 SHA-256 IEEE-P1363 and returns the complete revoked.json structure.
 */
export async function generateSignedRevocationList({
  privateKey = null,
  revokedList = []
} = {}) {
  const payload = {
    issuedAt: new Date().toISOString(),
    revokedIds: revokedList.map(item => typeof item === 'string' ? item : item.licenseId),
    revokedDetails: revokedList.map(item => {
      if (typeof item === 'string') {
        return { licenseId: item, reason: 'Revoked by administrator', revokedAt: new Date().toISOString() };
      }
      return {
        licenseId: item.licenseId,
        reason: item.reason || 'Revoked by administrator',
        revokedAt: item.revokedAt || new Date().toISOString()
      };
    })
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // 1. In-memory private key via WebCrypto
  if (privateKey) {
    const subtleKey = await importPrivateKeyInMemory(privateKey);
    const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : globalThis.crypto.subtle;
    const sigBuffer = await cryptoSubtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      subtleKey,
      payloadBytes
    );
    const signature = bytesToBase64Url(new Uint8Array(sigBuffer));
    return { payload, signature };
  }

  // 2. Node.js local file fallback
  const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
  const NodeBuffer = typeof globalThis !== 'undefined' ? globalThis['Buffer'] : null;
  const nodeRequire = typeof globalThis !== 'undefined' ? globalThis['require'] : null;

  if (nodeProc && nodeProc.versions && nodeProc.versions.node && NodeBuffer) {
    const getModule = nodeProc.getBuiltinModule ? (m) => nodeProc.getBuiltinModule(m) : ((m) => null);
    const fs = getModule('node:fs') || (nodeRequire ? nodeRequire('node:fs') : null);
    const path = getModule('node:path') || (nodeRequire ? nodeRequire('node:path') : null);
    const os = getModule('node:os') || (nodeRequire ? nodeRequire('node:os') : null);
    const crypto = getModule('node:crypto') || (nodeRequire ? nodeRequire('node:crypto') : null);

    if (fs && path && os && crypto) {
      const keyPath = getLocalKeyPath(path, os);
      if (fs.existsSync(keyPath)) {
        const jwk = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        const privKeyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
        const sig = crypto.sign('SHA256', NodeBuffer.from(JSON.stringify(payload)), { key: privKeyObj, dsaEncoding: 'ieee-p1363' });
        const signature = NodeBuffer.from(sig).toString('base64url');
        return { payload, signature };
      }
    }
  }

  throw new Error('Private key required to sign revocation list.');
}
