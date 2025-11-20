# Edge Case Handling Guide

This guide covers how to handle edge cases in multiplayer sessions, including disconnection, tab close, multi-tab behavior, and race conditions.

## Overview

The edge case handling system consists of several complementary mechanisms:

1. **Tab Close Detection** - Detect and handle browser tab close/refresh events
2. **Multi-Tab Detection** - Detect and prevent/warn about multiple tabs for the same session
3. **Reconnection Handling** - Automatic state recovery after disconnection (existing)
4. **Race Condition Prevention** - Sequence number-based move ordering (existing)

## Tab Close Detection

### `useBeforeUnload` Hook

The `useBeforeUnload` hook allows you to execute cleanup operations when a user closes the tab, refreshes the page, or navigates away.

#### Basic Usage

```typescript
import { useBeforeUnload } from '@/hooks/useBeforeUnload';

function GameComponent() {
  const { sessionId, playerId } = useMultiplayer();

  useBeforeUnload({
    enabled: !!sessionId,
    onBeforeUnload: () => {
      // Send cleanup message via sendBeacon
      // This is the most reliable way to send data on page unload
      navigator.sendBeacon(
        '/api/player-leave',
        JSON.stringify({ sessionId, playerId })
      );
    },
  });

  return <div>Game content...</div>;
}
```

#### With Confirmation Dialog

```typescript
useBeforeUnload({
  enabled: isInActiveGame,
  message: 'Are you sure you want to leave the game?',
  onBeforeUnload: () => {
    // Cleanup logic
  },
});
```

#### Important Notes

- **Modern browsers limit `beforeunload`**: Async operations may not complete before page unload
- **Use `navigator.sendBeacon()`**: This is the most reliable way to send data on page unload
- **Confirmation dialogs**: Modern browsers may not show custom messages
- **Cleanup must be synchronous**: Wrap any cleanup logic to execute synchronously

### Integration with Multiplayer

To integrate tab close detection with the multiplayer system:

```typescript
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useMultiplayer } from '@/hooks/useMultiplayer';

function MultiplayerGame() {
  const { broadcastPlayerLeave, sessionId, playerId } = useMultiplayer({
    // ... multiplayer options
  });

  // Send player leave event on tab close
  useBeforeUnload({
    enabled: !!sessionId,
    onBeforeUnload: () => {
      // Attempt to send leave event synchronously
      // Note: This may not always complete before page unload
      try {
        // Option 1: Use sendBeacon (recommended)
        const endpoint = `/api/sessions/${sessionId}/leave`;
        const payload = JSON.stringify({ playerId });
        navigator.sendBeacon(endpoint, payload);

        // Option 2: Broadcast via Supabase (may not complete)
        // broadcastPlayerLeave(); // Less reliable on page unload
      } catch (error) {
        console.error('Failed to send leave event:', error);
      }
    },
  });

  return <div>Game UI...</div>;
}
```

## Multi-Tab Detection

### `useMultiTabDetection` Hook

The `useMultiTabDetection` hook tracks when a user opens multiple browser tabs for the same session.

#### Basic Usage

```typescript
import {
  useMultiTabDetection,
  MultiTabStrategy,
} from '@/hooks/useMultiTabDetection';

function GameComponent() {
  const { sessionId } = useMultiplayer();

  const { hasMultipleTabs, activeTabCount, isPrimaryTab } = useMultiTabDetection({
    sessionId,
    strategy: MultiTabStrategy.WARN,
    onMultiTabDetected: (count) => {
      console.warn(`${count} tabs detected for this session`);
      // Show warning to user
    },
  });

  if (hasMultipleTabs && !isPrimaryTab) {
    return (
      <div className="alert alert-warning">
        <p>Multiple tabs detected for this game session.</p>
        <p>Please use only one tab to avoid conflicts.</p>
      </div>
    );
  }

  return <div>Game content...</div>;
}
```

#### Strategies

The hook supports three strategies for handling multiple tabs:

1. **`MultiTabStrategy.ALLOW`** - Allow multiple tabs without warning
2. **`MultiTabStrategy.WARN`** - Warn the user but allow multiple tabs (default)
3. **`MultiTabStrategy.BLOCK`** - Block non-primary tabs from interacting

