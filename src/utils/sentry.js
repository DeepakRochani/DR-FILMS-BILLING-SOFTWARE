import * as Sentry from '@sentry/react';
import { db } from '../db/db.js';

let isInitialized = false;

// Regex patterns to scrub PII and financial details
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]*)?(?:(?:\d{5}[-.\s]*\d{5})|(?:\d{3}[-.\s]*\d{3}[-.\s]*\d{4})|(?:\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4})|\b\d{10,12}\b)/g;
const UPI_REGEX = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;
const CURRENCY_REGEX = /(?:₹|Rs\.?|INR|\$)\s*[0-9,]+(?:\.[0-9]{1,2})?/gi;
const FINANCIAL_NUMBER_REGEX = /\b\d{4,12}(?:\.\d{2})?\b/g;

/**
 * Scrub sensitive client PII and financial amounts from any string
 */
export function scrubSensitiveString(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(UPI_REGEX, '[REDACTED_UPI]')
    .replace(PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(CURRENCY_REGEX, '[REDACTED_AMOUNT]');
}

/**
 * Recursive sanitizer for breadcrumb or context objects
 */
function sanitizeContext(obj, depth = 0) {
  if (depth > 4 || !obj) return obj;
  if (typeof obj === 'string') return scrubSensitiveString(obj);
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeContext(item, depth + 1));
  }

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    // Drop known sensitive keys entirely
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('phone') ||
      lowerKey.includes('email') ||
      lowerKey.includes('customer') ||
      lowerKey.includes('client') ||
      lowerKey.includes('upi') ||
      lowerKey.includes('account') ||
      lowerKey.includes('bank') ||
      lowerKey.includes('balance') ||
      lowerKey.includes('subtotal') ||
      lowerKey.includes('total') ||
      lowerKey.includes('pin') ||
      lowerKey.includes('pass') ||
      lowerKey.includes('secret')
    ) {
      clean[key] = '[REDACTED]';
    } else {
      clean[key] = sanitizeContext(val, depth + 1);
    }
  }
  return clean;
}

/**
 * Check if Sentry is enabled in user settings
 */
export async function isSentryEnabled() {
  try {
    if (!db?.settings) return true;
    const rec = await db.settings.get('sentry_settings');
    // Enabled by default unless explicitly disabled by user
    return rec?.enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Save user Sentry crash reporting preference
 */
export async function setSentryEnabled(enabled) {
  try {
    if (!db?.settings) return;
    await db.settings.put({
      key: 'sentry_settings',
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to update Sentry settings:', err);
  }
}

/**
 * Initialize Sentry error reporting with PII & financial scrubbing
 */
export async function initSentry() {
  if (isInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // Sentry DSN not provided in environment, skip initialization
    return;
  }

  const enabled = await isSentryEnabled();
  if (!enabled) {
    return;
  }

  try {
    Sentry.init({
      dsn,
      release: 'dr-films-billing@1.0.0',
      environment: import.meta.env.MODE || 'production',
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Strip out user identifier to guarantee anonymity
        delete event.user;

        // Clean event message
        if (event.message) {
          event.message = scrubSensitiveString(event.message);
        }

        // Clean exception values
        if (event.exception?.values) {
          event.exception.values.forEach(val => {
            if (val.value) {
              val.value = scrubSensitiveString(val.value);
            }
          });
        }

        // Clean breadcrumbs
        if (Array.isArray(event.breadcrumbs)) {
          event.breadcrumbs = event.breadcrumbs.map(bc => {
            if (bc.message) bc.message = scrubSensitiveString(bc.message);
            if (bc.data) bc.data = sanitizeContext(bc.data);
            return bc;
          });
        }

        // Clean extra context
        if (event.extra) {
          event.extra = sanitizeContext(event.extra);
        }

        // Clean request URL params if present
        if (event.request?.url) {
          try {
            const parsed = new URL(event.request.url);
            event.request.url = `${parsed.origin}${parsed.pathname}`;
          } catch {
            // Ignore parse errors
          }
        }

        return event;
      }
    });

    isInitialized = true;
  } catch (err) {
    console.error('Sentry initialization error:', err);
  }
}

/**
 * Capture error safely with scrubbing
 */
export function captureAppError(error, context = {}) {
  const cleanContext = sanitizeContext(context);
  console.error('[DR FILMS ERROR]', error, cleanContext);
  if (isInitialized) {
    Sentry.captureException(error, { extra: cleanContext });
  }
}
