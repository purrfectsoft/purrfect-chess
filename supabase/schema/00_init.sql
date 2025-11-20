-- ============================================================================
-- Purrfect Chess - Complete Database Schema Migration
-- ============================================================================
-- This migration creates all tables for anonymous multiplayer chess sessions.
-- Run this script in your Supabase SQL editor or via supabase CLI.
--
-- Tables created:
--   1. players - Anonymous guest player records
--   2. sessions - Game rooms and session state
--   3. moves - Complete move history (immutable)
--
-- Features:
--   - Row Level Security (RLS) enabled for all tables
--   - Automatic cleanup triggers for expired data
--   - Indexes optimized for Realtime subscriptions
--   - Privacy-first design (no PII, anonymous only)
--
-- Prerequisites:
--   - PostgreSQL 12+
--   - Supabase project with database access
--   - uuid-ossp extension (usually enabled by default)
--
-- Usage:
--   1. Via Supabase Dashboard:
--      - Go to SQL Editor
--      - Paste this script
--      - Click "Run"
--
--   2. Via Supabase CLI:
--      supabase db push
--
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE 1: Players
-- ============================================================================
-- Create players table first (referenced by sessions)

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL DEFAULT 'Guest',
  client_id UUID NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_client_id UNIQUE(client_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_client_id ON players(client_id);
CREATE INDEX IF NOT EXISTS idx_players_online ON players(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen_at);

-- Triggers
CREATE OR REPLACE FUNCTION update_player_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_update_last_seen ON players;
CREATE TRIGGER players_update_last_seen
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_player_last_seen();

-- Helper functions
CREATE OR REPLACE FUNCTION mark_inactive_players_offline()
RETURNS void AS $$
BEGIN
  UPDATE players
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_players()
RETURNS void AS $$
BEGIN
  DELETE FROM players
  WHERE last_seen_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM sessions
      WHERE (sessions.white_player_id = players.id OR sessions.black_player_id = players.id)
        AND sessions.state IN ('waiting', 'active')
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_or_create_player(
  p_client_id UUID,
  p_display_name TEXT DEFAULT 'Guest'
)
RETURNS UUID AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE client_id = p_client_id;
  
  IF v_player_id IS NULL THEN
    INSERT INTO players (client_id, display_name)
    VALUES (p_client_id, p_display_name)
    RETURNING id INTO v_player_id;
  ELSE
    UPDATE players
    SET last_seen_at = NOW(),
        is_online = true
    WHERE id = v_player_id;
  END IF;
  
  RETURN v_player_id;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players are viewable by everyone" ON players;
CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can create players" ON players;
CREATE POLICY "Anyone can create players"
  ON players FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update themselves" ON players;
CREATE POLICY "Players can update themselves"
  ON players FOR UPDATE
  USING (
    client_id = (current_setting('request.jwt.claims', true)::json->>'client_id')::UUID OR
    auth.uid() IS NULL
  );

DROP POLICY IF EXISTS "System can delete old players" ON players;
CREATE POLICY "System can delete old players"
  ON players FOR DELETE
  USING (last_seen_at < NOW() - INTERVAL '7 days');

-- ============================================================================
-- TABLE 2: Sessions
-- ============================================================================
-- Create sessions table (references players)

-- Session states enum
DO $$ BEGIN
  CREATE TYPE session_state AS ENUM (
    'waiting',
    'active',
    'completed',
    'abandoned',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  state session_state NOT NULL DEFAULT 'waiting',
  initial_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  current_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn TEXT DEFAULT '',
  time_control_initial INTEGER,
  time_control_increment INTEGER DEFAULT 0,
  white_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  black_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  result TEXT CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),
  result_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_white_player ON sessions(white_player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_black_player ON sessions(black_player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at DESC);

-- Triggers
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sessions_update_activity ON sessions;
CREATE TRIGGER sessions_update_activity
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- Helper functions
CREATE OR REPLACE FUNCTION expire_inactive_sessions()
RETURNS void AS $$
BEGIN
  UPDATE sessions
  SET state = 'expired'
  WHERE state IN ('waiting', 'active')
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  
  result := result || '-';
  
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sessions are viewable by everyone" ON sessions;
CREATE POLICY "Sessions are viewable by everyone"
  ON sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can create sessions" ON sessions;
CREATE POLICY "Anyone can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update their sessions" ON sessions;
CREATE POLICY "Players can update their sessions"
  ON sessions FOR UPDATE
  USING (
    white_player_id = auth.uid() OR 
    black_player_id = auth.uid() OR
    auth.uid() IS NULL
  );

DROP POLICY IF EXISTS "System can delete expired sessions" ON sessions;
CREATE POLICY "System can delete expired sessions"
  ON sessions FOR DELETE
  USING (state = 'expired' AND expires_at < NOW() - INTERVAL '7 days');

-- ============================================================================
-- TABLE 3: Moves
-- ============================================================================
-- Create moves table (references sessions and players)

CREATE TABLE IF NOT EXISTS moves (
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
  promotion_piece CHAR(1) CHECK (promotion_piece IN ('q', 'r', 'b', 'n')),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  time_spent_ms INTEGER,
  time_remaining_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_move_per_ply UNIQUE(session_id, ply),
  CONSTRAINT valid_move_number CHECK (move_number > 0),
  CONSTRAINT valid_ply CHECK (ply >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_moves_session_ply ON moves(session_id, ply);
CREATE INDEX IF NOT EXISTS idx_moves_session_created ON moves(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_session_number ON moves(session_id, move_number);
CREATE INDEX IF NOT EXISTS idx_moves_player ON moves(player_id);

-- Triggers
CREATE OR REPLACE FUNCTION validate_move_sequence()
RETURNS TRIGGER AS $$
DECLARE
  v_expected_ply INTEGER;
  v_last_fen TEXT;
BEGIN
  SELECT COALESCE(MAX(ply), -1) + 1 INTO v_expected_ply
  FROM moves
  WHERE session_id = NEW.session_id;
  
  IF NEW.ply != v_expected_ply THEN
    RAISE EXCEPTION 'Invalid ply: expected %, got %', v_expected_ply, NEW.ply;
  END IF;
  
  IF NEW.ply > 0 THEN
    SELECT fen_after INTO v_last_fen
    FROM moves
    WHERE session_id = NEW.session_id
      AND ply = NEW.ply - 1;
    
    IF v_last_fen IS NOT NULL AND v_last_fen != NEW.fen_before THEN
      RAISE EXCEPTION 'FEN mismatch: expected %, got %', v_last_fen, NEW.fen_before;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS moves_validate_sequence ON moves;
CREATE TRIGGER moves_validate_sequence
  BEFORE INSERT ON moves
  FOR EACH ROW
  EXECUTE FUNCTION validate_move_sequence();

CREATE OR REPLACE FUNCTION update_session_after_move()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sessions
  SET current_fen = NEW.fen_after,
      last_activity_at = NOW()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS moves_update_session ON moves;
CREATE TRIGGER moves_update_session
  AFTER INSERT ON moves
  FOR EACH ROW
  EXECUTE FUNCTION update_session_after_move();

-- Helper functions
CREATE OR REPLACE FUNCTION get_move_history(p_session_id UUID)
RETURNS TABLE (
  move_number INTEGER,
  white_san TEXT,
  black_san TEXT,
  white_time_ms INTEGER,
  black_time_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.move_number,
    w.san AS white_san,
    b.san AS black_san,
    w.time_spent_ms AS white_time_ms,
    b.time_spent_ms AS black_time_ms
  FROM moves w
  LEFT JOIN moves b ON w.session_id = b.session_id 
    AND w.move_number = b.move_number 
    AND b.is_white_move = false
  WHERE w.session_id = p_session_id
    AND w.is_white_move = true
  ORDER BY w.move_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_latest_move(p_session_id UUID)
RETURNS moves AS $$
DECLARE
  v_move moves;
BEGIN
  SELECT * INTO v_move
  FROM moves
  WHERE session_id = p_session_id
  ORDER BY ply DESC
  LIMIT 1;
  
  RETURN v_move;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION build_pgn(p_session_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_pgn TEXT := '';
  v_move RECORD;
BEGIN
  FOR v_move IN
    SELECT move_number, white_san, black_san
    FROM get_move_history(p_session_id)
  LOOP
    v_pgn := v_pgn || v_move.move_number || '. ' || v_move.white_san;
    
    IF v_move.black_san IS NOT NULL THEN
      v_pgn := v_pgn || ' ' || v_move.black_san || ' ';
    END IF;
  END LOOP;
  
  RETURN TRIM(v_pgn);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moves are viewable by everyone" ON moves;
CREATE POLICY "Moves are viewable by everyone"
  ON moves FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Players can create moves in their sessions" ON moves;
CREATE POLICY "Players can create moves in their sessions"
  ON moves FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_id
        AND (
          sessions.white_player_id = player_id OR
          sessions.black_player_id = player_id
        )
        AND sessions.state = 'active'
    )
  );

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables were created
DO $$ 
DECLARE
  v_players_count INTEGER;
  v_sessions_count INTEGER;
  v_moves_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_players_count FROM information_schema.tables WHERE table_name = 'players';
  SELECT COUNT(*) INTO v_sessions_count FROM information_schema.tables WHERE table_name = 'sessions';
  SELECT COUNT(*) INTO v_moves_count FROM information_schema.tables WHERE table_name = 'moves';
  
  IF v_players_count = 0 OR v_sessions_count = 0 OR v_moves_count = 0 THEN
    RAISE EXCEPTION 'Migration failed: Not all tables were created';
  END IF;
  
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Tables created: players, sessions, moves';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Set up periodic cleanup jobs (see supabase/README.md)';
  RAISE NOTICE '  2. Configure Realtime on sessions and moves tables';
  RAISE NOTICE '  3. Test schema with sample data';
END $$;
