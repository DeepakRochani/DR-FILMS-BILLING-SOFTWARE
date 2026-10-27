#!/usr/bin/env node
/**
 * One-time ECDSA P-256 keypair generator for DR FILMS Licensing Suite.
 * Generates an asymmetric keypair:
 * - Public key is embedded into src/config/licensePublicKey.js
 * - Private key is saved securely outside the repository (never committed)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const subtle = crypto.webcrypto.subtle;

async function generateKeypair() {
  console.log('Generating ECDSA P-256 keypair for DR FILMS software licensing...');

  const keyPair = await subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);

  // Determine private key save path
  const args = process.argv.slice(2);
  let privateKeyPath = '';
  const outPrivateIndex = args.indexOf('--out-private');
  if (outPrivateIndex !== -1 && args[outPrivateIndex + 1]) {
    privateKeyPath = path.resolve(args[outPrivateIndex + 1]);
  } else {
    // Default to ~/.drfilms/license-private-key.json
    const userDir = path.join(os.homedir(), '.drfilms');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    privateKeyPath = path.join(userDir, 'license-private-key.json');
  }

  // Write private key file (restricted permissions 0600)
  fs.writeFileSync(privateKeyPath, JSON.stringify(privateJwk, null, 2), {
    mode: 0o600
  });
  console.log(`Private key safely saved to: ${privateKeyPath}`);
  console.log('Notice: Never share, commit, or bundle this private key.');

  // Write public key file to src/config/licensePublicKey.js
  const publicConfigDir = path.resolve('src/config');
  if (!fs.existsSync(publicConfigDir)) {
    fs.mkdirSync(publicConfigDir, { recursive: true });
  }

  const publicConfigPath = path.join(publicConfigDir, 'licensePublicKey.js');
  const publicFileContent = `/**
 * Public Key for DR FILMS Asymmetric License Verification.
 * This public key is safe to embed in the client bundle.
 * It is only used to verify signatures created by the private key.
 */

export const LICENSE_PUBLIC_KEY = ${JSON.stringify(publicJwk, null, 2)};
`;

  fs.writeFileSync(publicConfigPath, publicFileContent, 'utf8');
  console.log(`Public key saved to: ${publicConfigPath}`);
  console.log('Keypair generation complete.');
  return { publicConfigPath, privateKeyPath };
}

generateKeypair().catch((err) => {
  console.error('Failed to generate keypair:', err);
  process.exit(1);
});
