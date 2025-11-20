# Supabase Database Schema

This directory contains the PostgreSQL database schema for **Purrfect Chess** multiplayer functionality. The schema supports anonymous (guest) game sessions using Supabase Realtime for live move synchronization.

## 📋 Overview

The database schema consists of three main tables:

1. **`players`** - Anonymous guest player records
2. **`sessions`** - Game rooms and session state
3. **`moves`** - Complete move history (immutable)

## 🗂️ Files

```
supabase/
├── README.md           # This file - comprehensive documentation
└── schema/
    ├── 00_init.sql     # Complete migration script (all tables)
    ├── players.sql     # Players table with RLS and helpers
    ├── sessions.sql    # Sessions table with RLS and helpers
    └── moves.sql       # Moves table with RLS and helpers
```

## 🚀 Quick Start

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `schema/00_init.sql`
4. Paste into the SQL editor
5. Click **Run** to execute

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Initialize Supabase in your project (if not already done)
supabase init

# Link to your remote project
supabase link --project-ref your-project-ref

# Apply the migration
supabase db push
```

### Option 3: Manual Table Creation

Apply the schemas in this order:
1. `schema/players.sql`
2. `schema/sessions.sql`
3. `schema/moves.sql`

## 📊 Database Schema

### Table: `players`

Stores minimal metadata for anonymous guest players.

```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL DEFAULT 'Guest',
  client_id UUID NOT NULL UNIQUE,
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key Features:**
- No authentication required
- Client ID for reconnection support
- Automatic offline detection (5-minute timeout)
- Cleanup of old records (7 days)

**Indexes:**
- `idx_players_client_id` - Fast lookup by client ID
- `idx_players_online` - Filter online players
- `idx_players_last_seen` - Cleanup queries

### Table: `sessions`

Stores game rooms and session state.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  state session_state NOT NULL DEFAULT 'waiting',
  initial_fen TEXT NOT NULL,
  current_fen TEXT NOT NULL,
  pgn TEXT DEFAULT '',
  time_control_initial INTEGER,
  time_control_increment INTEGER DEFAULT 0,
  white_player_id UUID REFERENCES players(id),
  black_player_id UUID REFERENCES players(id),
  result TEXT CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),
  result_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Session States:**
- `waiting` - Waiting for second player
- `active` - Game in progress
- `completed` - Game finished normally
- `abandoned` - Player disconnected/timeout
- `expired` - Session expired (24 hours)

**Key Features:**
- Short room codes for easy sharing (e.g., "ABCD-1234")
- Automatic expiration after 24 hours
- Support for time controls
- Track game result and reason

**Indexes:**
- `idx_sessions_room_id` - Join games via room code
- `idx_sessions_state` - Realtime filtering
- `idx_sessions_expires_at` - Cleanup queries
- `idx_sessions_white_player` / `idx_sessions_black_player` - Player game lookup
- `idx_sessions_last_activity` - Recent activity queries

### Table: `moves`

Stores complete move history for each game.

