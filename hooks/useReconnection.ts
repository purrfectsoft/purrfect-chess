'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRootStore } from '@/stores/store-setup';
import {
  getFullGameState,
  queryMoveHistory,
  applyStateSnapshot,
  isOutOfSync,
  type GameStateSnapshot,
} from '@/lib/multiplayer/sync';
import { applyRemoteMove } from '@/lib/multiplayer/moveSync';
import { Chess } from 'chess.js';

/**
 * Reconnection status
 */
export enum ReconnectionStatus {
  IDLE = 'idle',
  DETECTING = 'detecting',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  ERROR = 'error',
}

/**
 * Options for the useReconnection hook
 */
export interface UseReconnectionOptions {
  sessionId: string | null;
  enabled?: boolean;
  onStateRecovered?: (snapshot: GameStateSnapshot) => void;
  onSyncError?: (error: string) => void;
}

/**
 * Return type for the useReconnection hook
 */
export interface UseReconnectionReturn {
  reconnectionStatus: ReconnectionStatus;
  isReconnecting: boolean;
  lastSyncedAt: string | null;
  requestSync: () => Promise<void>;
}

/**
 * Custom hook for handling reconnection and state synchronization
 *
 * This hook monitors connection status and automatically syncs game state
 * when a client reconnects after being disconnected.
 *
 * Features:
 * - Automatic reconnection detection
 * - Full state snapshot recovery
 * - Partial move history sync
 * - Duplicate move prevention
 * - Last sequence number tracking
 *
 * @example
 * ```tsx
 * const { reconnectionStatus, requestSync } = useReconnection({
 *   sessionId: 'session-uuid',
 *   enabled: true,
 *   onStateRecovered: (snapshot) => {
 *     console.log('State recovered:', snapshot);
 *   },
 * });
 * ```
 */
