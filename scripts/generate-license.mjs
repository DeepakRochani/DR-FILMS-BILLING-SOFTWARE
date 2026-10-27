#!/usr/bin/env node
/**
 * CLI Tool to generate cryptographically signed DR FILMS licenses.
 * Uses ECDSA P-256 + SHA-256 via Web Crypto API.
 *
 * Usage:
 *   node scripts/generate-license.mjs --customer "Royal Studio" --plan pro --duration 365
 *   node scripts/generate-license.mjs --customer "DR FILMS" --plan enterprise --lifetime
 *   node scripts/generate-license.mjs --customer "Starter Studio" --plan starter --duration 365 --features quotes,expenses
 *   node scripts/generate-license.mjs --sign-revocation lic_12345,lic_67890 --out revoked.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const subtle = crypto.webcrypto.subtle;

// Helper: base64url conversions
function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function stringToBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64UrlToBytes(b64url) {
  return Buffer.from(b64url, 'base64url');
}

// Available features constant
export const ALL_FEATURES = [
  'quotes',
  'projects',
  'expenses',
  'reports',
  'hour_calculator',
  'wedding_suite',
  'contracts',
  'receipts',
  'whatsapp',
  'google_sheets',
  'direct_client',
  'theme_switcher'
];

async function loadPrivateKey(customPath) {
  const privateKeyPath = customPath 
    ? path.resolve(customPath)
    : path.join(os.homedir(), '.drfilms', 'license-private-key.json');

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(
      `Private key not found at ${privateKeyPath}. Run 'node scripts/generate-keypair.mjs' first.`
    );
  }

  const jwkContent = JSON.parse(fs.readFileSync(privateKeyPath, 'utf8'));
  return await subtle.importKey(
    'jwk',
    jwkContent,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );
}

export async function signLicensePayload(payload, privateKey) {
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = stringToBase64Url(payloadJson);
  const dataToSign = new TextEncoder().encode(payloadBase64);

  const signatureBuffer = await subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    dataToSign
  );

  const signatureBase64 = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `DRF-${payloadBase64}.${signatureBase64}`;
}

export async function signRevocationList(revokedIds, privateKey) {
  const payload = {
    revokedIds: Array.isArray(revokedIds) ? revokedIds : [],
    updatedAt: new Date().toISOString()
  };
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = stringToBase64Url(payloadJson);
  const dataToSign = new TextEncoder().encode(payloadBase64);

  const signatureBuffer = await subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    dataToSign
  );

  return {
    payload,
    signature: bytesToBase64Url(new Uint8Array(signatureBuffer)),
    rawSignedToken: `${payloadBase64}.${bytesToBase64Url(new Uint8Array(signatureBuffer))}`
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback = '') => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  // Help flag
  if (hasFlag('help') || args.length === 0) {
    console.log(`DR FILMS License Generator CLI
Usage:
  node scripts/generate-license.mjs [options]

Options:
  --customer <name>     Customer/Studio name (default: "DR FILMS Creative Studios")
  --plan <tier>         Plan tier: trial | starter | pro | enterprise (default: pro)
  --duration <days>     Duration in days (default: 365, ignored if --lifetime)
  --lifetime            Issue a permanent lifetime license
  --bill-limit <n>      Maximum allowed bills (default: null/unlimited, 25 for trial)
  --features <list>     Allowed features comma-separated, or '*' for all (default: '*')
  --id <licenseId>      Custom license ID (default: auto-generated)
  --private-key <path>  Custom path to private key (default: ~/.drfilms/license-private-key.json)
  --sign-revocation <ids> Comma-separated list of revoked license IDs to sign
  --out <path>          Output file path for revoked list (used with --sign-revocation)
`);
    return;
  }

  const privateKey = await loadPrivateKey(getArg('private-key'));

  // Handle revocation signing mode
  if (hasFlag('sign-revocation')) {
    const idsString = getArg('sign-revocation');
    const ids = idsString.split(',').map(s => s.trim()).filter(Boolean);
    const signedRevocation = await signRevocationList(ids, privateKey);
    const outPath = getArg('out', 'revoked.json');
    fs.writeFileSync(outPath, JSON.stringify(signedRevocation, null, 2), 'utf8');
    console.log(`Signed revocation list saved to ${outPath}`);
    console.log(`Revoked IDs: ${ids.join(', ') || '(none)'}`);
    return;
  }

  // License creation mode
  const customer = getArg('customer', 'DR FILMS Creative Studios');
  const plan = getArg('plan', 'pro').toLowerCase();
  const isLifetime = hasFlag('lifetime') || plan === 'enterprise';
  const durationDays = isLifetime ? null : parseInt(getArg('duration', '365'), 10);
  const customId = getArg('id', '');
  const licenseId = customId || `lic_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const today = new Date();
  const issueDate = today.toISOString().split('T')[0];

  let expiryDate = null;
  if (!isLifetime && durationDays) {
    const exp = new Date(today.getTime() + durationDays * 24 * 60 * 60 * 1000);
    expiryDate = exp.toISOString().split('T')[0];
  }

  // Bill limit
  let billLimit = null;
  const billLimitArg = getArg('bill-limit');
  if (billLimitArg) {
    billLimit = parseInt(billLimitArg, 10);
  } else if (plan === 'trial') {
    billLimit = 25;
  }

  // Allowed features
  const featuresArg = getArg('features', '*');
  let allowedFeatures = ['*'];
  if (featuresArg !== '*') {
    allowedFeatures = featuresArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  const payload = {
    licenseId,
    customerName: customer,
    planTier: isLifetime ? 'enterprise' : plan,
    issueDate,
    expiryDate: isLifetime ? null : expiryDate,
    isLifetime,
    billLimit,
    allowedFeatures
  };

  const signedKey = await signLicensePayload(payload, privateKey);

  console.log('------------------------------------------------------------');
  console.log('DR FILMS SECURE ASYMMETRIC LICENSE KEY GENERATED');
  console.log('------------------------------------------------------------');
  console.log(`License ID:        ${licenseId}`);
  console.log(`Customer:          ${customer}`);
  console.log(`Plan Tier:         ${payload.planTier}`);
  console.log(`Expiry Date:       ${payload.expiryDate || 'Permanent / Lifetime'}`);
  console.log(`Bill Limit:        ${billLimit ? billLimit : 'Unlimited'}`);
  console.log(`Allowed Features:  ${allowedFeatures.join(', ')}`);
  console.log('------------------------------------------------------------');
  console.log('LICENSE KEY:');
  console.log(signedKey);
  console.log('------------------------------------------------------------');
}

// Only execute when run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('generate-license.mjs')) {
  runCli().catch(err => {
    console.error('Error generating license:', err.message);
    process.exit(1);
  });
}
