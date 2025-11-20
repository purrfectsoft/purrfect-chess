'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Multi-tab detection strategy
 */
export enum MultiTabStrategy {
  /**
   * Allow multiple tabs without warning
   */
  ALLOW = 'allow',

  /**
   * Warn the user but allow multiple tabs
   */
  WARN = 'warn',

  /**
   * Block the user from opening multiple tabs
   */
  BLOCK = 'block',
}

/**
 * Options for the useMultiTabDetection hook
 */
export interface UseMultiTabDetectionOptions {
  /**
   * Unique identifier for the session
   * Used to track which tabs belong to the same session
   */
  sessionId: string | null;

  /**
   * Strategy for handling multiple tabs
   * @default MultiTabStrategy.WARN
   */
  strategy?: MultiTabStrategy;

  /**
   * Storage key prefix for tracking tabs
   * @default 'purrfect-chess-tabs'
   */
  storageKey?: string;

  /**
   * Callback when multiple tabs are detected
   */
  onMultiTabDetected?: (tabCount: number) => void;

  /**
   * Callback when tab becomes the only active tab
   */
  onSingleTab?: () => void;
}

/**
 * Return type for the useMultiTabDetection hook
 */
export interface UseMultiTabDetectionReturn {
  /**
   * Whether multiple tabs are currently open for this session
   */
  hasMultipleTabs: boolean;

  /**
   * Number of active tabs for this session
   */
  activeTabCount: number;

  /**
   * Unique ID for the current tab
   */
  currentTabId: string;

  /**
   * Whether this is the primary (first) tab
   */
  isPrimaryTab: boolean;
}

/**
 * Generate a unique tab ID
 */
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Custom hook for detecting multiple tabs of the same session
 *
 * This hook monitors localStorage to detect when the same user opens
 * multiple browser tabs for the same game session.
 *
 * Features:
 * - Detects multiple tabs using localStorage and storage events
 * - Supports different strategies (allow, warn, block)
 * - Automatic cleanup on tab close
 * - Heartbeat mechanism to detect stale tabs
 *
 * **Implementation Details:**
 * - Each tab registers itself in localStorage with a unique ID
 * - Tabs send heartbeats to indicate they're still active
 * - Storage events notify other tabs of changes
 * - Stale tabs (no heartbeat for 5s) are automatically cleaned up
 *
 * @example
 * ```tsx
 * const { hasMultipleTabs, activeTabCount, isPrimaryTab } = useMultiTabDetection({
 *   sessionId: 'room-abc123',
 *   strategy: MultiTabStrategy.WARN,
 *   onMultiTabDetected: (count) => {
 *     console.warn(`${count} tabs detected for this session`);
 *   },
 * });
 *
 * if (hasMultipleTabs && !isPrimaryTab) {
 *   return <div>Multiple tabs detected. Please use only one tab.</div>;
 * }
 * ```
 */
