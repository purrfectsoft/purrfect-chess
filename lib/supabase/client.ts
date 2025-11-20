import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validation function that can be tested
export function validateSupabaseConfig(url: string, key: string): void {
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
}

// Function to get or create the Supabase client
export function getSupabaseClient(): SupabaseClient {
  validateSupabaseConfig(supabaseUrl, supabaseAnonKey);
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10, // Throttle for chess moves
      },
    },
  });
}

// Export a singleton client instance for convenience
// This will only be created when actually accessed
let _supabaseInstance: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseInstance) {
      _supabaseInstance = getSupabaseClient();
    }
    return (_supabaseInstance as any)[prop];
  },
});