```sql
CREATE TABLE moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  is_white_move BOOLEAN NOT NULL,
  ply INTEGER NOT NULL,
  san TEXT NOT NULL,
  uci TEXT NOT NULL,
  fen_before TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  is_capture BOOLEAN NOT NULL DEFAULT false,
  is_check BOOLEAN NOT NULL DEFAULT false,
  is_checkmate BOOLEAN NOT NULL DEFAULT false,
  is_castling BOOLEAN NOT NULL DEFAULT false,
  is_en_passant BOOLEAN NOT NULL DEFAULT false,
  is_promotion BOOLEAN NOT NULL DEFAULT false,
  promotion_piece CHAR(1),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  time_spent_ms INTEGER,
  time_remaining_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key Features:**
- Immutable move history (no updates/deletes)
- Both SAN and UCI notation
- Complete position tracking (FEN before/after)
- Move metadata (capture, check, etc.)
- Timing information

**Indexes:**
- `idx_moves_session_ply` - Get moves in order
- `idx_moves_session_created` - Latest moves
- `idx_moves_session_number` - Move navigation
- `idx_moves_player` - Player move history

## 🔒 Row Level Security (RLS)

All tables have RLS enabled with policies for anonymous guest play:

### Players Table
- ✅ **SELECT**: Anyone can view players
- ✅ **INSERT**: Anyone can create player records
- ✅ **UPDATE**: Players can update their own record
- ✅ **DELETE**: System can delete old players (7 days)

### Sessions Table
- ✅ **SELECT**: Anyone can view sessions
- ✅ **INSERT**: Anyone can create sessions
- ✅ **UPDATE**: Players can update their sessions
- ✅ **DELETE**: System can delete expired sessions (7 days after expiry)

### Moves Table
- ✅ **SELECT**: Anyone can view moves
- ✅ **INSERT**: Players can insert moves in their sessions
- ❌ **UPDATE**: Disabled (immutable history)
- ❌ **DELETE**: Disabled (immutable history)

## 🔄 Automatic Cleanup

### Triggers

**Sessions:**
- `sessions_update_activity` - Updates `last_activity_at` on any change

**Players:**
- `players_update_last_seen` - Updates `last_seen_at` on any change

**Moves:**
- `moves_validate_sequence` - Validates move sequence and FEN continuity
- `moves_update_session` - Updates session after move insertion

### Cleanup Functions

These functions should be called periodically (see Cron Setup below):

1. **`mark_inactive_players_offline()`**
   - Marks players as offline if inactive for 5 minutes
   - Recommended: Every 1 minute

2. **`expire_inactive_sessions()`**
   - Expires sessions that passed their `expires_at` timestamp
   - Recommended: Every 5 minutes

3. **`cleanup_old_players()`**
   - Deletes player records older than 7 days (if not in active sessions)
   - Recommended: Every 24 hours

## ⏰ Cron Setup

### Option 1: Supabase Edge Functions (Recommended)

Create Edge Functions for periodic cleanup:

```typescript
// supabase/functions/cleanup-sessions/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  await supabase.rpc('expire_inactive_sessions')
  await supabase.rpc('mark_inactive_players_offline')
  
  return new Response('Cleanup complete', { status: 200 })
})
```

Schedule via GitHub Actions or external cron service.

### Option 2: pg_cron Extension

If you have access to `pg_cron` (Supabase Pro or self-hosted):

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Mark inactive players offline (every minute)
SELECT cron.schedule(
  'mark-inactive-players',
  '* * * * *',
  'SELECT mark_inactive_players_offline()'
);

-- Expire inactive sessions (every 5 minutes)
SELECT cron.schedule(
  'expire-sessions',
  '*/5 * * * *',
  'SELECT expire_inactive_sessions()'
);

-- Cleanup old players (daily at 3 AM)
SELECT cron.schedule(
  'cleanup-players',
  '0 3 * * *',
  'SELECT cleanup_old_players()'
);
```

### Option 3: Application-Level Cron

Run cleanup from your application using a cron service or scheduled task:

```typescript
// Run every 5 minutes
setInterval(async () => {
  await supabase.rpc('expire_inactive_sessions');
  await supabase.rpc('mark_inactive_players_offline');
}, 5 * 60 * 1000);

// Run daily
setInterval(async () => {
  await supabase.rpc('cleanup_old_players');
}, 24 * 60 * 60 * 1000);
```

## 🔥 Realtime Configuration

Enable Realtime on tables for live synchronization:

1. Go to **Database → Replication** in Supabase Dashboard
2. Enable Realtime for:
   - ✅ `sessions` table
   - ✅ `moves` table
   - ⚠️ `players` table (optional, not required for basic functionality)

### Subscription Examples

**Subscribe to session updates:**
```typescript
const channel = supabase
  .channel('game-session')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'sessions',
      filter: `room_id=eq.${roomId}`
    },
    (payload) => {
      console.log('Session updated:', payload);
    }
  )
  .subscribe();
```

