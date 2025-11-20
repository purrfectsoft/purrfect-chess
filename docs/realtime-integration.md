# Supabase Realtime Integration

This document provides examples of how to use the Supabase Realtime integration for multiplayer features in Purrfect Chess.

## Overview

The realtime integration consists of two main components:

1. **`lib/supabase/realtime.ts`** - Low-level channel management utilities
2. **`hooks/useMultiplayer.ts`** - React hook for easy integration

## Basic Usage

### Using the useMultiplayer Hook

The `useMultiplayer` hook is the recommended way to add realtime functionality to your components:

```tsx
import { useMultiplayer, ConnectionStatus } from '@/hooks/useMultiplayer';

function GameRoom({ roomId, playerId }: { roomId: string; playerId: string }) {
  const {
    connectionStatus,
    isConnected,
    connect,
    disconnect,
    broadcastMove,
    broadcastPlayerJoin,
  } = useMultiplayer({
    roomId,
    playerId,
    onMove: (payload, message) => {
      console.log('Received move:', payload);
      // Update game state with the move
      // game.movePiece(payload.from, payload.to);
    },
    onPlayerJoin: (payload, message) => {
      console.log('Player joined:', payload.displayName);
    },
    onConnectionChange: (status) => {
      console.log('Connection status:', status);
    },
    autoConnect: true, // Automatically connect on mount
  });

  const handleMove = async (from: string, to: string, san: string, fen: string) => {
    // Broadcast the move to other players
    await broadcastMove({ from, to, san, fen });
  };

  return (
    <div>
      <div>Status: {connectionStatus}</div>
      {!isConnected && <button onClick={connect}>Connect</button>}
      {isConnected && <button onClick={disconnect}>Disconnect</button>}
      {/* Your game UI here */}
    </div>
  );
}
```

### Manual Channel Management

For more control, you can use the `RealtimeChannelManager` directly:

```tsx
import { RealtimeChannelManager, RealtimeEventType } from '@/lib/supabase/realtime';
import { supabase } from '@/lib/supabase/client';

// Create a channel manager
const channelManager = new RealtimeChannelManager(supabase);

// Join a room
await channelManager.joinRoom('room-123', {
  onMove: (message) => {
    console.log('Move received:', message.payload);
  },
  onSessionStateChange: (message) => {
    console.log('Session state changed:', message.payload.state);
  },
});

// Broadcast a move
await channelManager.broadcast(
  'room-123',
  RealtimeEventType.MOVE,
  {
    sessionId: 'room-123',
    from: 'e2',
    to: 'e4',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  },
  'player-123'
);

// Leave the room
await channelManager.leaveRoom('room-123');

// Clean up all channels
await channelManager.cleanup();
```

## Event Types

The following event types are supported:

- **MOVE** - Chess move made by a player
- **SESSION_STATE_CHANGE** - Game session state changed (waiting, active, completed, etc.)
- **PLAYER_JOIN** - A player joined the game
- **PLAYER_LEAVE** - A player left the game
- **DRAW_OFFER** - A player offered a draw
- **DRAW_RESPONSE** - Response to a draw offer (accepted/declined)
- **RESIGN** - A player resigned
- **HEARTBEAT** - Keep-alive signal

## Message Format

All realtime messages follow this structure:

```typescript
interface RealtimeMessage<T> {
  type: RealtimeEventType;
  payload: T;
  timestamp: string; // ISO 8601 timestamp
  senderId: string; // Player or client ID
}
```

### Example Payloads

**Move Event:**
```typescript
{
  sessionId: string;
  from: string;        // e.g., 'e2'
  to: string;          // e.g., 'e4'
  promotion?: string;  // e.g., 'q'
  san: string;         // e.g., 'e4'
  fen: string;         // Full FEN after move
  timeRemainingMs?: number;
}
```

**Session State Change:**
```typescript
{
  sessionId: string;
  state: 'waiting' | 'active' | 'completed' | 'abandoned' | 'expired';
  result?: string;     // e.g., '1-0', '0-1', '1/2-1/2'
  resultReason?: string;
}
```

**Player Join:**
```typescript
{
  sessionId: string;
  playerId: string;
  displayName: string;
  color?: 'white' | 'black';
}
```

## Connection Management

### Connection Status

The `useMultiplayer` hook provides a `connectionStatus` state that can be:

- `DISCONNECTED` - Not connected to any channel
- `CONNECTING` - Attempting to connect
- `CONNECTED` - Successfully connected
- `ERROR` - Connection error occurred

### Auto-Reconnection

The channel manager automatically attempts to reconnect with exponential backoff:

- Max retries: 5
- Initial delay: 1 second
- Max delay: 30 seconds
- Backoff multiplier: 2x

### Manual Connection Control

```tsx
const { connect, disconnect, isConnected } = useMultiplayer({
  roomId: 'room-123',
  playerId: 'player-123',
  autoConnect: false, // Don't connect automatically
});

// Connect when ready
await connect();

// Disconnect when leaving
await disconnect();
```

## Best Practices

### 1. Always Clean Up

Make sure to disconnect when unmounting components:

```tsx
useEffect(() => {
  return () => {
    disconnect();
  };
}, [disconnect]);
```

### 2. Handle Connection Errors

Monitor connection status and handle errors gracefully:

```tsx
const { connectionStatus, connect } = useMultiplayer({
  roomId,
  playerId,
  onConnectionChange: (status) => {
    if (status === ConnectionStatus.ERROR) {
      // Show error to user
      // Attempt manual reconnection if needed
    }
  },
});
```

