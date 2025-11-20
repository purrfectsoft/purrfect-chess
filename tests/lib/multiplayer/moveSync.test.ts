/**
 * Unit tests for Move Synchronization Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Chess, Move as ChessJsMove } from 'chess.js';
import {
  validateMove,
  serializeMove,
  applyRemoteMove,
  resolveConflict,
  processMoveQueue,
  createMoveQueue,
  MoveQueue,
  type QueuedMove,
} from '@/lib/multiplayer/moveSync';
import type { MovePayload } from '@/lib/supabase/realtime';

describe('Move Synchronization', () => {
  describe('validateMove', () => {
    let chess: Chess;

    beforeEach(() => {
      chess = new Chess();
    });

    it('should validate a legal move', () => {
      const result = validateMove(chess, 'e2', 'e4');

      expect(result.valid).toBe(true);
      expect(result.move).toBeDefined();
      expect(result.move?.san).toBe('e4');
      expect(result.error).toBeUndefined();
    });

    it('should reject an illegal move', () => {
      const result = validateMove(chess, 'e2', 'e5');

      expect(result.valid).toBe(false);
      expect(result.move).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it('should validate a move with promotion', () => {
      // Set up position for pawn promotion
      chess.load('8/P7/8/8/8/8/8/4K2k w - - 0 1');
      const result = validateMove(chess, 'a7', 'a8', 'q');

      expect(result.valid).toBe(true);
      expect(result.move?.promotion).toBe('q');
    });

    it('should reject invalid promotion piece', () => {
      chess.load('8/P7/8/8/8/8/8/4K2k w - - 0 1');
      const result = validateMove(chess, 'a7', 'a8', 'k'); // King is not valid promotion

      expect(result.valid).toBe(false);
    });

    it('should handle castling', () => {
      chess.load('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
      const result = validateMove(chess, 'e1', 'g1'); // Kingside castling

      expect(result.valid).toBe(true);
      expect(result.move?.san).toBe('O-O');
    });

    it('should reject moves from invalid squares', () => {
      const result = validateMove(chess, 'z9', 'a1'); // Invalid square

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('serializeMove', () => {
    it('should serialize a basic move', () => {
      const chess = new Chess();
      const move = chess.move('e4')!;
      const fen = chess.fen();

      const payload = serializeMove('session-123', move, fen);

      expect(payload.sessionId).toBe('session-123');
      expect(payload.from).toBe('e2');
      expect(payload.to).toBe('e4');
      expect(payload.san).toBe('e4');
      expect(payload.fen).toBe(fen);
      expect(payload.promotion).toBeUndefined();
      expect(payload.timeRemainingMs).toBeUndefined();
    });

    it('should serialize a move with promotion', () => {
      const chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1');
      const move = chess.move({ from: 'a7', to: 'a8', promotion: 'q' })!;
      const fen = chess.fen();

      const payload = serializeMove('session-123', move, fen);

      expect(payload.from).toBe('a7');
      expect(payload.to).toBe('a8');
      expect(payload.promotion).toBe('q');
      expect(payload.san).toBe('a8=Q+'); // Includes check notation
    });

    it('should include time remaining when provided', () => {
      const chess = new Chess();
      const move = chess.move('e4')!;
      const fen = chess.fen();

      const payload = serializeMove('session-123', move, fen, 120000);

      expect(payload.timeRemainingMs).toBe(120000);
    });

    it('should serialize captures correctly', () => {
      const chess = new Chess();
      chess.move('e4');
      chess.move('d5');
      const move = chess.move('exd5')!;
      const fen = chess.fen();

      const payload = serializeMove('session-123', move, fen);

      expect(payload.from).toBe('e4');
      expect(payload.to).toBe('d5');
      expect(payload.san).toBe('exd5');
    });
  });

  describe('applyRemoteMove', () => {
    let chess: Chess;

    beforeEach(() => {
      chess = new Chess();
    });

    it('should apply a valid remote move', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      const result = applyRemoteMove(chess, payload);

      expect(result.valid).toBe(true);
      expect(result.move).toBeDefined();
      expect(result.move?.san).toBe('e4');
    });

    it('should reject an invalid remote move', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e5', // Illegal move
        san: 'e5',
        fen: 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      };

      const result = applyRemoteMove(chess, payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle FEN mismatch gracefully', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 999', // Different move counter
      };

      const result = applyRemoteMove(chess, payload);

      // Move should still be valid despite FEN mismatch in counters
      expect(result.valid).toBe(true);
    });

    it('should apply remote move with promotion', () => {
      chess.load('8/P7/8/8/8/8/8/4K2k w - - 0 1');

      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'a7',
        to: 'a8',
        promotion: 'q',
        san: 'a8=Q',
        fen: '1Q6/8/8/8/8/8/8/4K2k b - - 0 1',
      };

      const result = applyRemoteMove(chess, payload);

      expect(result.valid).toBe(true);
      expect(result.move?.promotion).toBe('q');
    });
  });

  describe('MoveQueue', () => {
    let queue: MoveQueue;

    beforeEach(() => {
      queue = createMoveQueue();
    });

    it('should create an empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.length()).toBe(0);
    });

    it('should enqueue moves', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'test-fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());

      expect(queue.isEmpty()).toBe(false);
      expect(queue.length()).toBe(1);
    });

    it('should dequeue moves in FIFO order', () => {
      const payload1: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen1',
      };
      const payload2: MovePayload = {
        sessionId: 'session-123',
        from: 'e7',
        to: 'e5',
        san: 'e5',
        fen: 'fen2',
      };

      const time1 = new Date('2024-01-01T00:00:00Z').toISOString();
      const time2 = new Date('2024-01-01T00:00:01Z').toISOString();

      queue.enqueue(payload1, 'player-1', time1);
      queue.enqueue(payload2, 'player-2', time2);

      const move1 = queue.dequeue();
      const move2 = queue.dequeue();

      expect(move1?.payload.san).toBe('e4');
      expect(move2?.payload.san).toBe('e5');
      expect(queue.isEmpty()).toBe(true);
    });

    it('should sort moves by timestamp', () => {
      const payload1: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen1',
      };
      const payload2: MovePayload = {
        sessionId: 'session-123',
        from: 'e7',
        to: 'e5',
        san: 'e5',
        fen: 'fen2',
      };

      const time1 = new Date('2024-01-01T00:00:01Z').toISOString();
      const time2 = new Date('2024-01-01T00:00:00Z').toISOString();

      // Enqueue in wrong order
      queue.enqueue(payload1, 'player-1', time1);
      queue.enqueue(payload2, 'player-2', time2);

      // Should dequeue in correct timestamp order
      const move1 = queue.dequeue();
      expect(move1?.payload.san).toBe('e5'); // Earlier timestamp
    });

    it('should peek without removing', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());

      const peeked1 = queue.peek();
      expect(peeked1?.payload.san).toBe('e4');
      expect(queue.length()).toBe(1); // Still in queue

      const peeked2 = queue.peek();
      expect(peeked2?.payload.san).toBe('e4'); // Same move
    });

    it('should clear the queue', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());
      queue.enqueue(payload, 'player-2', new Date().toISOString());

      expect(queue.length()).toBe(2);

      queue.clear();

      expect(queue.isEmpty()).toBe(true);
      expect(queue.length()).toBe(0);
    });

    it('should track retry count', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());
      const queuedMove = queue.dequeue()!;

      expect(queuedMove.retryCount).toBe(0);

      const retried = queue.retry(queuedMove);
      expect(retried).toBe(true);

      const retriedMove = queue.dequeue()!;
      expect(retriedMove.retryCount).toBe(1);
    });

    it('should stop retrying after max attempts', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());
      let queuedMove = queue.dequeue()!;

      // Retry up to max
      for (let i = 0; i < 3; i++) {
        expect(queue.retry(queuedMove)).toBe(true);
        queuedMove = queue.dequeue()!;
      }

      // Should fail on next retry
      expect(queue.retry(queuedMove)).toBe(false);
    });

    it('should track processing state', () => {
      expect(queue.isProcessing()).toBe(false);

      queue.setProcessing(true);
      expect(queue.isProcessing()).toBe(true);

      queue.setProcessing(false);
      expect(queue.isProcessing()).toBe(false);
    });
  });

  describe('resolveConflict', () => {
    it('should resolve by earlier timestamp', () => {
      const move1: QueuedMove = {
        payload: {
          sessionId: 'session-123',
          from: 'e2',
          to: 'e4',
          san: 'e4',
          fen: 'fen1',
        },
        timestamp: new Date('2024-01-01T00:00:00Z').toISOString(),
        senderId: 'player-1',
        retryCount: 0,
      };

      const move2: QueuedMove = {
        payload: {
          sessionId: 'session-123',
          from: 'e7',
          to: 'e5',
          san: 'e5',
          fen: 'fen2',
        },
        timestamp: new Date('2024-01-01T00:00:01Z').toISOString(),
        senderId: 'player-2',
        retryCount: 0,
      };

      const winner = resolveConflict(move1, move2);
      expect(winner.senderId).toBe('player-1');
    });

    it('should resolve by sender ID when timestamps are equal', () => {
      const timestamp = new Date().toISOString();

      const move1: QueuedMove = {
        payload: {
          sessionId: 'session-123',
          from: 'e2',
          to: 'e4',
          san: 'e4',
          fen: 'fen1',
        },
        timestamp,
        senderId: 'player-b',
        retryCount: 0,
      };

      const move2: QueuedMove = {
        payload: {
          sessionId: 'session-123',
          from: 'e7',
          to: 'e5',
          san: 'e5',
          fen: 'fen2',
        },
        timestamp,
        senderId: 'player-a',
        retryCount: 0,
      };

      const winner = resolveConflict(move1, move2);
      expect(winner.senderId).toBe('player-a'); // Lexicographically first
    });
  });

  describe('processMoveQueue', () => {
    let chess: Chess;
    let queue: MoveQueue;

    beforeEach(() => {
      chess = new Chess();
      queue = createMoveQueue();
    });

    it('should process valid moves from queue', async () => {
      const onMoveApplied = vi.fn();
      const onMoveRejected = vi.fn();

      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());

      const processed = await processMoveQueue(
        queue,
        chess,
        onMoveApplied,
        onMoveRejected
      );

      expect(processed).toBe(1);
      expect(onMoveApplied).toHaveBeenCalledTimes(1);
      expect(onMoveRejected).not.toHaveBeenCalled();
      expect(queue.isEmpty()).toBe(true);
    });

    it('should reject invalid moves', async () => {
      const onMoveApplied = vi.fn();
      const onMoveRejected = vi.fn();

      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e5', // Illegal move
        san: 'e5',
        fen: 'invalid-fen',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());

      const processed = await processMoveQueue(
        queue,
        chess,
        onMoveApplied,
        onMoveRejected
      );

      expect(processed).toBe(0);
      expect(onMoveApplied).not.toHaveBeenCalled();
      expect(onMoveRejected).toHaveBeenCalledTimes(1);
    });

    it('should process multiple moves in order', async () => {
      const onMoveApplied = vi.fn();
      const onMoveRejected = vi.fn();

      const payload1: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      const payload2: MovePayload = {
        sessionId: 'session-123',
        from: 'e7',
        to: 'e5',
        san: 'e5',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      };

      queue.enqueue(payload1, 'player-1', new Date('2024-01-01T00:00:00Z').toISOString());
      queue.enqueue(payload2, 'player-2', new Date('2024-01-01T00:00:01Z').toISOString());

      const processed = await processMoveQueue(
        queue,
        chess,
        onMoveApplied,
        onMoveRejected
      );

      expect(processed).toBe(2);
      expect(onMoveApplied).toHaveBeenCalledTimes(2);
      expect(onMoveRejected).not.toHaveBeenCalled();
    });

    it('should not process queue if already processing', async () => {
      const onMoveApplied = vi.fn();
      const onMoveRejected = vi.fn();

      queue.setProcessing(true);

      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      queue.enqueue(payload, 'player-1', new Date().toISOString());

      const processed = await processMoveQueue(
        queue,
        chess,
        onMoveApplied,
        onMoveRejected
      );

      expect(processed).toBe(0);
      expect(onMoveApplied).not.toHaveBeenCalled();
      expect(queue.length()).toBe(1); // Move still in queue
    });
  });
});