**Subscribe to new moves:**
```typescript
const channel = supabase
  .channel('game-moves')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'moves',
      filter: `session_id=eq.${sessionId}`
    },
    (payload) => {
      console.log('New move:', payload.new);
    }
  )
  .subscribe();
```

## 🧪 Testing the Schema

### Sample Data

Create a test session with moves:

```sql
-- Create two test players
INSERT INTO players (client_id, display_name)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Test Player 1'),
  ('22222222-2222-2222-2222-222222222222', 'Test Player 2')
RETURNING id;

-- Create a test session
INSERT INTO sessions (room_id, white_player_id, black_player_id, state)
VALUES (
  'TEST-1234',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'active'
)
RETURNING id;

-- Insert some moves
INSERT INTO moves (
  session_id, 
  move_number, 
  is_white_move, 
  ply, 
  san, 
  uci,
  fen_before,
  fen_after,
  player_id
)
VALUES (
  (SELECT id FROM sessions WHERE room_id = 'TEST-1234'),
  1,
  true,
  0,
  'e4',
  'e2e4',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  '11111111-1111-1111-1111-111111111111'
);
```

### Query Examples

```sql
-- Get all active sessions
SELECT room_id, state, created_at
FROM sessions
WHERE state = 'active'
ORDER BY last_activity_at DESC;

-- Get move history for a session
SELECT * FROM get_move_history('session-id-here');

-- Build PGN for a session
SELECT build_pgn('session-id-here');

-- Find sessions by player
SELECT s.room_id, s.state, s.created_at
FROM sessions s
WHERE s.white_player_id = 'player-id-here'
   OR s.black_player_id = 'player-id-here'
ORDER BY s.created_at DESC;
```

## 🔧 Helper Functions

### Session Management

- **`generate_room_code()`** - Generates unique room codes (e.g., "ABCD-1234")
- **`expire_inactive_sessions()`** - Expires sessions past their expiry time

### Player Management

- **`get_or_create_player(client_id, display_name)`** - Get existing or create new player
- **`mark_inactive_players_offline()`** - Mark inactive players as offline
- **`cleanup_old_players()`** - Delete old player records

### Move Management

- **`get_move_history(session_id)`** - Get formatted move history
- **`get_latest_move(session_id)`** - Get last move played
- **`build_pgn(session_id)`** - Build PGN string from moves

## 📝 Privacy & Security

### Design Principles

1. **No Authentication Required**
   - Anonymous guest play without accounts
   - Client IDs stored in browser localStorage

2. **No PII Stored**
   - No emails, passwords, or personal information
   - Display names are optional and non-identifying

3. **Automatic Cleanup**
   - Sessions expire after 24 hours
   - Old player records deleted after 7 days
   - No long-term data retention

4. **Data Minimization**
   - Only store what's needed for gameplay
   - No tracking or analytics data

### Security Considerations

- All tables have RLS enabled
- Guest players can only modify their own sessions
- Moves are immutable (cannot be changed or deleted)
- FEN validation prevents invalid positions
- Move sequence validation prevents replay attacks

## 🔍 Troubleshooting

### Issue: Tables not created

**Solution:** Ensure you have the required extensions:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Issue: RLS policies preventing access

**Solution:** Check that anonymous access is enabled:
```sql
-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename IN ('players', 'sessions', 'moves');
```

### Issue: Realtime not working

**Solution:**
1. Enable replication for tables in Supabase Dashboard
2. Verify Realtime is enabled in project settings
3. Check subscription filters match your data

### Issue: Cleanup functions not running

**Solution:** Set up cron jobs (see Cron Setup section above)

## 🚀 Next Steps

After applying the schema:

1. ✅ Verify tables created successfully
2. ✅ Enable Realtime replication on `sessions` and `moves`
3. ✅ Set up periodic cleanup jobs (cron or Edge Functions)
4. ✅ Test with sample data
5. ✅ Update TypeScript types in `lib/supabase/types.ts`
6. ✅ Implement multiplayer store and UI (issues #127-#137)

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

## 📄 License

This schema is part of the Purrfect Chess project and follows the same license (see LICENSE.md).
