# Game State Sync and Reconnection - Usage Guide

This guide demonstrates how to use the new game state synchronization and reconnection handling features.

## Overview

The synchronization system ensures that players who disconnect and reconnect to a multiplayer game receive the latest game state without duplicate moves or data loss.

## Key Features

1. **Automatic Reconnection Detection** - Detects when a client reconnects after being disconnected
2. **Full State Recovery** - Fetches complete game state from the database
3. **Duplicate Prevention** - Uses sequence numbers (ply) to avoid applying moves twice
4. **Partial History Queries** - Can fetch only moves since last known state
5. **Conflict Detection** - Identifies when local and remote state diverge

## Basic Usage

### 1. Import the Hook

```typescript
import { useReconnection, ReconnectionStatus } from '@/hooks/useReconnection';
```

### 2. Use in a Component

```typescript
function MultiplayerGame() {
  const store = useRootStore();
  const sessionId = store.multiplayer.sessionId;

  // Set up reconnection handling
  const { 
    reconnectionStatus, 
    isReconnecting, 
    lastSyncedAt,
    requestSync 
  } = useReconnection({
    sessionId,
    enabled: true, // Enable automatic reconnection detection
    onStateRecovered: (snapshot) => {
      console.log('Game state recovered:', snapshot);
      // Optionally show a notification to the user
    },
    onSyncError: (error) => {
      console.error('Sync failed:', error);
      // Show error message to user
    },
  });

  return (
    <div>
      {/* Show reconnection status */}
      {isReconnecting && (
        <div className="sync-indicator">
          Syncing game state...
        </div>
      )}
      
      {reconnectionStatus === ReconnectionStatus.SYNCED && lastSyncedAt && (
        <div className="sync-success">
          Synced at {new Date(lastSyncedAt).toLocaleTimeString()}
        </div>
      )}
      
      {/* Manual sync button (optional) */}
      <button onClick={requestSync}>
        Refresh Game State
      </button>
      
      {/* Your game UI */}
      <Board />
    </div>
  );
}
```

## Integration with Existing Multiplayer Setup

### In RoomManager or Similar Component

```typescript
import { useMultiplayer } from '@/hooks/useMultiplayer';
import { useReconnection } from '@/hooks/useReconnection';
import { useRootStore } from '@/stores/store-setup';

function RoomManager() {
  const store = useRootStore();
  
  // Existing multiplayer connection
  const { 
    connectionStatus, 
    connect, 
    disconnect,
    broadcastMove 
  } = useMultiplayer({
    roomId: store.multiplayer.roomId || '',
    playerId: store.multiplayer.localPlayerId || '',
    onMove: (payload) => {
      // Handle incoming moves
      console.log('Received move:', payload);
    },
    autoConnect: true,
  });

  // Add reconnection handling
  const { reconnectionStatus, requestSync } = useReconnection({
    sessionId: store.multiplayer.sessionId,
    enabled: store.multiplayer.isInSession,
    onStateRecovered: (snapshot) => {
      console.log(`Recovered ${snapshot.moves.length} moves`);
    },
  });

  // The reconnection hook automatically:
  // 1. Detects when connection transitions from disconnected to connected
  // 2. Checks if the client is out of sync
  // 3. Fetches the latest game state
  // 4. Applies only new moves
  
  return (
    <div>
      <ConnectionStatus status={connectionStatus} />
      <SyncStatus status={reconnectionStatus} />
      {/* Rest of UI */}
    </div>
  );
}
```

## Direct API Usage (Without Hook)

If you need more control, you can use the sync functions directly:

```typescript
import {
  getFullGameState,
  queryMoveHistory,
  applyStateSnapshot,
  isOutOfSync,
} from '@/lib/multiplayer/sync';

// Check if client needs to sync
async function checkSync() {
  const sessionId = 'your-session-id';
  const localLastSequence = 5; // Last ply number you have
  
  const needsSync = await isOutOfSync(sessionId, localLastSequence);
  
  if (needsSync) {
    // Fetch full game state
    const snapshot = await getFullGameState(sessionId);
    
    if (snapshot) {
      // Apply only new moves
      const result = applyStateSnapshot(snapshot, localLastSequence);
      
      console.log(`Applied ${result.applied.length} new moves`);
      console.log(`Skipped ${result.skipped.length} duplicate moves`);
      
      if (!result.success) {
        console.error('Sync failed:', result.error);
      }
    }
  }
}

// Query partial history
async function fetchRecentMoves() {
  const sessionId = 'your-session-id';
  const fromSequence = 10; // Start from ply 10
  const limit = 50; // Get up to 50 moves
  
  const history = await queryMoveHistory(sessionId, fromSequence, limit);
  
  if (history) {
    console.log(`Fetched ${history.moves.length} moves`);
    console.log(`Sequence range: ${history.fromSequence} to ${history.toSequence}`);
    console.log(`Has more: ${history.hasMore}`);
  }
}
```

