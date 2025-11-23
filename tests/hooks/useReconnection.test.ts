/**
 * Unit tests for Reconnection Hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ReconnectionStatus, useReconnection } from '@/hooks/useReconnection';
import { RootStoreProvider } from '@/stores/store-setup';
import { createElement, type ReactNode } from 'react';

// Mock the sync module
vi.mock('@/lib/multiplayer/sync', () => ({
  getFullGameState: vi.fn(),
  queryMoveHistory: vi.fn(),
  applyStateSnapshot: vi.fn(),
  isOutOfSync: vi.fn(),
}));

// Mock the moveSync module
vi.mock('@/lib/multiplayer/moveSync', () => ({
  applyRemoteMove: vi.fn(() => ({
    valid: true,
    move: { san: 'e4' },
  })),
}));

// Mock chess.js
vi.mock('chess.js', () => ({
  Chess: vi.fn(() => ({
    load: vi.fn(),
    move: vi.fn(),
    fen: vi.fn(() => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  })),
}));

const wrapper = ({ children }: { children: ReactNode }) => 
  createElement(RootStoreProvider, null, children);

describe('useReconnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with IDLE status', () => {
    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
        }),
      { wrapper }
    );

    expect(result.current.reconnectionStatus).toBe(ReconnectionStatus.IDLE);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('should not activate when enabled is false', () => {
    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: false,
        }),
      { wrapper }
    );

    expect(result.current.reconnectionStatus).toBe(ReconnectionStatus.IDLE);
  });

  it('should not activate when sessionId is null', () => {
    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: null,
          enabled: true,
        }),
      { wrapper }
    );

    expect(result.current.reconnectionStatus).toBe(ReconnectionStatus.IDLE);
  });

  it('should provide requestSync function', () => {
    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
        }),
      { wrapper }
    );

    expect(typeof result.current.requestSync).toBe('function');
  });

  it('should call onStateRecovered callback when state is recovered', async () => {
    const mockSync = await import('@/lib/multiplayer/sync');
    const onStateRecovered = vi.fn();

    const mockSnapshot = {
      session: {
        id: 'session-123',
        room_id: 'TEST-1234',
        state: 'active' as const,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        time_control_initial: 300,
        time_control_increment: 0,
        white_player_id: null,
        black_player_id: null,
        result: null,
        result_reason: null,
        created_at: '2024-01-01T00:00:00Z',
        started_at: null,
        ended_at: null,
        expires_at: '2024-01-02T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
      },
      moves: [],
      lastSequenceNumber: -1,
      timestamp: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mockSync.getFullGameState).mockResolvedValue(mockSnapshot);
    vi.mocked(mockSync.applyStateSnapshot).mockReturnValue({
      applied: [],
      skipped: [],
      conflicts: [],
      success: true,
    });

    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
          onStateRecovered,
        }),
      { wrapper }
    );

    await result.current.requestSync();

    await waitFor(() => {
      expect(onStateRecovered).toHaveBeenCalledWith(mockSnapshot);
    });
  });

  it('should call onSyncError callback when sync fails', async () => {
    const mockSync = await import('@/lib/multiplayer/sync');
    const onSyncError = vi.fn();

    vi.mocked(mockSync.getFullGameState).mockResolvedValue(null);

    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
          onSyncError,
        }),
      { wrapper }
    );

    await result.current.requestSync();

    await waitFor(() => {
      expect(onSyncError).toHaveBeenCalled();
    });
  });

  it('should update reconnection status during sync', async () => {
    const mockSync = await import('@/lib/multiplayer/sync');

    const mockSnapshot = {
      session: {
        id: 'session-123',
        room_id: 'TEST-1234',
        state: 'active' as const,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        time_control_initial: 300,
        time_control_increment: 0,
        white_player_id: null,
        black_player_id: null,
        result: null,
        result_reason: null,
        created_at: '2024-01-01T00:00:00Z',
        started_at: null,
        ended_at: null,
        expires_at: '2024-01-02T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
      },
      moves: [],
      lastSequenceNumber: -1,
      timestamp: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mockSync.getFullGameState).mockResolvedValue(mockSnapshot);
    vi.mocked(mockSync.applyStateSnapshot).mockReturnValue({
      applied: [],
      skipped: [],
      conflicts: [],
      success: true,
    });

    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
        }),
      { wrapper }
    );

    await result.current.requestSync();

    await waitFor(() => {
      expect(result.current.reconnectionStatus).toBe(ReconnectionStatus.SYNCED);
      expect(result.current.isReconnecting).toBe(false);
    });
  });

  it('should prevent concurrent sync operations', async () => {
    const mockSync = await import('@/lib/multiplayer/sync');

    const mockSnapshot = {
      session: {
        id: 'session-123',
        room_id: 'TEST-1234',
        state: 'active' as const,
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        time_control_initial: 300,
        time_control_increment: 0,
        white_player_id: null,
        black_player_id: null,
        result: null,
        result_reason: null,
        created_at: '2024-01-01T00:00:00Z',
        started_at: null,
        ended_at: null,
        expires_at: '2024-01-02T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
      },
      moves: [],
      lastSequenceNumber: -1,
      timestamp: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mockSync.getFullGameState).mockResolvedValue(mockSnapshot);
    vi.mocked(mockSync.applyStateSnapshot).mockReturnValue({
      applied: [],
      skipped: [],
      conflicts: [],
      success: true,
    });

    const { result } = renderHook(
      () =>
        useReconnection({
          sessionId: 'session-123',
          enabled: true,
        }),
      { wrapper }
    );

    // Start first sync
    const sync1 = result.current.requestSync();

    // Try to start second sync immediately
    const sync2 = result.current.requestSync();

    await Promise.all([sync1, sync2]);

    // getFullGameState should only be called once because the second sync was skipped
    expect(mockSync.getFullGameState).toHaveBeenCalledTimes(1);
  });
});
