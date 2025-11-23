import { Page, BrowserContext, expect } from '@playwright/test';

/**
 * Multiplayer E2E Test Helpers
 * 
 * Utilities for testing multiplayer functionality with two or more browser contexts.
 * These helpers simplify common multiplayer testing scenarios like:
 * - Creating and joining rooms
 * - Synchronizing moves between players
 * - Handling reconnection scenarios
 * - Verifying game state across multiple clients
 */

export interface PlayerContext {
  context: BrowserContext;
  page: Page;
  displayName: string;
  playerId?: string;
}

export interface RoomInfo {
  roomId: string;
  sessionId: string;
}

export interface MoveSpec {
  from: string;
  to: string;
}

/**
 * Create a new player context with a fresh browser context and page
 */
export async function createPlayer(
  browser: any,
  displayName: string
): Promise<PlayerContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  return {
    context,
    page,
    displayName,
  };
}

/**
 * Navigate player to the app and wait for it to load
 */
export async function navigateToApp(player: PlayerContext): Promise<void> {
  await player.page.goto('http://localhost:3000');
  await player.page.waitForSelector('text=Multiplayer', { timeout: 10000 });
}

/**
 * Create a new room as a player
 * Returns the room ID and session ID
 */
export async function createRoom(
  player: PlayerContext
): Promise<RoomInfo> {
  const { page, displayName } = player;
  
  // Navigate to app if not already there
  try {
    await page.waitForSelector('text=Multiplayer', { timeout: 1000 });
  } catch {
    await navigateToApp(player);
  }
  
  // Enter display name
  const nameInput = page.locator('input[placeholder="Anonymous Cat"]');
  await nameInput.fill(displayName);
  
  // Click create room button
  await page.click('text=Create New Room');
  
  // Wait for room to be created and extract room code
  await page.waitForSelector('text=Room Code:', { timeout: 10000 });
  const roomCodeText = await page.locator('text=/Room Code: [A-Z0-9-]+/').textContent();
  const roomId = roomCodeText?.match(/Room Code: ([A-Z0-9-]+)/)?.[1];
  
  if (!roomId) {
    throw new Error('Failed to extract room ID from UI');
  }
  
  console.log(`[Multiplayer Helper] Room created: ${roomId} by ${displayName}`);
  
  return {
    roomId,
    sessionId: roomId, // For now, using roomId as sessionId
  };
}

/**
 * Join an existing room as a player
 */
export async function joinRoom(
  player: PlayerContext,
  roomId: string
): Promise<void> {
  const { page, displayName } = player;
  
  // Navigate to app if not already there
  try {
    await page.waitForSelector('text=Multiplayer', { timeout: 1000 });
  } catch {
    await navigateToApp(player);
  }
  
  // Enter display name
  const nameInput = page.locator('input[placeholder="Anonymous Cat"]');
  await nameInput.fill(displayName);
  
  // Click join existing room button
  await page.click('text=Join Existing Room');
  
  // Wait for join form to appear
  await page.waitForSelector('input[placeholder="ABCD-1234"]', { timeout: 5000 });
  
  // Enter room ID
  const roomIdInput = page.locator('input[placeholder="ABCD-1234"]');
  await roomIdInput.fill(roomId);
  
  // Click join button
  await page.click('button:has-text("Join Room")');
  
  // Wait for join to complete (look for opponent's name or game board)
  await page.waitForTimeout(2000);
  
  console.log(`[Multiplayer Helper] ${displayName} joined room: ${roomId}`);
}

/**
 * Wait for both players to be in the room and see each other
 */
export async function waitForPlayersReady(
  player1: PlayerContext,
  player2: PlayerContext
): Promise<void> {
  // Wait for each player to see the other
  await Promise.all([
    player1.page.waitForSelector(`text=${player2.displayName}`, { timeout: 10000 }),
    player2.page.waitForSelector(`text=${player1.displayName}`, { timeout: 10000 }),
  ]);
  
  console.log(`[Multiplayer Helper] Both players ready: ${player1.displayName} and ${player2.displayName}`);
}

