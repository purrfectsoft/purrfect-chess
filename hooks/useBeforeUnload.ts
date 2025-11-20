'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Options for the useBeforeUnload hook
 */
export interface UseBeforeUnloadOptions {
  /**
   * Whether the hook is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback to execute before the page unloads
   * This can be used to send cleanup messages to the server
   */
  onBeforeUnload?: () => void | Promise<void>;

  /**
   * Message to show in the browser's confirmation dialog
   * Note: Modern browsers may not display custom messages
   * @default undefined (no confirmation dialog)
   */
  message?: string;
}

/**
 * Return type for the useBeforeUnload hook
 */
export interface UseBeforeUnloadReturn {
  /**
   * Manually trigger the beforeunload callback
   * Useful for testing or manual cleanup
   */
  triggerBeforeUnload: () => void;
}

/**
 * Custom hook for handling browser tab close/refresh events
 *
 * This hook manages the `beforeunload` event to allow cleanup operations
 * when a user closes the tab, refreshes the page, or navigates away.
 *
 * Features:
 * - Execute cleanup operations before page unload
 * - Optional confirmation dialog (browser-dependent)
 * - Synchronous cleanup with sendBeacon for reliable delivery
 * - Automatic cleanup on unmount
 *
 * **Important Notes:**
 * - Modern browsers severely limit what can be done in beforeunload
 * - Async operations may not complete before the page unloads
 * - Use `navigator.sendBeacon()` for reliable message delivery
 * - Confirmation dialogs may not show custom messages
 *
 * @example
 * ```tsx
 * // Basic usage: send cleanup message
 * useBeforeUnload({
 *   onBeforeUnload: () => {
 *     // Send cleanup message via sendBeacon
 *     navigator.sendBeacon('/api/leave', JSON.stringify({ playerId }));
 *   }
 * });
 *
 * // With confirmation dialog
 * useBeforeUnload({
 *   message: 'Are you sure you want to leave the game?',
 *   onBeforeUnload: () => {
 *     // Cleanup logic
 *   }
 * });
 *
 * // Conditional usage
 * useBeforeUnload({
 *   enabled: isInGame,
 *   onBeforeUnload: handleLeave,
 * });
 * ```
 */
export function useBeforeUnload(
  options: UseBeforeUnloadOptions = {}
): UseBeforeUnloadReturn {
  const { enabled = true, onBeforeUnload, message } = options;

  // Use ref to avoid recreating handler on every render
  const onBeforeUnloadRef = useRef(onBeforeUnload);

  // Keep callback up to date
  useEffect(() => {
    onBeforeUnloadRef.current = onBeforeUnload;
  }, [onBeforeUnload]);

  /**
   * Execute the beforeunload callback
   */
  const triggerBeforeUnload = useCallback(() => {
    if (onBeforeUnloadRef.current) {
      try {
        // Execute callback synchronously for best reliability
        const result = onBeforeUnloadRef.current();

        // If callback returns a promise, we can't wait for it
        // but we log a warning to help developers
        if (result instanceof Promise) {
          console.warn(
            '[useBeforeUnload] Async callbacks may not complete before page unload. ' +
            'Use navigator.sendBeacon() for reliable message delivery.'
          );
        }
      } catch (error) {
        console.error('[useBeforeUnload] Error in beforeunload callback:', error);
      }
    }
  }, []);

  /**
   * Handle the beforeunload event
   */
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!enabled) {
        return;
      }

      console.log('[useBeforeUnload] Page unload detected, executing cleanup');

      // Execute cleanup callback
      triggerBeforeUnload();

      // Show confirmation dialog if message is provided
      if (message) {
        // Modern browsers ignore custom messages but setting returnValue
        // still triggers the confirmation dialog
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    },
    [enabled, message, triggerBeforeUnload]
  );

  /**
   * Register/unregister the beforeunload event listener
   */
  useEffect(() => {
    if (!enabled) {
      return;
    }

    console.log('[useBeforeUnload] Registering beforeunload handler');

    // Add event listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount
    return () => {
      console.log('[useBeforeUnload] Unregistering beforeunload handler');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, handleBeforeUnload]);

  return {
    triggerBeforeUnload,
  };
}
