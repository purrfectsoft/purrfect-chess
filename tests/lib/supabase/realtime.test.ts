import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  RealtimeChannelManager,
  RealtimeEventType,
  createMessage,
  isValidMessage,
  type MovePayload,
  type SessionStatePayload,
} from '@/lib/supabase/realtime';

// Mock Supabase client
const MOCK_SUPABASE_URL = 'https://test-project.supabase.co';
const MOCK_SUPABASE_ANON_KEY = 'test-anon-key';

describe('Realtime Utilities', () => {
  describe('createMessage', () => {
    it('should create a valid message with required fields', () => {
      const payload: MovePayload = {
        sessionId: 'session-123',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      };

      const message = createMessage(
        RealtimeEventType.MOVE,
        payload,
        'player-123'
      );

      expect(message.type).toBe(RealtimeEventType.MOVE);
      expect(message.payload).toEqual(payload);
      expect(message.senderId).toBe('player-123');
      expect(message.timestamp).toBeDefined();
      expect(new Date(message.timestamp)).toBeInstanceOf(Date);
    });

    it('should create messages with different event types', () => {
      const sessionPayload: SessionStatePayload = {
        sessionId: 'session-123',
        state: 'active',
      };

      const message = createMessage(
        RealtimeEventType.SESSION_STATE_CHANGE,
        sessionPayload,
        'player-123'
      );

      expect(message.type).toBe(RealtimeEventType.SESSION_STATE_CHANGE);
      expect(message.payload).toEqual(sessionPayload);
    });
  });

  describe('isValidMessage', () => {
    it('should validate a correct message', () => {
      const validMessage = {
        type: RealtimeEventType.MOVE,
        payload: { from: 'e2', to: 'e4' },
        timestamp: new Date().toISOString(),
        senderId: 'player-123',
      };

      expect(isValidMessage(validMessage)).toBe(true);
    });

    it('should reject message with missing type', () => {
      const invalidMessage = {
        payload: { from: 'e2', to: 'e4' },
        timestamp: new Date().toISOString(),
        senderId: 'player-123',
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message with invalid type', () => {
      const invalidMessage = {
        type: 'invalid_type',
        payload: { from: 'e2', to: 'e4' },
        timestamp: new Date().toISOString(),
        senderId: 'player-123',
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message with missing payload', () => {
      const invalidMessage = {
        type: RealtimeEventType.MOVE,
        timestamp: new Date().toISOString(),
        senderId: 'player-123',
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message with missing timestamp', () => {
      const invalidMessage = {
        type: RealtimeEventType.MOVE,
        payload: { from: 'e2', to: 'e4' },
        senderId: 'player-123',
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message with missing senderId', () => {
      const invalidMessage = {
        type: RealtimeEventType.MOVE,
        payload: { from: 'e2', to: 'e4' },
        timestamp: new Date().toISOString(),
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject non-object values', () => {
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage(undefined)).toBe(false);
      expect(isValidMessage('string')).toBe(false);
      expect(isValidMessage(123)).toBe(false);
      expect(isValidMessage([])).toBe(false);
    });
  });

  describe('RealtimeChannelManager', () => {
    let manager: RealtimeChannelManager;
    let supabaseClient: ReturnType<typeof createClient>;
    let mockChannel: any;
    let mockSubscribe: any;

    beforeEach(() => {
      // Create a real Supabase client for testing
      supabaseClient = createClient(MOCK_SUPABASE_URL, MOCK_SUPABASE_ANON_KEY);

      // Mock the channel methods
      mockSubscribe = vi.fn((callback) => {
        // Simulate successful subscription
        setTimeout(() => callback('SUBSCRIBED'), 0);
        return mockChannel;
      });

      mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: mockSubscribe,
        send: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };

      // Mock supabase.channel to return our mock channel
      vi.spyOn(supabaseClient, 'channel').mockReturnValue(mockChannel as any);
      vi.spyOn(supabaseClient, 'removeChannel').mockResolvedValue(undefined as any);

      manager = new RealtimeChannelManager(supabaseClient);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('joinRoom', () => {
      it('should create a channel with correct name', async () => {
        await manager.joinRoom('test-room', {});

        expect(supabaseClient.channel).toHaveBeenCalledWith('room:test-room');
      });

      it('should subscribe to broadcast events', async () => {
        await manager.joinRoom('test-room', {});

        expect(mockChannel.on).toHaveBeenCalledWith(
          'broadcast',
          { event: '*' },
          expect.any(Function)
        );
      });

      it('should call subscribe on the channel', async () => {
        await manager.joinRoom('test-room', {});

        expect(mockChannel.subscribe).toHaveBeenCalled();
      });

      it('should mark as subscribed after successful subscription', async () => {
        await manager.joinRoom('test-room', {});

        expect(manager.isSubscribed('test-room')).toBe(true);
      });

      it('should not create duplicate subscriptions', async () => {
        await manager.joinRoom('test-room', {});
        const channel1 = await manager.joinRoom('test-room', {});

        // Should only call channel once
        expect(supabaseClient.channel).toHaveBeenCalledTimes(1);
        expect(channel1).toBeDefined();
      });

      it('should call onMove callback when move message is received', async () => {
        const onMove = vi.fn();
        await manager.joinRoom('test-room', { onMove });

        // Get the broadcast callback
        const broadcastCallback = mockChannel.on.mock.calls[0][2];

        // Simulate receiving a move message
        const moveMessage = {
          payload: {
            type: RealtimeEventType.MOVE,
            payload: {
              sessionId: 'session-123',
              from: 'e2',
              to: 'e4',
              san: 'e4',
              fen: 'test-fen',
            },
            timestamp: new Date().toISOString(),
            senderId: 'player-123',
          },
        };

        broadcastCallback(moveMessage);

        expect(onMove).toHaveBeenCalledWith(moveMessage.payload);
      });

      it('should call onAnyMessage callback for all messages', async () => {
        const onAnyMessage = vi.fn();
        await manager.joinRoom('test-room', { onAnyMessage });

        // Get the broadcast callback
        const broadcastCallback = mockChannel.on.mock.calls[0][2];

        // Simulate receiving a message
        const message = {
          payload: {
            type: RealtimeEventType.MOVE,
            payload: { from: 'e2', to: 'e4' },
            timestamp: new Date().toISOString(),
            senderId: 'player-123',
          },
        };

        broadcastCallback(message);

        expect(onAnyMessage).toHaveBeenCalledWith(message.payload);
      });
    });

    describe('broadcast', () => {
      it('should broadcast a message to the correct channel', async () => {
        await manager.joinRoom('test-room', {});

        const payload: MovePayload = {
          sessionId: 'session-123',
          from: 'e2',
          to: 'e4',
          san: 'e4',
          fen: 'test-fen',
        };

        await manager.broadcast(
          'test-room',
          RealtimeEventType.MOVE,
          payload,
          'player-123'
        );

        expect(mockChannel.send).toHaveBeenCalledWith({
          type: 'broadcast',
          event: RealtimeEventType.MOVE,
          payload: expect.objectContaining({
            type: RealtimeEventType.MOVE,
            payload,
            senderId: 'player-123',
          }),
        });
      });

      it('should not broadcast if not subscribed', async () => {
        const payload: MovePayload = {
          sessionId: 'session-123',
          from: 'e2',
          to: 'e4',
          san: 'e4',
          fen: 'test-fen',
        };

        await manager.broadcast(
          'test-room',
          RealtimeEventType.MOVE,
          payload,
          'player-123'
        );

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('leaveRoom', () => {
      it('should unsubscribe from the channel', async () => {
        await manager.joinRoom('test-room', {});
        await manager.leaveRoom('test-room');

        expect(supabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
      });

      it('should mark as not subscribed after leaving', async () => {
        await manager.joinRoom('test-room', {});
        await manager.leaveRoom('test-room');

        expect(manager.isSubscribed('test-room')).toBe(false);
      });

      it('should handle leaving a non-existent room gracefully', async () => {
        await expect(manager.leaveRoom('non-existent')).resolves.not.toThrow();
      });
    });

    describe('cleanup', () => {
      it('should remove all channels', async () => {
        await manager.joinRoom('room-1', {});
        await manager.joinRoom('room-2', {});

        await manager.cleanup();

        expect(manager.getActiveChannelCount()).toBe(0);
        expect(manager.isSubscribed('room-1')).toBe(false);
        expect(manager.isSubscribed('room-2')).toBe(false);
      });
    });

    describe('isSubscribed', () => {
      it('should return false for non-subscribed rooms', () => {
        expect(manager.isSubscribed('test-room')).toBe(false);
      });

      it('should return true for subscribed rooms', async () => {
        await manager.joinRoom('test-room', {});
        expect(manager.isSubscribed('test-room')).toBe(true);
      });
    });

    describe('getActiveChannelCount', () => {
      it('should return 0 initially', () => {
        expect(manager.getActiveChannelCount()).toBe(0);
      });

      it('should return correct count after joining rooms', async () => {
        await manager.joinRoom('room-1', {});
        expect(manager.getActiveChannelCount()).toBe(1);

        await manager.joinRoom('room-2', {});
        expect(manager.getActiveChannelCount()).toBe(2);
      });

      it('should return correct count after leaving rooms', async () => {
        await manager.joinRoom('room-1', {});
        await manager.joinRoom('room-2', {});
        await manager.leaveRoom('room-1');

        expect(manager.getActiveChannelCount()).toBe(1);
      });
    });
  });
});
