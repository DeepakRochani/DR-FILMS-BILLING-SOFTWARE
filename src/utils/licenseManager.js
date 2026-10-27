/**
 * License & Subscription Management Engine for DR FILMS Billing Suite.
 *
 * Implements:
 * - Asymmetric ECDSA P-256 license signature verification
 * - Re-verification of raw signed keys on every launch (never trusts raw DB fields)
 * - Clock rollback detection and progressive lockout
 * - 14-day / 25-bill real Free Trial management
 * - AllowedFeatures switchboard enforcement
 * - Fail-open online revocation check
 */

import { db } from '../db/db.js';
import { logAuditEvent, AUDIT_CATEGORIES } from './auditLogger.js';
import { 
  verifyLicenseKey as verifyLicenseKeyCrypto, 
  verifyLicenseKeySync, 
  checkClockTampering, 
  isFeatureAllowedByLicense 
} from './licenseCrypto.js';
import { checkLicenseRevocation } from './revocationManager.js';

export const PLAN_TIERS = {
  trial: {
    id: 'trial',
    name: 'Free Trial',
    badge: 'Trial',
    maxBills: 25,
    maxClients: 15,
    durationDays: 14,
    description: '14-Day trial with basic invoicing limits'
  },
  starter: {
    id: 'starter',
    name: 'Starter Studio',
    badge: 'Starter',
    maxBills: 500,
    maxClients: 100,
    durationDays: 365,
    description: 'Standard studio annual plan with invoicing limits'
  },
  pro: {
    id: 'pro',
    name: 'Pro Studio Suite',
    badge: 'Pro Suite',
    maxBills: null,
    maxClients: null,
    durationDays: 365,
    description: 'Full studio suite with all features and unlimited billing'
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise / Lifetime',
    badge: 'Lifetime',
    maxBills: null,
    maxClients: null,
    durationDays: null,
    description: 'Perpetual lifetime license with priority features'
  }
};

/**
 * Synchronous / Promise-compatible verifyLicenseKey export for runtime verification.
 */
export function verifyLicenseKey(keyString) {
  return verifyLicenseKeyImmediate(keyString);
}


/**
 * In-memory verification cache to avoid duplicate cryptographic checks on each re-render.
 */
const verifiedKeyCache = new Map();

/**
 * Asynchronously verifies and caches a license key.
 */
export async function preVerifyLicenseKey(keyString) {
  if (!keyString) return null;
  const cleanKey = keyString.trim();
  if (verifiedKeyCache.has(cleanKey)) {
    return verifiedKeyCache.get(cleanKey);
  }
  const result = await verifyLicenseKeyCrypto(cleanKey);
  verifiedKeyCache.set(cleanKey, result);
  return result;
}

/**
 * Synchronous license key verification for immediate UI render and Node.js testing.
 */
export function verifyLicenseKeyImmediate(keyString) {
  if (!keyString) return { valid: false, isValid: false, error: 'Key is required' };
  const cleanKey = keyString.trim();
  if (verifiedKeyCache.has(cleanKey)) {
    return verifiedKeyCache.get(cleanKey);
  }

  // If in Node.js environment, use synchronous crypto
  const nodeProc = typeof globalThis !== 'undefined' ? globalThis['process'] : null;
  if (nodeProc && nodeProc.versions && nodeProc.versions.node) {
    const res = verifyLicenseKeySync(cleanKey);
    verifiedKeyCache.set(cleanKey, res);
    return res;
  }

  // In browser, trigger async verification in background and return pending/unverified
  preVerifyLicenseKey(cleanKey);
  return { valid: false, isValid: false, pending: true, error: 'Verifying license...' };
}

/**
 * Checks if a specific feature module is permitted by the active subscription / license.
 */
export function isModulePermitted(flagKey, subscriptionStatus) {
  if (!subscriptionStatus || subscriptionStatus.isLocked) {
    return false;
  }
  const allowed = subscriptionStatus.allowedFeatures || ['*'];
  return isFeatureAllowedByLicense(flagKey, allowed);
}

/**
 * Computes subscription status, days remaining, limits, and lockouts.
 * Re-verifies cryptographic signature on every check and never trusts stored IndexedDB expiry/tier fields.
 */
