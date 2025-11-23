/**
 * Unit tests for State Synchronization Module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  applyStateSnapshot,
  reconcileMoveHistory,
  type GameStateSnapshot,
} from '@/lib/multiplayer/sync';
import type { Session, Move } from '@/lib/supabase/types';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn(),
          })),
        })),
        gte: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(),
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    })),
  },
}));

describe('State Synchronization', () => {
  describe('applyStateSnapshot', () => {
    let mockSession: Session;
    let mockMoves: Move[];

    beforeEach(() => {
      mockSession = {
        id: 'session-123',
        room_id: 'TEST-1234',
        state: 'active',
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        pgn: '1. e4 e5',
        time_control_initial: 300,
        time_control_increment: 0,
        white_player_id: 'player-1',
        black_player_id: 'player-2',
        result: null,
        result_reason: null,
        created_at: '2024-01-01T00:00:00Z',
        started_at: '2024-01-01T00:00:00Z',
        ended_at: null,
        expires_at: '2024-01-02T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
      };

      mockMoves = [
        {
          id: 'move-1',
          session_id: 'session-123',
          move_number: 1,
          is_white_move: true,
          ply: 0,
          san: 'e4',
          uci: 'e2e4',
          fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          is_capture: false,
          is_check: false,
          is_checkmate: false,
          is_castling: false,
          is_en_passant: false,
          is_promotion: false,
          promotion_piece: null,
          player_id: 'player-1',
          time_spent_ms: 1000,
          time_remaining_ms: 299000,
          created_at: '2024-01-01T00:00:01Z',
        },
        {
          id: 'move-2',
          session_id: 'session-123',
          move_number: 1,
          is_white_move: false,
          ply: 1,
          san: 'e5',
          uci: 'e7e5',
          fen_before: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          fen_after: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          is_capture: false,
          is_check: false,
          is_checkmate: false,
          is_castling: false,
          is_en_passant: false,
          is_promotion: false,
          promotion_piece: null,
          player_id: 'player-2',
          time_spent_ms: 1500,
          time_remaining_ms: 298500,
          created_at: '2024-01-01T00:00:02Z',
        },
      ];
    });

    it('should apply all moves when local sequence is -1 (no local moves)', () => {
      const snapshot: GameStateSnapshot = {
        session: mockSession,
        moves: mockMoves,
        lastSequenceNumber: 1,
        timestamp: '2024-01-01T00:00:02Z',
      };

      const result = applyStateSnapshot(snapshot, -1);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(2);
      expect(result.skipped.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
      expect(result.applied[0].san).toBe('e4');
      expect(result.applied[1].san).toBe('e5');
    });

    it('should skip moves already seen by the client', () => {
      const snapshot: GameStateSnapshot = {
        session: mockSession,
        moves: mockMoves,
        lastSequenceNumber: 1,
        timestamp: '2024-01-01T00:00:02Z',
      };

      // Client already has the first move (sequence 0)
      const result = applyStateSnapshot(snapshot, 0);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(1);
      expect(result.skipped.length).toBe(1);
      expect(result.applied[0].san).toBe('e5');
      expect(result.skipped[0].san).toBe('e4');
    });

    it('should skip all moves if client is up to date', () => {
      const snapshot: GameStateSnapshot = {
        session: mockSession,
        moves: mockMoves,
        lastSequenceNumber: 1,
        timestamp: '2024-01-01T00:00:02Z',
      };

      // Client already has all moves (sequence 1)
      const result = applyStateSnapshot(snapshot, 1);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(0);
      expect(result.skipped.length).toBe(2);
    });

    it('should handle empty move list', () => {
      const snapshot: GameStateSnapshot = {
        session: mockSession,
        moves: [],
        lastSequenceNumber: -1,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = applyStateSnapshot(snapshot, -1);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(0);
      expect(result.skipped.length).toBe(0);
    });
  });

  describe('reconcileMoveHistory', () => {
    let localMoves: Move[];
    let remoteMoves: Move[];

    beforeEach(() => {
      localMoves = [
        {
          id: 'local-move-1',
          session_id: 'session-123',
          move_number: 1,
          is_white_move: true,
          ply: 0,
          san: 'e4',
          uci: 'e2e4',
          fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          is_capture: false,
          is_check: false,
          is_checkmate: false,
          is_castling: false,
          is_en_passant: false,
          is_promotion: false,
          promotion_piece: null,
          player_id: 'player-1',
          time_spent_ms: 1000,
          time_remaining_ms: 299000,
          created_at: '2024-01-01T00:00:01Z',
        },
      ];

      remoteMoves = [
        {
          id: 'remote-move-1',
          session_id: 'session-123',
          move_number: 1,
          is_white_move: true,
          ply: 0,
          san: 'e4',
          uci: 'e2e4',
          fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          is_capture: false,
          is_check: false,
          is_checkmate: false,
          is_castling: false,
          is_en_passant: false,
          is_promotion: false,
          promotion_piece: null,
          player_id: 'player-1',
          time_spent_ms: 1000,
          time_remaining_ms: 299000,
          created_at: '2024-01-01T00:00:01Z',
        },
        {
          id: 'remote-move-2',
          session_id: 'session-123',
          move_number: 1,
          is_white_move: false,
          ply: 1,
          san: 'e5',
          uci: 'e7e5',
          fen_before: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          fen_after: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          is_capture: false,
          is_check: false,
          is_checkmate: false,
          is_castling: false,
          is_en_passant: false,
          is_promotion: false,
          promotion_piece: null,
          player_id: 'player-2',
          time_spent_ms: 1500,
          time_remaining_ms: 298500,
          created_at: '2024-01-01T00:00:02Z',
        },
      ];
    });

    it('should apply new remote moves', () => {
      const result = reconcileMoveHistory(localMoves, remoteMoves, 0);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(1);
      expect(result.skipped.length).toBe(1);
      expect(result.conflicts.length).toBe(0);
      expect(result.applied[0].san).toBe('e5');
      expect(result.skipped[0].san).toBe('e4');
    });

    it('should skip matching moves', () => {
      const result = reconcileMoveHistory(localMoves, [remoteMoves[0]], 0);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(0);
      expect(result.skipped.length).toBe(1);
      expect(result.conflicts.length).toBe(0);
    });

    it('should detect conflicts when moves differ at same sequence', () => {
      const conflictingRemoteMoves = [
        {
          ...remoteMoves[0],
          san: 'd4', // Different move at same sequence
          uci: 'd2d4',
          fen_after: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        },
      ];

      const result = reconcileMoveHistory(
        localMoves,
        conflictingRemoteMoves,
        -1
      );

      expect(result.success).toBe(false);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].san).toBe('d4');
      expect(result.error).toContain('conflict');
    });

    it('should handle empty local moves', () => {
      const result = reconcileMoveHistory([], remoteMoves, -1);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(2);
      expect(result.skipped.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
    });

    it('should handle empty remote moves', () => {
      const result = reconcileMoveHistory(localMoves, [], 0);

      expect(result.success).toBe(true);
      expect(result.applied.length).toBe(0);
      expect(result.skipped.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
    });
  });
});
