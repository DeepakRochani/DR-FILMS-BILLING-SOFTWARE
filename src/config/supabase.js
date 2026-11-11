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
 * Check if the current device is authorized for DR FILMS Studio Cloud sync.
 * Localhost is always authorized for the owner.
 * On public deployments (e.g. Vercel), each user operates their own isolated
 * local billing software unless explicitly authorized with the Studio Owner passcode.
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
  } else {
    localStorage.removeItem(STORAGE_KEY_STUDIO_AUTH);
  }
  supabaseInstance = null;
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
 * Check if cloud sync is active on this device.
 * False by default for all public visitors to guarantee private, isolated billing software.
 */
export function isCloudSyncActive() {
  return isStudioCloudAuthorized() || isCustomSupabaseConfigured();
}

/**
 * Verify Studio Owner passcode (accepts 0303 or owner hash or fallback secret)
 */
export async function verifyAndAuthorizeStudioCloud(passcode) {
  const clean = String(passcode || '').trim();
  if (!clean) {
    return { success: false, error: 'Please enter the Studio Owner Passcode' };
  }

  if (clean === '0303' || clean === 'drfilms2026') {
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

  return { success: false, error: 'Incorrect Studio Owner Passcode' };
}

/**
 * Get active Supabase URL (custom override, studio owner default, or null in private local mode)
 */
export function getActiveSupabaseUrl() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_URL)) {
      return localStorage.getItem(STORAGE_KEY_URL);
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) {
      return import.meta.env.VITE_SUPABASE_URL;
    }
    if (isStudioCloudAuthorized()) {
      return DEFAULT_SUPABASE_URL;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get active Supabase Anon Key (custom override, studio owner default, or null in private local mode)
 */
export function getActiveSupabaseAnonKey() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_KEY)) {
      return localStorage.getItem(STORAGE_KEY_KEY);
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
      return import.meta.env.VITE_SUPABASE_ANON_KEY;
    }
    if (isStudioCloudAuthorized()) {
      return DEFAULT_SUPABASE_ANON_KEY;
    }
    return null;
  } catch {
    return null;
  }
}

let supabaseInstance = null;
let currentUrl = null;
let currentKey = null;

/**
 * Get the singleton Supabase client. Returns null if running in Private Local Mode.
 */
export function getSupabase() {
  if (!isCloudSyncActive()) {
    return null;
  }

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
