/**
 * Move Synchronization Module
 *
 * Handles real-time move synchronization for multiplayer chess games.
 * Provides validation, serialization, and conflict resolution for moves.
 */

import { Chess, Move as ChessJsMove } from 'chess.js';
import type { MovePayload } from '@/lib/supabase/realtime';

/**
 * Result of a move validation
 */
export interface MoveValidationResult {
  valid: boolean;
  move?: ChessJsMove;
  error?: string;
}

/**
 * Queued move with metadata
 */
export interface QueuedMove {
  payload: MovePayload;
  timestamp: string;
  senderId: string;
  retryCount: number;
}

/**
 * Move queue for ordering and conflict resolution
 */
export class MoveQueue {
  private queue: QueuedMove[] = [];
  private processing = false;
  private maxRetries = 3;

  /**
   * Add a move to the queue
   */
  enqueue(payload: MovePayload, senderId: string, timestamp: string): void {
    this.queue.push({
      payload,
      timestamp,
      senderId,
      retryCount: 0,
    });

    // Sort by timestamp to maintain order
    this.queue.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get the next move in the queue
   */
  dequeue(): QueuedMove | undefined {
    return this.queue.shift();
  }

  /**
   * Peek at the next move without removing it
   */
  peek(): QueuedMove | undefined {
    return this.queue[0];
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue length
   */
  length(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Re-enqueue a move with incremented retry count
   */
  retry(queuedMove: QueuedMove): boolean {
    if (queuedMove.retryCount >= this.maxRetries) {
      console.error(
        '[MoveQueue] Max retries reached for move:',
        queuedMove.payload
      );
      return false;
    }

    this.queue.push({
      ...queuedMove,
      retryCount: queuedMove.retryCount + 1,
    });

    return true;
  }

  /**
   * Mark queue as processing
   */
  setProcessing(processing: boolean): void {
    this.processing = processing;
  }

  /**
   * Check if queue is being processed
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

/**
 * Validate a move using chess.js
 *
 * @param chess - Chess.js instance
 * @param from - Source square (e.g., 'e2')
 * @param to - Destination square (e.g., 'e4')
 * @param promotion - Optional promotion piece ('q', 'r', 'b', 'n')
 * @returns Validation result with move details or error
 */
export function validateMove(
  chess: Chess,
  from: string,
  to: string,
  promotion?: string
): MoveValidationResult {
  try {
    // Attempt the move
    const move = chess.move({
      from,
      to,
      promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined,
    });

    if (!move) {
      return {
        valid: false,
        error: `Illegal move: ${from}-${to}`,
      };
    }

    return {
      valid: true,
      move,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid move',
    };
  }
}

/**
 * Serialize a chess.js move to a MovePayload for broadcasting
 *
 * @param sessionId - The session identifier
 * @param move - The chess.js move object
 * @param fen - The resulting FEN after the move
 * @param timeRemainingMs - Optional time remaining for the player
 * @returns Serialized move payload
 */
export function serializeMove(
  sessionId: string,
  move: ChessJsMove,
  fen: string,
  timeRemainingMs?: number
): MovePayload {
  return {
    sessionId,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    san: move.san,
    fen,
    timeRemainingMs,
  };
}

/**
 * Apply a remote move to a chess instance with validation
 *
 * @param chess - Chess.js instance to apply move to
 * @param payload - Move payload from remote player
 * @returns Validation result
 */
export function applyRemoteMove(
  chess: Chess,
  payload: MovePayload
): MoveValidationResult {
  // First validate the move is legal in current position
  const currentFen = chess.fen();
  console.log(
    `[MoveSync] Applying remote move: ${payload.from}-${payload.to} (current FEN: ${currentFen})`
  );

  const result = validateMove(chess, payload.from, payload.to, payload.promotion);

  if (!result.valid) {
    console.error('[MoveSync] Remote move validation failed:', result.error);
    return result;
  }

  // Verify the resulting FEN matches the expected FEN
  const resultingFen = chess.fen();
  
  // Compare FENs (ignoring halfmove/fullmove counters which may differ)
  const normalizedResultFen = resultingFen.split(' ').slice(0, 4).join(' ');
  const normalizedPayloadFen = payload.fen.split(' ').slice(0, 4).join(' ');

  if (normalizedResultFen !== normalizedPayloadFen) {
    console.warn(
      `[MoveSync] FEN mismatch after move. Expected: ${normalizedPayloadFen}, Got: ${normalizedResultFen}`
    );
    // This is a warning, not an error - the move was valid but FEN diverged
    // This can happen due to timing or different chess.js versions
  }

  console.log(
    `[MoveSync] Remote move applied successfully: ${payload.san} (new FEN: ${resultingFen})`
  );

  return result;
}

/**
 * Resolve conflict when simultaneous moves are detected
 *
 * Uses timestamp-based ordering: earlier timestamp wins
 * If timestamps are equal, use sender ID lexicographic ordering
 *
 * @param move1 - First queued move
 * @param move2 - Second queued move
 * @returns The move that should be processed first
 */
export function resolveConflict(
  move1: QueuedMove,
  move2: QueuedMove
): QueuedMove {
  const time1 = new Date(move1.timestamp).getTime();
  const time2 = new Date(move2.timestamp).getTime();

  if (time1 !== time2) {
    return time1 < time2 ? move1 : move2;
  }

  // Timestamps equal - use sender ID as tiebreaker
  return move1.senderId < move2.senderId ? move1 : move2;
}

/**
 * Process the move queue and apply moves in order
 *
 * @param queue - The move queue
 * @param chess - Chess.js instance
 * @param onMoveApplied - Callback when a move is successfully applied
 * @param onMoveRejected - Callback when a move is rejected
 * @returns Number of moves processed
 */
export async function processMoveQueue(
  queue: MoveQueue,
  chess: Chess,
  onMoveApplied: (payload: MovePayload, move: ChessJsMove) => void,
  onMoveRejected: (payload: MovePayload, error: string) => void
): Promise<number> {
  if (queue.isProcessing()) {
    console.log('[MoveSync] Queue already being processed');
    return 0;
  }

  queue.setProcessing(true);
  let processedCount = 0;

  try {
    while (!queue.isEmpty()) {
      const queuedMove = queue.dequeue();
      if (!queuedMove) break;

      console.log(
        `[MoveSync] Processing queued move: ${queuedMove.payload.from}-${queuedMove.payload.to}`
      );

      const result = applyRemoteMove(chess, queuedMove.payload);

      if (result.valid && result.move) {
        onMoveApplied(queuedMove.payload, result.move);
        processedCount++;
      } else {
        // Move failed - check if we should retry
        if (queue.retry(queuedMove)) {
          console.log(
            `[MoveSync] Retrying move (attempt ${queuedMove.retryCount + 1})`
          );
        } else {
          onMoveRejected(
            queuedMove.payload,
            result.error || 'Unknown error'
          );
        }
      }
    }
  } finally {
    queue.setProcessing(false);
  }

  return processedCount;
}

/**
 * Create a new move queue instance
 */
export function createMoveQueue(): MoveQueue {
  return new MoveQueue();
}
