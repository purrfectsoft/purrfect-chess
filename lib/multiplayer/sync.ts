/**
 * Game State Synchronization Module
 *
 * Handles state recovery and synchronization for reconnecting clients.
 * Provides mechanisms to:
 * - Fetch full game state from the database
 * - Query partial move history with sequence numbers
 * - Apply state snapshots without duplicates
 * - Reconcile local and remote move history
 */

import { supabase } from '@/lib/supabase/client';
import type { Session, Move } from '@/lib/supabase/types';

/**
 * Full game state snapshot for reconnection
 */
export interface GameStateSnapshot {
  session: Session;
  moves: Move[];
  lastSequenceNumber: number;
  timestamp: string;
}

/**
 * Partial move history query result
 */
export interface PartialMoveHistory {
  moves: Move[];
  fromSequence: number;
  toSequence: number;
  hasMore: boolean;
}

/**
 * State reconciliation result
 */
export interface ReconciliationResult {
  applied: Move[];
  skipped: Move[];
  conflicts: Move[];
  success: boolean;
  error?: string;
}

/**
 * Fetch the complete game state for a session
 *
 * This is used when a client reconnects and needs the full current state.
 *
 * @param sessionId - The session UUID
 * @returns Full game state snapshot including session details and all moves
 */
export async function getFullGameState(
  sessionId: string
): Promise<GameStateSnapshot | null> {
  try {
    console.log(`[Sync] Fetching full game state for session: ${sessionId}`);

    // Fetch session data
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError) {
      console.error('[Sync] Failed to fetch session:', sessionError);
      return null;
    }

    if (!session) {
      console.error('[Sync] Session not found:', sessionId);
      return null;
    }

    // Fetch all moves for the session, ordered by ply (sequence)
    const { data: moves, error: movesError } = await supabase
      .from('moves')
      .select('*')
      .eq('session_id', sessionId)
      .order('ply', { ascending: true });

    if (movesError) {
      console.error('[Sync] Failed to fetch moves:', movesError);
      return null;
    }

    // Calculate last sequence number (highest ply)
    const lastSequenceNumber = moves && moves.length > 0 
      ? Math.max(...moves.map(m => m.ply))
      : -1;

    const snapshot: GameStateSnapshot = {
      session,
      moves: moves || [],
      lastSequenceNumber,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Sync] Fetched full game state: ${moves?.length || 0} moves, last sequence: ${lastSequenceNumber}`
    );

    return snapshot;
  } catch (error) {
    console.error('[Sync] Error fetching full game state:', error);
    return null;
  }
}

/**
 * Query partial move history from a specific sequence number
 *
 * Useful for syncing only new moves since the last known state.
 *
 * @param sessionId - The session UUID
 * @param fromSequence - Starting sequence number (ply)
 * @param limit - Maximum number of moves to fetch (default: 100)
 * @returns Partial move history with pagination info
 */
export async function queryMoveHistory(
  sessionId: string,
  fromSequence: number,
  limit: number = 100
): Promise<PartialMoveHistory | null> {
  try {
    console.log(
      `[Sync] Querying move history for session ${sessionId} from sequence ${fromSequence}, limit ${limit}`
    );

    // Fetch moves starting from the specified sequence
    const { data: moves, error } = await supabase
      .from('moves')
      .select('*')
      .eq('session_id', sessionId)
      .gte('ply', fromSequence)
      .order('ply', { ascending: true })
      .limit(limit + 1); // Fetch one extra to check if there are more

    if (error) {
      console.error('[Sync] Failed to query move history:', error);
      return null;
    }

    const hasMore = moves && moves.length > limit;
    const resultMoves = hasMore ? moves.slice(0, limit) : moves || [];

    const toSequence = resultMoves.length > 0
      ? Math.max(...resultMoves.map(m => m.ply))
      : fromSequence - 1;

    const result: PartialMoveHistory = {
      moves: resultMoves,
      fromSequence,
      toSequence,
      hasMore,
    };

    console.log(
      `[Sync] Queried move history: ${resultMoves.length} moves, hasMore: ${hasMore}`
    );

    return result;
  } catch (error) {
    console.error('[Sync] Error querying move history:', error);
    return null;
  }
}

/**
 * Apply a full game state snapshot to the local game
 *
 * This ensures no duplicate moves are applied by tracking sequence numbers.
 *
 * @param snapshot - The game state snapshot to apply
 * @param localLastSequence - The last sequence number the client has seen
 * @returns Reconciliation result with details of applied/skipped moves
 */
export function applyStateSnapshot(
  snapshot: GameStateSnapshot,
  localLastSequence: number
): ReconciliationResult {
  console.log(
    `[Sync] Applying state snapshot. Local last sequence: ${localLastSequence}, Remote last sequence: ${snapshot.lastSequenceNumber}`
  );

  const applied: Move[] = [];
  const skipped: Move[] = [];
  const conflicts: Move[] = [];

  try {
    // Filter moves to only those after the local last sequence
    for (const move of snapshot.moves) {
      if (move.ply <= localLastSequence) {
        // Already have this move, skip it
        skipped.push(move);
        console.log(
          `[Sync] Skipping duplicate move at sequence ${move.ply}: ${move.san}`
        );
      } else {
        // New move, apply it
        applied.push(move);
        console.log(
          `[Sync] Applying new move at sequence ${move.ply}: ${move.san}`
        );
      }
    }

    console.log(
      `[Sync] State snapshot applied: ${applied.length} new moves, ${skipped.length} skipped`
    );

    return {
      applied,
      skipped,
      conflicts,
      success: true,
    };
  } catch (error) {
    console.error('[Sync] Error applying state snapshot:', error);
    return {
      applied,
      skipped,
      conflicts,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reconcile local and remote move history
 *
 * Handles cases where the client has made local moves that may or may not
 * have been synced to the server yet.
 *
 * @param localMoves - Moves stored locally
 * @param remoteMoves - Moves from the server
 * @param localLastSyncedSequence - Last sequence number confirmed by server
 * @returns Reconciliation result
 */
export function reconcileMoveHistory(
  localMoves: Move[],
  remoteMoves: Move[],
  localLastSyncedSequence: number
): ReconciliationResult {
  console.log(
    `[Sync] Reconciling move history. Local: ${localMoves.length}, Remote: ${remoteMoves.length}, Last synced: ${localLastSyncedSequence}`
  );

  const applied: Move[] = [];
  const skipped: Move[] = [];
  const conflicts: Move[] = [];

  try {
    // Create a map of local moves by sequence number for quick lookup
    const localMoveMap = new Map<number, Move>();
    for (const move of localMoves) {
      localMoveMap.set(move.ply, move);
    }

    // Process remote moves
    for (const remoteMove of remoteMoves) {
      const localMove = localMoveMap.get(remoteMove.ply);

      if (!localMove) {
        // New move from remote, apply it
        applied.push(remoteMove);
        console.log(
          `[Sync] Applying remote move at sequence ${remoteMove.ply}: ${remoteMove.san}`
        );
      } else {
        // Check if moves match
        const movesMatch =
          localMove.san === remoteMove.san &&
          localMove.fen_after === remoteMove.fen_after;

        if (movesMatch) {
          // Moves match, skip (already have it)
          skipped.push(remoteMove);
          console.log(
            `[Sync] Skipping matching move at sequence ${remoteMove.ply}: ${remoteMove.san}`
          );
        } else {
          // Moves differ - conflict detected
          conflicts.push(remoteMove);
          console.error(
            `[Sync] Conflict detected at sequence ${remoteMove.ply}. Local: ${localMove.san}, Remote: ${remoteMove.san}`
          );
        }
      }
    }

    const hasConflicts = conflicts.length > 0;

    if (hasConflicts) {
      console.error(
        `[Sync] Reconciliation found ${conflicts.length} conflicts`
      );
    } else {
      console.log(
        `[Sync] Reconciliation complete: ${applied.length} applied, ${skipped.length} skipped, no conflicts`
      );
    }

    return {
      applied,
      skipped,
      conflicts,
      success: !hasConflicts,
      error: hasConflicts ? 'Move history conflicts detected' : undefined,
    };
  } catch (error) {
    console.error('[Sync] Error reconciling move history:', error);
    return {
      applied,
      skipped,
      conflicts,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the last sequence number from a session
 *
 * @param sessionId - The session UUID
 * @returns The last sequence number, or -1 if no moves exist
 */
export async function getLastSequenceNumber(
  sessionId: string
): Promise<number> {
  try {
    console.log(`[Sync] Getting last sequence number for session: ${sessionId}`);

    const { data, error } = await supabase
      .from('moves')
      .select('ply')
      .eq('session_id', sessionId)
      .order('ply', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No moves found is not an error
      if (error.code === 'PGRST116') {
        console.log('[Sync] No moves found, returning sequence -1');
        return -1;
      }
      console.error('[Sync] Error getting last sequence number:', error);
      return -1;
    }

    const lastSequence = data?.ply ?? -1;
    console.log(`[Sync] Last sequence number: ${lastSequence}`);
    return lastSequence;
  } catch (error) {
    console.error('[Sync] Error getting last sequence number:', error);
    return -1;
  }
}

/**
 * Check if a client's state is out of sync with the server
 *
 * @param sessionId - The session UUID
 * @param localLastSequence - The client's last known sequence number
 * @returns true if the client is behind the server
 */
export async function isOutOfSync(
  sessionId: string,
  localLastSequence: number
): Promise<boolean> {
  try {
    const serverLastSequence = await getLastSequenceNumber(sessionId);
    const outOfSync = localLastSequence < serverLastSequence;

    console.log(
      `[Sync] Sync check: local=${localLastSequence}, server=${serverLastSequence}, outOfSync=${outOfSync}`
    );

    return outOfSync;
  } catch (error) {
    console.error('[Sync] Error checking sync status:', error);
    return false;
  }
}
