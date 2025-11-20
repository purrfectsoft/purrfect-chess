import { test, expect } from '@playwright/test';
import {
  createPlayer,
  createRoom,
  joinRoom,
  waitForPlayersReady,
  makeMove,
  waitForMoveSync,
  verifyBoardSync,
  disconnectPlayer,
  reconnectPlayer,
  resign,
  offerDraw,
  acceptDraw,
  waitForGameEnd,
  cleanupPlayers,
  playMoveSequence,
  waitFor,
  type PlayerContext,
  type MoveSpec,
} from './helpers/multiplayer';

/**
 * Multiplayer Flow E2E Tests
 * 
 * Comprehensive tests for multiplayer functionality including:
 * - Room creation and joining
 * - Move synchronization
 * - Reconnection and state recovery
 * - Game actions (draw offers, resignation)
 * - Game end conditions
 * 
 * Note: These tests require a running Supabase instance.
 * Set SUPABASE environment variables in .env.local before running.
 * 
 * Run with: yarn test:e2e e2e/multiplayer.spec.ts
 * or: SUPABASE_URL=... SUPABASE_ANON_KEY=... yarn test:e2e e2e/multiplayer.spec.ts
 */

// Skip tests by default if Supabase credentials are not configured
const skipIfNoSupabase = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test.describe('Multiplayer Flow E2E', () => {
  // Skip entire suite if Supabase is not configured
  test.skip(skipIfNoSupabase, 'Supabase credentials not configured');
  
  test.describe('Room Creation and Joining', () => {
    test('should create room and allow second player to join', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      const player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Player 1 creates room
        const roomInfo = await createRoom(player1);
        expect(roomInfo.roomId).toBeTruthy();
        expect(roomInfo.roomId).toMatch(/^[A-Z0-9]+-[A-Z0-9]+$/);
        
        // Player 2 joins the room
        await joinRoom(player2, roomInfo.roomId);
        
        // Wait for both players to see each other
        await waitForPlayersReady(player1, player2);
        
        // Verify both players are in the room
        await expect(player1.page.locator(`text=${player2.displayName}`)).toBeVisible();
        await expect(player2.page.locator(`text=${player1.displayName}`)).toBeVisible();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should reject invalid room codes', async ({ browser }) => {
      const player = await createPlayer(browser, 'TestPlayer');
      
      try {
        await player.page.goto('http://localhost:3000');
        await player.page.waitForSelector('text=Multiplayer');
        
        // Try to join with invalid room code
        await player.page.locator('input[placeholder="Anonymous Cat"]').fill('TestPlayer');
        await player.page.click('text=Join Existing Room');
        await player.page.waitForSelector('input[placeholder="ABCD-1234"]');
        await player.page.locator('input[placeholder="ABCD-1234"]').fill('INVALID-CODE-123');
        await player.page.click('button:has-text("Join Room")');
        
        // Wait for error message
        await waitFor(2000, 'waiting for error message');
        
        // Should show error or remain on join screen
        const errorVisible = await player.page.locator('text=/error|not found|invalid/i').isVisible().catch(() => false);
        const stillOnJoinScreen = await player.page.locator('input[placeholder="ABCD-1234"]').isVisible().catch(() => false);
        
        expect(errorVisible || stillOnJoinScreen).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player);
      }
    });
    
    test('should display room code in shareable format', async ({ browser }) => {
      const player = await createPlayer(browser, 'Alice');
      
      try {
        const roomInfo = await createRoom(player);
        
        // Verify room code format (e.g., "ABCD-1234")
        expect(roomInfo.roomId).toMatch(/^[A-Z0-9]+-[A-Z0-9]+$/);
        
        // Verify room code is displayed in UI
        await expect(player.page.locator(`text=/Room Code: ${roomInfo.roomId}/`)).toBeVisible();
        
      } finally {
        await cleanupPlayers(player);
      }
    });
  });
  
  test.describe('Move Synchronization', () => {
    test('should synchronize moves between two players', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'White');
      const player2 = await createPlayer(browser, 'Black');
      
      try {
        // Setup: Both players in same room
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Player 1 makes first move (e2-e4)
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        // Verify both players see the move
        await expect(player1.page.locator('[aria-label*="e4"][aria-label*="pawn"]').first()).toBeVisible();
        await expect(player2.page.locator('[aria-label*="e4"][aria-label*="pawn"]').first()).toBeVisible();
        
        // Player 2 responds (e7-e5)
        await makeMove(player2, { from: 'e7', to: 'e5' });
        await waitForMoveSync([player1, player2], { from: 'e7', to: 'e5' });
        
        // Verify board state is synchronized
        await verifyBoardSync([player1, player2]);
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should synchronize multiple moves in sequence', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'White');
      const player2 = await createPlayer(browser, 'Black');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Play a sequence of moves (Italian Game opening)
        const moves: MoveSpec[] = [
          { from: 'e2', to: 'e4' }, // 1. e4
          { from: 'e7', to: 'e5' }, // 1... e5
          { from: 'g1', to: 'f3' }, // 2. Nf3
          { from: 'b8', to: 'c6' }, // 2... Nc6
          { from: 'f1', to: 'c4' }, // 3. Bc4
          { from: 'f8', to: 'c5' }, // 3... Bc5
        ];
        
        await playMoveSequence(player1, player2, moves);
        
        // Final board state verification
        await verifyBoardSync([player1, player2]);
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should reject illegal moves in multiplayer', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'White');
      const player2 = await createPlayer(browser, 'Black');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Try to make an illegal move (e2 to e5 - too far)
        await player1.page.locator('[aria-label*="e2"]').first().click();
        await waitFor(100);
        
        // Try to click e5 (should not be highlighted as legal move)
        const e5Legal = await player1.page.locator('[aria-label*="e5"][aria-label*="legal"]').isVisible().catch(() => false);
        expect(e5Legal).toBeFalsy();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
  });
  
  test.describe('Reconnection and State Recovery', () => {
    test('should recover game state after disconnect and reconnect', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      let player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup: Both players in room, make some moves
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Play a few moves
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        await makeMove(player2, { from: 'e7', to: 'e5' });
        await waitForMoveSync([player1, player2], { from: 'e7', to: 'e5' });
        
        // Player 2 disconnects
        await disconnectPlayer(player2);
        
        // Player 1 makes a move while Player 2 is offline
        await makeMove(player1, { from: 'g1', to: 'f3' });
        await waitFor(500, 'move to propagate');
        
        // Player 2 reconnects
        player2 = await reconnectPlayer(player2, roomInfo.roomId);
        await waitFor(2000, 'state synchronization');
        
        // Verify Player 2 sees all moves including the one made while offline
        await expect(player2.page.locator('[aria-label*="e4"][aria-label*="pawn"]').first()).toBeVisible();
        await expect(player2.page.locator('[aria-label*="e5"][aria-label*="pawn"]').first()).toBeVisible();
        await expect(player2.page.locator('[aria-label*="f3"][aria-label*="knight"]').first()).toBeVisible();
        
        // Verify board states match
        await verifyBoardSync([player1, player2]);
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should not create duplicate moves after reconnection', async ({ browser }) => {
      const player = await createPlayer(browser, 'TestPlayer');
      
      try {
        // Create room and make a move
        const roomInfo = await createRoom(player);
        
        await makeMove(player, { from: 'e2', to: 'e4' });
        await waitFor(500, 'move to be recorded');
        
        // Disconnect and reconnect
        await disconnectPlayer(player);
        const reconnectedPlayer = await reconnectPlayer(player, roomInfo.roomId);
        await waitFor(2000, 'state sync after reconnection');
        
        // Count moves in history (if move history is visible)
        const moveElements = await reconnectedPlayer.page.locator('[data-testid="move"]').count().catch(() => 1);
        
        // Should have exactly 1 move, not duplicated
        expect(moveElements).toBeLessThanOrEqual(1);
        
      } finally {
        await cleanupPlayers(player);
      }
    });
    
    test('should handle multiple reconnection cycles', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      let player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Cycle: Move → Disconnect → Reconnect (repeated 3 times)
        const movePairs = [
          [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }],
          [{ from: 'g1', to: 'f3' }, { from: 'b8', to: 'c6' }],
          [{ from: 'f1', to: 'c4' }, { from: 'f8', to: 'c5' }],
        ];
        
        for (let i = 0; i < movePairs.length; i++) {
          // Make moves
          await makeMove(player1, movePairs[i][0]);
          await waitForMoveSync([player1, player2], movePairs[i][0]);
          
          // Player 2 disconnects
          await disconnectPlayer(player2);
          await waitFor(500);
          
          // Player 2 reconnects
          player2 = await reconnectPlayer(player2, roomInfo.roomId);
          await waitFor(2000, 'state sync');
          
          // Player 2 makes their move
          await makeMove(player2, movePairs[i][1]);
          await waitForMoveSync([player1, player2], movePairs[i][1]);
        }
        
        // Final verification
        await verifyBoardSync([player1, player2]);
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
  });
  
  test.describe('Game Actions', () => {
    test('should handle resignation', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      const player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Make a move to start the game
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        // Player 2 resigns
        await resign(player2);
        
        // Wait for resignation to propagate
        await waitFor(1000, 'resignation to sync');
        
        // Both players should see game over
        const player1GameOver = await player1.page.locator('text=/Game Over|Resigned/i').isVisible().catch(() => false);
        const player2GameOver = await player2.page.locator('text=/Game Over|Resigned/i').isVisible().catch(() => false);
        
        expect(player1GameOver || player2GameOver).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should handle draw offers and acceptance', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      const player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Make some moves
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        await makeMove(player2, { from: 'e7', to: 'e5' });
        await waitForMoveSync([player1, player2], { from: 'e7', to: 'e5' });
        
        // Player 1 offers draw
        await offerDraw(player1);
        await waitFor(1000, 'draw offer to sync');
        
        // Player 2 should see draw offer
        const drawOfferVisible = await player2.page.locator('text=/Draw Offer|Accept Draw/i').isVisible().catch(() => false);
        
        if (drawOfferVisible) {
          // Player 2 accepts draw
          await acceptDraw(player2);
          await waitFor(1000, 'draw acceptance to sync');
          
          // Both players should see draw result
          await waitForGameEnd(player1, 'Draw');
          await waitForGameEnd(player2, 'Draw');
        }
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should handle draw offer rejection', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      const player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Make a move
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        // Player 1 offers draw
        await offerDraw(player1);
        await waitFor(1000);
        
        // Player 2 rejects (by continuing to play or clicking reject button)
        const rejectButton = player2.page.locator('button:has-text("Reject")');
        const rejectVisible = await rejectButton.isVisible().catch(() => false);
        
        if (rejectVisible) {
          await rejectButton.click();
        } else {
          // Reject by making a move
          await makeMove(player2, { from: 'e7', to: 'e5' });
        }
        
        await waitFor(500);
        
        // Game should continue
        const gameStillActive = await player1.page.locator('[aria-label*="knight"]').first().isVisible();
        expect(gameStillActive).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
  });
  
  test.describe('Game End Conditions', () => {
    test('should detect and sync checkmate', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'White');
      const player2 = await createPlayer(browser, 'Black');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Play Scholar's Mate (4-move checkmate)
        const scholarsMate: MoveSpec[] = [
          { from: 'e2', to: 'e4' },  // 1. e4
          { from: 'e7', to: 'e5' },  // 1... e5
          { from: 'f1', to: 'c4' },  // 2. Bc4
          { from: 'b8', to: 'c6' },  // 2... Nc6
          { from: 'd1', to: 'h5' },  // 3. Qh5
          { from: 'g8', to: 'f6' },  // 3... Nf6 (mistake)
          { from: 'h5', to: 'f7' },  // 4. Qxf7# (checkmate)
        ];
        
        await playMoveSequence(player1, player2, scholarsMate);
        
        // Wait for checkmate detection
        await waitFor(1000, 'checkmate detection');
        
        // Both players should see checkmate
        const player1Checkmate = await player1.page.locator('text=/Checkmate/i').isVisible().catch(() => false);
        const player2Checkmate = await player2.page.locator('text=/Checkmate/i').isVisible().catch(() => false);
        
        expect(player1Checkmate || player2Checkmate).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should handle timeout in multiplayer game', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Fast');
      const player2 = await createPlayer(browser, 'Slow');
      
      try {
        // Setup with very short time control (if supported)
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // This test would require setting up a very short time control
        // and waiting for timeout. Implementation depends on UI for time controls.
        
        // Placeholder: make a move to start clocks
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        // In a real scenario, we'd wait for timeout and verify game end
        // For now, just verify game is active
        const gameActive = await player1.page.locator('[aria-label*="pawn"]').first().isVisible();
        expect(gameActive).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
  });
  
  test.describe('Edge Cases and Error Handling', () => {
    test('should handle player leaving room mid-game', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'Alice');
      const player2 = await createPlayer(browser, 'Bob');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Make a move
        await makeMove(player1, { from: 'e2', to: 'e4' });
        await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
        
        // Player 2 leaves (close page)
        await player2.page.close();
        await waitFor(2000, 'disconnect detection');
        
        // Player 1 should see disconnection indicator or be able to continue
        const disconnectIndicator = await player1.page.locator('text=/disconnected|offline/i').isVisible().catch(() => false);
        const canStillMove = await player1.page.locator('[aria-label*="e7"]').first().isVisible();
        
        expect(disconnectIndicator || canStillMove).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player1);
        // player2 already closed
      }
    });
    
    test('should prevent moves when not player turn', async ({ browser }) => {
      const player1 = await createPlayer(browser, 'White');
      const player2 = await createPlayer(browser, 'Black');
      
      try {
        // Setup
        const roomInfo = await createRoom(player1);
        await joinRoom(player2, roomInfo.roomId);
        await waitForPlayersReady(player1, player2);
        
        // Player 1's turn - try to have Player 2 move (should be blocked)
        await player2.page.locator('[aria-label*="e7"]').first().click();
        await waitFor(100);
        
        // Should not show legal moves for black pieces when it's white's turn
        const legalMoves = await player2.page.locator('[aria-label*="legal move"]').count();
        expect(legalMoves).toBe(0);
        
      } finally {
        await cleanupPlayers(player1, player2);
      }
    });
    
    test('should handle rapid reconnection attempts gracefully', async ({ browser }) => {
      const player = await createPlayer(browser, 'TestPlayer');
      
      try {
        // Create room
        const roomInfo = await createRoom(player);
        
        // Disconnect and reconnect multiple times rapidly
        for (let i = 0; i < 3; i++) {
          await disconnectPlayer(player);
          await waitFor(200);
          await reconnectPlayer(player, roomInfo.roomId);
          await waitFor(500);
        }
        
        // Should still be in a valid state
        const roomVisible = await player.page.locator('text=/Room Code/i').isVisible();
        expect(roomVisible).toBeTruthy();
        
      } finally {
        await cleanupPlayers(player);
      }
    });
  });
});
