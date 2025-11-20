import { types, Instance, SnapshotIn, flow } from 'mobx-state-tree';
import { Chess } from 'chess.js';
import type { SessionState } from '@/lib/supabase/types';
import { MoveQueue, createMoveQueue } from '@/lib/multiplayer/moveSync';

/**
 * Promisified delay function for use in MST flows
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Time Control Model
 */
const TimeControlModel = types.model('TimeControl', {
  minutes: types.number,
  increment: types.number,
});

/**
 * Game State Model
 * Manages chess game state including position, history, time controls
 */
const GameStateModel = types
  .model('GameState', {
    fen: types.optional(
      types.string,
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    ),
    whiteTime: types.number,
    blackTime: types.number,
    timeControl: TimeControlModel,
    isGameOver: types.optional(types.boolean, false),
    isTimerRunning: types.optional(types.boolean, false),
  })
  .volatile(() => ({
    // Chess.js instance is volatile (not serialized)
    chessInstance: new Chess(),
    // Timer state (not persisted)
    timerRunning: false, // Track if timer loop is running
    lastTickTime: null as number | null,
  }))
  .views((self) => ({
    get position() {
      // Depend on fen for reactivity - when fen changes, position recalculates
      const _ = self.fen; // Track fen dependency
      const board = self.chessInstance.board();
      const position: Record<string, { type: string; color: string } | null> =
        {};
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

      board.forEach((row, rankIndex) => {
        const rank = 8 - rankIndex;
        row.forEach((piece, fileIndex) => {
          const square = `${files[fileIndex]}${rank}`;
          position[square] = piece;
        });
      });

      return position;
    },
    get history() {
      // Depend on fen for reactivity
      const _ = self.fen;
      return self.chessInstance.history({ verbose: true });
    },
    get turn() {
      // Depend on fen for reactivity - when fen changes, turn recalculates
      const _ = self.fen; // Track fen dependency
      return self.chessInstance.turn();
    },
    get check() {
      return self.chessInstance.isCheck();
    },
    get checkmate() {
      return self.chessInstance.isCheckmate();
    },
    get stalemate() {
      return self.chessInstance.isStalemate();
    },
    get threefoldRepetition() {
      return self.chessInstance.isThreefoldRepetition();
    },
    get insufficientMaterial() {
      return self.chessInstance.isInsufficientMaterial();
    },
    get draw() {
      return self.chessInstance.isDraw();
    },
    /**
     * Get legal moves for a square
     * Returns moves in verbose format with from, to, san, etc.
     */
    getLegalMoves(square: string) {
      return self.chessInstance.moves({ square: square as any, verbose: true });
    },
  }))
  .actions((self) => ({
    movePiece(from: string, to: string, promotion?: string) {
      try {
        const move = self.chessInstance.move({
          from,
          to,
          promotion: promotion || 'q',
        });
        if (move) {
          // Update FEN after successful move
          self.fen = self.chessInstance.fen();

          // Add increment to the player who just moved
          const incrementMs = self.timeControl.increment * 1000;
          if (move.color === 'w') {
            self.whiteTime += incrementMs;
          } else {
            self.blackTime += incrementMs;
          }

          return true;
        }
        return false;
      } catch (error) {
        console.error('Invalid move:', error);
        return false;
      }
    },
    stopTimer() {
      self.isTimerRunning = false;
      self.timerRunning = false;
      self.lastTickTime = null;
    },
  }))
  .actions((self) => ({
    resetGame() {
      self.chessInstance.reset();
      self.fen = self.chessInstance.fen();
      self.whiteTime = self.timeControl.minutes * 60 * 1000;
      self.blackTime = self.timeControl.minutes * 60 * 1000;
      self.isGameOver = false;
      self.stopTimer();
    },
    tick(delta: number) {
      // Timer tick logic - must be in an action to modify model state
      // Update lastTickTime here (inside action)
      self.lastTickTime = Date.now();

      if (!self.isGameOver && self.isTimerRunning) {
        if (self.turn === 'w') {
          self.whiteTime = Math.max(0, self.whiteTime - delta);
          if (self.whiteTime === 0) {
            self.isGameOver = true;
            self.stopTimer();
          }
        } else {
          self.blackTime = Math.max(0, self.blackTime - delta);
          if (self.blackTime === 0) {
            self.isGameOver = true;
            self.stopTimer();
          }
        }
      }
    },
    setTimeControl(minutes: number, increment: number) {
      self.timeControl = TimeControlModel.create({ minutes, increment });
      self.whiteTime = minutes * 60 * 1000;
      self.blackTime = minutes * 60 * 1000;
      self.stopTimer();
    },
    loadFen(fen: string) {
      try {
        self.chessInstance.load(fen.trim());
        self.fen = self.chessInstance.fen();
        self.stopTimer();
        // Update isGameOver based on the loaded position
        self.isGameOver = self.chessInstance.isGameOver();
        return true;
      } catch (error) {
        console.error('Invalid FEN:', error);
        return false;
      }
    },
    loadPgn(pgn: string) {
      try {
        self.chessInstance.loadPgn(pgn.trim());
        self.fen = self.chessInstance.fen();
        self.stopTimer();
        // Update isGameOver based on the loaded position
        self.isGameOver = self.chessInstance.isGameOver();
        return true;
      } catch (error) {
        console.error('Invalid PGN:', error);
        return false;
      }
    },
    getPgn() {
      return self.chessInstance.pgn();
    },
  }))
  .actions((self) => ({
    // Flow-based async timer loop
    startTimer: flow(function* () {
      if (self.timerRunning) {
        return; // Already running
      }

      self.isTimerRunning = true;
      self.timerRunning = true;
      self.lastTickTime = Date.now();

      // Timer loop using generator/flow
      while (self.timerRunning && !self.isGameOver) {
        yield delay(100); // Wait 100ms

        if (!self.timerRunning || self.isGameOver) {
          break;
        }

        const now = Date.now();
        const delta = self.lastTickTime ? now - self.lastTickTime : 0;
        self.tick(delta);
      }
    }),
    afterCreate() {
      // Load FEN on creation with error handling
      if (self.fen) {
        try {
          self.chessInstance.load(self.fen);
        } catch (error) {
          console.error(
            '[GameStore] Failed to load FEN on initialization:',
            error
          );
          // Fall back to default position if FEN is invalid
          self.chessInstance.reset();
        }
      }
    },
    beforeDestroy() {
      // Clean up timer on destroy
      self.stopTimer();
    },
  }))
  .actions((self) => ({
    resetGame() {
      self.chessInstance.reset();
      self.fen = self.chessInstance.fen();
      self.whiteTime = self.timeControl.minutes * 60 * 1000;
      self.blackTime = self.timeControl.minutes * 60 * 1000;
      self.isGameOver = false;
      self.stopTimer();
    },
    // Enhanced actions with error handling - can now call actions from previous block
    movePieceWithValidation(
      from: string,
      to: string,
      promotion?: string,
      onError?: (msg: string) => void
    ) {
      const success = self.movePiece(from, to, promotion);
      if (!success && onError) {
        onError('Illegal move.');
      }
      // Start timer on first move
      if (success && self.history.length === 1) {
        self.startTimer();
      }
      return success;
    },
    loadFenWithValidation(fen: string, onError?: (msg: string) => void) {
      if (!fen || !fen.trim()) {
        if (onError) {
          onError('Enter a FEN string to load.');
        }
        return false;
      }
      const success = self.loadFen(fen);
      if (!success && onError) {
        onError('Invalid FEN string.');
      }
      return success;
    },
    loadPgnWithValidation(pgn: string, onError?: (msg: string) => void) {
      if (!pgn || !pgn.trim()) {
        if (onError) {
          onError('Enter a PGN string to load.');
        }
        return false;
      }
      const success = self.loadPgn(pgn);
      if (!success && onError) {
        onError('Invalid PGN data.');
      }
      return success;
    },
  }));