export function calculateSubscriptionStatus(subscriptionConfig, invoiceCount = 0) {
  // 1. Clock-tampering check
  const clockCheck = checkClockTampering();
  if (clockCheck.tampered) {
    const reasonText = 'System clock rollback detected. Your computer clock appears to have been set backwards. Please restore the correct system date and time.';
    return {
      isLocked: true,
      status: 'clock_tampered',
      planTier: 'invalid',
      planName: 'Security Lock',
      isLifetime: false,
      daysRemaining: 0,
      formattedExpiry: 'Clock Error',
      billsRemaining: 0,
      reason: reasonText,
      lockReason: reasonText,
      lockReasonCode: 'CLOCK_TAMPERED',
      allowedFeatures: []
    };
  }

  // 2. Explicit admin suspension
  if (subscriptionConfig?.status === 'suspended') {
    const reasonText = 'This software installation has been suspended by the administrator.';
    return {
      isLocked: true,
      status: 'suspended',
      planTier: subscriptionConfig?.planTier || 'pro',
      planName: 'Suspended Installation',
      isLifetime: false,
      daysRemaining: 0,
      formattedExpiry: subscriptionConfig?.expiryDate || 'Suspended',
      billsRemaining: 0,
      reason: reasonText,
      lockReason: reasonText,
      lockReasonCode: 'SUSPENDED',
      allowedFeatures: []
    };
  }

  const rawKey = subscriptionConfig?.licenseKey?.trim();

  // 3. If a signed license key exists, verify signature
  if (rawKey) {
    const verified = verifyLicenseKeyImmediate(rawKey);

    if (verified.pending) {
      // Async verify still running in browser
      return {
        isLocked: false,
        status: 'verifying',
        planTier: 'pro',
        planName: 'Verifying License...',
        isLifetime: false,
        daysRemaining: 1,
        formattedExpiry: 'Verifying...',
        billsRemaining: null,
        allowedFeatures: ['*']
      };
    }

    if (!verified.isValid) {
      const reasonText = verified.error || 'Cryptographic signature is invalid. The license key has been tampered with or is invalid.';
      return {
        isLocked: true,
        status: 'invalid_signature',
        planTier: 'invalid',
        planName: 'Invalid License Key',
        isLifetime: false,
        daysRemaining: 0,
        formattedExpiry: 'Signature Failed',
        billsRemaining: 0,
        reason: reasonText,
        lockReason: reasonText,
        lockReasonCode: 'INVALID_SIGNATURE',
        allowedFeatures: []
      };
    }

    const payload = verified.payload;
    const planTier = payload.planTier || 'pro';
    const planInfo = PLAN_TIERS[planTier] || PLAN_TIERS.pro;
    const allowedFeatures = Array.isArray(payload.allowedFeatures) ? payload.allowedFeatures : ['*'];

    // Lifetime License
    if (payload.isLifetime || planTier === 'enterprise') {
      return {
        isLocked: false,
        status: 'active',
        planTier: 'enterprise',
        planName: 'Enterprise / Lifetime',
        isLifetime: true,
        daysRemaining: 9999,
        formattedExpiry: 'Permanent Lifetime License',
        billsRemaining: null,
        reason: null,
        lockReason: null,
        lockReasonCode: null,
        allowedFeatures,
        customerName: payload.customerName,
        licenseId: payload.licenseId
      };
    }

    // Fixed-Duration Plan
    const now = new Date();
    const expiryDateStr = payload.expiryDate;
    const targetExpiry = new Date(expiryDateStr + 'T23:59:59');
    const diffMs = targetExpiry.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Bill limit check (if specified in signed payload)
    if (payload.billLimit && invoiceCount >= payload.billLimit) {
      const reasonText = `Plan bill limit reached (${invoiceCount} of ${payload.billLimit} bills created). Please upgrade your subscription.`;
      return {
        isLocked: true,
        status: 'expired',
        planTier,
        planName: planInfo.name,
        isLifetime: false,
        daysRemaining: Math.max(0, daysRemaining),
        formattedExpiry: expiryDateStr,
        billsRemaining: 0,
        reason: reasonText,
        lockReason: reasonText,
        lockReasonCode: 'BILL_LIMIT_REACHED',
        allowedFeatures,
        customerName: payload.customerName,
        licenseId: payload.licenseId
      };
    }

    // Expiration date checks
    if (daysRemaining < 0) {
      const overdueDays = Math.abs(daysRemaining);
      const graceDays = subscriptionConfig?.gracePeriodDays ?? 3;
      if (overdueDays <= graceDays) {
        const reasonText = `Your subscription expired on ${expiryDateStr}. You are currently in a ${graceDays}-day grace period.`;
        return {
          isLocked: false,
          isGracePeriod: true,
          status: 'grace_period',
          planTier,
          planName: planInfo.name,
          isLifetime: false,
          daysRemaining: 0,
          formattedExpiry: expiryDateStr,
          billsRemaining: null,
          reason: reasonText,
          lockReason: null,
          lockReasonCode: null,
          allowedFeatures,
          customerName: payload.customerName,
          licenseId: payload.licenseId
        };
      }

      const reasonText = `Your ${planInfo.name} subscription expired on ${expiryDateStr}. Please enter a renewal activation key to continue.`;
      return {
        isLocked: true,
        status: 'expired',
        planTier,
        planName: planInfo.name,
        isLifetime: false,
        daysRemaining: 0,
        formattedExpiry: expiryDateStr,
        billsRemaining: 0,
        reason: reasonText,
        lockReason: reasonText,
        lockReasonCode: 'EXPIRED',
        allowedFeatures,
        customerName: payload.customerName,
        licenseId: payload.licenseId
      };
    }

    return {
      isLocked: false,
      status: 'active',
      planTier,
      planName: planInfo.name,
      isLifetime: false,
      daysRemaining,
      formattedExpiry: expiryDateStr,
      billsRemaining: null,
      reason: null,
      lockReason: null,
      lockReasonCode: null,
      allowedFeatures,
      customerName: payload.customerName,
      licenseId: payload.licenseId
    };
  }

  // 4. No signed license key -> 14-day / 25-bill Free Trial
  const trialStartStr = subscriptionConfig?.trialStartDate || subscriptionConfig?.startDate || new Date().toISOString().split('T')[0];
  const trialMaxBills = subscriptionConfig?.trialMaxBills || 25;
  const trialDurationDays = subscriptionConfig?.trialDurationDays || 14;

  const trialStartDate = new Date(trialStartStr + 'T00:00:00');
  const trialExpiryDate = new Date(trialStartDate.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = trialExpiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const trialExpiryFormatted = trialExpiryDate.toISOString().split('T')[0];

  // Trial bill limit check
  if (invoiceCount >= trialMaxBills) {
    const reasonText = `Trial bill limit reached (${invoiceCount} of ${trialMaxBills} bills created). Please upgrade your subscription to continue creating bills.`;
    return {
      isLocked: true,
      status: 'expired',
      planTier: 'trial',
      planName: 'Free Trial',
      isLifetime: false,
      daysRemaining: Math.max(0, daysRemaining),
      formattedExpiry: trialExpiryFormatted,
      billsRemaining: 0,
      reason: reasonText,
      lockReason: reasonText,
      lockReasonCode: 'TRIAL_LIMIT_REACHED',
      allowedFeatures: ['*']
    };
  }

  // Trial duration check
  if (daysRemaining < 0) {
    const reasonText = `Your 14-day free trial expired on ${trialExpiryFormatted}. Please enter an activation key to continue.`;
    return {
      isLocked: true,
      status: 'expired',
      planTier: 'trial',
      planName: 'Free Trial',
      isLifetime: false,
      daysRemaining: 0,
      formattedExpiry: trialExpiryFormatted,
      billsRemaining: Math.max(0, trialMaxBills - invoiceCount),
      reason: reasonText,
      lockReason: reasonText,
      lockReasonCode: 'EXPIRED',
      allowedFeatures: ['*']
    };
  }

  return {
    isLocked: false,
    status: 'trial',
    planTier: 'trial',
    planName: 'Free Trial',
    isLifetime: false,
    daysRemaining,
    formattedExpiry: `${daysRemaining} days left in trial`,
    billsRemaining: Math.max(0, trialMaxBills - invoiceCount),
    reason: null,
    lockReason: null,
    lockReasonCode: null,
    allowedFeatures: ['*']
  };
}

/**
 * Activates a subscription using an entered signed license key.
 */
export async function activateWithLicenseKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return { success: false, error: 'Please enter a valid license key' };
  }

  const cleanKey = keyString.trim();
  const verified = await verifyLicenseKey(cleanKey);

  if (!verified.isValid) {
    return { success: false, error: verified.error || 'Cryptographic verification failed' };
  }

  // Check online revocation
  if (verified.licenseId) {
    const revocation = await checkLicenseRevocation(verified.licenseId);
    if (revocation.isRevoked) {
      return { success: false, error: 'This license has been revoked by the studio administrator' };
    }
  }

  // Cache verified payload
  verifiedKeyCache.set(cleanKey, verified);

  const payload = verified.payload;
  const current = (await db.settings.get('admin_subscription_config')) || {};

  const updatedConfig = {
    ...current,
    key: 'admin_subscription_config',
    clientStudioName: payload.customerName || current.clientStudioName || 'Studio Billing',
    planTier: payload.planTier,
    status: 'active',
    expiryDate: payload.isLifetime ? null : payload.expiryDate,
    isLifetime: Boolean(payload.isLifetime),
    licenseKey: cleanKey,
    licenseId: payload.licenseId,
    billLimit: payload.billLimit || null,
    allowedFeatures: payload.allowedFeatures || ['*'],
    lastRenewedAt: new Date().toISOString()
  };

  await db.settings.put(updatedConfig);

  await logAuditEvent({
    category: AUDIT_CATEGORIES.SETTINGS,
    action: payload.isLifetime ? 'SUBSCRIPTION_LIFETIME_ACTIVATED' : 'SUBSCRIPTION_EXTENDED',
    details: `Signed license key activated for ${payload.customerName} (Plan: ${payload.planTier}, ID: ${payload.licenseId})`
  });

  // Synchronize monotonic clock state upon authentic license activation
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('drfilms_license_clock_state', JSON.stringify({ lastSeen: Date.now() }));
    } catch {}
  } else if (typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.setItem('drfilms_license_clock_state', JSON.stringify({ lastSeen: Date.now() }));
    } catch {}
  }

  return {
    success: true,
    planTier: payload.planTier,
    planName: PLAN_TIERS[payload.planTier]?.name || 'Studio License',
    expiryDate: payload.expiryDate || 'Permanent / Lifetime',
    isLifetime: payload.isLifetime,
    allowedFeatures: payload.allowedFeatures || ['*']
  };
}

// Backward compatibility export alias for runtime verification suites
export { verifyLicenseKey as verifyLicenseKeyAsync };
