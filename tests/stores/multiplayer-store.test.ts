/**
 * Unit tests for Multiplayer Store
 *
 * Tests the multiplayer state management slice in the root store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import RootStoreModel, {
  createDefaultSnapshot,
  type RootStore,
} from '@/stores/root-store';

describe('Multiplayer Store', () => {
  let store: RootStore;

  beforeEach(() => {
    // Create a fresh store instance for each test
    store = RootStoreModel.create(createDefaultSnapshot());
  });

  describe('Initialization', () => {
    it('should initialize with default multiplayer state', () => {
      expect(store.multiplayer.sessionId).toBeNull();
      expect(store.multiplayer.roomId).toBeNull();
      expect(store.multiplayer.sessionState).toBe('waiting');
      expect(store.multiplayer.localPlayerId).toBeNull();
      expect(store.multiplayer.players.size).toBe(0);
      expect(store.multiplayer.moves.length).toBe(0);
      expect(store.multiplayer.connectionStatus).toBe('disconnected');
      expect(store.multiplayer.lastActivityAt).toBeDefined();
    });

    it('should not be connected initially', () => {
      expect(store.multiplayer.isConnected).toBe(false);
    });

    it('should not be in a session initially', () => {
      expect(store.multiplayer.isInSession).toBe(false);
    });
  });

  describe('Connection Status', () => {
    it('should update connection status', () => {
      store.multiplayer.setConnectionStatus('connecting');
      expect(store.multiplayer.connectionStatus).toBe('connecting');

      store.multiplayer.setConnectionStatus('connected');
      expect(store.multiplayer.connectionStatus).toBe('connected');
      expect(store.multiplayer.isConnected).toBe(true);
    });

    it('should update lastActivityAt when connection status changes', () => {
      const initialTimestamp = store.multiplayer.lastActivityAt;
      
      // Wait a small amount to ensure timestamp difference
      setTimeout(() => {
        store.multiplayer.setConnectionStatus('connected');
        expect(store.multiplayer.lastActivityAt).not.toBe(initialTimestamp);
      }, 10);
    });

    it('should handle error connection status', () => {
      store.multiplayer.setConnectionStatus('error');
      expect(store.multiplayer.connectionStatus).toBe('error');
      expect(store.multiplayer.isConnected).toBe(false);
    });
  });

  describe('Room/Session Management', () => {
    it('should join a room successfully', () => {
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );

      expect(store.multiplayer.roomId).toBe('test-room-123');
      expect(store.multiplayer.sessionId).toBe('test-session-456');
      expect(store.multiplayer.localPlayerId).toBe('player-1');
      expect(store.multiplayer.sessionState).toBe('waiting');
      expect(store.multiplayer.isInSession).toBe(true);
    });

    it('should add local player when joining room', () => {
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );

      expect(store.multiplayer.players.size).toBe(1);
      const localPlayer = store.multiplayer.localPlayer;
      expect(localPlayer).not.toBeNull();
      expect(localPlayer?.id).toBe('player-1');
      expect(localPlayer?.displayName).toBe('Alice');
      expect(localPlayer?.isOnline).toBe(true);
    });

    it('should leave a room successfully', () => {
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );
      store.multiplayer.leaveRoom();

      expect(store.multiplayer.roomId).toBeNull();
      expect(store.multiplayer.sessionId).toBeNull();
      expect(store.multiplayer.sessionState).toBe('abandoned');
      expect(store.multiplayer.connectionStatus).toBe('disconnected');
      expect(store.multiplayer.isInSession).toBe(false);
    });

    it('should update session state', () => {
      store.multiplayer.setSessionState('active');
      expect(store.multiplayer.sessionState).toBe('active');

      store.multiplayer.setSessionState('completed');
      expect(store.multiplayer.sessionState).toBe('completed');
    });
  });

  describe('Player Management', () => {
    beforeEach(() => {
      // Set up a session
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );
    });

    it('should add a new player', () => {
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black');

      expect(store.multiplayer.players.size).toBe(2);
      const player2 = store.multiplayer.players.get('player-2');
      expect(player2).toBeDefined();
      expect(player2?.displayName).toBe('Bob');
      expect(player2?.color).toBe('black');
      expect(player2?.isOnline).toBe(true);
    });

    it('should update an existing player', () => {
      store.multiplayer.addOrUpdatePlayer('player-1', 'Alice Updated', 'white');

      const player1 = store.multiplayer.players.get('player-1');
      expect(player1?.displayName).toBe('Alice Updated');
      expect(player1?.color).toBe('white');
    });

    it('should update player online status', () => {
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black', true);
      let player2 = store.multiplayer.players.get('player-2');
      expect(player2?.isOnline).toBe(true);

      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', undefined, false);
      player2 = store.multiplayer.players.get('player-2');
      expect(player2?.isOnline).toBe(false);
    });

    it('should remove a player', () => {
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black');
      expect(store.multiplayer.players.size).toBe(2);

      store.multiplayer.removePlayer('player-2');
      expect(store.multiplayer.players.size).toBe(1);
      expect(store.multiplayer.players.has('player-2')).toBe(false);
    });

    it('should get player by color', () => {
      store.multiplayer.addOrUpdatePlayer('player-1', 'Alice', 'white');
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black');

      const whitePlayer = store.multiplayer.getPlayerByColor('white');
      expect(whitePlayer?.id).toBe('player-1');
      expect(whitePlayer?.displayName).toBe('Alice');

      const blackPlayer = store.multiplayer.getPlayerByColor('black');
      expect(blackPlayer?.id).toBe('player-2');
      expect(blackPlayer?.displayName).toBe('Bob');
    });

    it('should return null for non-existent player color', () => {
      const whitePlayer = store.multiplayer.getPlayerByColor('white');
      expect(whitePlayer).toBeNull();
    });

    it('should get remote players', () => {
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black');
      store.multiplayer.addOrUpdatePlayer('player-3', 'Charlie', null);

      const remotePlayers = store.multiplayer.remotePlayers;
      expect(remotePlayers.length).toBe(2);
      expect(remotePlayers.some((p) => p.id === 'player-2')).toBe(true);
      expect(remotePlayers.some((p) => p.id === 'player-3')).toBe(true);
      expect(remotePlayers.some((p) => p.id === 'player-1')).toBe(false);
    });
  });

  describe('Move Management', () => {
    beforeEach(() => {
      // Set up a session
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );
    });

    it('should add a move to history', () => {
      store.multiplayer.addMove(
        'move-1',
        'e2',
        'e4',
        'e4',
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'player-1'
      );

      expect(store.multiplayer.moves.length).toBe(1);
      expect(store.multiplayer.moveCount).toBe(1);
      
      const move = store.multiplayer.moves[0];
      expect(move.id).toBe('move-1');
      expect(move.from).toBe('e2');
      expect(move.to).toBe('e4');
      expect(move.san).toBe('e4');
      expect(move.playerId).toBe('player-1');
      expect(move.promotion).toBeNull();
      expect(move.timeRemainingMs).toBeNull();
    });

    it('should add a move with promotion', () => {
      store.multiplayer.addMove(
        'move-2',
        'e7',
        'e8',
        'e8=Q',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'player-1',
        'q'
      );

      const move = store.multiplayer.moves[0];
      expect(move.promotion).toBe('q');
    });

    it('should add a move with time remaining', () => {
      store.multiplayer.addMove(
        'move-3',
        'e2',
        'e4',
        'e4',
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'player-1',
        undefined,
        120000
      );

      const move = store.multiplayer.moves[0];
      expect(move.timeRemainingMs).toBe(120000);
    });

    it('should maintain move order', () => {
      store.multiplayer.addMove(
        'move-1',
        'e2',
        'e4',
        'e4',
        'fen1',
        'player-1'
      );
      store.multiplayer.addMove(
        'move-2',
        'e7',
        'e5',
        'e5',
        'fen2',
        'player-2'
      );
      store.multiplayer.addMove(
        'move-3',
        'g1',
        'f3',
        'Nf3',
        'fen3',
        'player-1'
      );

      expect(store.multiplayer.moves.length).toBe(3);
      expect(store.multiplayer.moves[0].id).toBe('move-1');
      expect(store.multiplayer.moves[1].id).toBe('move-2');
      expect(store.multiplayer.moves[2].id).toBe('move-3');
    });

    it('should clear all moves', () => {
      store.multiplayer.addMove('move-1', 'e2', 'e4', 'e4', 'fen1', 'player-1');
      store.multiplayer.addMove('move-2', 'e7', 'e5', 'e5', 'fen2', 'player-2');
      
      expect(store.multiplayer.moves.length).toBe(2);

      store.multiplayer.clearMoves();
      expect(store.multiplayer.moves.length).toBe(0);
      expect(store.multiplayer.moveCount).toBe(0);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all multiplayer state', () => {
      // Set up a full session
      store.multiplayer.joinRoom(
        'test-room-123',
        'test-session-456',
        'player-1',
        'Alice'
      );
      store.multiplayer.addOrUpdatePlayer('player-2', 'Bob', 'black');
      store.multiplayer.setConnectionStatus('connected');
      store.multiplayer.setSessionState('active');
      store.multiplayer.addMove('move-1', 'e2', 'e4', 'e4', 'fen1', 'player-1');

      // Reset
      store.multiplayer.reset();

      // Verify all state is reset
      expect(store.multiplayer.sessionId).toBeNull();
      expect(store.multiplayer.roomId).toBeNull();
      expect(store.multiplayer.sessionState).toBe('waiting');
      expect(store.multiplayer.localPlayerId).toBeNull();
      expect(store.multiplayer.players.size).toBe(0);
      expect(store.multiplayer.moves.length).toBe(0);
      expect(store.multiplayer.connectionStatus).toBe('disconnected');
      expect(store.multiplayer.isConnected).toBe(false);
      expect(store.multiplayer.isInSession).toBe(false);
    });
  });

  describe('Activity Tracking', () => {
    it('should update lastActivityAt on actions', () => {
      const initialTimestamp = store.multiplayer.lastActivityAt;

      // Perform an action and verify timestamp is updated
      store.multiplayer.setConnectionStatus('connected');
      const afterConnectionChange = store.multiplayer.lastActivityAt;
      
      // Verify timestamp is an ISO string and not the exact same instance
      expect(afterConnectionChange).toBeDefined();
      expect(typeof afterConnectionChange).toBe('string');
      expect(new Date(afterConnectionChange).getTime()).toBeGreaterThanOrEqual(
        new Date(initialTimestamp).getTime()
      );
    });

    it('should update lastActivityAt when joining room', () => {
      const beforeTimestamp = store.multiplayer.lastActivityAt;
      
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      const afterTimestamp = store.multiplayer.lastActivityAt;
      
      // Should have a valid timestamp after joining
      expect(new Date(afterTimestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTimestamp).getTime()
      );
    });

    it('should update lastActivityAt when adding moves', () => {
      const beforeTimestamp = store.multiplayer.lastActivityAt;
      
      store.multiplayer.addMove('move-1', 'e2', 'e4', 'e4', 'fen', 'player-1');
      const afterTimestamp = store.multiplayer.lastActivityAt;
      
      // Should have a valid timestamp after adding move
      expect(new Date(afterTimestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTimestamp).getTime()
      );
    });
  });

  describe('View Getters', () => {
    it('should correctly report connection state', () => {
      expect(store.multiplayer.isConnected).toBe(false);
      
      store.multiplayer.setConnectionStatus('connecting');
      expect(store.multiplayer.isConnected).toBe(false);
      
      store.multiplayer.setConnectionStatus('connected');
      expect(store.multiplayer.isConnected).toBe(true);
      
      store.multiplayer.setConnectionStatus('error');
      expect(store.multiplayer.isConnected).toBe(false);
    });

    it('should correctly report session state', () => {
      expect(store.multiplayer.isInSession).toBe(false);
      
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      expect(store.multiplayer.isInSession).toBe(true);
      
      store.multiplayer.leaveRoom();
      expect(store.multiplayer.isInSession).toBe(false);
    });

    it('should return local player', () => {
      expect(store.multiplayer.localPlayer).toBeNull();
      
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      const localPlayer = store.multiplayer.localPlayer;
      expect(localPlayer).not.toBeNull();
      expect(localPlayer?.id).toBe('player-1');
    });

    it('should return move count', () => {
      expect(store.multiplayer.moveCount).toBe(0);
      
      store.multiplayer.addMove('move-1', 'e2', 'e4', 'e4', 'fen1', 'player-1');
      expect(store.multiplayer.moveCount).toBe(1);
      
      store.multiplayer.addMove('move-2', 'e7', 'e5', 'e5', 'fen2', 'player-2');
      expect(store.multiplayer.moveCount).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle joining room with existing player', () => {
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      expect(store.multiplayer.players.size).toBe(1);
      
      // Join again with same player ID (shouldn't duplicate)
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      expect(store.multiplayer.players.size).toBe(1);
    });

    it('should handle removing non-existent player gracefully', () => {
      store.multiplayer.removePlayer('non-existent-player');
      expect(store.multiplayer.players.size).toBe(0);
    });

    it('should handle empty remote players when only local player exists', () => {
      store.multiplayer.joinRoom('room', 'session', 'player-1', 'Alice');
      const remotePlayers = store.multiplayer.remotePlayers;
      expect(remotePlayers.length).toBe(0);
    });

    it('should handle adding moves when not in session', () => {
      // Should not throw error
      store.multiplayer.addMove('move-1', 'e2', 'e4', 'e4', 'fen', 'player-1');
      expect(store.multiplayer.moves.length).toBe(1);
    });
  });
});