/**
 * UI State Model
 * Manages transient UI state (not persisted)
 */
const UIStateModel = types
  .model('UIState', {
    isEnginePanelVisible: types.optional(types.boolean, false),
    isEvalBarVisible: types.optional(types.boolean, false),
    isBoardFlipped: types.optional(types.boolean, false),
    engineDisplayMode: types.optional(
      types.enumeration('EngineDisplayMode', [
        'squares',
        'arrows',
        'both',
        'none',
      ]),
      'both'
    ),
  })
  .views((self) => ({
    get engineDisplayModeValue(): 'squares' | 'arrows' | 'both' | 'none' {
      return self.engineDisplayMode as 'squares' | 'arrows' | 'both' | 'none';
    },
  }))
  .actions((self) => ({
    toggleEnginePanel() {
      self.isEnginePanelVisible = !self.isEnginePanelVisible;
    },
    showEnginePanel() {
      self.isEnginePanelVisible = true;
    },
    hideEnginePanel() {
      self.isEnginePanelVisible = false;
    },
    toggleEvalBar() {
      self.isEvalBarVisible = !self.isEvalBarVisible;
    },
    toggleBoardFlip() {
      self.isBoardFlipped = !self.isBoardFlipped;
    },
    setEngineDisplayMode(mode: 'squares' | 'arrows' | 'both' | 'none') {
      self.engineDisplayMode = mode;
    },
  }));

