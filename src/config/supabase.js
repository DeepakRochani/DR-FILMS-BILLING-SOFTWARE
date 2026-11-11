import { createClient } from '@supabase/supabase-js';

// Default Supabase project credentials for DR FILMS Studio
export const DEFAULT_SUPABASE_URL = 'https://wzoikmcpaempxnxosnve.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6b2lrbWNwYWVtcHhueG9zbnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTkyMDAsImV4cCI6MjEwODY3NTIwMH0.yyeaHLYEQA7v5jglCFBr1uTO1-P9sUmZg7pcZQXTyfE';
export const SUPABASE_PROJECT_ID = 'wzoikmcpaempxnxosnve';
export const SUPABASE_REGION = 'ap-southeast-2';

export const STORAGE_KEY_URL = 'drfilms_supabase_url';
export const STORAGE_KEY_KEY = 'drfilms_supabase_anon_key';
export const STORAGE_KEY_STUDIO_AUTH = 'drfilms_studio_cloud_authorized';

/**
 * Check if the current device is authorized as DR FILMS Studio Owner/Admin.
 * Localhost is always authorized for the owner.
 * On public deployments (e.g. Vercel), owner authorization is unlocked
 * via the 4-digit Master PIN (0303) or by signing in with the owner email.
 */
export function isStudioCloudAuthorized() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return true;
    }
    return localStorage.getItem(STORAGE_KEY_STUDIO_AUTH) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set studio owner cloud authorization state
 */
export function setStudioCloudAuthorized(authorized) {
  if (typeof localStorage === 'undefined') return;
  if (authorized) {
    localStorage.setItem(STORAGE_KEY_STUDIO_AUTH, 'true');
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('drfilms:owner-authorized'));
      } catch {}
    }
  } else {
    localStorage.removeItem(STORAGE_KEY_STUDIO_AUTH);
  }
}

/**
 * Check if custom Supabase credentials have been configured by a third-party user
 */
export function isCustomSupabaseConfigured() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY_URL) && localStorage.getItem(STORAGE_KEY_KEY));
  } catch {
    return false;
  }
}

/**
 * Get current authenticated user profile from local Supabase Auth cache
 */
export function getCurrentAuthUser() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const authKey = `sb-${SUPABASE_PROJECT_ID}-auth-token`;
    const raw = localStorage.getItem(authKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch {
    return null;
  }
}

/**
 * Get the effective tenant user_id for cloud queries and synchronization:
 * 1. If an authenticated user exists (Google, Apple, or Email):
 *    - If email matches owner (contact@drfilms.studio or deepurochani@gmail.com), returns 'admin'.
 *    - Otherwise returns the user's isolated UUID.
 * 2. If the device is authorized as Studio Owner (PIN 0303 or localhost), returns 'admin'.
 * 3. Otherwise returns null (Private Local Mode).
 */
export function getEffectiveCloudUserId() {
  const user = getCurrentAuthUser();
  if (user) {
    const email = String(user.email || '').toLowerCase().trim();
    if (['contact@drfilms.studio', 'deepurochani@gmail.com'].includes(email)) {
      return 'admin';
    }
    if (user.id) {
      return String(user.id);
    }
  }

  if (isStudioCloudAuthorized()) {
    return 'admin';
  }

  return null;
}

/**
 * Check if the active session belongs to the DR FILMS Studio Admin
 */
export function isAdminAuthenticated() {
  return getEffectiveCloudUserId() === 'admin';
}

/**
 * Check if cloud sync is active on this device:
 * True if user is signed in with Google/Apple/Email, or if owner PIN is verified,
 * or if custom Supabase is configured.
 * False by default for anonymous public visitors to guarantee private, isolated billing software.
 */
export function isCloudSyncActive() {
  return isStudioCloudAuthorized() || isCustomSupabaseConfigured() || Boolean(getEffectiveCloudUserId());
}

/**
 * Verify Studio Owner passcode (accepts 0303 or owner hash or fallback secret)
 */
export async function verifyAndAuthorizeStudioCloud(passcode) {
  const clean = String(passcode || '').trim();
  if (!clean) {
    return { success: false, error: 'Please enter the Studio Owner Passcode' };
  }

  if (clean === '0303' || clean === '1989' || clean === 'drfilms2026') {
    setStudioCloudAuthorized(true);
    return { success: true };
  }

  try {
    const { verifyPin } = await import('../utils/security.js');
    const salt = 'b5aceb1d5da5dd3bce84746fd46d2526';
    const expectedHash = '205e10eb64355bc95cae5fa159b159796b1a8dbc16f88722779f367263d6106c';
    const matches = await verifyPin(clean, salt, expectedHash);
    if (matches) {
      setStudioCloudAuthorized(true);
      return { success: true };
    }
  } catch {
    // fallback
  }

  try {
    const { db } = await import('../db/db.js');
    const sec = await db.settings.get('security_profile');
    if (sec?.salt && sec?.pinHash) {
      const { verifyPin } = await import('../utils/security.js');
      const matches = await verifyPin(clean, sec.salt, sec.pinHash);
      if (matches) {
        setStudioCloudAuthorized(true);
        return { success: true };
      }
    }
  } catch {
    // fallback
  }

  return { success: false, error: 'Incorrect Studio Owner Passcode' };
}

/**
 * Get active Supabase URL
 */
export function getActiveSupabaseUrl() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_URL)) {
      return localStorage.getItem(STORAGE_KEY_URL);
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) {
      return import.meta.env.VITE_SUPABASE_URL;
    }
    return DEFAULT_SUPABASE_URL;
  } catch {
    return DEFAULT_SUPABASE_URL;
  }
}

/**
 * Get active Supabase Anon Key
 */
export function getActiveSupabaseAnonKey() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_KEY)) {
      return localStorage.getItem(STORAGE_KEY_KEY);
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
      return import.meta.env.VITE_SUPABASE_ANON_KEY;
    }
    return DEFAULT_SUPABASE_ANON_KEY;
  } catch {
    return DEFAULT_SUPABASE_ANON_KEY;
  }
}

let supabaseInstance = null;
let currentUrl = null;
let currentKey = null;

/**
 * Get the singleton Supabase client
 */
export function getSupabase() {
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseAnonKey();

  if (!url || !key) {
    return null;
  }

  if (!supabaseInstance || currentUrl !== url || currentKey !== key) {
    currentUrl = url;
    currentKey = key;
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }

  return supabaseInstance;
}

/**
 * Test connectivity with Supabase database
 */
export async function testSupabaseConnection() {
  if (!isCloudSyncActive()) {
    return { ok: false, error: 'Cloud sync is currently disabled (Private Local Mode).' };
  }

  try {
    const client = getSupabase();
    if (!client) {
      return { ok: false, error: 'Supabase client is not initialized.' };
    }
    const { data, error } = await client.from('customers').select('id').limit(1);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Update custom Supabase credentials
 */
export function setCustomSupabaseCredentials(url, anonKey) {
  if (url) {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_URL);
  }

  if (anonKey) {
    localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_KEY);
  }

  // Reset instance so next getSupabase reinitializes
  supabaseInstance = null;
}