/**
 * Make a move as a player using aria-labels
 */
export async function makeMove(
  player: PlayerContext,
  move: MoveSpec
): Promise<void> {
  const { page } = player;
  
  // Click source square (find by aria-label containing the square name)
  const fromSquares = page.locator(`[aria-label*="${move.from}"]`);
  await fromSquares.first().click();
  
  // Small wait for selection UI
  await page.waitForTimeout(100);
  
  // Click destination square
  const toSquares = page.locator(`[aria-label*="${move.to}"]`);
  await toSquares.first().click();
  
  // Wait for move to complete
  await page.waitForTimeout(300);
  
  console.log(`[Multiplayer Helper] ${player.displayName} moved: ${move.from} -> ${move.to}`);
}

/**
 * Wait for move synchronization between players
 * Verifies that a piece appears on the expected square for all players
 */
export async function waitForMoveSync(
  players: PlayerContext[],
  move: MoveSpec,
  timeout: number = 3000
): Promise<void> {
  const startTime = Date.now();
  
  // Wait for all players to see the move
  const checks = players.map(async (player) => {
    let synced = false;
    while (!synced && Date.now() - startTime < timeout) {
      try {
        // Check if destination square has a piece
        const destSquare = player.page.locator(`[aria-label*="${move.to}"]`).first();
        const ariaLabel = await destSquare.getAttribute('aria-label');
        
        if (ariaLabel && !ariaLabel.includes('empty')) {
          synced = true;
          break;
        }
      } catch (e) {
        // Continue trying
      }
      await player.page.waitForTimeout(100);
    }
    
    if (!synced) {
      throw new Error(
        `Move sync timeout: ${player.displayName} did not see move ${move.from}->${move.to} within ${timeout}ms`
      );
    }
  });
  
  await Promise.all(checks);
  console.log(`[Multiplayer Helper] Move synced across ${players.length} players: ${move.from} -> ${move.to}`);
}

/**
 * Verify board position matches for all players
 */
export async function verifyBoardSync(
  players: PlayerContext[]
): Promise<void> {
  if (players.length < 2) {
    return;
  }
  
  // Get board state from first player
  const referenceBoardState = await getBoardState(players[0].page);
  
  // Verify all other players have the same board state
  for (let i = 1; i < players.length; i++) {
    const boardState = await getBoardState(players[i].page);
    
    // Compare board states
    if (JSON.stringify(referenceBoardState) !== JSON.stringify(boardState)) {
      console.error(`[Multiplayer Helper] Board mismatch between ${players[0].displayName} and ${players[i].displayName}`);
      console.error('Reference:', referenceBoardState);
      console.error('Actual:', boardState);
      throw new Error(`Board state mismatch between ${players[0].displayName} and ${players[i].displayName}`);
    }
  }
  
  console.log(`[Multiplayer Helper] Board state synced across ${players.length} players`);
}

/**
 * Get the current board state as a map of squares to pieces
 */
async function getBoardState(page: Page): Promise<Record<string, string>> {
  const boardState: Record<string, string> = {};
  
  // Get all square elements
  const squares = await page.locator('[aria-label*=","]').all();
  
  for (const square of squares) {
    const ariaLabel = await square.getAttribute('aria-label');
    if (ariaLabel) {
      // Extract square name and piece info
      // Format: "e2, White pawn" or "e4, empty" or "e4, empty, legal move"
      const parts = ariaLabel.split(',').map(p => p.trim());
      const squareName = parts[0];
      const pieceInfo = parts.slice(1).join(', ');
      
      boardState[squareName] = pieceInfo;
    }
  }
  
  return boardState;
}

/**
 * Disconnect a player by closing their page
 */
export async function disconnectPlayer(player: PlayerContext): Promise<void> {
  await player.page.close();
  console.log(`[Multiplayer Helper] ${player.displayName} disconnected`);
}

