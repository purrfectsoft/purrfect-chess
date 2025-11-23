'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';
import { useRoom } from '@/hooks/useRoom';
import { useMultiplayer } from '@/hooks/useMultiplayer';
import { supabase } from '@/lib/supabase/client';
import ConnectionStatusBadge from './ConnectionStatusBadge';

interface RoomManagerProps {
  /** Callback when room is created or joined */
  onRoomJoined?: (roomId: string, sessionId: string) => void;
  /** Callback to show messages */
  onShowMessage?: (type: 'success' | 'error' | 'info', message: string) => void;
}

/**
 * RoomManager Component
 * 
 * Handles creating and joining multiplayer game rooms.
 * Features:
 * - Create new room with generated room ID
 * - Join existing room by room ID
 * - Display current room status and waiting players
 * - Copy shareable room link to clipboard
 * - Leave room functionality
 */
const RoomManager = observer(function RoomManager({
  onRoomJoined,
  onShowMessage,
}: RoomManagerProps) {
  const store = useRootStore();
  const multiplayer = store.multiplayer;
  
  const {
    createRoom,
    joinRoom,
    leaveRoom,
    isCreating,
    isJoining,
    error: roomError,
    isInRoom,
    roomId,
    sessionId,
  } = useRoom();

  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  // Track connection attempts to prevent re-connecting to the same room
  const connectionAttemptRef = useRef<{ roomId: string | null; attempted: boolean }>({
    roomId: null,
    attempted: false,
  });

  // Initialize multiplayer connection when in a room
  const { connectionStatus, connect, disconnect, updatePresence, broadcastPlayerJoin, broadcastPlayerReady } = useMultiplayer({
    roomId: roomId || '',
    playerId: multiplayer.localPlayerId || '',
    autoConnect: false,
    presenceState: multiplayer.localPlayerId ? {
      playerId: multiplayer.localPlayerId,
      displayName: displayName || 'Anonymous Cat',
      online_at: new Date().toISOString(),
      color: multiplayer.localPlayer?.color as 'white' | 'black' | undefined,
    } : undefined,
    onPlayerJoin: (payload) => {
      // Update store when a player joins
      multiplayer.addOrUpdatePlayer(
        payload.playerId,
        payload.displayName,
        payload.color,
        true
      );
      onShowMessage?.('info', `${payload.displayName} joined the room`);
    },
    onPlayerLeave: (payload) => {
      // Update store when a player leaves
      const player = multiplayer.players.get(payload.playerId);
      if (player) {
        onShowMessage?.('info', `${player.displayName} left the room`);
      }
      multiplayer.removePlayer(payload.playerId);
    },
    onPlayerReady: (payload) => {
      // Remote player is ready
      console.log('[RoomManager] Remote player ready:', payload.playerId);
      multiplayer.setRemotePlayerReady(true);
    },
    onPresenceJoin: (playerId, state) => {
      // Update player online status via presence
      console.log('[RoomManager] Player presence joined:', playerId, state);
      multiplayer.addOrUpdatePlayer(
        playerId,
        state.displayName,
        state.color,
        true // online
      );
    },
    onPresenceLeave: (playerId) => {
      // Mark player as offline via presence
      console.log('[RoomManager] Player presence left:', playerId);
      const player = multiplayer.players.get(playerId);
      if (player) {
        multiplayer.addOrUpdatePlayer(
          playerId,
          player.displayName,
          (player.color as 'white' | 'black' | null) || null,
          false // offline
        );
      }
    },
    onConnectionChange: (status) => {
      multiplayer.setConnectionStatus(status);
    },
  });

  // Sync existing players from the session
  // Helper function to fetch and add a player to the store
  const fetchAndAddPlayer = useCallback(async (
    playerId: string,
    color: 'white' | 'black'
  ) => {
    try {
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('id, display_name, is_online')
        .eq('id', playerId)
        .single();

      if (!playerError && player) {
        console.log(`[RoomManager] Synced ${color} player: ${player.display_name}`);
        multiplayer.addOrUpdatePlayer(
          player.id,
          player.display_name,
          color,
          player.is_online
        );
      }
    } catch (error) {
      console.error(`[RoomManager] Failed to fetch ${color} player:`, error);
    }
  }, [multiplayer]);

  const syncExistingPlayers = useCallback(async () => {
    if (!sessionId || !multiplayer.localPlayerId) {
      console.warn('[RoomManager] Cannot sync players - missing session or player ID');
      return;
    }

    try {
      console.log('[RoomManager] Syncing existing players from session');
      
      // Fetch current session state (only player IDs needed)
      const { data: session, error: fetchError } = await supabase
        .from('sessions')
        .select('white_player_id, black_player_id')
        .eq('id', sessionId)
        .single();

      if (fetchError || !session) {
        console.error('[RoomManager] Failed to fetch session for sync:', fetchError);
        return;
      }

      // Fetch white player if exists and is not local player
      if (session.white_player_id && session.white_player_id !== multiplayer.localPlayerId) {
        await fetchAndAddPlayer(session.white_player_id, 'white');
      }

      // Fetch black player if exists and is not local player
      if (session.black_player_id && session.black_player_id !== multiplayer.localPlayerId) {
        await fetchAndAddPlayer(session.black_player_id, 'black');
      }
    } catch (error) {
      console.error('[RoomManager] Error in syncExistingPlayers:', error);
    }
  }, [sessionId, multiplayer, fetchAndAddPlayer]);

  // Initialize game when session becomes active (Issue 4)
  const initializeGameFromSession = useCallback(async () => {
    if (!sessionId) {
      console.warn('[RoomManager] Cannot initialize game - missing session ID');
      return;
    }

    try {
      console.log('[RoomManager] Initializing game from session');
      
      // Fetch session data
      const { data: session, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (fetchError || !session) {
        console.error('[RoomManager] Failed to fetch session for initialization:', fetchError);
        return;
      }

      // Load FEN from session
      if (session.initial_fen) {
        console.log('[RoomManager] Loading initial FEN:', session.initial_fen);
        // Validate and load FEN - loadFen has built-in validation
        const success = store.game.loadFen(session.initial_fen);
        if (!success) {
          console.error('[RoomManager] Failed to load FEN, using default position');
          onShowMessage?.('error', 'Failed to load game position');
        }
      }

      // Set time controls (convert seconds to minutes)
      if (session.time_control_initial !== null) {
        const SECONDS_PER_MINUTE = 60;
        const minutes = session.time_control_initial / SECONDS_PER_MINUTE;
        const increment = session.time_control_increment;
        console.log('[RoomManager] Setting time controls:', minutes, 'minutes +', increment, 'seconds');
        store.game.setTimeControl(minutes, increment);
      }

      // Mark local player as ready
      multiplayer.setLocalPlayerReady(true);
      
      // Broadcast that we're ready
      await broadcastPlayerReady();
      
      console.log('[RoomManager] Game initialized, waiting for opponent to be ready');
    } catch (error) {
      console.error('[RoomManager] Error initializing game:', error);
    }
  }, [sessionId, store.game, multiplayer, broadcastPlayerReady]);

  // Assign player to a color and update session
  const assignPlayerToSession = useCallback(async () => {
    if (!sessionId || !multiplayer.localPlayerId) {
      console.warn('[RoomManager] Cannot assign player - missing session or player ID');
      return;
    }

    try {
      // Fetch current session state
      const { data: session, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (fetchError || !session) {
        console.error('[RoomManager] Failed to fetch session:', fetchError);
        return;
      }

      // Determine which color to assign
      let assignedColor: 'white' | 'black' | null = null;
      const updates: Partial<{
        white_player_id: string;
        black_player_id: string;
        state: string;
        started_at: string;
      }> = {};

      if (!session.white_player_id) {
        // Assign as white player
        assignedColor = 'white';
        updates.white_player_id = multiplayer.localPlayerId;
        console.log(`[RoomManager] Assigning player as white`);
      } else if (!session.black_player_id && session.white_player_id !== multiplayer.localPlayerId) {
        // Assign as black player (only if not already white)
        assignedColor = 'black';
        updates.black_player_id = multiplayer.localPlayerId;
        console.log(`[RoomManager] Assigning player as black`);
      } else if (session.white_player_id === multiplayer.localPlayerId) {
        // Already assigned as white
        assignedColor = 'white';
        console.log(`[RoomManager] Player already assigned as white`);
      } else if (session.black_player_id === multiplayer.localPlayerId) {
        // Already assigned as black
        assignedColor = 'black';
        console.log(`[RoomManager] Player already assigned as black`);
      }

      // Update session if needed
      if (Object.keys(updates).length > 0) {
        // Check if this completes the room (both players assigned)
        const whitePlayer = session.white_player_id || updates.white_player_id;
        const blackPlayer = session.black_player_id || updates.black_player_id;
        const willHaveBothPlayers = whitePlayer && blackPlayer;
        
        if (willHaveBothPlayers && session.state === 'waiting') {
          updates.state = 'active';
          updates.started_at = new Date().toISOString();
          console.log(`[RoomManager] Both players present, activating session`);
        }

        const { error: updateError } = await supabase
          .from('sessions')
          .update(updates)
          .eq('id', sessionId);

        if (updateError) {
          console.error('[RoomManager] Failed to update session:', updateError);
          return;
        }
      }

      // Update local store with assigned color
      if (assignedColor) {
        multiplayer.addOrUpdatePlayer(
          multiplayer.localPlayerId,
          displayName || 'Anonymous Cat',
          assignedColor,
          true
        );

        // Auto-flip board for black players (Issue 3)
        // Only flip if user hasn't manually overridden the flip setting
        if (assignedColor === 'black' && !store.ui.userOverrodeFlip) {
          console.log('[RoomManager] Auto-flipping board for black player');
          store.ui.setBoardFlipped(true, true); // true = automatic flip
        } else if (assignedColor === 'white' && !store.ui.userOverrodeFlip) {
          console.log('[RoomManager] Setting normal orientation for white player');
          store.ui.setBoardFlipped(false, true); // false = white on bottom
        }

        // Update session state in store if we just activated it
        if (updates.state === 'active') {
          multiplayer.setSessionState('active');
        }
      }

      // Sync existing players BEFORE broadcasting
      // This ensures we know about other players who joined before us
      await syncExistingPlayers();

      // Broadcast player join with assigned color
      if (assignedColor) {
        await broadcastPlayerJoin({
          playerId: multiplayer.localPlayerId,
          displayName: displayName || 'Anonymous Cat',
          color: assignedColor,
        });
      }
    } catch (error) {
      console.error('[RoomManager] Error in assignPlayerToSession:', error);
    }
  }, [sessionId, multiplayer, displayName, broadcastPlayerJoin, syncExistingPlayers, store.ui]);

  // Subscribe to session changes to detect when second player joins
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    console.log(`[RoomManager] Setting up session subscription for: ${sessionId}`);
    
    const sessionChannel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('[RoomManager] Session updated:', payload);
          const newSession = payload.new as {
            id: string;
            state: string;
            white_player_id?: string;
            black_player_id?: string;
          };
          
          // Update session state if changed
          if (newSession.state && newSession.state !== multiplayer.sessionState) {
            console.log(`[RoomManager] Session state changed to: ${newSession.state}`);
            multiplayer.setSessionState(newSession.state as any);
            
            if (newSession.state === 'active') {
              onShowMessage?.('success', 'Game is starting!');
              // Initialize the game when session becomes active
              initializeGameFromSession();
            }
          }

          // Update player colors if assigned
          if (newSession.white_player_id === multiplayer.localPlayerId) {
            multiplayer.addOrUpdatePlayer(
              multiplayer.localPlayerId,
              displayName || 'Anonymous Cat',
              'white',
              true
            );
            // Auto-flip board for white (not flipped)
            if (!store.ui.userOverrodeFlip) {
              store.ui.setBoardFlipped(false, true);
            }
          } else if (newSession.black_player_id === multiplayer.localPlayerId) {
            multiplayer.addOrUpdatePlayer(
              multiplayer.localPlayerId,
              displayName || 'Anonymous Cat',
              'black',
              true
            );
            // Auto-flip board for black
            if (!store.ui.userOverrodeFlip) {
              store.ui.setBoardFlipped(true, true);
            }
          }

          // Fetch and add the other player's information when session has both players
          if (newSession.white_player_id && newSession.black_player_id) {
            const otherPlayerId = newSession.white_player_id === multiplayer.localPlayerId 
              ? newSession.black_player_id 
              : newSession.white_player_id;
            
            const otherPlayerColor = newSession.white_player_id === multiplayer.localPlayerId 
              ? 'black' 
              : 'white';

            // Fetch the other player's details from the database
            (async () => {
              try {
                const { data: otherPlayer, error: playerError } = await supabase
                  .from('players')
                  .select('*')
                  .eq('id', otherPlayerId)
                  .single();

                if (!playerError && otherPlayer) {
                  console.log(`[RoomManager] Adding other player: ${otherPlayer.display_name} (${otherPlayerColor})`);
                  multiplayer.addOrUpdatePlayer(
                    otherPlayer.id,
                    otherPlayer.display_name,
                    otherPlayerColor,
                    otherPlayer.is_online
                  );
                }
              } catch (error) {
                console.error('[RoomManager] Failed to fetch other player:', error);
              }
            })();
          }
        }
      )
      .subscribe((status) => {
        console.log(`[RoomManager] Session subscription status for ${sessionId}:`, status);
      });

    return () => {
      console.log(`[RoomManager] Cleaning up session subscription`);
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, multiplayer, displayName, onShowMessage, store.ui, initializeGameFromSession]);

  // Update presence when display name changes (Issue 2 fix)
  useEffect(() => {
    // Only update if we're connected and have a player ID
    if (
      multiplayer.connectionStatus === 'connected' &&
      multiplayer.localPlayerId &&
      roomId &&
      displayName
    ) {
      const presenceState = {
        playerId: multiplayer.localPlayerId,
        displayName: displayName || 'Anonymous Cat',
        online_at: new Date().toISOString(),
        color: multiplayer.localPlayer?.color as 'white' | 'black' | undefined,
      };
      
      console.log('[RoomManager] Updating presence with new display name:', displayName);
      updatePresence(presenceState).catch((error) => {
        console.error('[RoomManager] Failed to update presence:', error);
      });
    }
  }, [displayName, multiplayer.connectionStatus, multiplayer.localPlayerId, multiplayer.localPlayer, roomId, updatePresence]);

  // Start clocks when both players are ready (Issue 4)
  useEffect(() => {
    if (multiplayer.areBothPlayersReady && multiplayer.sessionState === 'active' && !store.game.isTimerRunning) {
      console.log('[RoomManager] Both players ready, starting clocks');
      store.game.startTimer();
      onShowMessage?.('success', 'Game started! Good luck!');
    }
  }, [multiplayer.areBothPlayersReady, multiplayer.sessionState, store.game, onShowMessage]);

  // Connect to room when joining
  useEffect(() => {
    // Reset connection attempt tracker when room changes
    if (connectionAttemptRef.current.roomId !== roomId) {
      connectionAttemptRef.current = {
        roomId,
        attempted: false,
      };
    }

    // Sync players when connected
    if (multiplayer.connectionStatus === 'connected' && sessionId) {
      syncExistingPlayers();
    }

    // Only attempt connection if:
    // 1. We're in a room
    // 2. We have a room ID
    // 3. We haven't already attempted to connect to this room
    // 4. We're not already connected or connecting
    if (
      isInRoom &&
      roomId &&
      !connectionAttemptRef.current.attempted &&
      multiplayer.connectionStatus === 'disconnected'
    ) {
      connectionAttemptRef.current.attempted = true;
      
      console.log(`[RoomManager] Initiating connection to room: ${roomId}`);
      
      const connectAndAssign = async () => {
        await connect();
        console.log(`[RoomManager] Connected successfully to room: ${roomId}`);
        
        // Assign player to color and update session
        await assignPlayerToSession();
      };
      
      connectAndAssign().catch((error) => {
        console.error(`[RoomManager] Connection failed:`, error);
        // Note: Don't reset attempted flag here - reconnection is handled by RealtimeChannelManager
        // Users can manually reconnect via the reconnect button which resets the flag
      });
    }

    // Cleanup on unmount
    return () => {
      if (multiplayer.connectionStatus !== 'disconnected') {
        console.log(`[RoomManager] Cleaning up connection on unmount`);
        disconnect();
      }
    };
    // Note: We only depend on connectionStatus (not isConnected) to prevent re-connection loops
    // The effect should only run when room changes, connection status changes, or component mounts
  }, [isInRoom, roomId, sessionId, multiplayer.localPlayerId, displayName, multiplayer.connectionStatus, connect, disconnect, assignPlayerToSession, syncExistingPlayers]);

  // Handle room errors
  useEffect(() => {
    if (roomError) {
      onShowMessage?.('error', roomError);
    }
  }, [roomError, onShowMessage]);

  const handleCreateRoom = useCallback(async () => {
    try {
      const name = displayName.trim() || 'Anonymous Cat';
      const roomInfo = await createRoom({ displayName: name });
      onShowMessage?.('success', `Room created: ${roomInfo.roomId}`);
      onRoomJoined?.(roomInfo.roomId, roomInfo.sessionId);
    } catch (err) {
      // Error already set by useRoom hook
      console.error('Failed to create room:', err);
    }
  }, [createRoom, displayName, onShowMessage, onRoomJoined]);

  const handleJoinRoom = useCallback(async () => {
    const trimmedRoomId = joinRoomInput.trim();
    
    if (!trimmedRoomId) {
      onShowMessage?.('error', 'Please enter a room ID');
      return;
    }

    try {
      const name = displayName.trim() || 'Anonymous Cat';
      const roomInfo = await joinRoom({ roomId: trimmedRoomId, displayName: name });
      onShowMessage?.('success', `Joined room: ${roomInfo.roomId}`);
      setShowJoinForm(false);
      setJoinRoomInput('');
      onRoomJoined?.(roomInfo.roomId, roomInfo.sessionId);
    } catch (err) {
      // Error already set by useRoom hook
      console.error('Failed to join room:', err);
    }
  }, [joinRoom, joinRoomInput, displayName, onShowMessage, onRoomJoined]);

  const handleLeaveRoom = useCallback(() => {
    disconnect();
    leaveRoom();
    // Reset connection attempt tracker
    connectionAttemptRef.current = {
      roomId: null,
      attempted: false,
    };
    onShowMessage?.('info', 'Left the room');
  }, [disconnect, leaveRoom, onShowMessage]);

  const handleReconnect = useCallback(async () => {
    try {
      onShowMessage?.('info', 'Reconnecting...');
      // Reset the attempted flag to allow manual reconnection
      connectionAttemptRef.current.attempted = false;
      await connect();
      // Broadcast that we're back
      if (multiplayer.localPlayerId && displayName) {
        broadcastPlayerJoin({
          playerId: multiplayer.localPlayerId,
          displayName,
          color: (multiplayer.localPlayer?.color as 'white' | 'black') || null,
        });
      }
      onShowMessage?.('success', 'Reconnected successfully');
    } catch (err) {
      console.error('Failed to reconnect:', err);
      onShowMessage?.('error', 'Failed to reconnect');
    }
  }, [connect, multiplayer.localPlayerId, multiplayer.localPlayer, displayName, broadcastPlayerJoin, onShowMessage]);

  const handleCopyShareLink = useCallback(async () => {
    if (!roomId) return;

    const shareableUrl = `${window.location.origin}?room=${roomId}`;
    
    try {
      await navigator.clipboard.writeText(shareableUrl);
      onShowMessage?.('success', 'Room link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      onShowMessage?.('error', 'Failed to copy link. Please copy manually.');
    }
  }, [roomId, onShowMessage]);

  // Get seat-holders and spectators separately
  const seatHolders = multiplayer.seatHolders;
  const spectators = multiplayer.spectators;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg" style={{ background: '#2a2a2a' }}>
      <h3 className="text-lg font-bold text-gray-100">Multiplayer</h3>

      {!isInRoom ? (
        <>
          {/* Display name input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="displayName" className="text-sm text-gray-300">
              Your Name (optional)
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Anonymous Cat"
              maxLength={50}
              className="px-3 py-2 rounded text-sm"
              style={{
                background: '#333',
                color: '#fff',
                border: '1px solid #555',
              }}
            />
          </div>

          {/* Create room button */}
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="px-4 py-2 rounded font-semibold text-sm transition-all"
            style={{
              background: isCreating ? '#444' : '#4CAF50',
              color: '#fff',
              cursor: isCreating ? 'not-allowed' : 'pointer',
              opacity: isCreating ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isCreating) {
                e.currentTarget.style.filter = 'brightness(1.1)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)';
            }}
          >
            {isCreating ? 'Creating...' : '🎮 Create New Room'}
          </button>

          {/* Join room toggle */}
          <button
            onClick={() => setShowJoinForm(!showJoinForm)}
            className="px-4 py-2 rounded font-semibold text-sm transition-all"
            style={{
              background: '#555',
              color: '#fff',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)';
            }}
          >
            {showJoinForm ? '❌ Cancel' : '🚪 Join Existing Room'}
          </button>

          {/* Join room form */}
          {showJoinForm && (
            <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#333' }}>
              <label htmlFor="roomId" className="text-sm text-gray-300">
                Room ID
              </label>
              <input
                id="roomId"
                type="text"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                maxLength={9}
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: '#222',
                  color: '#fff',
                  border: '1px solid #555',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJoinRoom();
                  }
                }}
              />
              <button
                onClick={handleJoinRoom}
                disabled={isJoining || !joinRoomInput.trim()}
                className="px-4 py-2 rounded font-semibold text-sm transition-all"
                style={{
                  background: isJoining || !joinRoomInput.trim() ? '#444' : '#2196F3',
                  color: '#fff',
                  cursor: isJoining || !joinRoomInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isJoining || !joinRoomInput.trim() ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isJoining && joinRoomInput.trim()) {
                    e.currentTarget.style.filter = 'brightness(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Connection Status Badge */}
          <ConnectionStatusBadge 
            onReconnect={handleReconnect}
            size="md"
            position="inline"
          />
          
          {/* Room info */}
          <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#333' }}>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-300">Room ID:</span>
              <span className="text-lg font-bold text-green-400">{roomId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-300">Status:</span>
              <span className="text-sm font-semibold text-yellow-400">
                {multiplayer.sessionState === 'waiting' 
                  ? 'Waiting for opponent...' 
                  : multiplayer.sessionState === 'active' 
                    ? (multiplayer.localPlayerReady && !multiplayer.remotePlayerReady 
                        ? 'Waiting for opponent to load...' 
                        : multiplayer.areBothPlayersReady 
                          ? 'Game active!' 
                          : 'Loading game...')
                    : multiplayer.sessionState}
              </span>
            </div>
          </div>

          {/* Players in room - show seat-holders separately from spectators */}
          {(seatHolders.length > 0 || spectators.length > 0) && (
            <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#333' }}>
              <span className="text-sm font-semibold text-gray-300">
                Players ({seatHolders.length}/2):
              </span>
              <ul className="list-none flex flex-col gap-1">
                {seatHolders.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: player.isOnline ? '#4CAF50' : '#999' }}
                  >
                    <span>{player.isOnline ? '🟢' : '⚫'}</span>
                    <span>{player.displayName}</span>
                    {player.color && (
                      <span className="text-xs" style={{ color: '#999' }}>
                        ({player.color})
                      </span>
                    )}
                    {player.id === multiplayer.localPlayerId && (
                      <span className="text-xs text-blue-400">(you)</span>
                    )}
                  </li>
                ))}
              </ul>
              
              {/* Show spectators separately if any exist */}
              {spectators.length > 0 && (
                <>
                  <span className="text-sm font-semibold text-gray-300 mt-2">
                    Spectators ({spectators.length}):
                  </span>
                  <ul className="list-none flex flex-col gap-1">
                    {spectators.map((player) => (
                      <li
                        key={player.id}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: player.isOnline ? '#888' : '#666' }}
                      >
                        <span>{player.isOnline ? '👁️' : '⚫'}</span>
                        <span>{player.displayName}</span>
                        {player.id === multiplayer.localPlayerId && (
                          <span className="text-xs text-blue-400">(you)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyShareLink}
              className="flex-1 px-4 py-2 rounded font-semibold text-sm transition-all"
              style={{
                background: '#2196F3',
                color: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              📋 Copy Link
            </button>
            <button
              onClick={handleLeaveRoom}
              className="flex-1 px-4 py-2 rounded font-semibold text-sm transition-all"
              style={{
                background: '#f44336',
                color: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              🚪 Leave Room
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default RoomManager;
