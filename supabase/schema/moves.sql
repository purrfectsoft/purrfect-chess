-- ============================================================================
-- Moves Table
-- ============================================================================
-- Stores complete move history for each game session.
-- Each row represents a single move (half-move or ply in chess terminology).
-- Optimized for Realtime subscriptions and move replay.
-- ============================================================================

CREATE TABLE moves (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session reference
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Move sequence
  move_number INTEGER NOT NULL,  -- Full move number (1, 2, 3, ...)
  is_white_move BOOLEAN NOT NULL,  -- true for white's move, false for black's move
  ply INTEGER NOT NULL,  -- Half-move number (0-indexed: 0=white's first move, 1=black's first move)
  
  -- Move notation
  san TEXT NOT NULL,  -- Standard Algebraic Notation (e.g., "e4", "Nf3", "O-O")
  uci TEXT NOT NULL,  -- Universal Chess Interface notation (e.g., "e2e4", "g1f3")
  
  -- Position data
  fen_before TEXT NOT NULL,  -- FEN before this move
  fen_after TEXT NOT NULL,   -- FEN after this move
  
  -- Move metadata
  is_capture BOOLEAN NOT NULL DEFAULT false,
  is_check BOOLEAN NOT NULL DEFAULT false,
  is_checkmate BOOLEAN NOT NULL DEFAULT false,
  is_castling BOOLEAN NOT NULL DEFAULT false,
  is_en_passant BOOLEAN NOT NULL DEFAULT false,
  is_promotion BOOLEAN NOT NULL DEFAULT false,
  promotion_piece CHAR(1) CHECK (promotion_piece IN ('q', 'r', 'b', 'n')),  -- Promoted piece type
  
  -- Player reference
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  -- Timing information
  time_spent_ms INTEGER,  -- Time spent thinking (milliseconds)
  time_remaining_ms INTEGER,  -- Time remaining after move (milliseconds)
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_move_per_ply UNIQUE(session_id, ply),
  CONSTRAINT valid_move_number CHECK (move_number > 0),
  CONSTRAINT valid_ply CHECK (ply >= 0)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup: get all moves for a session (ordered by ply)
CREATE INDEX idx_moves_session_ply ON moves(session_id, ply);

-- Realtime subscription: get latest moves
CREATE INDEX idx_moves_session_created ON moves(session_id, created_at DESC);

-- Move number lookup (for navigation)
CREATE INDEX idx_moves_session_number ON moves(session_id, move_number);

-- Player move history
CREATE INDEX idx_moves_player ON moves(player_id);

-- ============================================================================
-- Triggers and Functions
-- ============================================================================

-- Function to validate move sequence
CREATE OR REPLACE FUNCTION validate_move_sequence()
RETURNS TRIGGER AS $$
DECLARE
  v_expected_ply INTEGER;
  v_last_fen TEXT;
BEGIN
  -- Get the expected next ply (should be max(ply) + 1)
  SELECT COALESCE(MAX(ply), -1) + 1 INTO v_expected_ply
  FROM moves
  WHERE session_id = NEW.session_id;
  
  -- Verify ply is sequential
  IF NEW.ply != v_expected_ply THEN
    RAISE EXCEPTION 'Invalid ply: expected %, got %', v_expected_ply, NEW.ply;
  END IF;
  
  -- Verify FEN continuity (fen_before should match previous fen_after)
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

-- Trigger to validate move sequence on insert
CREATE TRIGGER moves_validate_sequence
  BEFORE INSERT ON moves
  FOR EACH ROW
  EXECUTE FUNCTION validate_move_sequence();

-- Function to update session after move
CREATE OR REPLACE FUNCTION update_session_after_move()
RETURNS TRIGGER AS $$
BEGIN
  -- Update session with latest FEN and PGN
  UPDATE sessions
  SET current_fen = NEW.fen_after,
      last_activity_at = NOW()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session after move insertion
CREATE TRIGGER moves_update_session
  AFTER INSERT ON moves
  FOR EACH ROW
  EXECUTE FUNCTION update_session_after_move();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on moves table
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view moves for any session
CREATE POLICY "Moves are viewable by everyone"
  ON moves FOR SELECT
  USING (true);

-- Policy: Players can insert moves for their sessions
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

-- Policy: Moves cannot be updated or deleted (immutable history)
-- Note: No UPDATE or DELETE policies = no one can modify/delete moves

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get move history for a session
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

-- Get latest move for a session
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

-- Build PGN from move history
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

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE moves IS 'Complete move history for each game session (immutable)';
COMMENT ON COLUMN moves.session_id IS 'Reference to the game session';
COMMENT ON COLUMN moves.move_number IS 'Full move number in standard chess notation (1, 2, 3, ...)';
COMMENT ON COLUMN moves.is_white_move IS 'True for white moves, false for black moves';
COMMENT ON COLUMN moves.ply IS 'Half-move number (0-indexed sequential counter)';
COMMENT ON COLUMN moves.san IS 'Standard Algebraic Notation (e.g., e4, Nf3, O-O)';
COMMENT ON COLUMN moves.uci IS 'Universal Chess Interface notation (e.g., e2e4, g1f3)';
COMMENT ON COLUMN moves.fen_before IS 'Position FEN before this move (for validation)';
COMMENT ON COLUMN moves.fen_after IS 'Position FEN after this move (for replay)';
COMMENT ON COLUMN moves.time_spent_ms IS 'Time spent thinking in milliseconds';
COMMENT ON COLUMN moves.time_remaining_ms IS 'Time remaining after move in milliseconds';
