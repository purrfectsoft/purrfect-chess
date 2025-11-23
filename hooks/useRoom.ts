'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRootStore } from '@/stores/store-setup';
// uuid provides its own TypeScript definitions
import { v4 as uuidv4 } from 'uuid';

export interface CreateRoomOptions {
  displayName?: string;
  timeControlMinutes?: number;
  timeControlIncrement?: number;
}

export interface JoinRoomOptions {
  roomId: string;
  displayName?: string;
}

export interface RoomInfo {
  sessionId: string;
  roomId: string;
  playerId: string;
  shareableUrl: string;
}

/**
 * Hook for managing room creation and joining
 */
export function useRoom() {
  const store = useRootStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate a client ID for the current browser session
   * This should be persistent across page refreshes
   */
  const getOrCreateClientId = useCallback(() => {
    const storageKey = 'purrfect-chess-client-id';
    let clientId = localStorage.getItem(storageKey);
    
    if (!clientId) {
      clientId = uuidv4();
      localStorage.setItem(storageKey, clientId);
    }
    
    return clientId;
  }, []);

  /**
   * Get or create a player in the database
   * Always updates the display name to ensure consistency
   */
  const getOrCreatePlayer = useCallback(async (displayName: string = 'Anonymous Cat') => {
    const clientId = getOrCreateClientId();
    
    try {
      // Call the Supabase function to get or create player
      const { data, error: rpcError } = await supabase.rpc('get_or_create_player', {
        p_client_id: clientId,
        p_display_name: displayName,
      });

      if (rpcError) {
        throw rpcError;
      }

      const playerId = data as string; // Returns player UUID
      
      // Always update display name in DB to ensure it's current
      // This fixes stale name issues when player returns with a different name
      const { error: updateError } = await supabase
        .from('players')
        .update({ display_name: displayName })
        .eq('id', playerId);
      
      if (updateError) {
        console.warn('[useRoom] Failed to update display name for player', playerId, ':', updateError);
        // Don't throw - this is not critical
      }

      return playerId;
    } catch (err) {
      console.error('[useRoom] Failed to get or create player:', err);
      throw err;
    }
  }, [getOrCreateClientId]);

  /**
   * Generate a unique room code using the database function
   */
  const generateRoomCode = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('generate_room_code');

      if (rpcError) {
        throw rpcError;
      }

      return data as string; // Returns room code like "ABCD-1234"
    } catch (err) {
      console.error('[useRoom] Failed to generate room code:', err);
      throw err;
    }
  }, []);

  /**
   * Create a new multiplayer room
   */
  const createRoom = useCallback(async (options: CreateRoomOptions = {}): Promise<RoomInfo> => {
    const {
      displayName = 'Anonymous Cat',
      timeControlMinutes = 5,
      timeControlIncrement = 0,
    } = options;

    setIsCreating(true);
    setError(null);

    try {
      // Get or create player
      const playerId = await getOrCreatePlayer(displayName);
      
      // Generate room code
      const roomCode = await generateRoomCode();
      
      // Create session in database
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          room_id: roomCode,
          state: 'waiting',
          initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          pgn: '',
          time_control_initial: timeControlMinutes * 60, // Convert to seconds
          time_control_increment: timeControlIncrement,
        })
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      // Update multiplayer store
      store.multiplayer.joinRoom(roomCode, session.id, playerId, displayName);

      // Generate shareable URL
      const shareableUrl = `${window.location.origin}?room=${roomCode}`;

      console.log('[useRoom] Room created successfully:', {
        roomId: roomCode,
        sessionId: session.id,
        playerId,
      });

      return {
        sessionId: session.id,
        roomId: roomCode,
        playerId,
        shareableUrl,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create room';
      setError(errorMessage);
      console.error('[useRoom] Create room error:', err);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, [store.multiplayer, getOrCreatePlayer, generateRoomCode]);

  /**
   * Join an existing room
   */
  const joinRoom = useCallback(async (options: JoinRoomOptions): Promise<RoomInfo> => {
    const { roomId, displayName = 'Anonymous Cat' } = options;

    setIsJoining(true);
    setError(null);

    try {
      // Normalize room ID (uppercase, trim spaces)
      const normalizedRoomId = roomId.toUpperCase().trim();

      // Get or create player
      const playerId = await getOrCreatePlayer(displayName);

      // Check if session exists
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('room_id', normalizedRoomId)
        .single();

      if (sessionError || !session) {
        throw new Error('Room not found. Please check the room ID and try again.');
      }

      // Check if room is full (already has 2 players)
      if (session.white_player_id && session.black_player_id) {
        throw new Error('Room is full. Please join a different room.');
      }

      // Check if session is not in waiting or active state
      if (session.state !== 'waiting' && session.state !== 'active') {
        throw new Error(`Cannot join room. Session is ${session.state}.`);
      }

      // Update multiplayer store
      store.multiplayer.joinRoom(normalizedRoomId, session.id, playerId, displayName);

      // Generate shareable URL
      const shareableUrl = `${window.location.origin}?room=${normalizedRoomId}`;

      console.log('[useRoom] Joined room successfully:', {
        roomId: normalizedRoomId,
        sessionId: session.id,
        playerId,
      });

      return {
        sessionId: session.id,
        roomId: normalizedRoomId,
        playerId,
        shareableUrl,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join room';
      setError(errorMessage);
      console.error('[useRoom] Join room error:', err);
      throw err;
    } finally {
      setIsJoining(false);
    }
  }, [store.multiplayer, getOrCreatePlayer]);

  /**
   * Leave the current room
   */
  const leaveRoom = useCallback(() => {
    store.multiplayer.leaveRoom();
    setError(null);
  }, [store.multiplayer]);

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    isCreating,
    isJoining,
    error,
    isInRoom: store.multiplayer.isInSession,
    roomId: store.multiplayer.roomId,
    sessionId: store.multiplayer.sessionId,
  };
}