export function useMultiTabDetection(
  options: UseMultiTabDetectionOptions
): UseMultiTabDetectionReturn {
  const {
    sessionId,
    strategy = MultiTabStrategy.WARN,
    storageKey = 'purrfect-chess-tabs',
    onMultiTabDetected,
    onSingleTab,
  } = options;

  const [currentTabId] = useState(() => generateTabId());
  const [activeTabCount, setActiveTabCount] = useState(1);
  const [hasMultipleTabs, setHasMultipleTabs] = useState(false);
  const [isPrimaryTab, setIsPrimaryTab] = useState(true);

  /**
   * Get the storage key for a specific session
   */
  const getStorageKey = useCallback(
    (id: string) => `${storageKey}:${id}`,
    [storageKey]
  );

  /**
   * Get active tabs for the current session
   */
  const getActiveTabs = useCallback((): Record<string, number> => {
    if (!sessionId) return {};

    try {
      const key = getStorageKey(sessionId);
      const data = localStorage.getItem(key);
      if (!data) return {};

      const tabs = JSON.parse(data) as Record<string, number>;
      const now = Date.now();
      const STALE_THRESHOLD = 5000; // 5 seconds

      // Filter out stale tabs (no heartbeat for 5s)
      const activeTabs: Record<string, number> = {};
      for (const [tabId, timestamp] of Object.entries(tabs)) {
        if (now - timestamp < STALE_THRESHOLD) {
          activeTabs[tabId] = timestamp;
        }
      }

      return activeTabs;
    } catch (error) {
      console.error('[MultiTab] Error reading active tabs:', error);
      return {};
    }
  }, [sessionId, getStorageKey]);

  /**
   * Update the heartbeat for the current tab
   */
  const updateHeartbeat = useCallback(() => {
    if (!sessionId) return;

    try {
      const key = getStorageKey(sessionId);
      const tabs = getActiveTabs();
      tabs[currentTabId] = Date.now();
      localStorage.setItem(key, JSON.stringify(tabs));

      // Update tab count
      const count = Object.keys(tabs).length;
      setActiveTabCount(count);
      
      const multipleTabs = count > 1;
      setHasMultipleTabs(multipleTabs);

      // Determine if this is the primary tab (first one)
      const sortedTabIds = Object.entries(tabs)
        .sort(([, a], [, b]) => a - b)
        .map(([tabId]) => tabId);
      setIsPrimaryTab(sortedTabIds[0] === currentTabId);

      // Notify callbacks
      if (multipleTabs && count !== activeTabCount) {
        console.log(`[MultiTab] Detected ${count} active tabs for session ${sessionId}`);
        onMultiTabDetected?.(count);
      } else if (!multipleTabs && hasMultipleTabs) {
        console.log('[MultiTab] Back to single tab');
        onSingleTab?.();
      }
    } catch (error) {
      console.error('[MultiTab] Error updating heartbeat:', error);
    }
  }, [
    sessionId,
    currentTabId,
    getStorageKey,
    getActiveTabs,
    activeTabCount,
    hasMultipleTabs,
    onMultiTabDetected,
    onSingleTab,
  ]);

  /**
   * Remove the current tab from the registry
   */
  const removeCurrentTab = useCallback(() => {
    if (!sessionId) return;

    try {
      const key = getStorageKey(sessionId);
      const tabs = getActiveTabs();
      delete tabs[currentTabId];

      if (Object.keys(tabs).length === 0) {
        // No more tabs, remove the key
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(tabs));
      }

      console.log(`[MultiTab] Removed tab ${currentTabId} from session ${sessionId}`);
    } catch (error) {
      console.error('[MultiTab] Error removing tab:', error);
    }
  }, [sessionId, currentTabId, getStorageKey, getActiveTabs]);

  /**
   * Handle storage events from other tabs
   */
  const handleStorageEvent = useCallback(
    (event: StorageEvent) => {
      if (!sessionId) return;

      const key = getStorageKey(sessionId);
      if (event.key === key) {
        console.log('[MultiTab] Storage event detected, updating tab count');
        
        // Another tab changed the registry, update our view
        const tabs = getActiveTabs();
        const count = Object.keys(tabs).length;
        setActiveTabCount(count);
        
        const multipleTabs = count > 1;
        setHasMultipleTabs(multipleTabs);

        // Determine if this is the primary tab
        const sortedTabIds = Object.entries(tabs)
          .sort(([, a], [, b]) => a - b)
          .map(([tabId]) => tabId);
        setIsPrimaryTab(sortedTabIds[0] === currentTabId);

        // Notify callbacks
        if (multipleTabs && count !== activeTabCount) {
          onMultiTabDetected?.(count);
        } else if (!multipleTabs && hasMultipleTabs) {
          onSingleTab?.();
        }
      }
    },
    [
      sessionId,
      currentTabId,
      getStorageKey,
      getActiveTabs,
      activeTabCount,
      hasMultipleTabs,
      onMultiTabDetected,
      onSingleTab,
    ]
  );

  /**
   * Register the current tab and start heartbeat
   */
  useEffect(() => {
    if (!sessionId) {
      // No session, reset state
      setActiveTabCount(0);
      setHasMultipleTabs(false);
      setIsPrimaryTab(false);
      return;
    }

    console.log(`[MultiTab] Registering tab ${currentTabId} for session ${sessionId}`);

    // Initial registration
    updateHeartbeat();

    // Set up heartbeat interval (every 2 seconds)
    const heartbeatInterval = setInterval(updateHeartbeat, 2000);

    // Listen for storage events from other tabs
    window.addEventListener('storage', handleStorageEvent);

    // Cleanup on unmount
    return () => {
      console.log(`[MultiTab] Cleaning up tab ${currentTabId}`);
      clearInterval(heartbeatInterval);
      window.removeEventListener('storage', handleStorageEvent);
      removeCurrentTab();
    };
  }, [sessionId, currentTabId, updateHeartbeat, handleStorageEvent, removeCurrentTab]);

  return {
    hasMultipleTabs,
    activeTabCount,
    currentTabId,
    isPrimaryTab,
  };
}
