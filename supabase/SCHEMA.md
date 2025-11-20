# Database Schema - Entity Relationship Diagram

This document describes the database schema structure for Purrfect Chess multiplayer functionality.

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PURRFECT CHESS DATABASE                           │
│                     Anonymous Multiplayer Game Sessions                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│      PLAYERS         │
│──────────────────────│
│ PK  id (UUID)        │
│ UK  client_id (UUID) │◄───┐
│     display_name     │    │
│     is_online        │    │
│     last_seen_at     │    │
│     created_at       │    │
└──────────────────────┘    │
         △                  │
         │                  │
         │ FK               │ FK
         │                  │
┌────────┴────────────┐     │
│     SESSIONS        │     │
│─────────────────────│     │
│ PK  id (UUID)       │     │
│ UK  room_id         │     │
│     state (enum)    │     │
│     initial_fen     │     │
│     current_fen     │     │
│     pgn             │     │
│     time_control_*  │     │
│ FK  white_player_id ├─────┘
│ FK  black_player_id ├─────┐
│     result          │     │
│     result_reason   │     │
│     created_at      │     │
│     started_at      │     │
│     ended_at        │     │
│     expires_at      │     │
│     last_activity_at│     │
└─────────────────────┘     │
         △                  │
         │                  │
         │ FK               │
         │                  │
         │                  │
┌────────┴───────────┐      │
│      MOVES         │      │
│────────────────────│      │
│ PK  id (UUID)      │      │
│ FK  session_id     │      │
│ FK  player_id      ├──────┘
│     move_number    │
│     is_white_move  │
│ UK  ply            │
│     san            │
│     uci            │
│     fen_before     │
│     fen_after      │
│     is_capture     │
│     is_check       │
│     is_checkmate   │
│     is_castling    │
│     is_en_passant  │
│     is_promotion   │
│     promotion_piece│
│     time_spent_ms  │
│     time_remaining │
│     created_at     │
└────────────────────┘

Legend:
  PK = Primary Key
  FK = Foreign Key
  UK = Unique Key
  △  = One-to-Many relationship
```

## Table Relationships

### 1. PLAYERS → SESSIONS (One-to-Many)

- One player can participate in multiple sessions
- Each session has two players (white and black)
- Foreign keys: `sessions.white_player_id`, `sessions.black_player_id`
- Relationship: `ON DELETE SET NULL` (session persists if player deleted)

### 2. SESSIONS → MOVES (One-to-Many)

- One session contains multiple moves
- Foreign key: `moves.session_id`
- Relationship: `ON DELETE CASCADE` (moves deleted if session deleted)
- Unique constraint: `(session_id, ply)` ensures sequential move order

### 3. PLAYERS → MOVES (One-to-Many)

- One player makes multiple moves across all games
- Foreign key: `moves.player_id`
- Relationship: `ON DELETE CASCADE` (moves deleted if player deleted)

## Data Flow

```
1. Player Creation:
   ┌─────────────┐
   │   Browser   │
   └──────┬──────┘
          │ 1. Generate client_id (localStorage)
          ▼
   ┌─────────────┐
   │  get_or_    │
   │  create_    │
   │  player()   │
   └──────┬──────┘
          │ 2. Create/retrieve player record
          ▼
   ┌─────────────┐
   │   PLAYERS   │
   └─────────────┘

2. Session Creation:
   ┌─────────────┐
   │   Player 1  │
   └──────┬──────┘
          │ 1. Create session
          ▼
   ┌─────────────┐
   │  generate_  │
   │  room_code()│
   └──────┬──────┘
          │ 2. Generate unique room_id
          ▼
   ┌─────────────┐
   │  SESSIONS   │◄───┐
   └──────┬──────┘    │
          │ 3. Share room_id
          │           │
   ┌──────▼──────┐    │
   │   Player 2  │    │
   └──────┬──────┘    │
          │ 4. Join   │
          └───────────┘

3. Move Flow:
   ┌─────────────┐
   │   Player    │
   └──────┬──────┘
          │ 1. Make move (client-side validation)
          ▼
   ┌─────────────┐
   │  validate_  │
   │  move_      │
   │  sequence() │
   └──────┬──────┘
          │ 2. Validate ply and FEN
          ▼
   ┌─────────────┐
   │    MOVES    │
   └──────┬──────┘
          │ 3. Trigger update
          ▼
   ┌─────────────┐
   │  update_    │
   │  session_   │
   │  after_move()│
   └──────┬──────┘
          │ 4. Update current_fen
          ▼
   ┌─────────────┐
   │  SESSIONS   │
   └──────┬──────┘
          │ 5. Realtime broadcast
          ▼
   ┌─────────────┐
   │  Opponent   │
   └─────────────┘
```

## Session State Machine

```
┌─────────┐
│ waiting │ ──────┐
└────┬────┘       │
     │            │ Player 2 joins
     │            │
     ▼            │
┌─────────┐       │
│ active  │◄──────┘
└────┬────┘
     │
     │ Game ends (checkmate, resignation, etc.)
     │
     ▼
┌──────────┐
│completed │
└──────────┘

Alternative paths:

┌─────────┐                    ┌───────────┐
│ waiting │─────timeout───────▶│ abandoned │
└─────────┘                    └───────────┘

