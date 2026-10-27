#!/usr/bin/env node
/**
 * DR FILMS Billing Suite - CLI Tool for Generating Signed Revocation Lists
 *
 * Produces a cryptographically signed revoked.json using the owner ECDSA P-256 private key.
 * Verifies signature with the embedded public key before writing to disk.
 *
 * Usage:
 *   node scripts/generate-revocation-list.mjs
 *   node scripts/generate-revocation-list.mjs --revoke lic_12345 --reason "Chargeback refund"
 *   node scripts/generate-revocation-list.mjs --list
 *   node scripts/generate-revocation-list.mjs --key /path/to/key.json --out dist/revoked.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { LICENSE_PUBLIC_KEY } from '../src/config/licensePublicKey.js';
import { base64UrlToBytes, bytesToBase64Url } from '../src/utils/licenseCrypto.js';

function parseArgs(args) {
  const options = {
    revokeId: null,
    reason: 'Revoked by administrator',
    listOnly: false,
    keyPath: path.join(os.homedir(), '.drfilms', 'license-private-key.json'),
    outputPath: path.resolve('public/revoked.json')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--revoke' && args[i + 1]) {
      options.revokeId = args[++i];
    } else if (arg === '--reason' && args[i + 1]) {
      options.reason = args[++i];
    } else if (arg === '--list') {
      options.listOnly = true;
    } else if (arg === '--key' && args[i + 1]) {
      options.keyPath = path.resolve(args[++i]);
    } else if (arg === '--out' && args[i + 1]) {
      options.outputPath = path.resolve(args[++i]);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // 1. Read existing revoked.json if present
  let existingDetails = [];
  if (fs.existsSync(options.outputPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(options.outputPath, 'utf8'));
      if (raw?.payload?.revokedDetails && Array.isArray(raw.payload.revokedDetails)) {
        existingDetails = raw.payload.revokedDetails;
      }
    } catch {
      // Start fresh if invalid
      existingDetails = [];
    }
  }

  if (options.listOnly) {
    console.log('Revocation List Path: ' + options.outputPath);
    console.log('Total Revoked Licenses: ' + existingDetails.length);
    for (const d of existingDetails) {
      console.log(`- ${d.licenseId} | Reason: ${d.reason} | Revoked: ${d.revokedAt}`);
    }
    return;
  }

  // 2. Add new revocation if specified
  if (options.revokeId) {
    const alreadyExists = existingDetails.some(d => d.licenseId === options.revokeId);
    if (!alreadyExists) {
      existingDetails.push({
        licenseId: options.revokeId,
        reason: options.reason,
        revokedAt: new Date().toISOString()
      });
      console.log(`Added license ${options.revokeId} to revocation list.`);
    } else {
      console.log(`License ${options.revokeId} is already in the revocation list.`);
    }
  }

  // 3. Load private key
  if (!fs.existsSync(options.keyPath)) {
    console.error(`ERROR: Private key not found at ${options.keyPath}`);
    console.error('Signing requires the ECDSA P-256 private key.');
    process.exit(1);
  }

  let jwk = null;
  try {
    jwk = JSON.parse(fs.readFileSync(options.keyPath, 'utf8'));
  } catch (err) {
    console.error(`ERROR: Failed to read private key JSON: ${err.message}`);
    process.exit(1);
  }

  const privKeyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });

  // 4. Construct payload
  const payload = {
    issuedAt: new Date().toISOString(),
    revokedIds: existingDetails.map(d => d.licenseId),
    revokedDetails: existingDetails
  };

  const payloadString = JSON.stringify(payload);
  const payloadBytes = Buffer.from(payloadString);

  // 5. Sign with ECDSA P-256 SHA-256 IEEE-P1363
  const sig = crypto.sign('SHA256', payloadBytes, {
    key: privKeyObj,
    dsaEncoding: 'ieee-p1363'
  });
  const signature = Buffer.from(sig).toString('base64url');

  const signedDocument = {
    payload,
    signature
  };

  // 6. Verify signature against public key before writing
  const subtlePubKey = await crypto.webcrypto.subtle.importKey(
    'jwk',
    LICENSE_PUBLIC_KEY,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const isValid = await crypto.webcrypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    subtlePubKey,
    base64UrlToBytes(signature),
    new TextEncoder().encode(payloadString)
  );

  if (!isValid) {
    console.error('CRITICAL: Signature verification failed against public key! Aborting write.');
    process.exit(1);
  }

  // 7. Write to output
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, JSON.stringify(signedDocument, null, 2), 'utf8');

  console.log(`SUCCESS: Signed revocation list written to ${options.outputPath}`);
  console.log(`Total Revoked IDs: ${payload.revokedIds.length}`);
  console.log(`Issued At: ${payload.issuedAt}`);
  console.log(`Signature: ${signature.slice(0, 32)}...`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
