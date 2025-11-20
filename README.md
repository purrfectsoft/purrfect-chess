# purrfect-chess

Cat-themed chess board with local Stockfish, appearance sliders, time controls, and a hidden "gmmamun" engine panel. Part of the Purrfect Universe toy projects.

Built with **Next.js 14**, **React 18**, **TypeScript**, and **MobX** for improved type safety and state management.

## Project Status

**Phase X Complete ✅** - The Next.js migration has achieved full functional and visual parity with the legacy Vite app. All 14 workstreams validated through comprehensive testing with 27 FEN fixtures, 10 PGN fixtures, and 366 passing tests.

**Migration Complete ✅** - The legacy Vite/HTML implementation has been removed from the develop branch. The legacy codebase is preserved on the [`legacy`](https://github.com/purrfectsoft/purrfect-chess/tree/legacy) branch for historical reference.

**Next:** Phase 4 (Testing & Cleanup) - Improve test infrastructure, add CI/CD pipeline, enhance accessibility, and prepare for production release.

See [`docs/phase-x/phase-x-audit.md`](./docs/phase-x/phase-x-audit.md) for the complete Phase X audit report.

## Multiplayer — Phase 1 (Anonymous Play)

Started Phase 1 of the multiplayer effort to enable anonymous (guest) game rooms using Supabase Realtime. The parent epic is tracked in issue #111 and has been split into Phase 1 sub-issues for implementation and verification.

Sub-issues:

- #125 — Setup Supabase project and configure environment
- #126 — Create Database Schema for Game Sessions
- #127 — Implement Supabase Realtime Integration
- #128 — Create Multiplayer MobX Store
- #129 — Build Game Room Creation and Join UI
- #130 — Implement Real-time Move Synchronization
- #131 — Add Connection Status Indicators
- #132 — Implement Resign and Draw Offers
- #133 — Add Game State Sync & Reconnection Handling
- #134 — Handle Edge Cases (Disconnect, Tab Close, etc.)
- #135 — Add E2E tests for Multiplayer Flow
- #136 — Performance Testing and Optimization
- #137 — UI/UX Polish and Error Handling

## Legacy Implementation

The original Vite/HTML implementation has been preserved on the [`legacy`](https://github.com/purrfectsoft/purrfect-chess/tree/legacy) branch. To view or run the legacy version:

```bash
git checkout legacy
yarn install
yarn dev  # Runs legacy Vite dev server
```

See [`MIGRATION.md`](./MIGRATION.md) for details about the migration journey from Vite to Next.js.

---

## Requirements

- **Node.js**: Version specified in `.nvmrc` (currently Node 22)
- **Yarn**: Classic (v1.22.22) - the project uses `yarn.lock` for deterministic installs

## Setup

### Agent/CI Quickstart

For GitHub Copilot Coding Agents and CI environments:

```bash
# One-liner setup (installs Node from .nvmrc, Yarn v1, deps, and vendors Stockfish)
yarn run setup || bash scripts/setup-dev-env.sh
```

This script will:

- ✅ Install/configure nvm (Node Version Manager) if not present
- ✅ Install Node.js version from `.nvmrc` (Node 22)
- ✅ Install Yarn Classic (v1.22.22) globally
- ✅ Install all project dependencies via `yarn install --frozen-lockfile`
- ✅ Vendor Stockfish binaries to `public/libs/`
- ✅ Install Playwright browsers for e2e testing

After setup, run the app:

```bash
yarn dev   # Next.js development server (http://localhost:3000)
```

**Available tooling:**

- `yarn lint` - ESLint code quality checks with Next.js rules
- `yarn lint:fix` - Auto-fix linting issues
- `yarn format` / `yarn format:check` - Prettier formatting
- `yarn test` / `yarn test:watch` - Vitest unit/integration test runner
- `yarn test:e2e` - Playwright e2e tests (requires `yarn playwright install` first)
- `yarn test:e2e:ui` - Playwright e2e tests in UI mode
- `yarn build` - Production build
- `yarn start` - Start production server

### Manual Setup

If you already have the correct Node version and Yarn classic installed:

```bash
yarn install                  # Install dependencies
yarn playwright install       # Install Playwright browsers (first time only)
yarn dev                      # Start development server
```

**Note**: The `postinstall` script automatically vendors Stockfish binaries from the `stockfish` npm package to `public/libs/`.

**First-time setup**: Run `yarn playwright install` to download the browser binaries needed for e2e tests. This is a one-time step (unless you upgrade Playwright or switch machines).

The app uses Next.js, React, TypeScript, Tailwind CSS, MobX, and chess.js. Stockfish is loaded from `/public/libs/stockfish-lite-single.js` and `/public/libs/stockfish-lite-single.wasm`. The engine binaries are auto-vendored instead of pulled from a package registry so the worker URL remains stable across dev/production builds.

All piece and square PNGs live under `/public/assets/` and are licensed under CC BY 4.0 (see `LICENSE.md`).

## Supabase Setup (Optional - For Multiplayer Features)

Purrfect Chess uses Supabase for multiplayer functionality (anonymous game rooms, real-time move synchronization).

### Prerequisites
1. Create a free account at <a href="https://supabase.com">supabase.com</a>
2. Create a new project (e.g., "purrfect-chess-dev")
3. Choose a region closest to your target users

### Configuration
1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Get your Supabase credentials:
   - Go to your Supabase project settings
   - Navigate to "API" section
   - Copy the "Project URL" and "anon public" key

3. Add credentials to `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Restart the development server:
   ```bash
   yarn dev
   ```

### Verification
- The app will start without errors if Supabase is configured correctly
- Check the browser console for any Supabase connection errors
- Multiplayer features will be enabled once the database schema is set up (see issue #126)

**Note**: The app works fully offline without Supabase configuration - multiplayer features simply won't be available.

### Resources
- <a href="https://supabase.com/docs/guides/getting-started/quickstarts/nextjs">Supabase Next.js Quick Start</a>
- <a href="https://supabase.com/docs/reference/javascript/introduction">Supabase JavaScript Client Docs</a>

### Hidden engine panel

Select the grey text inside the board column that reads `(Reserved for future use)` and, while it is highlighted, type `gmmamun`. The Stockfish controls will appear, letting you choose the search depth and view the top three moves.

## Project structure

```
.
├── .gitignore
├── .nvmrc
├── LICENSE.md
├── README.md
├── package.json
├── next.config.mjs        # Next.js configuration
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Vitest test configuration
├── app/                   # Next.js App Router
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── Board.tsx          # Chess board with drag-and-drop
│   ├── Clock.tsx          # Chess clock display
│   ├── EnginePanel.tsx    # Stockfish analysis panel
│   └── ...                # Other UI components
├── hooks/                 # React hooks
│   ├── useEngine.ts       # Stockfish integration
│   ├── useNotification.ts # Toast notifications
│   └── ...                # Other custom hooks
├── stores/                # MobX-State-Tree stores
│   ├── root-store.ts      # State models
│   └── store-setup.ts     # Persistent store provider
├── lib/                   # Utility libraries
│   ├── uci-parser.ts      # UCI protocol parser
│   └── performance.ts     # Performance utilities
├── workers/               # Web Workers
│   └── stockfish.worker.ts # Stockfish engine worker
├── public/
│   ├── assets/            # Piece/square PNGs (CC BY 4.0)
│   └── libs/              # Stockfish binaries (auto-vendored)
├── tests/                 # Vitest test suites
│   ├── components/        # Component tests
│   ├── hooks/             # Hook tests
│   ├── integration/       # Integration tests
│   └── parity/            # Parity validation tests
├── docs/                  # Documentation
│   ├── phase-x/           # Migration audit docs
│   └── ...                # Other documentation
└── yarn.lock
```

## Development

### TypeScript

This project uses TypeScript for type safety and improved developer experience across the Next.js app, React components, and custom hooks.

### Linting and Formatting

```bash
yarn lint              # ESLint with Next.js rules
yarn lint:fix          # Fix auto-fixable linting issues
yarn format            # Format all code files with Prettier
yarn format:check      # Check if files are formatted correctly
```

The project uses:

- **ESLint** with Next.js rules for code quality
- **Prettier** for consistent code formatting

### Testing

#### Unit & Integration Tests (Vitest)

```bash
yarn test              # Run all unit/integration tests
yarn test:watch        # Run tests in watch mode
yarn test:coverage     # Generate coverage report
```

#### End-to-End Tests (Playwright)

```bash
yarn test:e2e          # Run E2E tests (headless)
yarn test:e2e:ui       # Run E2E tests in UI mode (recommended for debugging)
yarn test:e2e:headed   # Run E2E tests with visible browser

# Run specific test file
yarn test:e2e e2e/multiplayer.spec.ts

# Run multiplayer tests (requires Supabase credentials)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
yarn test:e2e e2e/multiplayer.spec.ts
```

See [TESTING.md](./TESTING.md) for comprehensive testing guidelines and [e2e/README.md](./e2e/README.md) for detailed E2E testing documentation, including multiplayer test setup.


### Building

```bash
yarn build             # Next.js production build
yarn start             # Start Next.js production server
```

## Verification

To reproduce the validation checks from the Phase X audit:

### Build Verification

```bash
# Next.js production build (should complete with zero errors)
yarn build

# Expected output:
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Generating static pages
# First Load JS: ~168 kB (acceptable)
```

### Lint Verification

```bash
# ESLint code quality checks with Next.js rules
yarn lint

# Expected warnings (non-blocking):
# - React Hook useCallback unnecessary dependency (performance optimization)
# - Next.js Image component recommendation (performance optimization)
```

### Test Verification

```bash
# Run all tests
yarn test

# Expected results:
# - 366 passing tests (parity, engine, components, hooks, integration)
# - 12 intentional TODOs (Phase 4 tasks)
# - Known failures documented in Phase X audit (see docs/phase-x/phase-x-audit.md)

# Run tests in watch mode
yarn test:watch

# Generate coverage report
yarn test:coverage
```

### Format Verification

```bash
# Check code formatting
yarn format:check

# Auto-fix formatting issues
yarn format
```

### CI/CD Status

**Current State:** Comprehensive CI workflow implemented in `.github/workflows/test.yml` with three parallel jobs:

1. **Unit & Integration Tests** - Vitest tests with coverage reporting
2. **Build Check** - Production build validation
3. **E2E Tests** - Playwright end-to-end tests

All jobs run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Test Results:** Available as workflow artifacts after each run, including:

- Coverage reports (uploaded to Codecov)
- Playwright HTML reports
- E2E test screenshots and traces

**Previous Goal (Completed):** Add comprehensive CI workflow with automated build/lint/test on all PRs and deploy preview environments.

See `.github/workflows/test.yml` for the complete CI configuration.
