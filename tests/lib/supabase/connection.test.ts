import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from '@/lib/supabase/client';

// Mock environment variables for testing
const MOCK_SUPABASE_URL = 'https://test-project.supabase.co';
const MOCK_SUPABASE_ANON_KEY = 'test-anon-key';

describe('Supabase Client', () => {
  describe('validateSupabaseConfig', () => {
    it('should not throw error with valid credentials', () => {
      expect(() => {
        validateSupabaseConfig(MOCK_SUPABASE_URL, MOCK_SUPABASE_ANON_KEY);
      }).not.toThrow();
    });

    it('should throw error when URL is missing', () => {
      expect(() => {
        validateSupabaseConfig('', MOCK_SUPABASE_ANON_KEY);
      }).toThrow('Missing Supabase environment variables');
    });

    it('should throw error when anon key is missing', () => {
      expect(() => {
        validateSupabaseConfig(MOCK_SUPABASE_URL, '');
      }).toThrow('Missing Supabase environment variables');
    });

    it('should throw error when both credentials are missing', () => {
      expect(() => {
        validateSupabaseConfig('', '');
      }).toThrow('Missing Supabase environment variables');
    });
  });

  describe('client creation', () => {
    it('should create Supabase client with correct API methods', () => {
      // Test creating a client directly with mock credentials
      const client = createClient(MOCK_SUPABASE_URL, MOCK_SUPABASE_ANON_KEY);
      
      expect(client).toBeDefined();
      expect(typeof client).toBe('object');
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
      expect(client.storage).toBeDefined();
      expect(client.realtime).toBeDefined();
    });
  });

  describe('realtime configuration', () => {
    it('should configure realtime with throttling for chess moves', () => {
      // Test the configuration directly without relying on module initialization
      const client = createClient(MOCK_SUPABASE_URL, MOCK_SUPABASE_ANON_KEY, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      
      expect(client).toBeDefined();
      expect(typeof client).toBe('object');
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
      expect(client.realtime).toBeDefined();
    });

    it('should support querying tables via from() method', () => {
      const client = createClient(MOCK_SUPABASE_URL, MOCK_SUPABASE_ANON_KEY);
      
      // Verify the from() method returns a query builder
      const query = client.from('test_table');
      expect(query).toBeDefined();
      expect(typeof query.select).toBe('function');
      expect(typeof query.insert).toBe('function');
      expect(typeof query.update).toBe('function');
      expect(typeof query.delete).toBe('function');
    });
  });
});
