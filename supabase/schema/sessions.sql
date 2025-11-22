-- ============================================================================
-- Game Sessions Table
-- ============================================================================
-- Stores anonymous chess game sessions (rooms) for multiplayer play.
-- Each session represents a unique game room that two players can join.
-- Sessions automatically expire after 24 hours for privacy and cleanup.
-- ============================================================================

-- Session states enum
CREATE TYPE session_state AS ENUM (
  'waiting',    -- Waiting for second player to join
  'active',     -- Game in progress with both players
  'completed',  -- Game finished (checkmate, stalemate, draw)
  'abandoned',  -- Game abandoned (player disconnected/timeout)
  'expired'     -- Session expired (past expires_at timestamp)
);

-- Main sessions table
CREATE TABLE sessions (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Room identifier (short code for easy sharing, e.g., "ABCD-1234")
  room_id TEXT UNIQUE NOT NULL,
  
  -- Session state
  state session_state NOT NULL DEFAULT 'waiting',
  
  -- Game data
  initial_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  current_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn TEXT DEFAULT '',
  
  -- Time control settings (in seconds, null means no time control)
  time_control_initial INTEGER,  -- Initial time per player (e.g., 600 for 10 minutes)
  time_control_increment INTEGER DEFAULT 0,  -- Increment per move in seconds
  
  -- Player color assignments
  white_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  black_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  
  -- Game result
  result TEXT CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),  -- Standard PGN result notation
  result_reason TEXT,  -- e.g., 'checkmate', 'resignation', 'timeout', 'draw_agreement'
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,  -- When second player joined and game started
  ended_at TIMESTAMPTZ,    -- When game finished
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup by room_id (for joining games via short code)
CREATE INDEX idx_sessions_room_id ON sessions(room_id);

-- Realtime subscription queries - filter by state
CREATE INDEX idx_sessions_state ON sessions(state);

-- Cleanup queries - find expired sessions
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Player lookup - find games by player
CREATE INDEX idx_sessions_white_player ON sessions(white_player_id);
CREATE INDEX idx_sessions_black_player ON sessions(black_player_id);

-- Recent activity queries
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at DESC);

-- ============================================================================
-- Triggers and Functions
-- ============================================================================

-- Function to update last_activity_at timestamp
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_activity_at on any update
CREATE TRIGGER sessions_update_activity
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- Function to auto-expire inactive sessions
CREATE OR REPLACE FUNCTION expire_inactive_sessions()
RETURNS void AS $$
BEGIN
  UPDATE sessions
  SET state = 'expired'
  WHERE state IN ('waiting', 'active')
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Note: This function should be called periodically via a cron job or Supabase Edge Function
-- Example cron setup (requires pg_cron extension):
-- SELECT cron.schedule('expire-sessions', '*/5 * * * *', 'SELECT expire_inactive_sessions()');

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active sessions (for joining)
CREATE POLICY "Sessions are viewable by everyone"
  ON sessions FOR SELECT
  USING (true);

-- Policy: Anyone can create a new session (anonymous play)
CREATE POLICY "Anyone can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (true);

-- Policy: Players can update their own sessions
-- (allows joining, making moves, updating state)
CREATE POLICY "Players can update their sessions"
  ON sessions FOR UPDATE
  USING (
    white_player_id = auth.uid() OR 
    black_player_id = auth.uid() OR
    auth.uid() IS NULL  -- Allow anonymous updates for guest play
  );

-- Policy: System can delete expired sessions (cleanup)
CREATE POLICY "System can delete expired sessions"
  ON sessions FOR DELETE
  USING (state = 'expired' AND expires_at < NOW() - INTERVAL '7 days');

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Generate a unique short room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- Removed ambiguous chars (0, O, I, 1)
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate 4-character code with hyphen separator (e.g., "ABCD-1234")
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

-- Atomically assign a player to a session (solves race condition)
-- Returns JSON with: { "color": "white" | "black" | null, "session": {...} }
CREATE OR REPLACE FUNCTION assign_player_to_session(
  p_session_id UUID,
  p_player_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_assigned_color TEXT := NULL;
BEGIN
  -- Lock the session row for update to prevent race conditions
  -- This ensures only one transaction can modify the session at a time
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;
  
  -- Check if session exists
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  
  -- Check if player is already assigned
  IF v_session.white_player_id = p_player_id THEN
    v_assigned_color := 'white';
  ELSIF v_session.black_player_id = p_player_id THEN
    v_assigned_color := 'black';
  -- Assign to first available color
  ELSIF v_session.white_player_id IS NULL THEN
    v_assigned_color := 'white';
    UPDATE sessions
    SET white_player_id = p_player_id
    WHERE id = p_session_id;
  ELSIF v_session.black_player_id IS NULL THEN
    v_assigned_color := 'black';
    UPDATE sessions
    SET black_player_id = p_player_id
    WHERE id = p_session_id;
    
    -- Activate the session since both players are now assigned
    IF v_session.white_player_id IS NOT NULL THEN
      UPDATE sessions
      SET state = 'active',
          started_at = NOW()
      WHERE id = p_session_id;
    END IF;
  END IF;
  
  -- Fetch the updated session
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id;
  
  -- Return result as JSON
  RETURN json_build_object(
    'color', v_assigned_color,
    'session', row_to_json(v_session)
  );
END;
$$ LANGUAGE plpgsql;

-- Add comment for the function
COMMENT ON FUNCTION assign_player_to_session(UUID, UUID) IS 
  'Atomically assigns a player to the first available color (white or black) in a session. ' ||
  'Uses row-level locking to prevent race conditions when multiple players join simultaneously. ' ||
  'Returns JSON with assigned color and updated session data.';

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE sessions IS 'Anonymous chess game sessions (rooms) for multiplayer play';
COMMENT ON COLUMN sessions.room_id IS 'Short code for easy sharing (e.g., ABCD-1234)';
COMMENT ON COLUMN sessions.state IS 'Current state of the game session';
COMMENT ON COLUMN sessions.initial_fen IS 'Starting position FEN (allows chess variants)';
COMMENT ON COLUMN sessions.current_fen IS 'Current position FEN';
COMMENT ON COLUMN sessions.pgn IS 'Portable Game Notation of all moves';
COMMENT ON COLUMN sessions.time_control_initial IS 'Initial time per player in seconds';
COMMENT ON COLUMN sessions.time_control_increment IS 'Increment per move in seconds';
COMMENT ON COLUMN sessions.result IS 'Game result in PGN notation: 1-0, 0-1, 1/2-1/2, or *';
COMMENT ON COLUMN sessions.expires_at IS 'Automatic expiration timestamp (24 hours after creation)';