/**
 * Settings Model
 * Manages persistent user preferences
 */
const SettingsModel = types
  .model('Settings', {
    defaultTimeMinutes: types.optional(types.number, 5),
    defaultTimeIncrement: types.optional(types.number, 0),
    defaultEngineDepth: types.optional(types.number, 22),
    // Add more persistent settings as needed
  })
  .actions((self) => ({
    setDefaultTime(minutes: number, increment: number) {
      self.defaultTimeMinutes = minutes;
      self.defaultTimeIncrement = increment;
    },
    setDefaultEngineDepth(depth: number) {
      self.defaultEngineDepth = depth;
    },
  }));

/**
 * Engine Analysis Model
 * Represents a single multi-PV analysis line
 */
const EngineAnalysisModel = types
  .model('EngineAnalysis', {
    multipv: types.number,
    depth: types.number,
    score: types.number,
    scoreType: types.enumeration('ScoreType', ['cp', 'mate']),
    bestMove: types.string,
    san: types.string,
    pv: types.array(types.string),
    pvSan: types.array(types.string),
  })
  .views((self) => ({
    /**
     * Get pvSan as a plain JavaScript array
     * This avoids MST observable tracking issues when accessing the array in components
     */
    get pvSanArray(): string[] {
      return self.pvSan.slice();
    },
    /**
     * Get pv as a plain JavaScript array
     */
    get pvArray(): string[] {
      return self.pv.slice();
    },
    /**
     * Get first 8 moves of pvSan for display
     */
    get pvSanPreview(): string {
      const moves = self.pvSan.slice(0, 8);
      const preview = moves.join(' ');
      return self.pvSan.length > 8 ? `${preview}...` : preview;
    },
    /**
     * Check if pvSan has moves
     */
    get hasPvSan(): boolean {
      return self.pvSan.length > 0;
    },
  }));

/**
 * Engine State Model
 * Manages Stockfish engine state and analysis results
 *
 * This is a shared global state accessed by all useEngine() hook invocations
 */
