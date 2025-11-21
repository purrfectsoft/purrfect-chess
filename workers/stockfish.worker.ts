/**
 * Stockfish Web Worker
 *
 * Integrates Stockfish 17.1 with support for multiple variants.
 * Uses the chess.com maintained stockfish binaries loaded from /public/libs/
 *
 * Supported Variants:
 * - wasm: Full Multi-threaded WASM (strongest, requires CORS)
 * - single: Full Single-threaded WASM (strongest without CORS) - DEFAULT
 * - lite: Lite Multi-threaded WASM (moderate, requires CORS)
 * - lite-single: Lite Single-threaded WASM (moderate, no CORS)
 * - asm: ASM.js Fallback (weakest, universal compatibility)
 *
 * Key features:
 * - UCI protocol implementation
 * - Multi-PV analysis support
 * - Depth-based and time-based analysis
 * - Real-time analysis updates
 * - Dynamic variant selection
 */

import { parseInfoLine, parseBestMove } from '@/lib/uci-parser';
import type { UciInfoResult } from '@/lib/uci-parser';

// @ts-ignore - Worker context
const ctx: Worker = self as any;

let stockfishEngine: Worker | null = null;
let isReady = false;
let isAnalyzing = false;
let currentVariant: string = 'single'; // Track current variant

/**
 * Initialize Stockfish engine from public/libs/
 * @param variant - Variant ID to load (e.g., 'single', 'lite-single', etc.)
 */
function initStockfish(variant: string = 'single') {
  try {
    currentVariant = variant;
    console.log(
      `[Stockfish Worker] Initializing Stockfish 17.1 (variant: ${variant})...`
    );

    // Load the stockfish worker from public/libs/
    // Path format: /libs/stockfish-{variant}.js
    const workerPath = `/libs/stockfish-${variant}.js`;
    stockfishEngine = new Worker(workerPath);

    // Set up message handler
    stockfishEngine.onmessage = (event: MessageEvent) => {
      handleStockfishMessage(event.data);
    };

    stockfishEngine.onerror = (error: ErrorEvent) => {
      console.error('[Stockfish Worker] Engine error:', error);
      // Note: isReady may already be false; this ensures state consistency after error
      isReady = false;
      ctx.postMessage({
        type: 'error',
        error: `Stockfish engine error (${variant}): ` + error.message,
      });
    };

    // Send UCI init command
    sendCommand('uci');
  } catch (error) {
    console.error('[Stockfish Worker] Failed to initialize:', error);
    isReady = false;
    ctx.postMessage({
      type: 'error',
      error: `Failed to initialize Stockfish (${variant}): ` + (error as Error).message,
    });
  }
}

/**
 * Handle messages from Stockfish engine
 */
function handleStockfishMessage(message: string | { data?: string }) {
  // Handle both string messages and object messages
  const trimmed =
    typeof message === 'string' ? message.trim() : (message.data || '').trim();

  if (!trimmed) return;

  // Log raw UCI messages for debugging (commented out for production)
  // console.log('[Stockfish Worker] UCI:', trimmed);

  if (trimmed === 'uciok') {
    // Engine initialized, send isready
    sendCommand('isready');
    return;
  }

  if (trimmed === 'readyok') {
    if (!isReady) {
      isReady = true;
      console.log(
        `[Stockfish Worker] Engine ready (Stockfish 17.1 ${currentVariant})`
      );
      ctx.postMessage({ type: 'ready', variant: currentVariant });
    }
    return;
  }

  if (trimmed.startsWith('info')) {
    // Parse and forward info lines
    const parsed = parseInfoLine(trimmed);
    if (parsed) {
      ctx.postMessage({ type: 'info', data: parsed });
    }
    return;
  }

  if (trimmed.startsWith('bestmove')) {
    // Parse and forward bestmove
    const parsed = parseBestMove(trimmed);
    if (parsed) {
      isAnalyzing = false;
      ctx.postMessage({ type: 'bestmove', data: parsed });
    }
    return;
  }
}

/**
 * Send command to Stockfish engine
 */
function sendCommand(command: string) {
  if (stockfishEngine) {
    // console.log('[Stockfish Worker] Sending command:', command);
    stockfishEngine.postMessage(command);
  } else {
    console.error('[Stockfish Worker] Engine not initialized');
  }
}

/**
 * Handle messages from main thread
 */
ctx.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      // Accept variant parameter, default to 'single' if not provided
      const variant = data?.variant || 'single';
      initStockfish(variant);
      break;

    case 'analyze': {
      if (!isReady) {
        ctx.postMessage({
          type: 'error',
          error: 'Engine not ready',
        });
        return;
      }

      const { fen, depth = 16, multipv = 3, movetime = null } = data;

      console.log(
        `[Stockfish Worker] Starting analysis: depth=${depth}, multipv=${multipv}`
      );

      isAnalyzing = true;

      // Stop any ongoing analysis
      sendCommand('stop');

      // Small delay to ensure stop is processed
      setTimeout(() => {
        // Configure and start new analysis
        sendCommand('ucinewgame');
        sendCommand(`setoption name MultiPV value ${multipv}`);
        sendCommand(`position fen ${fen}`);

        if (movetime !== null && Number.isFinite(movetime) && movetime > 0) {
          sendCommand(`go movetime ${movetime}`);
        } else {
          sendCommand(`go depth ${depth}`);
        }
      }, 10);
      break;
    }

    case 'stop':
      console.log('[Stockfish Worker] Stopping analysis');
      if (isAnalyzing) {
        sendCommand('stop');
        isAnalyzing = false;
      }
      break;

    case 'command':
      // Send raw UCI command (for advanced use)
      sendCommand(data);
      break;

    default:
      console.warn('[Stockfish Worker] Unknown message type:', type);
  }
};

// Log that the worker is loaded
console.log('[Stockfish Worker] Worker script loaded');

// Notify main thread that worker is ready to receive commands
ctx.postMessage({ type: 'worker-ready' });