## Sequence Numbers (Ply)

The synchronization system uses the `ply` column from the database as the sequence number:

- Ply 0 = White's first move (move 1)
- Ply 1 = Black's first move (move 1)
- Ply 2 = White's second move (move 2)
- Ply 3 = Black's second move (move 2)
- And so on...

This ensures:
- Moves are always ordered correctly
- Duplicates can be detected by comparing ply numbers
- Partial history can be fetched from any point

## Error Handling

The system handles various error scenarios:

```typescript
useReconnection({
  sessionId: 'your-session-id',
  enabled: true,
  onSyncError: (error) => {
    // Possible errors:
    // - 'Failed to fetch game state' - Database query failed
    // - 'Failed to apply state snapshot' - Move application failed
    // - 'Move history conflicts detected' - Local/remote state diverged
    
    // Show user-friendly message
    showNotification({
      type: 'error',
      message: 'Failed to sync game. Please try refreshing.',
    });
  },
});
```

## Best Practices

1. **Always enable in multiplayer sessions**:
   ```typescript
   enabled: store.multiplayer.isInSession
   ```

2. **Provide user feedback**:
   ```typescript
   {isReconnecting && <LoadingSpinner text="Syncing game..." />}
   ```

3. **Handle sync errors gracefully**:
   ```typescript
   onSyncError: (error) => {
     // Log for debugging
     console.error('Sync error:', error);
     // Show user-friendly message
     showErrorToast('Could not sync game state');
   }
   ```

4. **Don't call requestSync repeatedly**:
   The hook prevents concurrent syncs automatically, but avoid calling it in loops or rapid succession.

5. **Test reconnection scenarios**:
   - Disconnect WiFi and reconnect
   - Close and reopen browser tab
   - Simulate slow network

## Testing Reconnection

To manually test the reconnection flow:

1. Start a multiplayer game
2. Make some moves
3. Disconnect (turn off WiFi or close tab)
4. Make more moves in another tab/device
5. Reconnect
6. Verify:
   - Status shows "syncing"
   - All moves appear correctly
   - No duplicate moves
   - Game state matches the server

## Database Queries

The sync module uses these database queries:

### Full Game State
```sql
-- Fetch session
SELECT * FROM sessions WHERE id = $sessionId;

-- Fetch all moves ordered by ply
SELECT * FROM moves 
WHERE session_id = $sessionId 
ORDER BY ply ASC;
```

### Partial History
```sql
-- Fetch moves from sequence
SELECT * FROM moves 
WHERE session_id = $sessionId 
  AND ply >= $fromSequence 
ORDER BY ply ASC 
LIMIT $limit;
```

### Last Sequence Number
```sql
-- Get highest ply number
SELECT ply FROM moves 
WHERE session_id = $sessionId 
ORDER BY ply DESC 
LIMIT 1;
```

## Performance Considerations

- **Full state sync**: Use when client has been disconnected for a while
- **Partial history**: Use for short disconnections (fetch only new moves)
- **Sequence tracking**: Minimal overhead, just a single number in memory
- **Concurrent syncs**: Prevented automatically to avoid race conditions

## Troubleshooting

### Moves not syncing
- Check if `sessionId` is set correctly
- Verify database connection
- Check browser console for errors
- Ensure `enabled` prop is true

### Duplicate moves appearing
- Verify sequence number tracking is working
- Check if `applyStateSnapshot` is being called
- Look for race conditions in move handling

### Sync taking too long
- Check network latency
- Verify database query performance
- Consider using partial history instead of full state

## Future Enhancements

Possible improvements for the future:

1. **Delta sync**: Only fetch changes since last sync
2. **Optimistic updates**: Apply local moves immediately
3. **Conflict resolution**: Automatic resolution of divergent states
4. **Compression**: Compress large move histories
5. **Caching**: Cache recent game states
6. **Realtime sync**: Use Supabase realtime for push updates

## Related Documentation

- [Move Synchronization](../lib/multiplayer/moveSync.ts) - Real-time move handling
- [Realtime Module](../lib/supabase/realtime.ts) - WebSocket connections
- [Multiplayer Store](../stores/root-store.ts) - State management
- [Database Schema](../supabase/schema/) - Table definitions
