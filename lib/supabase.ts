/**
 * Supabase Client Configuration
 *
 * This module provides Supabase client instances for both browser and server environments.
 * Uses Next.js environment variables for configuration.
 *
 * The Supabase client is optional - the app works without it. If environment variables
 * are not set, the clients will be null and features requiring Supabase will be disabled.
 *
 * @see https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (optional)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase client for browser/client-side usage
 *
 * This client uses the anonymous key which is safe to use in the browser.
 * It respects Row Level Security (RLS) policies.
 *
 * Returns null if Supabase is not configured.
 *
 * @example
 * ```tsx
 * import { supabase } from '@/lib/supabase';
 *
 * if (supabase) {
 *   const { data, error } = await supabase
 *     .from('games')
 *     .select('*')
 *     .limit(10);
 * }
 * ```
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/**
 * Supabase client for server-side usage with service role
 *
 * This client uses the service role key and bypasses Row Level Security (RLS).
 * Only use this on the server side (API routes, server components).
 *
 * Returns null if Supabase service role key is not configured.
 *
 * @example
 * ```tsx
 * // In API route or Server Component
 * import { supabaseAdmin } from '@/lib/supabase';
 *
 * if (supabaseAdmin) {
 *   const { data, error } = await supabaseAdmin
 *     .from('games')
 *     .delete()
 *     .match({ id: gameId });
 * }
 * ```
 */
export const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

/**
 * Check if Supabase is configured
 */
export const isSupabaseConfigured = supabase !== null;

/**
 * Type helper for Supabase database schema
 *
 * Use this to get type-safe database queries.
 * Update this as your database schema evolves.
 *
 * @example
 * ```tsx
 * import type { Database } from '@/lib/supabase';
 *
 * type Game = Database['public']['Tables']['games']['Row'];
 * ```
 */
export type Database = {
  public: {
    Tables: {
      // Add your table types here as you create them
      // Example:
      // games: {
      //   Row: { id: string; fen: string; created_at: string };
      //   Insert: { fen: string };
      //   Update: { fen?: string };
      // };
    };
  };
};
