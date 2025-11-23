# End-to-End (E2E) Testing with Playwright

This directory contains comprehensive End-to-End tests for Purrfect Chess using [Playwright](https://playwright.dev/).

## Overview

The E2E test suite validates critical chess gameplay flows, game conditions, and complete game scenarios to ensure reliability and prevent regressions.

## Test Files

### 1. `gameplay.spec.ts` - Core Gameplay Tests

Tests basic game functionality:

- Starting a new game
- Resetting the game
- Making moves (piece selection, legal moves)
- Time controls display and tracking
- Move history
- Turn management

**Coverage:** 9 tests

### 2. `game-conditions.spec.ts` - Chess Rules & Conditions

Tests specific chess game conditions:

- **En passant capture** - Special pawn capture rule
- **Pawn promotion** - Promoting to queen, knight, etc.
- **Check** - King under attack
- **Checkmate** - Game-ending positions (Scholar's Mate)
- **Stalemate** - No legal moves available
- **Draw conditions:**
  - Threefold repetition
  - Insufficient material (K vs K, K+B vs K, K+N vs K)
  - 50-move rule
  - Timeout vs insufficient material

**Coverage:** 15 tests (some marked as skipped pending FEN loading feature)

### 3. `full-games.spec.ts` - Complete Game Replays

Tests full chess games and famous tactical sequences:

- **Scholar's Mate** - 4-move checkmate
- **Fool's Mate** - Fastest checkmate (2 moves)
- **Smothered Mate** - Knight delivers mate to trapped king
- **Traxler Counter Attack** - Wild tactical line
- **Legal Trap** - Classic queen sacrifice mate
- **Fried Liver Attack** - Aggressive opening
- **Italian Game** - Standard opening development
- **Scandinavian Defense** - Queen trap scenario
- **Rapid move sequences** - Stress testing

**Coverage:** 10 tests

### 4. `layout-stability.spec.ts` - UI Stability Tests

Tests UI layout consistency (existing test):

- Board position stability during gameplay
- Control panel width consistency
- Responsive layout on mobile
- Eval bar toggle stability

**Coverage:** 5 tests

### 5. `room-manager.spec.ts` - Room Manager UI Tests

Tests room creation and joining UI:

- Room creation UI display
- Join room form
- Room code formatting
- Display name input

**Coverage:** 4 tests

### 6. `multiplayer.spec.ts` - Multiplayer Flow Tests (NEW)

Comprehensive tests for multiplayer functionality using Supabase Realtime:

- **Room Creation and Joining:**
  - Creating rooms with valid room codes
  - Joining existing rooms
  - Invalid room code rejection
  - Shareable room code format
  
- **Move Synchronization:**
  - Real-time move syncing between players
  - Multiple move sequences
  - Illegal move rejection
  
- **Reconnection and State Recovery:**
  - Game state recovery after disconnect
  - No duplicate moves after reconnection
  - Multiple reconnection cycles
  
- **Game Actions:**
  - Resignation handling
  - Draw offers and acceptance
  - Draw offer rejection
  
- **Game End Conditions:**
  - Checkmate detection and sync
  - Timeout handling
  
- **Edge Cases:**
  - Player leaving mid-game
  - Turn enforcement
  - Rapid reconnection attempts

**Coverage:** 17 tests  
**Requirements:** Supabase credentials configured

### 7. `move-sync.spec.ts` - Move Sync Tests (Skipped)

Tests for move synchronization (currently skipped, requires Supabase):

- Two-player move synchronization
- Illegal move rejection
- Simultaneous move conflict resolution
- Move order across reconnection

**Coverage:** 5 tests (skipped by default)

### 8. `reconnection.spec.ts` - Reconnection Tests (Skipped)

Tests for reconnection scenarios (currently skipped, requires Supabase):

- Game state recovery after disconnect
- No duplicate moves after reconnection
- Multiple disconnection cycles

**Coverage:** 3 tests (skipped by default)

## Running Tests

### Prerequisites

```bash
# Install dependencies (includes Playwright)
yarn install

# Install Playwright browsers (first time only)
yarn playwright install
```

### Local Execution

```bash
# Run all E2E tests (headless)
yarn test:e2e

# Run in UI mode (interactive, recommended for debugging)
yarn test:e2e:ui

# Run in headed mode (see browser)
yarn test:e2e:headed

# Run specific test file
yarn test:e2e e2e/gameplay.spec.ts

# Run tests matching a pattern
yarn test:e2e --grep "checkmate"

# Run with debug mode
PWDEBUG=1 yarn test:e2e
```

### Multiplayer Tests

Multiplayer tests require Supabase credentials to be configured. These tests use the `multiplayer.spec.ts` file and the helper utilities in `e2e/helpers/multiplayer.ts`.

#### Setting Up for Multiplayer Tests

1. **Create a test Supabase project** (or use development project):
   ```bash
   # Visit https://supabase.com and create a project
   # Get your project URL and anon key
   ```

2. **Configure environment variables**:
   ```bash
   # Copy example env file
   cp .env.example .env.local
   
   # Edit .env.local and add your Supabase credentials
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Set up database schema**:
   ```bash
   # Follow instructions in supabase/ directory to create tables
   # Or use Supabase CLI: supabase db push
   ```

#### Running Multiplayer Tests

```bash
# Run all multiplayer tests
yarn test:e2e e2e/multiplayer.spec.ts

# Run multiplayer tests in UI mode
yarn test:e2e:ui e2e/multiplayer.spec.ts

# Run specific multiplayer test
yarn test:e2e e2e/multiplayer.spec.ts -g "should synchronize moves"

# Run with explicit Supabase credentials (override .env.local)
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
yarn test:e2e e2e/multiplayer.spec.ts
```

#### Multiplayer Test Helper Functions

The `e2e/helpers/multiplayer.ts` module provides utilities for multiplayer testing:

```typescript
import {
  createPlayer,        // Create a browser context for a player
  createRoom,         // Create a multiplayer room
  joinRoom,           // Join an existing room
  makeMove,           // Make a chess move
  waitForMoveSync,    // Wait for move synchronization
  verifyBoardSync,    // Verify board state matches
  disconnectPlayer,   // Simulate disconnection
  reconnectPlayer,    // Reconnect to room
  resign,             // Resign the game
  offerDraw,          // Offer a draw
  acceptDraw,         // Accept draw offer
  cleanupPlayers,     // Clean up test contexts
} from './helpers/multiplayer';
```

Example usage:
```typescript
test('my multiplayer test', async ({ browser }) => {
  const player1 = await createPlayer(browser, 'Alice');
  const player2 = await createPlayer(browser, 'Bob');
  
  try {
    const room = await createRoom(player1);
    await joinRoom(player2, room.roomId);
    await waitForPlayersReady(player1, player2);
    
    await makeMove(player1, { from: 'e2', to: 'e4' });
    await waitForMoveSync([player1, player2], { from: 'e2', to: 'e4' });
    
    await verifyBoardSync([player1, player2]);
  } finally {
    await cleanupPlayers(player1, player2);
  }
});
```


### CI Execution

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

The CI pipeline includes three E2E test jobs:

1. **`e2e`** - Standard E2E tests (gameplay, game conditions, full games, layout)
   - Runs on every push/PR
   - No external dependencies required
   
2. **`e2e-multiplayer`** - Multiplayer E2E tests
   - Only runs when Supabase test credentials are configured
   - Requires GitHub secrets: `SUPABASE_TEST_URL` and `SUPABASE_TEST_ANON_KEY`
   - Tests room creation, joining, move sync, reconnection
   
#### Configuring CI for Multiplayer Tests

To enable multiplayer tests in CI:

1. **Set up a test Supabase project**:
   - Create a dedicated Supabase project for CI testing
   - Deploy the database schema from `supabase/` directory

2. **Add GitHub secrets**:
   ```
   Settings → Secrets and variables → Actions → New repository secret
   
   SUPABASE_TEST_ANON_KEY: your-test-project-anon-key
   ```

3. **Add GitHub variable**:
   ```
   Settings → Secrets and variables → Actions → Variables → New repository variable
   
   SUPABASE_TEST_URL: https://your-test-project.supabase.co
   ```

4. **Multiplayer tests will now run automatically** when:
   - PRs touch multiplayer code
   - Pushing to main/develop branches
   - Manual workflow dispatch

See `.github/workflows/test.yml` for the complete CI configuration.


## Test Configuration

Configuration is in `playwright.config.ts`:

```typescript
{
  testDir: './e2e',
  fullyParallel: true,          // Run tests in parallel
  retries: process.env.CI ? 2 : 0,  // Retry failed tests in CI
  workers: process.env.CI ? 1 : undefined,  // Sequential in CI
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',   // Collect traces on retry
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'yarn dev',        // Auto-start dev server
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
}
```

## Debugging Tests

### Interactive UI Mode (Recommended)

```bash
yarn test:e2e:ui
```

Features:

- Visual test execution
- Time travel debugging
- Watch mode
- Pick and run individual tests

### Debug Mode with Playwright Inspector

```bash
PWDEBUG=1 yarn test:e2e e2e/gameplay.spec.ts
```

Features:

- Step through test execution
- Inspect page state
- Record and generate tests

### View Test Reports

After running tests:

```bash
# Open HTML report
npx playwright show-report
```

### Screenshots and Traces

- **Screenshots**: Automatically captured on failure in `test-results/`
- **Traces**: Captured on retry, viewable with `npx playwright show-trace <trace-file>`

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for board
    await page.goto('/');
    await page.waitForSelector('[role="application"]', { state: 'visible' });
  });

  test('should do something', async ({ page }) => {
    // Arrange: Set up test conditions

    // Act: Perform actions
    await page.click('[aria-label="e2, White pawn"]');
    await page.waitForTimeout(100);
    await page.click('[aria-label="e4, empty, legal move"]');

    // Assert: Verify results
    await expect(page.locator('[aria-label="e4, White pawn"]')).toBeVisible();
  });
});
```

### Best Practices

1. **Use Accessible Selectors**
   - Prefer `aria-label`, `role`, and semantic selectors
   - Avoid CSS classes or IDs that may change

2. **Wait Appropriately**
   - Use `waitForSelector`, `waitForTimeout` when needed
   - Don't rely on fixed timeouts if possible

3. **Take Screenshots**
   - Capture key states for manual verification
   - Use `page.screenshot({ path: 'test-results/name.png' })`

4. **Test Isolation**
   - Each test should be independent
   - Use `test.beforeEach` for setup
   - Reset game state between tests

5. **Clear Test Names**
   - Use descriptive names: "should detect checkmate in Scholar's Mate"
   - Group related tests with `test.describe()`

### Helper Functions

Create reusable helpers for common actions:

```typescript
async function playMoves(
  page: any,
  moves: Array<{ from: string; to: string }>
) {
  for (const move of moves) {
    await page.click(`[aria-label="${move.from}"]`);
    await page.waitForTimeout(100);
    await page.click(`[aria-label="${move.to}"]`);
    await page.waitForTimeout(250);
  }
}

async function resetGame(page: any) {
  await page.click('button:has-text("New Game")');
  await page.waitForTimeout(300);
}
```

## Test Fixtures

The project includes test fixtures in `docs/fixtures/`:

### FEN Fixtures (`docs/fixtures/fen/`)

Predefined board positions:

- `promotion-white-ready.fen` - Pawn on 7th rank
- `checkmate-scholars-mate.fen` - Scholar's mate position
- `stalemate-corner.fen` - Stalemate position
- `enpassant-white-can-capture.fen` - En passant setup
- `draw-insufficient-material-*.fen` - Various draw scenarios

### PGN Fixtures (`docs/fixtures/pgn/`)

Complete game records:

- `short-scholars-mate.pgn` - Quick checkmate
- `short-fools-mate.pgn` - Fastest checkmate
- `standard-italian-game.pgn` - Full game
- `standard-sicilian-defense.pgn` - Popular opening
- More standard openings and games

### Using Fixtures in Tests

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

test('should load FEN position', async ({ page }) => {
  const fen = readFileSync(
    join(process.cwd(), 'docs/fixtures/fen/promotion-white-ready.fen'),
    'utf-8'
  ).split('\n')[0];

  // Load FEN into app (if feature available)
  // ...
});
```

## Known Issues

### Playwright Browser Download

If you encounter download errors:

```bash
# Manual installation
npx playwright install chromium

# With system dependencies
npx playwright install --with-deps chromium
```

### Test Timing

Some tests use `waitForTimeout()` for UI updates. Adjust timings if tests are flaky:

- Click wait: 100ms
- Move completion: 200-300ms
- UI updates: 500ms

### Skipped Tests

Some tests are marked as `test.skip()` because they require features not yet in the UI:

- FEN position loading
- Extensive endgame scenarios (50-move rule, etc.)
- Promotion piece selection UI

These will be implemented as the app evolves.

## CI/CD Integration

### GitHub Actions Workflow

E2E tests run in the CI pipeline:

```yaml
- name: Install dependencies
  run: yarn install --frozen-lockfile

- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: yarn test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

### Test Results

After CI runs:

- Test results available in workflow logs
- HTML report uploaded as artifact
- Screenshots of failures available
- Traces captured on retry

## Performance Considerations

- **Parallel Execution**: Tests run in parallel locally for speed
- **Sequential in CI**: Run sequentially in CI to avoid resource contention
- **Retries**: Failed tests automatically retry 2x in CI
- **Timeouts**: Default test timeout is 30 seconds

## Future Improvements

- [ ] Add visual regression testing (screenshot comparison)
- [ ] Test PGN import/export functionality
- [ ] Test FEN position loading
- [ ] Add mobile device testing
- [ ] Test keyboard navigation
- [ ] Add performance benchmarks
- [ ] Test engine analysis features
- [ ] Add accessibility testing with axe-playwright

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [CI Configuration](https://playwright.dev/docs/ci)
- [Project README](../README.md)
- [Testing Strategy](../docs/TESTING_STRATEGY.md)

## Support

For issues or questions:

1. Check [Playwright docs](https://playwright.dev/docs/intro)
2. Review existing test examples
3. Open an issue on GitHub
4. Ask in project discussions

---

**Last Updated:** 2025-11-20  
**Test Count:** 73 tests across 8 files  
**Coverage:** Gameplay, game conditions, full games, layout stability, room manager UI, multiplayer flows (room creation, move sync, reconnection, game actions)  
**Multiplayer Tests:** 29 tests (17 in multiplayer.spec.ts, 5 in move-sync.spec.ts, 3 in reconnection.spec.ts, 4 in room-manager.spec.ts)

