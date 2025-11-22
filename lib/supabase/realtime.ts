import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Realtime Event Types
 * Defines the types of events that can be broadcast through Realtime channels
 */
export enum RealtimeEventType {
  MOVE = 'move',
  SESSION_STATE_CHANGE = 'session_state_change',
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  DRAW_OFFER = 'draw_offer',
  DRAW_RESPONSE = 'draw_response',
  RESIGN = 'resign',
  HEARTBEAT = 'heartbeat',
}

/**
 * Presence state for a player
 */
export interface PresenceState {
  playerId: string;
  displayName: string;
  online_at: string; // ISO 8601 timestamp
  color?: 'white' | 'black';
}

/**
 * Base message format for all realtime events
 */
export interface RealtimeMessage<T = unknown> {
  type: RealtimeEventType;
  payload: T;
  timestamp: string; // ISO 8601 timestamp
  senderId: string; // Player or client ID
}

/**
 * Payload types for specific events
 */
export interface MovePayload {
  sessionId: string;
  from: string;
  to: string;
  promotion?: string;
  san: string;
  fen: string;
  timeRemainingMs?: number;
}

export interface SessionStatePayload {
  sessionId: string;
  state: 'waiting' | 'active' | 'completed' | 'abandoned' | 'expired';
  result?: string;
  resultReason?: string;
}

export interface PlayerJoinPayload {
  sessionId: string;
  playerId: string;
  displayName: string;
  color?: 'white' | 'black';
}

export interface PlayerLeavePayload {
  sessionId: string;
  playerId: string;
}

export interface DrawOfferPayload {
  sessionId: string;
}

export interface DrawResponsePayload {
  sessionId: string;
  accepted: boolean;
}

export interface ResignPayload {
  sessionId: string;
}

/**
 * Channel subscription callback type
 */
export type MessageCallback<T = unknown> = (message: RealtimeMessage<T>) => void;

/**
 * Presence callback types
 */
export type PresenceJoinCallback = (
  playerId: string,
  state: PresenceState
) => void;
export type PresenceLeaveCallback = (playerId: string) => void;

/**
 * Reconnection configuration
 */
export interface ReconnectionConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Channel manager class for handling Realtime subscriptions
 */
