'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  RealtimeChannelManager,
  RealtimeEventType,
  type MovePayload,
  type SessionStatePayload,
  type PlayerJoinPayload,
  type PlayerLeavePayload,
  type PlayerReadyPayload,
  type DrawOfferPayload,
  type DrawResponsePayload,
  type ResignPayload,
  type RealtimeMessage,
  type PresenceState,
  type PresenceJoinCallback,
  type PresenceLeaveCallback,
} from '@/lib/supabase/realtime';

/**
 * Connection status for the multiplayer hook
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Options for the useMultiplayer hook
 */
export interface UseMultiplayerOptions {
  roomId: string;
  playerId: string;
  onMove?: (payload: MovePayload, message: RealtimeMessage<MovePayload>) => void;
  onSessionStateChange?: (
    payload: SessionStatePayload,
    message: RealtimeMessage<SessionStatePayload>
  ) => void;
  onPlayerJoin?: (
    payload: PlayerJoinPayload,
    message: RealtimeMessage<PlayerJoinPayload>
  ) => void;
  onPlayerLeave?: (
    payload: PlayerLeavePayload,
    message: RealtimeMessage<PlayerLeavePayload>
  ) => void;
  onPlayerReady?: (
    payload: PlayerReadyPayload,
    message: RealtimeMessage<PlayerReadyPayload>
  ) => void;
  onDrawOffer?: (
    payload: DrawOfferPayload,
    message: RealtimeMessage<DrawOfferPayload>
  ) => void;
  onDrawResponse?: (
    payload: DrawResponsePayload,
    message: RealtimeMessage<DrawResponsePayload>
  ) => void;
  onResign?: (
    payload: ResignPayload,
    message: RealtimeMessage<ResignPayload>
  ) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onPresenceJoin?: PresenceJoinCallback;
  onPresenceLeave?: PresenceLeaveCallback;
  presenceState?: PresenceState;
  autoConnect?: boolean;
}

/**
 * Return type for the useMultiplayer hook
 */
export interface UseMultiplayerReturn {
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  updatePresence: (presenceState: PresenceState) => Promise<void>;
  broadcastMove: (move: Omit<MovePayload, 'sessionId'>) => Promise<void>;
  broadcastSessionStateChange: (
    state: Omit<SessionStatePayload, 'sessionId'>
  ) => Promise<void>;
  broadcastPlayerJoin: (
    player: Omit<PlayerJoinPayload, 'sessionId'>
  ) => Promise<void>;
  broadcastPlayerLeave: () => Promise<void>;
  broadcastPlayerReady: () => Promise<void>;
  broadcastDrawOffer: () => Promise<void>;
  broadcastDrawResponse: (accepted: boolean) => Promise<void>;
  broadcastResign: () => Promise<void>;
}

/**
 * Custom hook for managing multiplayer Realtime connections
 *
 * This hook manages the lifecycle of a Realtime channel for a game room,
 * handling connection, reconnection, and cleanup automatically.
 *
 * @example
 * ```tsx
 * const { connect, disconnect, broadcastMove, isConnected } = useMultiplayer({
 *   roomId: 'abc123',
 *   playerId: 'player-uuid',
 *   onMove: (payload) => {
 *     console.log('Received move:', payload);
 *   },
 *   autoConnect: true,
 * });
 * ```
 */
