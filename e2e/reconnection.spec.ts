import { test, expect } from '@playwright/test';

/**
 * E2E tests for reconnection and state synchronization
 * 
 * These tests verify that a player who disconnects and reconnects
 * receives the latest game state without duplicates.
 * 
 * Note: These tests require a running Supabase instance.
 * They are marked as skip by default and should be run manually during integration testing.
 */

test.describe.skip('Reconnection and State Sync E2E', () => {
  test('should recover game state after disconnect and reconnect', async ({ browser }) => {
    // Create two browser contexts to simulate two players
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    
    try {
      // Both players navigate to the app
      await Promise.all([
        player1.goto('http://localhost:3000'),
        player2.goto('http://localhost:3000'),
      ]);
      
      // Player 1 creates a room
      await player1.waitForSelector('text=Multiplayer');
      await player1.locator('input[placeholder="Anonymous Cat"]').fill('Player One');
      await player1.click('text=Create New Room');
      
      // Wait for room to be created and get room code
      await player1.waitForSelector('text=Room Code:');
      const roomCodeText = await player1.locator('text=/Room Code: [A-Z0-9-]+/').textContent();
      const roomCode = roomCodeText?.match(/Room Code: ([A-Z0-9-]+)/)?.[1];
      
      expect(roomCode).toBeTruthy();
      console.log(`Room created with code: ${roomCode}`);
      
      // Player 2 joins the room
      await player2.waitForSelector('text=Multiplayer');
      await player2.locator('input[placeholder="Anonymous Cat"]').fill('Player Two');
      await player2.click('text=Join Existing Room');
      await player2.waitForSelector('input[placeholder="ABCD-1234"]');
      await player2.locator('input[placeholder="ABCD-1234"]').fill(roomCode!);
      await player2.click('button:has-text("Join Room")');
      
      // Wait for both players to be in the room
      await Promise.all([
        player1.waitForSelector('text=Player Two'),
        player2.waitForSelector('text=Player One'),
      ]);
      
      console.log('Both players in room');
      
      // Player 1 makes a move (e4)
      await player1.click('[data-square="e2"]');
      await player1.click('[data-square="e4"]');
      
      // Wait for move to sync
      await player2.waitForTimeout(1000);
      
      // Verify Player 2 sees the move
      const player2BoardAfterMove1 = await player2.locator('[data-square="e4"]').getAttribute('data-piece');
      expect(player2BoardAfterMove1).toContain('white-pawn');
      
      console.log('Move 1 synced: e2-e4');
      
      // Player 2 makes a move (e5)
      await player2.click('[data-square="e7"]');
      await player2.click('[data-square="e5"]');
      
      // Wait for move to sync
      await player1.waitForTimeout(1000);
      
      console.log('Move 2 synced: e7-e5');
      
      // Player 1 disconnects (close the page/context)
      await player1.close();
      console.log('Player 1 disconnected');
      
      // Player 2 makes another move while Player 1 is disconnected (Nf3)
      await player2.click('[data-square="g1"]');
      await player2.click('[data-square="f3"]');
      
      await player2.waitForTimeout(1000);
      console.log('Move 3 made while Player 1 offline: Ng1-f3');
      
      // Player 1 reconnects (new page with same context)
      const player1Reconnected = await context1.newPage();
      await player1Reconnected.goto('http://localhost:3000');
      
      // Join the same room again
      await player1Reconnected.waitForSelector('text=Multiplayer');
      await player1Reconnected.locator('input[placeholder="Anonymous Cat"]').fill('Player One');
      await player1Reconnected.click('text=Join Existing Room');
      await player1Reconnected.waitForSelector('input[placeholder="ABCD-1234"]');
      await player1Reconnected.locator('input[placeholder="ABCD-1234"]').fill(roomCode!);
      await player1Reconnected.click('button:has-text("Join Room")');
      
      console.log('Player 1 reconnected');
      
      // Wait for sync indicator (if visible)
      await player1Reconnected.waitForTimeout(2000);
      
      // Verify Player 1 sees all moves after reconnecting
      // Check e4 (Player 1's move before disconnect)
      const e4Piece = await player1Reconnected.locator('[data-square="e4"]').getAttribute('data-piece');
      expect(e4Piece).toContain('white-pawn');
      
      // Check e5 (Player 2's first move)
      const e5Piece = await player1Reconnected.locator('[data-square="e5"]').getAttribute('data-piece');
      expect(e5Piece).toContain('black-pawn');
      
      // Check f3 (Player 2's move while Player 1 was offline)
      const f3Piece = await player1Reconnected.locator('[data-square="f3"]').getAttribute('data-piece');
      expect(f3Piece).toContain('white-knight');
      
      console.log('All moves verified after reconnection');
      
      // Player 1 should now be able to make a move (Black's turn: Nc6)
      await player1Reconnected.click('[data-square="b8"]');
      await player1Reconnected.click('[data-square="c6"]');
      
      await player1Reconnected.waitForTimeout(1000);
      
      // Verify Player 2 sees the move
      const c6Piece = await player2.locator('[data-square="c6"]').getAttribute('data-piece');
      expect(c6Piece).toContain('black-knight');
      
      console.log('Move after reconnection synced successfully');
      
    } finally {
      // Cleanup
      await player2.close();
      await context1.close();
      await context2.close();
    }
  });

  test('should not create duplicate moves after reconnection', async ({ browser }) => {
    const context1 = await browser.newContext();
    const player1 = await context1.newPage();
    
    try {
      // Navigate to app
      await player1.goto('http://localhost:3000');
      
      // Create a room
      await player1.waitForSelector('text=Multiplayer');
      await player1.locator('input[placeholder="Anonymous Cat"]').fill('Test Player');
      await player1.click('text=Create New Room');
      
      // Wait for room creation
      await player1.waitForSelector('text=Room Code:');
      const roomCodeText = await player1.locator('text=/Room Code: [A-Z0-9-]+/').textContent();
      const roomCode = roomCodeText?.match(/Room Code: ([A-Z0-9-]+)/)?.[1];
      
      expect(roomCode).toBeTruthy();
      
      // Make a move
      await player1.click('[data-square="e2"]');
      await player1.click('[data-square="e4"]');
      
      await player1.waitForTimeout(500);
      
      // Get initial move count (should be 1)
      const movesContainer = await player1.locator('[data-testid="move-history"]');
      const initialMoveCount = await movesContainer.locator('[data-testid="move"]').count();
      expect(initialMoveCount).toBe(1);
      
      // Close and reconnect
      await player1.close();
      
      const player1Reconnected = await context1.newPage();
      await player1Reconnected.goto('http://localhost:3000');
      
      // Join the same room
      await player1Reconnected.waitForSelector('text=Multiplayer');
      await player1Reconnected.locator('input[placeholder="Anonymous Cat"]').fill('Test Player');
      await player1Reconnected.click('text=Join Existing Room');
      await player1Reconnected.waitForSelector('input[placeholder="ABCD-1234"]');
      await player1Reconnected.locator('input[placeholder="ABCD-1234"]').fill(roomCode!);
      await player1Reconnected.click('button:has-text("Join Room")');
      
      // Wait for sync
      await player1Reconnected.waitForTimeout(2000);
      
      // Verify move count is still 1 (no duplicates)
      const movesContainerAfterReconnect = await player1Reconnected.locator('[data-testid="move-history"]');
      const moveCountAfterReconnect = await movesContainerAfterReconnect.locator('[data-testid="move"]').count();
      expect(moveCountAfterReconnect).toBe(1);
      
      console.log('No duplicate moves after reconnection');
      
    } finally {
      await context1.close();
    }
  });

  test('should handle multiple disconnections gracefully', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    
    try {
      // Setup: Both players join room
      await Promise.all([
        player1.goto('http://localhost:3000'),
        player2.goto('http://localhost:3000'),
      ]);
      
      // Player 1 creates room
      await player1.waitForSelector('text=Multiplayer');
      await player1.locator('input[placeholder="Anonymous Cat"]').fill('Player One');
      await player1.click('text=Create New Room');
      
      await player1.waitForSelector('text=Room Code:');
      const roomCodeText = await player1.locator('text=/Room Code: [A-Z0-9-]+/').textContent();
      const roomCode = roomCodeText?.match(/Room Code: ([A-Z0-9-]+)/)?.[1];
      
      // Player 2 joins
      await player2.waitForSelector('text=Multiplayer');
      await player2.locator('input[placeholder="Anonymous Cat"]').fill('Player Two');
      await player2.click('text=Join Existing Room');
      await player2.locator('input[placeholder="ABCD-1234"]').fill(roomCode!);
      await player2.click('button:has-text("Join Room")');
      
      await player1.waitForTimeout(1000);
      
      // Cycle: Move → Disconnect → Reconnect (repeated)
      for (let i = 0; i < 3; i++) {
        console.log(`Cycle ${i + 1}: Making move`);
        
        // Make a move
        if (i === 0) {
          await player1.click('[data-square="e2"]');
          await player1.click('[data-square="e4"]');
        } else if (i === 1) {
          await player2.click('[data-square="e7"]');
          await player2.click('[data-square="e5"]');
        } else {
          await player1.click('[data-square="g1"]');
          await player1.click('[data-square="f3"]');
        }
        
        await player1.waitForTimeout(500);
        
        console.log(`Cycle ${i + 1}: Disconnecting Player 1`);
        await player1.close();
        
        console.log(`Cycle ${i + 1}: Reconnecting Player 1`);
        const player1Reconnected = await context1.newPage();
        await player1Reconnected.goto('http://localhost:3000');
        
        await player1Reconnected.waitForSelector('text=Multiplayer');
        await player1Reconnected.locator('input[placeholder="Anonymous Cat"]').fill('Player One');
        await player1Reconnected.click('text=Join Existing Room');
        await player1Reconnected.locator('input[placeholder="ABCD-1234"]').fill(roomCode!);
        await player1Reconnected.click('button:has-text("Join Room")');
        
        await player1Reconnected.waitForTimeout(2000);
        
        // Reassign player1 for next iteration
        player1 = player1Reconnected;
        
        console.log(`Cycle ${i + 1}: Complete`);
      }
      
      // Final verification: Check all moves are present
      const movesContainer = await player1.locator('[data-testid="move-history"]');
      const finalMoveCount = await movesContainer.locator('[data-testid="move"]').count();
      expect(finalMoveCount).toBeGreaterThanOrEqual(3);
      
      console.log('Multiple disconnection cycles handled successfully');
      
    } finally {
      await player2.close();
      await context1.close();
      await context2.close();
    }
  });
});
