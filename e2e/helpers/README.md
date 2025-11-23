# E2E Test Helpers

This directory contains helper utilities for E2E testing with Playwright.

## Multiplayer Helpers (`multiplayer.ts`)

Utilities for testing multiplayer functionality with two or more browser contexts.

### Core Functions

#### Player Management
- `createPlayer(browser, displayName)` - Create a browser context for a player
- `navigateToApp(player)` - Navigate player to the app
- `cleanupPlayer(player)` - Clean up a player context
- `cleanupPlayers(...players)` - Clean up multiple players

#### Room Management
- `createRoom(player)` - Create a new multiplayer room
- `joinRoom(player, roomId)` - Join an existing room
- `waitForPlayersReady(player1, player2)` - Wait for both players to see each other

#### Game Actions
- `makeMove(player, move)` - Make a chess move
- `playMoveSequence(player1, player2, moves)` - Play alternating moves
- `resign(player)` - Resign the game
- `offerDraw(player)` - Offer a draw
- `acceptDraw(player)` - Accept a draw offer

#### Synchronization
- `waitForMoveSync(players, move, timeout?)` - Wait for move to sync across players
- `verifyBoardSync(players)` - Verify all players have the same board state
- `waitFor(ms, reason?)` - Wait with logging

#### Connection Management
- `disconnectPlayer(player)` - Simulate disconnection
- `reconnectPlayer(player, roomId)` - Reconnect to a room

#### Game State
- `waitForGameEnd(player, expectedResult?)` - Wait for game to end

### Usage Example

```typescript
import { test } from '@playwright/test';
import {
  createPlayer,
  createRoom,
  joinRoom,
  waitForPlayersReady,
  makeMove,
  waitForMoveSync,
  verifyBoardSync,
  cleanupPlayers,
} from './helpers/multiplayer';

test('multiplayer game', async ({ browser }) => {
  const player1 = await createPlayer(browser, 'Alice');
  const player2 = await createPlayer(browser, 'Bob');
  
  try {
    // Setup room
    const room = await createRoom(player1);
    await joinRoom(player2, room.roomId);
    await waitForPlayersReady(player1, player2);
    
    // Play moves
    await makeMove(player1, { from: 'e2', to: 'e4' });
    await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
    
    // Verify sync
    await verifyBoardSync([player1, player2]);
  } finally {
    await cleanupPlayers(player1, player2);
  }
});
```

### Types

```typescript
interface PlayerContext {
  context: BrowserContext;
  page: Page;
  displayName: string;
  playerId?: string;
}

interface RoomInfo {
  roomId: string;
  sessionId: string;
}

interface MoveSpec {
  from: string;  // e.g., 'e2'
  to: string;    // e.g., 'e4'
}
```

### Best Practices

1. **Always use try-finally for cleanup**:
   ```typescript
   const player = await createPlayer(browser, 'Test');
   try {
     // Your test code
   } finally {
     await cleanupPlayer(player);
   }
   ```

2. **Use waitForMoveSync after every move** to ensure synchronization before proceeding:
   ```typescript
   await makeMove(player1, { from: 'e2', to: 'e4' });
   await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
   ```

3. **Verify board state** at key points to catch desynchronization:
   ```typescript
   await verifyBoardSync([player1, player2]);
   ```

4. **Use descriptive player names** for easier debugging:
   ```typescript
   const white = await createPlayer(browser, 'WhitePlayer');
   const black = await createPlayer(browser, 'BlackPlayer');
   ```

5. **Handle timeouts gracefully** - default is 3000ms for move sync, increase if needed:
   ```typescript
   await waitForMoveSync([player1, player2], move, 5000); // 5s timeout
   ```

### Debugging

All helper functions include console logging with the prefix `[Multiplayer Helper]`. Check test output for detailed execution flow:

```
[Multiplayer Helper] Room created: ABCD-1234 by Alice
[Multiplayer Helper] Bob joined room: ABCD-1234
[Multiplayer Helper] Both players ready: Alice and Bob
[Multiplayer Helper] Alice moved: e2 -> e4
[Multiplayer Helper] Move synced across 2 players: e2 -> e4
```

### Known Limitations

1. **Requires Supabase** - Tests need valid Supabase credentials
2. **Aria-label selectors** - Assumes board squares use aria-labels
3. **UI structure** - Some functions depend on specific UI text (e.g., "Offer Draw", "Resign")
4. **Timing-dependent** - Uses timeouts for synchronization; may need adjustment for slow connections

### Future Enhancements

- [ ] Support for spectator mode testing
- [ ] Automated reconnection testing with network throttling
- [ ] Move validation helpers
- [ ] PGN import/export testing
- [ ] Time control testing helpers
- [ ] Chat/communication testing (if implemented)