export function useReconnection(
  options: UseReconnectionOptions
): UseReconnectionReturn {
  const {
    sessionId,
    enabled = true,
    onStateRecovered,
    onSyncError,
  } = options;

  const store = useRootStore();
  const [reconnectionStatus, setReconnectionStatus] = useState<ReconnectionStatus>(
    ReconnectionStatus.IDLE
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Track the last known sequence number
  const lastSequenceRef = useRef<number>(-1);
  
  // Track previous connection status to detect reconnection
  const previousConnectionStatusRef = useRef<string>(
    store.multiplayer.connectionStatus
  );

  // Track if we're currently syncing to prevent concurrent syncs
  const isSyncingRef = useRef(false);

  /**
   * Apply moves from a snapshot to the local game state
   */
  const applyMovesToGame = useCallback((moves: Array<{
    id: string;
    from: string;
    to: string;
    promotion: string | null;
    san: string;
    fen: string;
    playerId: string;
    timestamp: string;
    timeRemainingMs: number | null;
  }>, chess: Chess) => {
    let appliedCount = 0;

    for (const move of moves) {
      try {
        const result = applyRemoteMove(chess, {
          sessionId: sessionId || '',
          from: move.from,
          to: move.to,
          promotion: move.promotion || undefined,
          san: move.san,
          fen: move.fen,
          timeRemainingMs: move.timeRemainingMs || undefined,
        });

        if (result.valid) {
          appliedCount++;
        } else {
          console.error(`[Reconnection] Failed to apply move: ${move.san}`, result.error);
        }
      } catch (error) {
        console.error(`[Reconnection] Error applying move: ${move.san}`, error);
      }
    }

    return appliedCount;
  }, [sessionId]);

  /**
   * Request a full state sync from the server
   */
  const requestSync = useCallback(async () => {
    if (!sessionId) {
      console.warn('[Reconnection] Cannot sync: no session ID');
      return;
    }

    if (isSyncingRef.current) {
      console.log('[Reconnection] Sync already in progress, skipping');
      return;
    }

    isSyncingRef.current = true;
    setReconnectionStatus(ReconnectionStatus.SYNCING);

    try {
      console.log(`[Reconnection] Requesting full game state for session: ${sessionId}`);

      // Fetch full game state from server
      const snapshot = await getFullGameState(sessionId);

      if (!snapshot) {
        throw new Error('Failed to fetch game state');
      }

      console.log(
        `[Reconnection] Received state snapshot: ${snapshot.moves.length} moves, last sequence: ${snapshot.lastSequenceNumber}`
      );

      // Apply state snapshot, filtering out duplicates
      const reconciliation = applyStateSnapshot(
        snapshot,
        lastSequenceRef.current
      );

      if (!reconciliation.success) {
        throw new Error(reconciliation.error || 'Failed to apply state snapshot');
      }

      console.log(
        `[Reconnection] Reconciliation complete: ${reconciliation.applied.length} new moves, ${reconciliation.skipped.length} skipped`
      );

      // Apply new moves to the game
      if (reconciliation.applied.length > 0) {
        const chess = new Chess();
        
        // Load the initial position
        if (snapshot.session.initial_fen) {
          chess.load(snapshot.session.initial_fen);
        }

        // Apply all moves from the snapshot in sequence
        const appliedCount = applyMovesToGame(
          reconciliation.applied.map(m => ({
            id: m.id,
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            promotion: m.promotion_piece,
            san: m.san,
            fen: m.fen_after,
            playerId: m.player_id,
            timestamp: m.created_at,
            timeRemainingMs: m.time_remaining_ms,
          })),
          chess
        );

        console.log(`[Reconnection] Applied ${appliedCount} moves to game`);

        // Update game state with the final FEN
        store.game.loadFen(snapshot.session.current_fen);

        // Update multiplayer state
        store.multiplayer.setSessionState(snapshot.session.state);
      }

      // Update last sequence number
      lastSequenceRef.current = snapshot.lastSequenceNumber;

      // Update last synced timestamp
      setLastSyncedAt(new Date().toISOString());

      // Update status
      setReconnectionStatus(ReconnectionStatus.SYNCED);

      // Notify callback
      if (onStateRecovered) {
        onStateRecovered(snapshot);
      }

      console.log('[Reconnection] State sync completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Reconnection] Sync error:', error);

      setReconnectionStatus(ReconnectionStatus.ERROR);

      if (onSyncError) {
        onSyncError(errorMessage);
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [
    sessionId,
    store.game,
    store.multiplayer,
    onStateRecovered,
    onSyncError,
    applyMovesToGame,
  ]);

  /**
   * Check if we need to sync after reconnection
   */
  const checkSyncNeeded = useCallback(async () => {
    if (!sessionId || !enabled) {
      return;
    }

    setReconnectionStatus(ReconnectionStatus.DETECTING);

    try {
      const outOfSync = await isOutOfSync(sessionId, lastSequenceRef.current);

      if (outOfSync) {
        console.log('[Reconnection] Client is out of sync, requesting state sync');
        await requestSync();
      } else {
        console.log('[Reconnection] Client is in sync, no action needed');
        setReconnectionStatus(ReconnectionStatus.SYNCED);
      }
    } catch (error) {
      console.error('[Reconnection] Error checking sync status:', error);
      setReconnectionStatus(ReconnectionStatus.ERROR);
    }
  }, [sessionId, enabled, requestSync]);

  /**
   * Detect reconnection by monitoring connection status changes
   */
  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }

    const currentStatus = store.multiplayer.connectionStatus;
    const previousStatus = previousConnectionStatusRef.current;

    // Detect reconnection: transition from disconnected/error to connected
    const isReconnecting =
      (previousStatus === 'disconnected' || previousStatus === 'error') &&
      currentStatus === 'connected';

    if (isReconnecting) {
      console.log('[Reconnection] Reconnection detected, checking if sync is needed');
      checkSyncNeeded();
    }

    // Update previous status
    previousConnectionStatusRef.current = currentStatus;
  }, [
    enabled,
    sessionId,
    store.multiplayer.connectionStatus,
    checkSyncNeeded,
  ]);

  /**
   * Update last sequence number when moves are added locally
   */
  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }

    // Update last sequence ref based on the number of moves in the multiplayer store
    const moveCount = store.multiplayer.moveCount;
    if (moveCount > 0) {
      // Sequence numbers are 0-indexed, so last sequence = moveCount - 1
      lastSequenceRef.current = Math.max(lastSequenceRef.current, moveCount - 1);
    }
  }, [enabled, sessionId, store.multiplayer.moveCount]);

  return {
    reconnectionStatus,
    isReconnecting: reconnectionStatus === ReconnectionStatus.SYNCING,
    lastSyncedAt,
    requestSync,
  };
}