┌─────────┐                    ┌───────────┐
│ active  │────disconnect─────▶│ abandoned │
└─────────┘                    └───────────┘

┌─────────┐                    ┌──────────┐
│   any   │────expires_at─────▶│ expired  │
└─────────┘                    └──────────┘
```

## Indexes

### High-Performance Lookups

```
PLAYERS:
  idx_players_client_id        → Reconnection
  idx_players_online           → Filter online players
  idx_players_last_seen        → Cleanup queries

SESSIONS:
  idx_sessions_room_id         → Join games via room code (PRIMARY)
  idx_sessions_state           → Realtime filtering
  idx_sessions_expires_at      → Cleanup queries
  idx_sessions_white_player    → Player game lookup
  idx_sessions_black_player    → Player game lookup
  idx_sessions_last_activity   → Recent activity

MOVES:
  idx_moves_session_ply        → Get moves in order (PRIMARY)
  idx_moves_session_created    → Latest moves
  idx_moves_session_number     → Move navigation
  idx_moves_player             → Player move history
```

## Security (Row Level Security)

### Policies

```
PLAYERS:
  ✓ SELECT:  Anyone (public)
  ✓ INSERT:  Anyone (anonymous registration)
  ✓ UPDATE:  Self only (by client_id)
  ✓ DELETE:  System only (cleanup)

SESSIONS:
  ✓ SELECT:  Anyone (public)
  ✓ INSERT:  Anyone (create game)
  ✓ UPDATE:  Players in session only
  ✓ DELETE:  System only (cleanup)

MOVES:
  ✓ SELECT:  Anyone (public)
  ✓ INSERT:  Players in active session only
  ✗ UPDATE:  Disabled (immutable)
  ✗ DELETE:  Disabled (immutable)
```

## Automatic Cleanup

```
┌────────────────────────────────────────────────────────────┐
│                    CLEANUP SCHEDULE                        │
├────────────────────────────────────────────────────────────┤
│ Every 1 minute:                                            │
│   ▶ mark_inactive_players_offline()                        │
│     - Mark players offline if inactive > 5 minutes         │
│                                                            │
│ Every 5 minutes:                                           │
│   ▶ expire_inactive_sessions()                             │
│     - Expire sessions past expires_at timestamp            │
│                                                            │
│ Every 24 hours:                                            │
│   ▶ cleanup_old_players()                                  │
│     - Delete players inactive > 7 days                     │
│     - Skip players in active sessions                      │
└────────────────────────────────────────────────────────────┘
```

## Realtime Subscriptions

### Recommended Channel Setup

```typescript
// Subscribe to session updates (game state, players joining, etc.)
channel: 'game-session'
table: 'sessions'
filter: `room_id=eq.${roomId}`
events: ['UPDATE', 'DELETE']

// Subscribe to new moves (live move synchronization)
channel: 'game-moves'
table: 'moves'
filter: `session_id=eq.${sessionId}`
events: ['INSERT']

// Optional: Player status
channel: 'player-status'
table: 'players'
filter: `id=in.(${playerId1},${playerId2})`
events: ['UPDATE']
```

## Data Size Estimates

```
Typical Session (40 moves):

PLAYERS:     2 records  ×  ~150 bytes  =    300 bytes
SESSIONS:    1 record   ×  ~500 bytes  =    500 bytes
MOVES:      40 records  ×  ~400 bytes  = 16,000 bytes
                                       ─────────────
TOTAL:                                  ~16.8 KB/game

Annual storage (1M games):  ~16.8 GB
  - Automatic cleanup reduces by 90%+
  - Effective storage: ~1-2 GB
```

## Privacy & Compliance

```
┌─────────────────────────────────────────────────────────┐
│               PRIVACY-FIRST DESIGN                      │
├─────────────────────────────────────────────────────────┤
│ ✓ No authentication required                            │
│ ✓ No email collection                                   │
│ ✓ No passwords stored                                   │
│ ✓ No personal information (PII)                         │
│ ✓ Client IDs are random UUIDs (localStorage)            │
│ ✓ Display names are optional & non-identifying          │
│ ✓ Automatic data expiration (24h sessions)              │
│ ✓ Automatic cleanup (7d player records)                 │
│ ✓ No tracking or analytics                              │
│ ✓ No cross-session correlation                          │
└─────────────────────────────────────────────────────────┘
```

## Migration Path

### To Apply This Schema

1. **Via Supabase Dashboard:**
   ```
   1. Go to SQL Editor
   2. Paste supabase/schema/00_init.sql
   3. Click "Run"
   ```

2. **Via Supabase CLI:**
   ```bash
   supabase db push
   ```

3. **Verify:**
   ```sql
   -- Check tables created
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('players', 'sessions', 'moves');
   ```

### Post-Migration Steps

1. Enable Realtime replication on `sessions` and `moves`
2. Set up periodic cleanup (cron or Edge Functions)
3. Test with sample data
4. Update application code with new types

---

## References

- Schema Files: `supabase/schema/*.sql`
- TypeScript Types: `lib/supabase/types.ts`
- Documentation: `supabase/README.md`
- Parent Issue: #111 (Multiplayer Phase 1)
- This Issue: #126 (Database Schema)
