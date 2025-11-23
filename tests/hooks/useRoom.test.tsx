import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoom } from '@/hooks/useRoom';
import { RootStoreProvider } from '@/stores/store-setup';
import { supabase } from '@/lib/supabase/client';
import React from 'react';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Wrapper component for tests
function wrapper({ children }: { children: React.ReactNode }) {
  return <RootStoreProvider>{children}</RootStoreProvider>;
}

describe('useRoom hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useRoom(), { wrapper });

      expect(result.current.isCreating).toBe(false);
      expect(result.current.isJoining).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.isInRoom).toBe(false);
    });
  });

  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      const mockPlayerId = 'player-123';
      const mockRoomCode = 'ABCD-1234';
      const mockSessionId = 'session-456';

      // Mock RPC calls
      vi.mocked(supabase.rpc).mockImplementation((fnName: string) => {
        if (fnName === 'get_or_create_player') {
          return Promise.resolve({ data: mockPlayerId, error: null }) as any;
        }
        if (fnName === 'generate_room_code') {
          return Promise.resolve({ data: mockRoomCode, error: null }) as any;
        }
        return Promise.resolve({ data: null, error: null }) as any;
      });

      // Mock session insert and player update
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: mockSessionId, room_id: mockRoomCode },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      const roomInfo = await result.current.createRoom({
        displayName: 'Test Player',
      });

      expect(roomInfo.roomId).toBe(mockRoomCode);
      expect(roomInfo.sessionId).toBe(mockSessionId);
      expect(roomInfo.playerId).toBe(mockPlayerId);
      expect(roomInfo.shareableUrl).toContain(mockRoomCode);
    });

    it('should handle create room errors', async () => {
      // Mock RPC failure
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: new Error('Database error'),
      } as any);

      const { result } = renderHook(() => useRoom(), { wrapper });

      await expect(result.current.createRoom()).rejects.toThrow();
      
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('joinRoom', () => {
    it('should join a room successfully', async () => {
      const mockPlayerId = 'player-123';
      const mockRoomCode = 'ABCD-1234';
      const mockSessionId = 'session-456';

      // Mock RPC call for player
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockPlayerId,
        error: null,
      } as any);

      // Mock session query and player update
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: mockSessionId,
                    room_id: mockRoomCode,
                    state: 'waiting',
                    white_player_id: null,
                    black_player_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      const roomInfo = await result.current.joinRoom({
        roomId: mockRoomCode,
        displayName: 'Test Player',
      });

      expect(roomInfo.roomId).toBe(mockRoomCode);
      expect(roomInfo.sessionId).toBe(mockSessionId);
    });

    it('should handle room not found error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 'player-123',
        error: null,
      } as any);

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: new Error('Not found'),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      await expect(
        result.current.joinRoom({ roomId: 'INVALID-CODE' })
      ).rejects.toThrow('Room not found');
    });

    it('should handle full room error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 'player-123',
        error: null,
      } as any);

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'session-456',
                    room_id: 'ABCD-1234',
                    state: 'waiting',
                    white_player_id: 'player-1',
                    black_player_id: 'player-2',
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      await expect(
        result.current.joinRoom({ roomId: 'ABCD-1234' })
      ).rejects.toThrow('Room is full');
    });

    it('should normalize room ID to uppercase', async () => {
      const mockPlayerId = 'player-123';
      const mockSessionId = 'session-456';

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockPlayerId,
        error: null,
      } as any);

      let capturedRoomId = '';
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((field: string, value: string) => {
                if (field === 'room_id') {
                  capturedRoomId = value;
                }
                return {
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: mockSessionId,
                      room_id: value,
                      state: 'waiting',
                      white_player_id: null,
                      black_player_id: null,
                    },
                    error: null,
                  }),
                };
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      await result.current.joinRoom({
        roomId: 'abcd-1234', // lowercase input
      });

      expect(capturedRoomId).toBe('ABCD-1234');
    });
  });

  describe('leaveRoom', () => {
    it('should call store leaveRoom method', () => {
      const { result } = renderHook(() => useRoom(), { wrapper });

      // leaveRoom should not throw even when not in a room
      expect(() => result.current.leaveRoom()).not.toThrow();
    });
  });

  describe('client ID persistence', () => {
    it('should generate and persist client ID', async () => {
      const mockPlayerId = 'player-123';
      
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockPlayerId,
        error: null,
      } as any);

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'session-1', room_id: 'TEST-1234' },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'players') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { result } = renderHook(() => useRoom(), { wrapper });

      await result.current.createRoom();

      // Check that client ID was persisted
      const clientId = localStorageMock.getItem('purrfect-chess-client-id');
      expect(clientId).toBeTruthy();
      expect(clientId?.length).toBeGreaterThan(0);
    });
  });
});
