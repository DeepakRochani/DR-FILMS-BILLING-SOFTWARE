import { createClient } from '@supabase/supabase-js';

// Default Supabase project credentials for DR FILMS Studio
export const DEFAULT_SUPABASE_URL = 'https://wzoikmcpaempxnxosnve.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6b2lrbWNwYWVtcHhueG9zbnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTkyMDAsImV4cCI6MjEwODY3NTIwMH0.yyeaHLYEQA7v5jglCFBr1uTO1-P9sUmZg7pcZQXTyfE';
export const SUPABASE_PROJECT_ID = 'wzoikmcpaempxnxosnve';
export const SUPABASE_REGION = 'ap-southeast-2';

const STORAGE_KEY_URL = 'drfilms_supabase_url';
const STORAGE_KEY_KEY = 'drfilms_supabase_anon_key';

/**
 * Get active Supabase URL (custom override from localStorage, env var, or default)
 */
export function getActiveSupabaseUrl() {
  try {
    return (
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_URL)) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
      DEFAULT_SUPABASE_URL
    );
  } catch {
    return DEFAULT_SUPABASE_URL;
  }
}

/**
 * Get active Supabase Anon Key (custom override from localStorage, env var, or default)
 */
export function getActiveSupabaseAnonKey() {
  try {
    return (
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_KEY)) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
      DEFAULT_SUPABASE_ANON_KEY
    );
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
  try {
    const client = getSupabase();
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
