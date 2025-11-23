'use client';

import createPersistentStore from 'mst-persistent-store';
import defaultStorage from 'mst-persistent-store/dist/storage';
import RootStoreModel, { createDefaultSnapshot } from './root-store';

/**
 * Create the persistent root store with Next.js SSR support
 *
 * Configuration:
 * - Uses default browser localStorage for persistence
 * - Excludes transient UI state from persistence (via disallowList)
 * - Persists game state and settings
 * - Exposes store instance in development for debugging
 *
 * Based on bookcover-craft example:
 * https://github.com/purrfectsoft/bookcover-craft/blob/main/src/stores/store-setup.ts
 */
export const [RootStoreProvider, useRootStore] = createPersistentStore(
  RootStoreModel,
  defaultStorage,
  createDefaultSnapshot(),
  // Exclude transient UI, engine, and multiplayer connection state from persistence
  // These values will replace what's in storage on hydration (always reset to defaults)
  {
    ui: {
      isEnginePanelVisible: false,
      isEvalBarVisible: false,
      isBoardFlipped: false,
      userOverrodeFlip: false,
      engineDisplayMode: 'both' as const,
    },
    engine: {
      isEngineReady: false,
      isAnalyzing: false,
      analysis: [],
      currentDepth: 0,
      currentFen: '',
    },
    multiplayer: {
      // Reset connection status on hydration (transient)
      connectionStatus: 'disconnected' as const,
      // Keep session/room data for potential reconnection
      // Players and moves are persisted for session recovery
    },
  },
  {
    storageKey: 'purrfect-chess-store',
    onHydrate(storeInstance) {
      // Call the store's hydration action
      storeInstance.hydrateStore();

      // Expose store in development for debugging (non-production only)
      // Note: This is safe in development as it's only for debugging purposes
      // and the store is read-only from the console
      if (
        process.env.NODE_ENV === 'development' &&
        typeof window !== 'undefined'
      ) {
        Object.defineProperty(window, '__rootStoreInstance', {
          value: storeInstance,
          writable: false,
          configurable: true,
        });
        console.log(
          '[Store] Root store available at window.__rootStoreInstance (read-only)'
        );
      }
    },
  }
);