```typescript
// Block non-primary tabs
const { hasMultipleTabs, isPrimaryTab } = useMultiTabDetection({
  sessionId,
  strategy: MultiTabStrategy.BLOCK,
});

if (hasMultipleTabs && !isPrimaryTab) {
  return (
    <div className="alert alert-error">
      <p>This game is already open in another tab.</p>
      <p>Please close this tab or the other tab to continue.</p>
    </div>
  );
}
```

#### How It Works

The multi-tab detection system uses:

- **localStorage** - Stores active tab registry per session
- **Heartbeat mechanism** - Each tab sends heartbeats every 2 seconds
- **Stale tab cleanup** - Tabs with no heartbeat for 5 seconds are removed
- **Storage events** - Tabs notify each other of changes via storage events
- **Primary tab identification** - The first tab (earliest timestamp) is the primary tab

#### Tab Lifecycle

1. **Tab opens**: Registers itself in localStorage with unique tab ID and timestamp
2. **Heartbeat**: Updates timestamp every 2 seconds to indicate it's still active
3. **Detection**: Other tabs detect the new tab via storage events
4. **Cleanup**: On tab close, removes itself from localStorage
5. **Stale removal**: Inactive tabs (no heartbeat for 5s) are automatically cleaned up

## Reconnection Handling

The reconnection handling system is already implemented via the `useReconnection` hook. See [RECONNECTION_GUIDE.md](./RECONNECTION_GUIDE.md) for details.

### Key Features

- Automatic reconnection detection
- Full state recovery from server
- Duplicate move prevention via sequence numbers
- Partial move history sync

### Integration with Edge Cases

The reconnection system works seamlessly with edge case handling:

```typescript
import { useReconnection } from '@/hooks/useReconnection';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useMultiTabDetection } from '@/hooks/useMultiTabDetection';

function MultiplayerGame() {
  const { sessionId, playerId } = useMultiplayer();

  // Handle reconnection
  useReconnection({
    sessionId,
    enabled: !!sessionId,
    onStateRecovered: (snapshot) => {
      console.log('State recovered after reconnection');
    },
  });

  // Handle tab close
  useBeforeUnload({
    enabled: !!sessionId,
    onBeforeUnload: () => {
      navigator.sendBeacon(
        `/api/sessions/${sessionId}/leave`,
        JSON.stringify({ playerId })
      );
    },
  });

  // Handle multi-tab
  const { hasMultipleTabs, isPrimaryTab } = useMultiTabDetection({
    sessionId,
    strategy: MultiTabStrategy.WARN,
  });

  return <div>Game UI...</div>;
}
```

## Race Condition Prevention

The system prevents race conditions through sequence number-based move ordering.

### How It Works

1. **Sequence Numbers (Ply)**: Each move has a sequence number (ply) in the database
   - Ply 0 = White's first move
   - Ply 1 = Black's first move
   - Ply 2 = White's second move
   - And so on...

2. **Move Queue**: Moves are queued and processed in order
3. **Duplicate Detection**: Moves with sequence numbers already applied are skipped
4. **Conflict Resolution**: If two moves claim the same sequence, server timestamp wins

### Move Synchronization Flow

```typescript
// Client A makes a move
const result = applyRemoteMove(chess, {
  sessionId,
  from: 'e2',
  to: 'e4',
  san: 'e4',
  fen: 'fen-after-move',
});

// Move is saved to database with sequence number (ply)
// Other clients receive the move via Realtime
// They check if sequence number is new
// If new, apply it; if already seen, skip it
```

### Preventing Duplicate Moves

The `applyStateSnapshot` function in `lib/multiplayer/sync.ts` handles duplicate prevention:

```typescript
// Filter moves to only those after the local last sequence
for (const move of snapshot.moves) {
  if (move.ply <= localLastSequence) {
    // Already have this move, skip it
    skipped.push(move);
  } else {
    // New move, apply it
    applied.push(move);
  }
}
```

### Handling Simultaneous Moves

If both players try to make a move simultaneously:

1. Both moves are sent to the server
2. Server processes them in the order received (database transaction)
3. First move is accepted and saved with sequence number N
4. Second move:
   - If valid in the new position: accepted with sequence N+1
   - If invalid (e.g., game ended): rejected

## Server-Side Cleanup

### Session TTLs

Sessions are automatically cleaned up on the server based on:

1. **Inactivity timeout**: Sessions with no activity for 24 hours are expired
2. **Completion**: Completed/abandoned sessions are kept for 30 days
3. **Stale connections**: Player presence is tracked via heartbeats

