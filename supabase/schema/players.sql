-- ============================================================================
-- Players Table
-- ============================================================================
-- Stores minimal metadata for anonymous guest players.
-- No authentication required - each browser session gets a unique player ID.
-- Player records are temporary and can be cleaned up after session expiration.
-- Privacy-first design: no PII, no email, no persistent accounts.
-- ============================================================================

CREATE TABLE players (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Guest identification
  -- Anonymous display name (e.g., "Guest 1234", "Cat Lover", "Pawn Pusher")
  display_name TEXT NOT NULL DEFAULT 'Guest',
  
  -- Browser/client identifier (for reconnection support)
  -- Generated client-side and stored in localStorage
  client_id UUID NOT NULL,
  
  -- Connection metadata
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_client_id UNIQUE(client_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Lookup by client_id (for reconnection)
CREATE INDEX idx_players_client_id ON players(client_id);

-- Find online players
CREATE INDEX idx_players_online ON players(is_online) WHERE is_online = true;

-- Cleanup queries - find stale players
CREATE INDEX idx_players_last_seen ON players(last_seen_at);

-- ============================================================================
-- Triggers and Functions
-- ============================================================================

-- Function to update last_seen_at timestamp
CREATE OR REPLACE FUNCTION update_player_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_seen_at on any update
CREATE TRIGGER players_update_last_seen
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_player_last_seen();

-- Function to mark inactive players as offline
CREATE OR REPLACE FUNCTION mark_inactive_players_offline()
RETURNS void AS $$
BEGIN
  UPDATE players
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old player records
CREATE OR REPLACE FUNCTION cleanup_old_players()
RETURNS void AS $$
BEGIN
  -- Delete players who haven't been seen in 7 days and are not in any active sessions
  DELETE FROM players
  WHERE last_seen_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM sessions
      WHERE (sessions.white_player_id = players.id OR sessions.black_player_id = players.id)
        AND sessions.state IN ('waiting', 'active')
    );
END;
$$ LANGUAGE plpgsql;

-- Note: These cleanup functions should be called periodically via cron jobs:
-- - mark_inactive_players_offline(): Every 1 minute
-- - cleanup_old_players(): Every 24 hours

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on players table
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view players (for game matchmaking)
CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  USING (true);

-- Policy: Anyone can create a player record (anonymous registration)
CREATE POLICY "Anyone can create players"
  ON players FOR INSERT
  WITH CHECK (true);

-- Policy: Players can update their own record
CREATE POLICY "Players can update themselves"
  ON players FOR UPDATE
  USING (
    client_id = (current_setting('request.jwt.claims', true)::json->>'client_id')::UUID OR
    auth.uid() IS NULL  -- Allow anonymous updates for guest play
  );

-- Policy: Cleanup of old players
CREATE POLICY "System can delete old players"
  ON players FOR DELETE
  USING (last_seen_at < NOW() - INTERVAL '7 days');

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get or create a player by client_id
CREATE OR REPLACE FUNCTION get_or_create_player(
  p_client_id UUID,
  p_display_name TEXT DEFAULT 'Guest'
)
RETURNS UUID AS $$
DECLARE
  v_player_id UUID;
BEGIN
  -- Try to find existing player
  SELECT id INTO v_player_id
  FROM players
  WHERE client_id = p_client_id;
  
  -- If not found, create new player
  IF v_player_id IS NULL THEN
    INSERT INTO players (client_id, display_name)
    VALUES (p_client_id, p_display_name)
    RETURNING id INTO v_player_id;
  ELSE
    -- Update last_seen_at for existing player
    UPDATE players
    SET last_seen_at = NOW(),
        is_online = true
    WHERE id = v_player_id;
  END IF;
  
  RETURN v_player_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE players IS 'Anonymous guest players for multiplayer games (no authentication required)';
COMMENT ON COLUMN players.display_name IS 'Anonymous display name shown to other players';
COMMENT ON COLUMN players.client_id IS 'Browser/client identifier for reconnection (stored in localStorage)';
COMMENT ON COLUMN players.is_online IS 'Current online status (updated via heartbeat)';
COMMENT ON COLUMN players.last_seen_at IS 'Last activity timestamp for cleanup and offline detection';
