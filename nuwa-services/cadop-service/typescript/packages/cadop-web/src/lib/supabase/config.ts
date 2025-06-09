/**
 * Client-side Supabase configuration
 * This file contains only client-side configurations and uses only public keys.
 * No server-side operations or privileged access should be configured here.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Only use VITE_ prefixed environment variables for client-side
const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase public environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)');
}

// Create Supabase client with public/anonymous access only
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable session persistence in browser
    autoRefreshToken: true, // Auto refresh the session token
    detectSessionInUrl: false, // Disable session detection in URL
  },
});

// Export only client-side needed types
export type { User, Session } from '@supabase/supabase-js'; 