export class RealtimeChannelManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private supabase: SupabaseClient,
    private reconnectionConfig: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG
  ) {}

  /**
   * Join a room channel and subscribe to messages
   * @param roomId - The room identifier to join
   * @param callbacks - Message callbacks for different event types
   * @param presenceState - Optional presence state to track
   * @returns The created channel
   */
  async joinRoom(
    roomId: string,
    callbacks: {
      onMove?: MessageCallback<MovePayload>;
      onSessionStateChange?: MessageCallback<SessionStatePayload>;
      onPlayerJoin?: MessageCallback<PlayerJoinPayload>;
      onPlayerLeave?: MessageCallback<PlayerLeavePayload>;
      onDrawOffer?: MessageCallback<DrawOfferPayload>;
      onDrawResponse?: MessageCallback<DrawResponsePayload>;
      onResign?: MessageCallback<ResignPayload>;
      onAnyMessage?: MessageCallback;
      onPresenceJoin?: PresenceJoinCallback;
      onPresenceLeave?: PresenceLeaveCallback;
    },
    presenceState?: PresenceState
  ): Promise<RealtimeChannel> {
    const channelName = `room:${roomId}`;

    // Check if already subscribed
    if (this.channels.has(channelName)) {
      console.warn(
        `[Realtime] Already subscribed to channel: ${channelName}`
      );
      return this.channels.get(channelName)!;
    }

    // Create channel
    const channel = this.supabase.channel(channelName);

    // Subscribe to presence if callbacks provided
    if (callbacks.onPresenceJoin || callbacks.onPresenceLeave) {
      channel
        .on('presence', { event: 'sync' }, () => {
          // Get current presence state when syncing
          const presenceState = channel.presenceState();
          console.log(`[Realtime] Presence sync - current state:`, presenceState);
          
          // Iterate through all present users and trigger onPresenceJoin for each
          Object.values(presenceState).forEach((presences: any) => {
            presences.forEach((presence: any) => {
              const state = presence as PresenceState;
              console.log(`[Realtime] Synced presence for player: ${state.playerId}`);
              callbacks.onPresenceJoin?.(state.playerId, state);
            });
          });
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log(`[Realtime] Presence join: ${key}`, newPresences);
          newPresences.forEach((presence) => {
            const state = presence as unknown as PresenceState;
            callbacks.onPresenceJoin?.(state.playerId, state);
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`[Realtime] Presence leave: ${key}`, leftPresences);
          leftPresences.forEach((presence) => {
            const state = presence as unknown as PresenceState;
            callbacks.onPresenceLeave?.(state.playerId);
          });
        });
    }

    // Subscribe to broadcast messages
    channel.on('broadcast', { event: '*' }, (payload) => {
      const message = payload.payload as RealtimeMessage;

      // Call the generic callback if provided
      if (callbacks.onAnyMessage) {
        callbacks.onAnyMessage(message);
      }

      // Call specific callbacks based on event type
      switch (message.type) {
        case RealtimeEventType.MOVE:
          callbacks.onMove?.(message as RealtimeMessage<MovePayload>);
          break;
        case RealtimeEventType.SESSION_STATE_CHANGE:
          callbacks.onSessionStateChange?.(
            message as RealtimeMessage<SessionStatePayload>
          );
          break;
        case RealtimeEventType.PLAYER_JOIN:
          callbacks.onPlayerJoin?.(
            message as RealtimeMessage<PlayerJoinPayload>
          );
          break;
        case RealtimeEventType.PLAYER_LEAVE:
          callbacks.onPlayerLeave?.(
            message as RealtimeMessage<PlayerLeavePayload>
          );
          break;
        case RealtimeEventType.DRAW_OFFER:
          callbacks.onDrawOffer?.(
            message as RealtimeMessage<DrawOfferPayload>
          );
          break;
        case RealtimeEventType.DRAW_RESPONSE:
          callbacks.onDrawResponse?.(
            message as RealtimeMessage<DrawResponsePayload>
          );
          break;
        case RealtimeEventType.RESIGN:
          callbacks.onResign?.(message as RealtimeMessage<ResignPayload>);
          break;
      }
    });

    // Subscribe and handle the result
    const subscribeResult = await new Promise<'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED'>((resolve) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to ${channelName}`);
          this.channels.set(channelName, channel);
          this.reconnectionAttempts.set(channelName, 0);
          
          // Track presence if state provided
          if (presenceState) {
            console.log(`[Realtime] Tracking presence:`, presenceState);
            await channel.track(presenceState);
          }
          
          resolve('SUBSCRIBED');
        } else if (status === 'TIMED_OUT') {
          console.error(`[Realtime] Subscription timed out for ${channelName}`);
          resolve('TIMED_OUT');
        } else if (status === 'CLOSED') {
          console.log(`[Realtime] Channel closed: ${channelName}`);
          resolve('CLOSED');
        }
      });
    });

    // Handle reconnection if subscription failed
    if (subscribeResult !== 'SUBSCRIBED') {
      this.handleReconnection(roomId, callbacks, presenceState);
    }

    return channel;
  }

  /**
   * Update presence state for the current client
   * @param roomId - The room identifier
   * @param presenceState - The updated presence state
   */
  async updatePresence(roomId: string, presenceState: PresenceState): Promise<void> {
    const channelName = `room:${roomId}`;
    const channel = this.channels.get(channelName);

    if (!channel) {
      console.error(
        `[Realtime] Cannot update presence - not subscribed to channel: ${channelName}`
      );
      return;
    }

    await channel.track(presenceState);
    console.log(`[Realtime] Updated presence in ${channelName}`, presenceState);
  }

  /**
   * Untrack presence for the current client
   * @param roomId - The room identifier
   */
  async untrackPresence(roomId: string): Promise<void> {
    const channelName = `room:${roomId}`;
    const channel = this.channels.get(channelName);

    if (!channel) {
      console.warn(
        `[Realtime] Cannot untrack presence - not subscribed to channel: ${channelName}`
      );
      return;
    }

    await channel.untrack();
    console.log(`[Realtime] Untracked presence in ${channelName}`);
  }

  /**
   * Broadcast a message to a room channel
   * @param roomId - The room identifier
   * @param eventType - The type of event to broadcast
   * @param payload - The message payload
   * @param senderId - The sender's client/player ID
   */
  async broadcast<T>(
    roomId: string,
    eventType: RealtimeEventType,
    payload: T,
    senderId: string
  ): Promise<void> {
    const channelName = `room:${roomId}`;
    const channel = this.channels.get(channelName);

    if (!channel) {
      console.error(
        `[Realtime] Cannot broadcast - not subscribed to channel: ${channelName}`
      );
      return;
    }

    const message: RealtimeMessage<T> = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
      senderId,
    };

    await channel.send({
      type: 'broadcast',
      event: eventType,
      payload: message,
    });

    console.log(
      `[Realtime] Broadcasted ${eventType} to ${channelName}`,
      payload
    );
  }

  /**
   * Leave a room channel and unsubscribe
   * @param roomId - The room identifier to leave
   */
  async leaveRoom(roomId: string): Promise<void> {
    const channelName = `room:${roomId}`;
    const channel = this.channels.get(channelName);

    if (!channel) {
      console.warn(`[Realtime] Not subscribed to channel: ${channelName}`);
      return;
    }

    // Untrack presence before leaving
    try {
      await channel.untrack();
    } catch (error) {
      console.warn(`[Realtime] Error untracking presence:`, error);
    }

    // Clear any pending reconnection timers
    const timer = this.reconnectionTimers.get(channelName);
    if (timer) {
      clearTimeout(timer);
      this.reconnectionTimers.delete(channelName);
    }

    // Unsubscribe from the channel
    await this.supabase.removeChannel(channel);

    // Clean up tracking
    this.channels.delete(channelName);
    this.reconnectionAttempts.delete(channelName);

    console.log(`[Realtime] Left channel: ${channelName}`);
  }

  /**
   * Leave all channels and clean up
   */
  async cleanup(): Promise<void> {
    console.log('[Realtime] Cleaning up all channels...');

    // Clear all reconnection timers
    for (const timer of this.reconnectionTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectionTimers.clear();

    // Remove all channels
    for (const channelName of this.channels.keys()) {
      const roomId = channelName.replace('room:', '');
      await this.leaveRoom(roomId);
    }

    console.log('[Realtime] Cleanup complete');
  }

  /**
   * Handle reconnection with exponential backoff
   * @param roomId - The room identifier
   * @param callbacks - The callbacks to resubscribe with
   * @param presenceState - Optional presence state to restore
   */
  private handleReconnection(
    roomId: string,
    callbacks: Parameters<typeof this.joinRoom>[1],
    presenceState?: PresenceState
  ): void {
    const channelName = `room:${roomId}`;
    const attempts = this.reconnectionAttempts.get(channelName) || 0;

    if (attempts >= this.reconnectionConfig.maxRetries) {
      console.error(
        `[Realtime] Max reconnection attempts reached for ${channelName}`
      );
      this.reconnectionAttempts.delete(channelName);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectionConfig.initialDelayMs *
        Math.pow(this.reconnectionConfig.backoffMultiplier, attempts),
      this.reconnectionConfig.maxDelayMs
    );

    console.log(
      `[Realtime] Scheduling reconnection attempt ${attempts + 1} for ${channelName} in ${delay}ms`
    );

    const timer = setTimeout(() => {
      this.reconnectionAttempts.set(channelName, attempts + 1);
      this.joinRoom(roomId, callbacks, presenceState);
    }, delay);

    this.reconnectionTimers.set(channelName, timer);
  }

  /**
   * Check if currently subscribed to a room
   * @param roomId - The room identifier
   * @returns true if subscribed
   */
  isSubscribed(roomId: string): boolean {
    const channelName = `room:${roomId}`;
    return this.channels.has(channelName);
  }

  /**
   * Get the number of active channels
   */
  getActiveChannelCount(): number {
    return this.channels.size;
  }
}

/**
 * Create a message for broadcasting
 * @param eventType - The type of event
 * @param payload - The event payload
 * @param senderId - The sender's ID
 * @returns A formatted realtime message
 */
export function createMessage<T>(
  eventType: RealtimeEventType,
  payload: T,
  senderId: string
): RealtimeMessage<T> {
  return {
    type: eventType,
    payload,
    timestamp: new Date().toISOString(),
    senderId,
  };
}

/**
 * Validate a realtime message structure
 * @param message - The message to validate
 * @returns true if valid
 */
export function isValidMessage(message: unknown): message is RealtimeMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as Partial<RealtimeMessage>;

  return (
    typeof msg.type === 'string' &&
    Object.values(RealtimeEventType).includes(msg.type as RealtimeEventType) &&
    msg.payload !== undefined &&
    typeof msg.timestamp === 'string' &&
    typeof msg.senderId === 'string'
  );
}