export function useMultiplayer(
  options: UseMultiplayerOptions
): UseMultiplayerReturn {
  const {
    roomId,
    playerId,
    onMove,
    onSessionStateChange,
    onPlayerJoin,
    onPlayerLeave,
    onPlayerReady,
    onDrawOffer,
    onDrawResponse,
    onResign,
    onConnectionChange,
    onPresenceJoin,
    onPresenceLeave,
    presenceState,
    autoConnect = false,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );

  // Use refs to avoid recreating the channel manager on every render
  const channelManagerRef = useRef<RealtimeChannelManager | null>(null);
  const callbacksRef = useRef({
    onMove,
    onSessionStateChange,
    onPlayerJoin,
    onPlayerLeave,
    onPlayerReady,
    onDrawOffer,
    onDrawResponse,
    onResign,
    onConnectionChange,
    onPresenceJoin,
    onPresenceLeave,
  });

  // Keep callbacks up to date
  useEffect(() => {
    callbacksRef.current = {
      onMove,
      onSessionStateChange,
      onPlayerJoin,
      onPlayerLeave,
      onPlayerReady,
      onDrawOffer,
      onDrawResponse,
      onResign,
      onConnectionChange,
      onPresenceJoin,
      onPresenceLeave,
    };
  }, [
    onMove,
    onSessionStateChange,
    onPlayerJoin,
    onPlayerLeave,
    onPlayerReady,
    onDrawOffer,
    onDrawResponse,
    onResign,
    onConnectionChange,
    onPresenceJoin,
    onPresenceLeave,
  ]);

  // Initialize channel manager once
  useEffect(() => {
    if (!channelManagerRef.current) {
      channelManagerRef.current = new RealtimeChannelManager(supabase);
      console.log('[useMultiplayer] Channel manager initialized');
    }
  }, []);

  // Update connection status and notify callback
  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    callbacksRef.current.onConnectionChange?.(status);
  }, []);

  // Connect to the room channel
  const connect = useCallback(async () => {
    if (!channelManagerRef.current) {
      console.error('[useMultiplayer] Channel manager not initialized');
      return;
    }

    if (channelManagerRef.current.isSubscribed(roomId)) {
      console.log(
        `[useMultiplayer] Already connected to room: ${roomId}`
      );
      return;
    }

    console.log(`[useMultiplayer] Connecting to room: ${roomId}`);
    updateConnectionStatus(ConnectionStatus.CONNECTING);

    try {
      await channelManagerRef.current.joinRoom(roomId, {
        onMove: (message) => {
          callbacksRef.current.onMove?.(message.payload, message);
        },
        onSessionStateChange: (message) => {
          callbacksRef.current.onSessionStateChange?.(message.payload, message);
        },
        onPlayerJoin: (message) => {
          callbacksRef.current.onPlayerJoin?.(message.payload, message);
        },
        onPlayerLeave: (message) => {
          callbacksRef.current.onPlayerLeave?.(message.payload, message);
        },
        onPlayerReady: (message) => {
          callbacksRef.current.onPlayerReady?.(message.payload, message);
        },
        onDrawOffer: (message) => {
          callbacksRef.current.onDrawOffer?.(message.payload, message);
        },
        onDrawResponse: (message) => {
          callbacksRef.current.onDrawResponse?.(message.payload, message);
        },
        onResign: (message) => {
          callbacksRef.current.onResign?.(message.payload, message);
        },
        onPresenceJoin: (playerId, state) => {
          callbacksRef.current.onPresenceJoin?.(playerId, state);
        },
        onPresenceLeave: (playerId) => {
          callbacksRef.current.onPresenceLeave?.(playerId);
        },
      }, presenceState);

      updateConnectionStatus(ConnectionStatus.CONNECTED);
      console.log(`[useMultiplayer] Connected to room: ${roomId}`);
    } catch (error) {
      console.error('[useMultiplayer] Connection error:', error);
      updateConnectionStatus(ConnectionStatus.ERROR);
    }
  }, [roomId, updateConnectionStatus]);

  // Disconnect from the room channel
  const disconnect = useCallback(async () => {
    if (!channelManagerRef.current) {
      return;
    }

    console.log(`[useMultiplayer] Disconnecting from room: ${roomId}`);

    try {
      await channelManagerRef.current.leaveRoom(roomId);
      updateConnectionStatus(ConnectionStatus.DISCONNECTED);
      console.log(`[useMultiplayer] Disconnected from room: ${roomId}`);
    } catch (error) {
      console.error('[useMultiplayer] Disconnect error:', error);
    }
  }, [roomId, updateConnectionStatus]);

  // Update presence
  const updatePresence = useCallback(
    async (presenceState: PresenceState) => {
      if (!channelManagerRef.current) {
        console.error('[useMultiplayer] Cannot update presence - not initialized');
        return;
      }

      await channelManagerRef.current.updatePresence(roomId, presenceState);
    },
    [roomId]
  );

  // Broadcast a move
  const broadcastMove = useCallback(
    async (move: Omit<MovePayload, 'sessionId'>) => {
      if (!channelManagerRef.current) {
        console.error('[useMultiplayer] Cannot broadcast - not initialized');
        return;
      }

      const payload: MovePayload = {
        sessionId: roomId,
        ...move,
      };

      await channelManagerRef.current.broadcast(
        roomId,
        RealtimeEventType.MOVE,
        payload,
        playerId
      );
    },
    [roomId, playerId]
  );

  // Broadcast session state change
  const broadcastSessionStateChange = useCallback(
    async (state: Omit<SessionStatePayload, 'sessionId'>) => {
      if (!channelManagerRef.current) {
        console.error('[useMultiplayer] Cannot broadcast - not initialized');
        return;
      }

      const payload: SessionStatePayload = {
        sessionId: roomId,
        ...state,
      };

      await channelManagerRef.current.broadcast(
        roomId,
        RealtimeEventType.SESSION_STATE_CHANGE,
        payload,
        playerId
      );
    },
    [roomId, playerId]
  );

  // Broadcast player join
  const broadcastPlayerJoin = useCallback(
    async (player: Omit<PlayerJoinPayload, 'sessionId'>) => {
      if (!channelManagerRef.current) {
        console.error('[useMultiplayer] Cannot broadcast - not initialized');
        return;
      }

      const payload: PlayerJoinPayload = {
        sessionId: roomId,
        ...player,
      };

      await channelManagerRef.current.broadcast(
        roomId,
        RealtimeEventType.PLAYER_JOIN,
        payload,
        playerId
      );
    },
    [roomId, playerId]
  );

  // Broadcast player leave
  const broadcastPlayerLeave = useCallback(async () => {
    if (!channelManagerRef.current) {
      console.error('[useMultiplayer] Cannot broadcast - not initialized');
      return;
    }

    const payload: PlayerLeavePayload = {
      sessionId: roomId,
      playerId,
    };

    await channelManagerRef.current.broadcast(
      roomId,
      RealtimeEventType.PLAYER_LEAVE,
      payload,
      playerId
    );
  }, [roomId, playerId]);

  // Broadcast player ready
  const broadcastPlayerReady = useCallback(async () => {
    if (!channelManagerRef.current) {
      console.error('[useMultiplayer] Cannot broadcast - not initialized');
      return;
    }

    const payload: PlayerReadyPayload = {
      sessionId: roomId,
      playerId,
    };

    await channelManagerRef.current.broadcast(
      roomId,
      RealtimeEventType.PLAYER_READY,
      payload,
      playerId
    );
  }, [roomId, playerId]);

  // Broadcast draw offer
  const broadcastDrawOffer = useCallback(async () => {
    if (!channelManagerRef.current) {
      console.error('[useMultiplayer] Cannot broadcast - not initialized');
      return;
    }

    const payload: DrawOfferPayload = {
      sessionId: roomId,
    };

    await channelManagerRef.current.broadcast(
      roomId,
      RealtimeEventType.DRAW_OFFER,
      payload,
      playerId
    );
  }, [roomId, playerId]);

  // Broadcast draw response
  const broadcastDrawResponse = useCallback(
    async (accepted: boolean) => {
      if (!channelManagerRef.current) {
        console.error('[useMultiplayer] Cannot broadcast - not initialized');
        return;
      }

      const payload: DrawResponsePayload = {
        sessionId: roomId,
        accepted,
      };

      await channelManagerRef.current.broadcast(
        roomId,
        RealtimeEventType.DRAW_RESPONSE,
        payload,
        playerId
      );
    },
    [roomId, playerId]
  );

  // Broadcast resign
  const broadcastResign = useCallback(async () => {
    if (!channelManagerRef.current) {
      console.error('[useMultiplayer] Cannot broadcast - not initialized');
      return;
    }

    const payload: ResignPayload = {
      sessionId: roomId,
    };

    await channelManagerRef.current.broadcast(
      roomId,
      RealtimeEventType.RESIGN,
      payload,
      playerId
    );
  }, [roomId, playerId]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (channelManagerRef.current?.isSubscribed(roomId)) {
        disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, roomId]);

  return {
    connectionStatus,
    isConnected: connectionStatus === ConnectionStatus.CONNECTED,
    connect,
    disconnect,
    updatePresence,
    broadcastMove,
    broadcastSessionStateChange,
    broadcastPlayerJoin,
    broadcastPlayerLeave,
    broadcastPlayerReady,
    broadcastDrawOffer,
    broadcastDrawResponse,
    broadcastResign,
  };
}