const EngineStateModel = types
  .model('EngineState', {
    isEngineReady: types.optional(types.boolean, false),
    isAnalyzing: types.optional(types.boolean, false),
    analysis: types.array(EngineAnalysisModel),
    currentDepth: types.optional(types.number, 0),
    currentFen: types.optional(types.string, ''),
  })
  .views((self) => ({
    get engineHighlights() {
      // Derive engine highlights from analysis for Board component
      return self.analysis
        .filter((line) => line.bestMove && line.bestMove.length >= 4)
        .map((line, index) => ({
          from: line.bestMove.slice(0, 2),
          to: line.bestMove.slice(2, 4),
          rank: index + 1, // 1-based rank (1 = best move)
        }));
    },
    get bestEvaluation() {
      // Get best evaluation for EvaluationBar (from first PV line)
      return self.analysis.length > 0 ? self.analysis[0] : null;
    },
  }))
  .actions((self) => ({
    setEngineReady(ready: boolean) {
      self.isEngineReady = ready;
    },
    setAnalyzing(analyzing: boolean) {
      self.isAnalyzing = analyzing;
    },
    setAnalysis(analysis: typeof self.analysis) {
      self.analysis.replace(analysis);
    },
    setCurrentDepth(depth: number) {
      self.currentDepth = depth;
    },
    setCurrentFen(fen: string) {
      self.currentFen = fen;
    },
    clearAnalysis() {
      self.analysis.clear();
      self.currentDepth = 0;
    },
    updateAnalysisLine(line: {
      multipv: number;
      depth: number;
      score: number;
      scoreType: 'cp' | 'mate';
      bestMove: string;
      san: string;
      pv: string[];
      pvSan: string[];
    }) {
      // Find existing line or add new one
      const existingIndex = self.analysis.findIndex(
        (a) => a.multipv === line.multipv
      );

      if (existingIndex >= 0) {
        // Update existing line
        self.analysis[existingIndex] = line as any;
      } else {
        // Add new line
        self.analysis.push(line as any);
      }

      // Sort by multipv to maintain order
      self.analysis.replace(
        self.analysis.slice().sort((a, b) => a.multipv - b.multipv)
      );
    },
  }));

/**
 * Multiplayer Player Model
 * Represents a player in a multiplayer session
 */
const MultiplayerPlayerModel = types.model('MultiplayerPlayer', {
  id: types.identifier,
  displayName: types.string,
  color: types.maybeNull(types.enumeration('PlayerColor', ['white', 'black'])),
  isOnline: types.optional(types.boolean, true),
  lastSeenAt: types.optional(types.string, () => new Date().toISOString()),
});

/**
 * Multiplayer Move Model
 * Represents a move in multiplayer history
 */
const MultiplayerMoveModel = types.model('MultiplayerMove', {
  id: types.identifier,
  from: types.string,
  to: types.string,
  promotion: types.maybeNull(types.string),
  san: types.string,
  fen: types.string,
  playerId: types.string,
  timestamp: types.string,
  timeRemainingMs: types.maybeNull(types.number),
});

/**
 * Multiplayer State Model
 * Manages multiplayer session state, players, moves, and connection status
 *
 * This store tracks:
 * - Current session/room information
 * - Players in the session
 * - Move history specific to multiplayer
 * - Connection status (transient, not persisted)
 * - Last activity timestamp
 */