### Cleanup SQL Script

See `supabase/cleanup.sql` for the database cleanup script:

```sql
-- Mark inactive sessions as expired
UPDATE sessions
SET state = 'expired',
    updated_at = NOW()
WHERE state IN ('waiting', 'active')
  AND updated_at < NOW() - INTERVAL '24 hours';

-- Clean up old completed/abandoned sessions (30 days)
DELETE FROM sessions
WHERE state IN ('completed', 'abandoned', 'expired')
  AND updated_at < NOW() - INTERVAL '30 days';
```

This script can be run as a scheduled job (e.g., via Supabase Functions or cron).

## Best Practices

### 1. Always Use Cleanup Hooks

```typescript
// ✅ GOOD: Use cleanup hooks for multiplayer sessions
useBeforeUnload({
  enabled: !!sessionId,
  onBeforeUnload: () => {
    navigator.sendBeacon('/api/leave', JSON.stringify({ sessionId, playerId }));
  },
});
```

### 2. Handle Multi-Tab Gracefully

```typescript
// ✅ GOOD: Warn users about multi-tab behavior
const { hasMultipleTabs, isPrimaryTab } = useMultiTabDetection({
  sessionId,
  strategy: MultiTabStrategy.WARN,
  onMultiTabDetected: (count) => {
    showNotification({
      type: 'warning',
      message: `This game is open in ${count} tabs. Please use only one tab.`,
    });
  },
});
```

### 3. Rely on Automatic Reconnection

```typescript
// ✅ GOOD: Let useReconnection handle state recovery
useReconnection({
  sessionId,
  enabled: !!sessionId,
  // No need to manually fetch state
});
```

### 4. Trust Sequence Numbers

```typescript
// ✅ GOOD: Trust the sequence number system
// Don't try to manually deduplicate moves
// The system handles this automatically

// ❌ BAD: Manually checking for duplicates
// This is already handled by the sync system
```

## Testing

### Manual Testing Checklist

- [ ] Open game in one tab, then open in second tab
- [ ] Verify multi-tab detection works
- [ ] Close primary tab, verify secondary tab becomes primary
- [ ] Refresh page, verify reconnection works
- [ ] Close tab, verify leave event is sent (check network or logs)
- [ ] Make moves simultaneously from two tabs, verify no duplicates
- [ ] Disconnect network, make moves, reconnect, verify sync
- [ ] Close tab mid-move, verify opponent sees disconnection

### Automated Tests

The edge case handling hooks have comprehensive unit tests:

- `tests/hooks/useBeforeUnload.test.ts` - 15 tests
- `tests/hooks/useMultiTabDetection.test.ts` - 14 tests

Run tests with:

```bash
yarn test useBeforeUnload
yarn test useMultiTabDetection
```

## Troubleshooting

### "Player not leaving on tab close"

**Problem**: Leave events not being sent reliably on tab close.

**Solution**: Use `navigator.sendBeacon()` instead of async API calls:

```typescript
// ✅ GOOD: Use sendBeacon
navigator.sendBeacon('/api/leave', JSON.stringify({ sessionId, playerId }));

// ❌ BAD: Async calls may not complete
fetch('/api/leave', { method: 'POST', body: JSON.stringify({ ... }) });
```

### "Multiple tabs showing wrong count"

**Problem**: Tab count not updating correctly.

**Solution**: Ensure storage events are being handled:

1. Check that `sessionId` is consistent across tabs
2. Verify localStorage is not being cleared
3. Check browser console for errors

### "Moves appearing twice"

**Problem**: Duplicate moves appearing in game history.

**Solution**: Ensure sequence numbers are being tracked:

1. Check that `lastSequenceRef` is being updated
2. Verify `applyStateSnapshot` is filtering duplicates
3. Check database for duplicate `ply` values

## Summary

The edge case handling system provides:

- ✅ Tab close detection with cleanup callbacks
- ✅ Multi-tab detection with configurable strategies
- ✅ Automatic reconnection with state recovery
- ✅ Race condition prevention via sequence numbers
- ✅ Duplicate move prevention
- ✅ Stale tab cleanup
- ✅ Primary tab identification

By combining these mechanisms, the multiplayer system handles common edge cases gracefully and provides a robust experience for players.
