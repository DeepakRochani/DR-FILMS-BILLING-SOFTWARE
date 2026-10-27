import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Customer Distribution Bundle Security Scanner
 * 
 * Scans customer distribution build artifacts (dist/) to strictly verify
 * that no administrative components, in-app key generators, private keys,
 * or embedded lifetime keys are present.
 * 
 * Searches for minification-proof string literals that survive JS minification
 * (UI headings, storage key names, private key filenames, and cryptographic markers).
 */

export const FORBIDDEN_STRING_LITERALS = [
  // Private Key Markers & File References
  { token: 'BEGIN PRIVATE KEY', description: 'PKCS#8 Private Key PEM Header' },
  { token: 'BEGIN EC PRIVATE KEY', description: 'SEC1 EC Private Key PEM Header' },
  { token: 'license-private-key.json', description: 'Private Key JSON File Reference' },
  { token: 'license-private-key', description: 'Private Key Path Reference' },

  // Admin PIN Storage Key Names & State Tokens
  { token: 'admin_security_profile', description: 'Admin Master PIN Storage Key' },
  { token: 'drfilms_admin_auth', description: 'Admin Session Storage Auth Token' },

  // Distinctive Admin UI Text (survives minification as exact string literals)
  { token: 'Admin Control Portal', description: 'Admin Portal Header Text' },
  { token: 'Return to Billing Studio', description: 'Admin Navigation Button Text' },
  { token: 'System Maintenance Underway', description: 'Maintenance Screen Heading' },
  { token: 'Generate Signed License Key', description: 'License Generator UI Text' },
  { token: 'Revocation List Management', description: 'Admin Revocation Manager UI Text' },
  { token: 'Enter Admin Master PIN', description: 'Admin PIN Prompt UI Text' },
  { token: 'Customer License Directory', description: 'Admin Customer Directory UI Text' },

  // Hardcoded Lifetime Key Signature
  { token: 'DRF-eyJ', description: 'Hardcoded Lifetime License Key' }
];

export function scanCustomerDist(distDir = path.resolve('dist')) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Customer dist directory does not exist at ${distDir}. Run "npm run build:customer" first.`);
  }

  function getFilesRecursively(dir) {
    let files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getFilesRecursively(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allFiles = getFilesRecursively(distDir);
  const scannedFiles = allFiles.filter(f => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json'));

  const violations = [];

  for (const filePath of scannedFiles) {
    const relPath = path.relative(distDir, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const rule of FORBIDDEN_STRING_LITERALS) {
      if (content.includes(rule.token)) {
        violations.push({
          file: relPath,
          token: rule.token,
          description: rule.description
        });
      }
    }
  }

  return {
    scannedFilesCount: scannedFiles.length,
    scannedFiles: scannedFiles.map(f => path.relative(distDir, f)),
    violations,
    isClean: violations.length === 0
  };
}

/**
 * Injection verification test: creates a sandbox copy of the bundle,
 * injects a forbidden string literal, and asserts that the scan detects the violation.
 */
export function testBundleScanInjection(targetDist = path.resolve('dist')) {
  if (!fs.existsSync(targetDist)) {
    throw new Error(`Target dist does not exist at ${targetDist}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drfilms-bundle-test-'));
  try {
    // Copy the dist files into tempDir
    function copyDir(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
    copyDir(targetDist, tempDir);

    // Verify clean bundle first
    const cleanCheck = scanCustomerDist(tempDir);
    if (!cleanCheck.isClean) {
      throw new Error('Base bundle copy in tempDir is not clean before injection test');
    }

    // Find the primary index.html or first JS chunk in tempDir to inject
    const jsFiles = fs.readdirSync(path.join(tempDir, 'assets')).filter(f => f.endsWith('.js'));
    const targetFile = path.join(tempDir, 'assets', jsFiles[0]);

    // Inject forbidden string literal: 'admin_security_profile'
    const originalContent = fs.readFileSync(targetFile, 'utf8');
    const injectedContent = originalContent + '\n/* INJECTED TEST */ const secret = "admin_security_profile";\n';
    fs.writeFileSync(targetFile, injectedContent, 'utf8');

    // Run scanner on poisoned directory
    const poisonedCheck = scanCustomerDist(tempDir);

    if (poisonedCheck.isClean) {
      throw new Error('Poisoned bundle test failed: scanner did not detect injected string literal!');
    }

    const foundInjected = poisonedCheck.violations.some(v => v.token === 'admin_security_profile');
    if (!foundInjected) {
      throw new Error('Poisoned bundle test failed: expected violation for admin_security_profile was not reported');
    }

    return {
      passed: true,
      injectedToken: 'admin_security_profile',
      violationsReported: poisonedCheck.violations.length
    };
  } finally {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

import { fileURLToPath } from 'node:url';

// CLI execution
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    console.log('Scanning customer dist/ bundle for minification-proof administrative string literals...');
    const result = scanCustomerDist();
    
    console.log(`Scanned ${result.scannedFilesCount} file(s) in dist/:`);
    result.scannedFiles.forEach(f => console.log(`  - ${f}`));

    if (!result.isClean) {
      console.error('\nSECURITY SCAN FAILED: Forbidden string literals detected in customer bundle:');
      result.violations.forEach(v => {
        console.error(`  VIOLATION: Found "${v.token}" (${v.description}) in ${v.file}`);
      });
      process.exit(1);
    }

    console.log('\nCustomer bundle is 100% clean. Zero admin string literals, storage keys, or private key markers found.');

    console.log('\nRunning scanner injection test...');
    const injectionResult = testBundleScanInjection();
    console.log(`Injection test PASSED: successfully detected poisoned token "${injectionResult.injectedToken}" with ${injectionResult.violationsReported} violation(s).`);
  } catch (err) {
    console.error('Scan error:', err.message);
    process.exit(1);
  }
}