### 3. Validate Messages

Always validate received messages before using them:

```tsx
onMove: (payload, message) => {
  // Don't process our own messages
  if (message.senderId === playerId) {
    return;
  }
  
  // Validate the move
  if (!isValidMove(payload.from, payload.to)) {
    console.error('Invalid move received:', payload);
    return;
  }
  
  // Apply the move
  applyMove(payload);
},
```

### 4. Use TypeScript Types

Leverage the provided TypeScript types for type safety:

```tsx
import type {
  MovePayload,
  SessionStatePayload,
  PlayerJoinPayload,
} from '@/lib/supabase/realtime';

const handleMove = (payload: MovePayload) => {
  // TypeScript ensures payload has the correct structure
  console.log(payload.from, payload.to);
};
```

## Testing

The realtime integration includes comprehensive tests. Run them with:

```bash
yarn test tests/lib/supabase/realtime.test.ts
yarn test tests/hooks/useMultiplayer.test.tsx
```

## Integration with Multiplayer Store

The `useMultiplayer` hook integrates seamlessly with the MobX multiplayer store to persist game state:

```tsx
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';
import { useMultiplayer, ConnectionStatus } from '@/hooks/useMultiplayer';

const MultiplayerGame = observer(({ roomId, playerId, displayName }: {
  roomId: string;
  playerId: string;
  displayName: string;
}) => {
  const store = useRootStore();
  const multiplayer = store.multiplayer;
  
  const {
    connectionStatus,
    isConnected,
    connect,
    disconnect,
    broadcastMove,
    broadcastPlayerJoin,
  } = useMultiplayer({
    roomId,
    playerId,
    onMove: (payload, message) => {
      // Don't process our own moves
      if (message.senderId === playerId) return;
      
      // Add move to store history
      multiplayer.addMove(
        `${Date.now()}-${message.senderId}`,
        payload.from,
        payload.to,
        payload.san,
        payload.fen,
        message.senderId,
        payload.promotion,
        payload.timeRemainingMs
      );
      
      // Apply move to game state
      store.game.movePiece(payload.from, payload.to, payload.promotion);
    },
    onPlayerJoin: (payload, message) => {
      // Add player to store
      multiplayer.addOrUpdatePlayer(
        payload.playerId,
        payload.displayName,
        payload.color
      );
    },
    onPlayerLeave: (payload) => {
      // Remove player from store
      multiplayer.removePlayer(payload.playerId);
    },
    onConnectionChange: (status) => {
      // Sync connection status to store
      multiplayer.setConnectionStatus(status);
    },
    autoConnect: false,
  });
  
  // Join room when component mounts
  useEffect(() => {
    const joinSession = async () => {
      // Update store with session info
      multiplayer.joinRoom(roomId, roomId, playerId, displayName);
      
      // Connect to realtime channel
      await connect();
      
      // Broadcast join event
      await broadcastPlayerJoin({
        playerId,
        displayName,
      });
    };
    
    joinSession();
    
    return () => {
      disconnect();
      multiplayer.leaveRoom();
    };
  }, []);
  
  // Handle local moves
  const handleLocalMove = async (from: string, to: string, promotion?: string) => {
    const success = store.game.movePiece(from, to, promotion);
    
    if (success) {
      const moveId = `${Date.now()}-${playerId}`;
      const san = store.game.history[store.game.history.length - 1].san;
      const fen = store.game.fen;
      
      // Add to multiplayer history
      multiplayer.addMove(
        moveId,
        from,
        to,
        san,
        fen,
        playerId,
        promotion
      );
      
      // Broadcast to other players
      await broadcastMove({
        from,
        to,
        promotion,
        san,
        fen,
      });
    }
  };
  
  return (
    <div>
      <div>Connection: {multiplayer.connectionStatus}</div>
      <div>Session: {multiplayer.sessionId || 'None'}</div>
      <div>Players: {multiplayer.players.size}</div>
      <div>Moves: {multiplayer.moveCount}</div>
      
      {/* Game board and controls */}
    </div>
  );
});
```

### Store Benefits

The multiplayer store provides:

1. **Persistent State** - Session and player data survive page refreshes
2. **Reactive Updates** - MobX observers automatically re-render on changes
3. **Centralized State** - All multiplayer state in one place
4. **Type Safety** - Full TypeScript support with MST models

### Store Actions

Access multiplayer state through the root store:

```tsx
const store = useRootStore();
const mp = store.multiplayer;

// Connection management
mp.setConnectionStatus('connected');
console.log(mp.isConnected); // true

// Room/session management
mp.joinRoom('room-123', 'session-456', 'player-1', 'Alice');
mp.leaveRoom();
mp.setSessionState('active');

// Player management
mp.addOrUpdatePlayer('player-2', 'Bob', 'black', true);
mp.removePlayer('player-2');
const whitePlayer = mp.getPlayerByColor('white');

// Move tracking
mp.addMove('move-1', 'e2', 'e4', 'e4', 'fen...', 'player-1');
mp.clearMoves();

// State queries
console.log(mp.isInSession);     // true if in a room
console.log(mp.localPlayer);      // Local player info
console.log(mp.remotePlayers);    // Array of remote players
console.log(mp.moveCount);        // Number of moves
```

## Next Steps

- Integrate with game UI components
- Add presence tracking for online players
- Implement typing indicators
- Add message queueing for offline messages
- Create E2E tests for multi-client scenarios