/**
 * Reconnect a player by creating a new page and rejoining the room
 */
export async function reconnectPlayer(
  player: PlayerContext,
  roomId: string
): Promise<PlayerContext> {
  const newPage = await player.context.newPage();
  const reconnectedPlayer: PlayerContext = {
    ...player,
    page: newPage,
  };
  
  await navigateToApp(reconnectedPlayer);
  await joinRoom(reconnectedPlayer, roomId);
  
  console.log(`[Multiplayer Helper] ${player.displayName} reconnected to room ${roomId}`);
  
  return reconnectedPlayer;
}

/**
 * Offer a draw as a player
 */
export async function offerDraw(player: PlayerContext): Promise<void> {
  const { page } = player;
  
  // Look for draw button (adjust selector based on actual implementation)
  const drawButton = page.locator('button:has-text("Offer Draw")');
  await drawButton.click();
  
  console.log(`[Multiplayer Helper] ${player.displayName} offered a draw`);
}

/**
 * Accept a draw offer as a player
 */
export async function acceptDraw(player: PlayerContext): Promise<void> {
  const { page } = player;
  
  // Look for accept draw button
  const acceptButton = page.locator('button:has-text("Accept Draw")');
  await acceptButton.click();
  
  console.log(`[Multiplayer Helper] ${player.displayName} accepted draw`);
}

/**
 * Resign the game as a player
 */
export async function resign(player: PlayerContext): Promise<void> {
  const { page } = player;
  
  // Look for resign button
  const resignButton = page.locator('button:has-text("Resign")');
  await resignButton.click();
  
  // Confirm if there's a confirmation dialog
  try {
    const confirmButton = page.locator('button:has-text("Confirm")');
    await confirmButton.click({ timeout: 1000 });
  } catch {
    // No confirmation needed
  }
  
  console.log(`[Multiplayer Helper] ${player.displayName} resigned`);
}

/**
 * Wait for game to end and verify result
 */
export async function waitForGameEnd(
  player: PlayerContext,
  expectedResult?: string
): Promise<void> {
  const { page } = player;
  
  // Wait for game over indicator
  await page.waitForSelector('text=/Game Over|Checkmate|Draw|Resigned/', { timeout: 10000 });
  
  if (expectedResult) {
    await expect(page.locator(`text=${expectedResult}`)).toBeVisible();
  }
  
  console.log(`[Multiplayer Helper] Game ended for ${player.displayName}`);
}

/**
 * Clean up player context
 */
export async function cleanupPlayer(player: PlayerContext): Promise<void> {
  try {
    if (!player.page.isClosed()) {
      await player.page.close();
    }
    await player.context.close();
  } catch (e) {
    console.warn(`[Multiplayer Helper] Cleanup warning for ${player.displayName}:`, e);
  }
}

/**
 * Clean up multiple players
 */
export async function cleanupPlayers(...players: PlayerContext[]): Promise<void> {
  await Promise.all(players.map(cleanupPlayer));
}

/**
 * Play a sequence of moves alternating between two players
 */
export async function playMoveSequence(
  player1: PlayerContext,
  player2: PlayerContext,
  moves: MoveSpec[]
): Promise<void> {
  for (let i = 0; i < moves.length; i++) {
    const currentPlayer = i % 2 === 0 ? player1 : player2;
    const move = moves[i];
    
    await makeMove(currentPlayer, move);
    await waitForMoveSync([player1, player2], move);
  }
  
  console.log(`[Multiplayer Helper] Completed ${moves.length} move sequence`);
}

/**
 * Wait for a specific timeout with logging
 */
export async function waitFor(ms: number, reason?: string): Promise<void> {
  if (reason) {
    console.log(`[Multiplayer Helper] Waiting ${ms}ms: ${reason}`);
  }
  await new Promise(resolve => setTimeout(resolve, ms));
}
