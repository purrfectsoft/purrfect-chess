// Database types for Purrfect Chess multiplayer schema
// Generated from supabase/schema/*.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Enums
export type SessionState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'abandoned'
  | 'expired';

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

// Table row types
export interface Player {
  id: string; // UUID
  display_name: string;
  client_id: string; // UUID
  is_online: boolean;
  last_seen_at: string; // ISO 8601 timestamp
  created_at: string; // ISO 8601 timestamp
}

export interface Session {
  id: string; // UUID
  room_id: string;
  state: SessionState;
  initial_fen: string;
  current_fen: string;
  pgn: string;
  time_control_initial: number | null;
  time_control_increment: number;
  white_player_id: string | null; // UUID
  black_player_id: string | null; // UUID
  result: GameResult | null;
  result_reason: string | null;
  created_at: string; // ISO 8601 timestamp
  started_at: string | null; // ISO 8601 timestamp
  ended_at: string | null; // ISO 8601 timestamp
  expires_at: string; // ISO 8601 timestamp
  last_activity_at: string; // ISO 8601 timestamp
}

export interface Move {
  id: string; // UUID
  session_id: string; // UUID
  move_number: number;
  is_white_move: boolean;
  ply: number;
  san: string;
  uci: string;
  fen_before: string;
  fen_after: string;
  is_capture: boolean;
  is_check: boolean;
  is_checkmate: boolean;
  is_castling: boolean;
  is_en_passant: boolean;
  is_promotion: boolean;
  promotion_piece: PromotionPiece | null;
  player_id: string; // UUID
  time_spent_ms: number | null;
  time_remaining_ms: number | null;
  created_at: string; // ISO 8601 timestamp
}

// Insert types (for creating new records)
export type PlayerInsert = Omit<
  Player,
  'id' | 'created_at' | 'last_seen_at' | 'is_online'
> &
  Partial<Pick<Player, 'id' | 'created_at' | 'last_seen_at' | 'is_online'>>;

export type SessionInsert = Omit<
  Session,
  'id' | 'created_at' | 'expires_at' | 'last_activity_at'
> &
  Partial<
    Pick<Session, 'id' | 'created_at' | 'expires_at' | 'last_activity_at'>
  >;

export type MoveInsert = Omit<Move, 'id' | 'created_at'> &
  Partial<Pick<Move, 'id' | 'created_at'>>;

// Update types (for updating records)
export type PlayerUpdate = Partial<
  Omit<Player, 'id' | 'client_id' | 'created_at'>
>;

export type SessionUpdate = Partial<
  Omit<Session, 'id' | 'room_id' | 'created_at'>
>;

// Moves are immutable, no update type

// Helper function return types
export interface MoveHistoryRow {
  move_number: number;
  white_san: string;
  black_san: string | null;
  white_time_ms: number | null;
  black_time_ms: number | null;
}

// Database interface for Supabase client
export interface Database {
  public: {
    Tables: {
      players: {
        Row: Player;
        Insert: PlayerInsert;
        Update: PlayerUpdate;
      };
      sessions: {
        Row: Session;
        Insert: SessionInsert;
        Update: SessionUpdate;
      };
      moves: {
        Row: Move;
        Insert: MoveInsert;
        Update: never; // Moves are immutable
      };
    };
    Views: {
      // No views defined yet
    };
    Functions: {
      generate_room_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_or_create_player: {
        Args: {
          p_client_id: string; // UUID
          p_display_name?: string;
        };
        Returns: string; // UUID
      };
      expire_inactive_sessions: {
        Args: Record<string, never>;
        Returns: void;
      };
      mark_inactive_players_offline: {
        Args: Record<string, never>;
        Returns: void;
      };
      cleanup_old_players: {
        Args: Record<string, never>;
        Returns: void;
      };
      get_move_history: {
        Args: {
          p_session_id: string; // UUID
        };
        Returns: MoveHistoryRow[];
      };
      get_latest_move: {
        Args: {
          p_session_id: string; // UUID
        };
        Returns: Move | null;
      };
      build_pgn: {
        Args: {
          p_session_id: string; // UUID
        };
        Returns: string;
      };
    };
    Enums: {
      session_state: SessionState;
    };
  };
}
