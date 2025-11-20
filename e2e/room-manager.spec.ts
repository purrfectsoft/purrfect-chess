import { test, expect } from '@playwright/test';

/**
 * Manual E2E test for Room Manager UI
 * This test demonstrates the room creation and joining flow
 */
test.describe('Room Manager UI', () => {
  test('should display room creation UI', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('text=Multiplayer');
    
    // Check that multiplayer section is visible
    await expect(page.locator('text=Multiplayer')).toBeVisible();
    
    // Check create room button
    await expect(page.locator('text=Create New Room')).toBeVisible();
    
    // Check join room button
    await expect(page.locator('text=Join Existing Room')).toBeVisible();
    
    // Check display name input
    await expect(page.locator('input[placeholder="Anonymous Cat"]')).toBeVisible();
    
    // Take screenshot of initial state
    await page.screenshot({ path: '/tmp/e2e-multiplayer-initial.png', fullPage: true });
  });

  test('should show join room form when clicking join button', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('text=Multiplayer');
    
    // Click join existing room button
    await page.click('text=Join Existing Room');
    
    // Wait for join form to appear
    await page.waitForSelector('text=Room ID');
    
    // Check that room ID input is visible
    await expect(page.locator('input[placeholder="ABCD-1234"]')).toBeVisible();
    
    // Check that Join Room button is visible
    await expect(page.locator('button:has-text("Join Room")')).toBeVisible();
    
    // Take screenshot of join form
    await page.screenshot({ path: '/tmp/e2e-multiplayer-join-form.png', fullPage: true });
  });

  test('should convert room ID to uppercase', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('text=Multiplayer');
    
    // Click join existing room button
    await page.click('text=Join Existing Room');
    
    // Wait for join form
    await page.waitForSelector('input[placeholder="ABCD-1234"]');
    
    // Type lowercase room ID
    const roomIdInput = page.locator('input[placeholder="ABCD-1234"]');
    await roomIdInput.fill('test-1234');
    
    // Check that it was converted to uppercase
    await expect(roomIdInput).toHaveValue('TEST-1234');
  });

  test('should allow entering display name', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('text=Multiplayer');
    
    // Type display name
    const nameInput = page.locator('input[placeholder="Anonymous Cat"]');
    await nameInput.fill('Test Player');
    
    // Check value
    await expect(nameInput).toHaveValue('Test Player');
  });
});
