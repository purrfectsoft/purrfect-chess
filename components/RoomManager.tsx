'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';
import { useRoom } from '@/hooks/useRoom';
import { useMultiplayer } from '@/hooks/useMultiplayer';
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

  // Initialize multiplayer connection when in a room
  const { connectionStatus, connect, disconnect, broadcastPlayerJoin } = useMultiplayer({
    roomId: roomId || '',
    playerId: multiplayer.localPlayerId || '',
    autoConnect: false,
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
    onConnectionChange: (status) => {
      multiplayer.setConnectionStatus(status);
    },
  });

  // Connect to room when joining
  useEffect(() => {
    if (isInRoom && roomId && !multiplayer.isConnected) {
      connect().then(() => {
        // Broadcast that we joined
        if (multiplayer.localPlayerId && displayName) {
          broadcastPlayerJoin({
            playerId: multiplayer.localPlayerId,
            displayName,
            color: null,
          });
        }
      });
    }

    // Cleanup on unmount
    return () => {
      if (multiplayer.isConnected) {
        disconnect();
      }
    };
  }, [isInRoom, roomId, multiplayer.isConnected, multiplayer.localPlayerId, displayName, connect, disconnect, broadcastPlayerJoin]);

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
    onShowMessage?.('info', 'Left the room');
  }, [disconnect, leaveRoom, onShowMessage]);

  const handleReconnect = useCallback(async () => {
    try {
      onShowMessage?.('info', 'Reconnecting...');
      await connect();
      // Broadcast that we're back
      if (multiplayer.localPlayerId && displayName) {
        broadcastPlayerJoin({
          playerId: multiplayer.localPlayerId,
          displayName,
          color: multiplayer.localPlayer?.color || null,
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

  // Get list of players in the room
  const playersInRoom = Array.from(multiplayer.players.values());

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
                {multiplayer.sessionState === 'waiting' ? 'Waiting for opponent...' : multiplayer.sessionState}
              </span>
            </div>
          </div>

          {/* Players in room */}
          {playersInRoom.length > 0 && (
            <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#333' }}>
              <span className="text-sm font-semibold text-gray-300">
                Players ({playersInRoom.length}/2):
              </span>
              <ul className="list-none flex flex-col gap-1">
                {playersInRoom.map((player) => (
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
