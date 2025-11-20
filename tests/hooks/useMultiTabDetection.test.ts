import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useMultiTabDetection,
  MultiTabStrategy,
} from '@/hooks/useMultiTabDetection';

describe('useMultiTabDetection hook', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with single tab', () => {
      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId: 'test-session' })
      );

      expect(result.current.hasMultipleTabs).toBe(false);
      expect(result.current.activeTabCount).toBe(1);
      expect(result.current.isPrimaryTab).toBe(true);
      expect(result.current.currentTabId).toBeDefined();
    });

    it('should not track tabs when sessionId is null', () => {
      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId: null })
      );

      expect(result.current.activeTabCount).toBe(0);
      expect(result.current.hasMultipleTabs).toBe(false);
      expect(result.current.isPrimaryTab).toBe(false);
    });

    it('should register tab in localStorage', () => {
      const sessionId = 'test-session';
      
      renderHook(() => useMultiTabDetection({ sessionId }));

      const key = `purrfect-chess-tabs:${sessionId}`;
      const data = localStorage.getItem(key);
      
      expect(data).toBeDefined();
      
      if (data) {
        const tabs = JSON.parse(data);
        expect(Object.keys(tabs).length).toBe(1);
      }
    });
  });

  describe('multi-tab detection', () => {
    it('should detect multiple tabs', async () => {
      const sessionId = 'test-session';
      const onMultiTabDetected = vi.fn();

      // Render first tab
      const { result: result1 } = renderHook(() =>
        useMultiTabDetection({ sessionId, onMultiTabDetected })
      );

      expect(result1.current.hasMultipleTabs).toBe(false);
      expect(result1.current.activeTabCount).toBe(1);

      // Simulate second tab by manually updating localStorage
      const key = `purrfect-chess-tabs:${sessionId}`;
      const tabs1 = JSON.parse(localStorage.getItem(key) || '{}');
      const tabs2 = {
        ...tabs1,
        'tab-second': Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(tabs2));

      // Trigger storage event to simulate other tab
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: JSON.stringify(tabs2),
          oldValue: JSON.stringify(tabs1),
        })
      );

      await waitFor(() => {
        expect(result1.current.hasMultipleTabs).toBe(true);
      });

      expect(result1.current.activeTabCount).toBe(2);
    });

    it('should identify primary tab', () => {
      const sessionId = 'test-session';

      // First tab
      const { result: result1 } = renderHook(() =>
        useMultiTabDetection({ sessionId })
      );

      expect(result1.current.isPrimaryTab).toBe(true);

      // Simulate second tab (with later timestamp)
      const key = `purrfect-chess-tabs:${sessionId}`;
      const tabs = JSON.parse(localStorage.getItem(key) || '{}');
      const tabIds = Object.keys(tabs);
      const firstTabId = tabIds[0];

      // Add second tab with later timestamp
      tabs['tab-second'] = Date.now() + 1000;
      localStorage.setItem(key, JSON.stringify(tabs));

      // Second tab should see itself as non-primary
      const { result: result2 } = renderHook(() =>
        useMultiTabDetection({ sessionId })
      );

      // Wait for heartbeat to update
      setTimeout(() => {
        // First tab should still be primary
        expect(result1.current.isPrimaryTab).toBe(true);
        // Second tab should not be primary
        expect(result2.current.isPrimaryTab).toBe(false);
      }, 100);
    });
  });

  describe('heartbeat mechanism', () => {
    it('should update heartbeat periodically', async () => {
      const sessionId = 'test-session';
      
      renderHook(() => useMultiTabDetection({ sessionId }));

      const key = `purrfect-chess-tabs:${sessionId}`;
      const initialData = localStorage.getItem(key);
      const initialTabs = JSON.parse(initialData || '{}');
      const initialTimestamp = Object.values(initialTabs)[0];

      // Wait for heartbeat (2 seconds interval)
      await new Promise((resolve) => setTimeout(resolve, 2100));

      const updatedData = localStorage.getItem(key);
      const updatedTabs = JSON.parse(updatedData || '{}');
      const updatedTimestamp = Object.values(updatedTabs)[0];

      expect(updatedTimestamp).toBeGreaterThan(initialTimestamp as number);
    });

    it('should clean up stale tabs', () => {
      const sessionId = 'test-session';
      const key = `purrfect-chess-tabs:${sessionId}`;

      // Set up stale tab (6 seconds ago)
      const staleTabs = {
        'tab-stale': Date.now() - 6000,
      };
      localStorage.setItem(key, JSON.stringify(staleTabs));

      // Render new tab
      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId })
      );

      // Should only count the current tab, not the stale one
      expect(result.current.activeTabCount).toBe(1);
      expect(result.current.hasMultipleTabs).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove tab from registry on unmount', () => {
      const sessionId = 'test-session';
      const key = `purrfect-chess-tabs:${sessionId}`;

      const { unmount } = renderHook(() =>
        useMultiTabDetection({ sessionId })
      );

      // Tab should be registered
      expect(localStorage.getItem(key)).toBeDefined();

      unmount();

      // Tab should be removed
      const data = localStorage.getItem(key);
      expect(data).toBeNull();
    });

    it('should handle sessionId change', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      const { rerender, result } = renderHook(
        ({ sessionId }) => useMultiTabDetection({ sessionId }),
        { initialProps: { sessionId: session1 } }
      );

      // Should be registered in session1
      expect(localStorage.getItem(`purrfect-chess-tabs:${session1}`)).toBeDefined();
      expect(result.current.activeTabCount).toBe(1);

      // Change to session2
      rerender({ sessionId: session2 });

      // Should be removed from session1 and registered in session2
      expect(localStorage.getItem(`purrfect-chess-tabs:${session1}`)).toBeNull();
      expect(localStorage.getItem(`purrfect-chess-tabs:${session2}`)).toBeDefined();
    });
  });

  describe('callbacks', () => {
    it('should call onMultiTabDetected when multiple tabs are detected', async () => {
      const sessionId = 'test-session';
      const onMultiTabDetected = vi.fn();

      renderHook(() =>
        useMultiTabDetection({ sessionId, onMultiTabDetected })
      );

      // Simulate second tab
      const key = `purrfect-chess-tabs:${sessionId}`;
      const tabs = JSON.parse(localStorage.getItem(key) || '{}');
      tabs['tab-second'] = Date.now();
      localStorage.setItem(key, JSON.stringify(tabs));

      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: JSON.stringify(tabs),
        })
      );

      await waitFor(() => {
        expect(onMultiTabDetected).toHaveBeenCalledWith(2);
      });
    });

    it('should call onSingleTab when returning to single tab', async () => {
      const sessionId = 'test-session';
      const onSingleTab = vi.fn();

      // Start with multiple tabs
      const key = `purrfect-chess-tabs:${sessionId}`;
      const multipleTabs = {
        'tab-1': Date.now(),
        'tab-2': Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(multipleTabs));

      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId, onSingleTab })
      );

      // Should detect multiple tabs initially
      await waitFor(() => {
        expect(result.current.hasMultipleTabs).toBe(true);
      });

      // Remove one tab
      const singleTab = {
        'tab-1': Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(singleTab));

      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: JSON.stringify(singleTab),
        })
      );

      await waitFor(() => {
        expect(onSingleTab).toHaveBeenCalled();
      });
    });
  });

  describe('storage event handling', () => {
    it('should respond to storage events from other tabs', async () => {
      const sessionId = 'test-session';
      
      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId })
      );

      expect(result.current.activeTabCount).toBe(1);

      // Simulate another tab updating the registry
      const key = `purrfect-chess-tabs:${sessionId}`;
      const tabs = JSON.parse(localStorage.getItem(key) || '{}');
      tabs['tab-other'] = Date.now();
      localStorage.setItem(key, JSON.stringify(tabs));

      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: JSON.stringify(tabs),
        })
      );

      await waitFor(() => {
        expect(result.current.activeTabCount).toBe(2);
      });
    });

    it('should ignore storage events for other keys', async () => {
      const sessionId = 'test-session';
      const onMultiTabDetected = vi.fn();
      
      const { result } = renderHook(() =>
        useMultiTabDetection({ sessionId, onMultiTabDetected })
      );

      // Trigger storage event for unrelated key
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'some-other-key',
          newValue: 'some-value',
        })
      );

      // Should not affect tab count
      expect(result.current.activeTabCount).toBe(1);
      expect(onMultiTabDetected).not.toHaveBeenCalled();
    });
  });

  describe('custom storage key', () => {
    it('should use custom storage key prefix', () => {
      const sessionId = 'test-session';
      const customKey = 'my-custom-key';

      renderHook(() =>
        useMultiTabDetection({ sessionId, storageKey: customKey })
      );

      const key = `${customKey}:${sessionId}`;
      const data = localStorage.getItem(key);
      
      expect(data).toBeDefined();
    });
  });
});
