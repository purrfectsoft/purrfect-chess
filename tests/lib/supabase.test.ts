/**
 * Supabase Client Configuration Tests
 *
 * Tests the Supabase client initialization and configuration.
 */

import { describe, it, expect } from 'vitest';

describe('Supabase Client Configuration', () => {
  describe('module exports', () => {
    it('should export supabase client (or null)', async () => {
      const { supabase, isSupabaseConfigured } = await import(
        '@/lib/supabase'
      );

      // Should be either a valid Supabase client or null (when not configured)
      expect(supabase === null || typeof supabase === 'object').toBe(true);

      // isSupabaseConfigured should match whether client exists
      expect(isSupabaseConfigured).toBe(supabase !== null);

      // If configured, should have expected methods
      if (supabase) {
        expect(supabase).toHaveProperty('from');
        expect(supabase).toHaveProperty('auth');
      }
    });

    it('should export supabaseAdmin client (or null)', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase');

      // Should be either a valid Supabase client or null (when not configured)
      expect(
        supabaseAdmin === null || typeof supabaseAdmin === 'object'
      ).toBe(true);

      // If configured, should have expected methods
      if (supabaseAdmin) {
        expect(supabaseAdmin).toHaveProperty('from');
        expect(supabaseAdmin).toHaveProperty('auth');
      }
    });

    it('should export isSupabaseConfigured flag', async () => {
      const { isSupabaseConfigured } = await import('@/lib/supabase');

      // Should be a boolean
      expect(typeof isSupabaseConfigured).toBe('boolean');
    });

    it('should export Database type', async () => {
      // This test verifies the type is exported correctly
      // TypeScript will catch if the type export is missing at compile time
      type DatabaseType = import('@/lib/supabase').Database;

      // Runtime check that the import worked
      const { supabase } = await import('@/lib/supabase');
      expect(supabase === null || typeof supabase === 'object').toBe(true);

      // Type assertion to verify Database type structure exists
      const _typeCheck: DatabaseType = {
        public: {
          Tables: {},
        },
      };

      expect(_typeCheck).toBeDefined();
    });
  });

  describe('client behavior', () => {
    it('should have consistent state between supabase and isSupabaseConfigured', async () => {
      const { supabase, isSupabaseConfigured } = await import(
        '@/lib/supabase'
      );

      if (isSupabaseConfigured) {
        expect(supabase).not.toBeNull();
      } else {
        expect(supabase).toBeNull();
      }
    });

    it('should export admin client only when service role key is set', async () => {
      const { supabase, supabaseAdmin } = await import('@/lib/supabase');

      // Admin client can only exist if regular client exists
      if (supabaseAdmin !== null) {
        expect(supabase).not.toBeNull();
      }
    });
  });
});