const MultiplayerStateModel = types
  .model('MultiplayerState', {
    // Session identifiers
    sessionId: types.maybeNull(types.string),
    roomId: types.maybeNull(types.string),

    // Session state
    sessionState: types.optional(
      types.enumeration('SessionState', [
        'waiting',
        'active',
        'completed',
        'abandoned',
        'expired',
      ]),
      'waiting'
    ),

    // Player tracking
    localPlayerId: types.maybeNull(types.string),
    players: types.map(MultiplayerPlayerModel),

    // Move history (separate from local game moves)
    moves: types.array(MultiplayerMoveModel),

    // Connection status (transient)
    connectionStatus: types.optional(
      types.enumeration('ConnectionStatus', [
        'disconnected',
        'connecting',
        'connected',
        'error',
      ]),
      'disconnected'
    ),

    // Activity tracking
    lastActivityAt: types.optional(types.string, () => new Date().toISOString()),

    // Draw offer tracking (transient - not persisted)
    pendingDrawOffer: types.optional(types.boolean, false),
    drawOfferedBy: types.maybeNull(types.string),

    // Game result tracking
    gameResult: types.maybeNull(
      types.enumeration('GameResult', ['1-0', '0-1', '1/2-1/2', '*'])
    ),
    resultReason: types.maybeNull(types.string),
  })
  .volatile(() => ({
    // Move queue for synchronization (not persisted)
    moveQueue: createMoveQueue() as MoveQueue,
  }))
  .views((self) => ({
    get isConnected() {
      return self.connectionStatus === 'connected';
    },
    get isInSession() {
      return self.sessionId !== null && self.roomId !== null;
    },
    get localPlayer() {
      return self.localPlayerId ? self.players.get(self.localPlayerId) : null;
    },
    get remotePlayers() {
      const players: Instance<typeof MultiplayerPlayerModel>[] = [];
      self.players.forEach((player) => {
        if (player.id !== self.localPlayerId) {
          players.push(player);
        }
      });
      return players;
    },
    get moveCount() {
      return self.moves.length;
    },
    /**
     * Get player by color
     */
    getPlayerByColor(color: 'white' | 'black') {
      let foundPlayer: Instance<typeof MultiplayerPlayerModel> | null = null;
      self.players.forEach((player) => {
        if (player.color === color) {
          foundPlayer = player;
        }
      });
      return foundPlayer;
    },
    /**
     * Check if there is a pending draw offer
     */
    get hasPendingDrawOffer() {
      return self.pendingDrawOffer && self.drawOfferedBy !== null;
    },
    /**
     * Check if the local player offered the draw
     */
    get isDrawOfferedByLocalPlayer() {
      return self.pendingDrawOffer && self.drawOfferedBy === self.localPlayerId;
    },
    /**
     * Check if the draw offer is from a remote player
     */
    get isDrawOfferedByRemotePlayer() {
      return self.pendingDrawOffer && self.drawOfferedBy !== self.localPlayerId;
    },
  }))
  .actions((self) => ({
    /**
     * Set connection status
     */
    setConnectionStatus(
      status: 'disconnected' | 'connecting' | 'connected' | 'error'
    ) {
      self.connectionStatus = status;
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Join a room/session
     */
    joinRoom(
      roomId: string,
      sessionId: string,
      localPlayerId: string,
      displayName: string
    ) {
      self.roomId = roomId;
      self.sessionId = sessionId;
      self.localPlayerId = localPlayerId;
      self.sessionState = 'waiting';
      self.lastActivityAt = new Date().toISOString();

      // Add local player if not already present
      if (!self.players.has(localPlayerId)) {
        self.players.put({
          id: localPlayerId,
          displayName,
          color: null,
          isOnline: true,
          lastSeenAt: new Date().toISOString(),
        });
      }

      console.log(`[MultiplayerStore] Joined room: ${roomId}, session: ${sessionId}`);
    },

    /**
     * Leave the current room/session
     */
    leaveRoom() {
      console.log(
        `[MultiplayerStore] Leaving room: ${self.roomId}, session: ${self.sessionId}`
      );
      self.roomId = null;
      self.sessionId = null;
      self.sessionState = 'abandoned';
      self.connectionStatus = 'disconnected';
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Update session state
     */
    setSessionState(state: SessionState) {
      self.sessionState = state;
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Add or update a player
     */
    addOrUpdatePlayer(
      playerId: string,
      displayName: string,
      color?: 'white' | 'black' | null,
      isOnline?: boolean
    ) {
      const existingPlayer = self.players.get(playerId);
      if (existingPlayer) {
        existingPlayer.displayName = displayName;
        if (color !== undefined) {
          existingPlayer.color = color;
        }
        if (isOnline !== undefined) {
          existingPlayer.isOnline = isOnline;
        }
        existingPlayer.lastSeenAt = new Date().toISOString();
      } else {
        self.players.put({
          id: playerId,
          displayName,
          color: color || null,
          isOnline: isOnline ?? true,
          lastSeenAt: new Date().toISOString(),
        });
      }
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Remove a player
     */
    removePlayer(playerId: string) {
      self.players.delete(playerId);
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Add a move to the history
     */
    addMove(
      moveId: string,
      from: string,
      to: string,
      san: string,
      fen: string,
      playerId: string,
      promotion?: string,
      timeRemainingMs?: number
    ) {
      self.moves.push({
        id: moveId,
        from,
        to,
        promotion: promotion || null,
        san,
        fen,
        playerId,
        timestamp: new Date().toISOString(),
        timeRemainingMs: timeRemainingMs ?? null,
      });
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Clear all moves
     */
    clearMoves() {
      self.moves.clear();
      self.lastActivityAt = new Date().toISOString();
    },

    /**
     * Enqueue a remote move for processing
     */
    enqueueRemoteMove(
      from: string,
      to: string,
      san: string,
      fen: string,
      senderId: string,
      timestamp: string,
      promotion?: string,
      timeRemainingMs?: number
    ) {
      const payload = {
        sessionId: self.sessionId || '',
        from,
        to,
        san,
        fen,
        promotion,
        timeRemainingMs,
      };

      self.moveQueue.enqueue(payload, senderId, timestamp);
      self.lastActivityAt = new Date().toISOString();

      console.log(
        `[MultiplayerStore] Enqueued remote move: ${from}-${to} from ${senderId}`
      );
    },

    /**
     * Get the move queue for external processing
     */
    getMoveQueue(): MoveQueue {
      return self.moveQueue;
    },

    /**
     * Clear the move queue
     */
    clearMoveQueue() {
      self.moveQueue.clear();
      console.log('[MultiplayerStore] Move queue cleared');
    },

    /**
     * Offer a draw to the opponent
     */
    offerDraw() {
      if (self.pendingDrawOffer) {
        console.warn('[MultiplayerStore] Draw offer already pending');
        return false;
      }
      
      self.pendingDrawOffer = true;
      self.drawOfferedBy = self.localPlayerId;
      self.lastActivityAt = new Date().toISOString();
      console.log('[MultiplayerStore] Draw offer initiated by local player');
      return true;
    },

    /**
     * Receive a draw offer from remote player
     */
    receiveDrawOffer(playerId: string) {
      if (self.pendingDrawOffer) {
        console.warn('[MultiplayerStore] Draw offer already pending');
        return;
      }
      
      self.pendingDrawOffer = true;
      self.drawOfferedBy = playerId;
      self.lastActivityAt = new Date().toISOString();
      console.log(`[MultiplayerStore] Draw offer received from ${playerId}`);
    },

    /**
     * Accept a draw offer
     */
    acceptDraw() {
      if (!self.pendingDrawOffer) {
        console.warn('[MultiplayerStore] No pending draw offer to accept');
        return false;
      }
      
      self.pendingDrawOffer = false;
      self.drawOfferedBy = null;
      self.gameResult = '1/2-1/2';
      self.resultReason = 'Draw by agreement';
      self.sessionState = 'completed';
      self.lastActivityAt = new Date().toISOString();
      console.log('[MultiplayerStore] Draw offer accepted');
      return true;
    },

    /**
     * Decline a draw offer
     */
    declineDraw() {
      if (!self.pendingDrawOffer) {
        console.warn('[MultiplayerStore] No pending draw offer to decline');
        return false;
      }
      
      self.pendingDrawOffer = false;
      self.drawOfferedBy = null;
      self.lastActivityAt = new Date().toISOString();
      console.log('[MultiplayerStore] Draw offer declined');
      return true;
    },

    /**
     * Resign the game
     */
    resign() {
      const localPlayer = self.localPlayer;
      if (!localPlayer || !localPlayer.color) {
        console.warn('[MultiplayerStore] Cannot resign - no local player color assigned');
        return false;
      }
      
      // Determine the result based on who resigned
      self.gameResult = localPlayer.color === 'white' ? '0-1' : '1-0';
      self.resultReason = `${localPlayer.color === 'white' ? 'White' : 'Black'} resigned`;
      self.sessionState = 'completed';
      
      // Clear any pending draw offer
      self.pendingDrawOffer = false;
      self.drawOfferedBy = null;
      
      self.lastActivityAt = new Date().toISOString();
      console.log(`[MultiplayerStore] Local player resigned: ${self.gameResult}`);
      return true;
    },

    /**
     * Process a remote player's resignation
     */
    processRemoteResign(playerId: string) {
      const resigningPlayer = self.players.get(playerId);
      if (!resigningPlayer || !resigningPlayer.color) {
        console.warn('[MultiplayerStore] Cannot process resignation - player not found or no color');
        return;
      }
      
      // Determine the result based on who resigned
      self.gameResult = resigningPlayer.color === 'white' ? '0-1' : '1-0';
      self.resultReason = `${resigningPlayer.color === 'white' ? 'White' : 'Black'} resigned`;
      self.sessionState = 'completed';
      
      // Clear any pending draw offer
      self.pendingDrawOffer = false;
      self.drawOfferedBy = null;
      
      self.lastActivityAt = new Date().toISOString();
      console.log(`[MultiplayerStore] Remote player resigned: ${self.gameResult}`);
    },

    /**
     * Reset the multiplayer state to initial values
     */
    reset() {
      self.sessionId = null;
      self.roomId = null;
      self.sessionState = 'waiting';
      self.localPlayerId = null;
      self.players.clear();
      self.moves.clear();
      self.moveQueue.clear();
      self.connectionStatus = 'disconnected';
      self.pendingDrawOffer = false;
      self.drawOfferedBy = null;
      self.gameResult = null;
      self.resultReason = null;
      self.lastActivityAt = new Date().toISOString();
      console.log('[MultiplayerStore] State reset');
    },
  }));

/**
 * Root Store Model
 * Combines all store slices
 */
const RootStoreModel = types
  .model('RootStore', {
    game: GameStateModel,
    ui: UIStateModel,
    settings: SettingsModel,
    engine: EngineStateModel,
    multiplayer: MultiplayerStateModel,
  })
  .actions((self) => ({
    hydrateStore() {
      // Called after rehydration from storage
      // Can be used to restore derived state or perform migrations
      console.log('[RootStore] Store hydrated successfully');
    },
  }));

// Create default snapshot for initialization
export const createDefaultSnapshot = () => ({
  game: {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    whiteTime: 5 * 60 * 1000,
    blackTime: 5 * 60 * 1000,
    timeControl: {
      minutes: 5,
      increment: 0,
    },
    isGameOver: false,
    isTimerRunning: false,
  },
  ui: {
    isEnginePanelVisible: false,
    isEvalBarVisible: false,
    isBoardFlipped: false,
    engineDisplayMode: 'both' as const,
  },
  settings: {
    defaultTimeMinutes: 5,
    defaultTimeIncrement: 0,
    defaultEngineDepth: 22,
  },
  engine: {
    isEngineReady: false,
    isAnalyzing: false,
    analysis: [],
    currentDepth: 0,
    currentFen: '',
  },
  multiplayer: {
    sessionId: null,
    roomId: null,
    sessionState: 'waiting' as const,
    localPlayerId: null,
    players: {},
    moves: [],
    connectionStatus: 'disconnected' as const,
    lastActivityAt: new Date().toISOString(),
    pendingDrawOffer: false,
    drawOfferedBy: null,
    gameResult: null,
    resultReason: null,
  },
});

export type RootStore = Instance<typeof RootStoreModel>;
export type RootStoreSnapshot = SnapshotIn<typeof RootStoreModel>;
export type EngineAnalysis = Instance<typeof EngineAnalysisModel>;
export type MultiplayerPlayer = Instance<typeof MultiplayerPlayerModel>;
export type MultiplayerMove = Instance<typeof MultiplayerMoveModel>;

export default RootStoreModel;
