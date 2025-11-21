'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { UciInfoResult } from '@/lib/uci-parser';
import { useRootStore } from '@/stores/store-setup';
import type { EngineAnalysis } from '@/stores/root-store';

/**
 * Custom hook for managing Stockfish chess engine
 *
 * IMPORTANT: This hook shares global state via the root store.
 * Multiple invocations of this hook will access the SAME engine state.
 * This ensures that engine analysis is accessible across all components.
 *
 * Integrates with the stockfish npm package via Web Worker
 * Provides real-time analysis with multi-PV support
 */

interface UseEngineOptions {
  onError?: (error: string) => void;
}

interface UseEngineReturn {
  isEngineReady: boolean;
  isAnalyzing: boolean;
  analysis: EngineAnalysis[];
  currentDepth: number;
  startAnalysis: (fen: string, depth?: number, multipv?: number) => void;
  stopAnalysis: () => void;
  setDepth: (depth: number) => void;
}

export function useEngine(options: UseEngineOptions = {}): UseEngineReturn {
  const { onError } = options;

  // Access shared engine state from root store
  const store = useRootStore();
  const engine = store.engine;

  // Local state for depth preference (not shared)
  const [depth, setDepth] = useState(15);

  // Worker is managed globally (singleton pattern)
  const workerRef = useRef<Worker | null>(null);
  const analysisMapRef = useRef<Map<number, Partial<EngineAnalysis>>>(
    new Map()
  );
  const onErrorRef = useRef(onError);

  // Keep onError ref up to date
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const convertUciToSan = useCallback(
    (fen: string, uciMove: string): string => {
      try {
        const game = new Chess(fen);
        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion =
          uciMove.length > 4 ? uciMove.slice(4).toLowerCase() : undefined;

        const move = game.move({ from, to, promotion });
        return move ? move.san : uciMove;
      } catch (error) {
        return uciMove;
      }
    },
    []
  );

  const convertPvToSan = useCallback(
    (fen: string, pvMoves: string[]): string[] => {
      const sanMoves: string[] = [];
      const game = new Chess(fen);

      for (const uciMove of pvMoves) {
        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion =
          uciMove.length > 4 ? uciMove.slice(4).toLowerCase() : undefined;

        try {
          const move = game.move({ from, to, promotion });
          if (move) {
            sanMoves.push(move.san);
          } else {
            break;
          }
        } catch (error) {
          break;
        }
      }

      return sanMoves;
    },
    []
  );

  const handleWorkerMessage = useCallback(
    (message: any) => {
      // Use a helper to update MST store from async callback
      // This ensures all MST mutations happen synchronously in the React render cycle
      const updateStore = (fn: () => void) => {
        // Schedule the update for the next tick to avoid MST "not in initializing phase" errors
        setTimeout(fn, 0);
      };

      switch (message.type) {
        case 'ready':
          console.log('[useEngine] Engine ready');
          updateStore(() => engine.setEngineReady(true));
          break;

        case 'info': {
          const info: UciInfoResult = message.data;

          // Update current depth in store
          if (info.depth !== null) {
            updateStore(() => engine.setCurrentDepth(info.depth));
          }

          // Process multi-PV lines
          if (info.multipv !== null && info.pv && info.pvLine && info.score) {
            const pvMoves = info.pvLine.split(' ');
            const pvSan = convertPvToSan(engine.currentFen, pvMoves);

            // Normalize score based on side to move
            const fen = engine.currentFen;
            const turn = new Chess(fen).turn();
            let normalizedScore = info.score.value;

            if (info.score.type === 'cp' || info.score.type === 'mate') {
              if (turn === 'b') {
                normalizedScore = -normalizedScore;
              }
            }

            const analysis = {
              multipv: info.multipv,
              depth: info.depth || 0,
              score: normalizedScore,
              scoreType: info.score.type,
              bestMove: info.pv,
              san: convertUciToSan(fen, info.pv),
              pv: pvMoves,
              pvSan: pvSan,
            };

            // Update analysis in store (schedule for next tick)
            updateStore(() => engine.updateAnalysisLine(analysis));
          }
          break;
        }

        case 'bestmove':
          console.log('[useEngine] Analysis complete');
          updateStore(() => engine.setAnalyzing(false));
          break;

        case 'error':
          console.error('[useEngine] Engine error:', message.error);
          updateStore(() => engine.setAnalyzing(false));
          if (onErrorRef.current) {
            onErrorRef.current(message.error || 'Engine analysis failed.');
          }
          break;

        default:
          // Ignore unknown messages
          break;
      }
    },
    [convertUciToSan, convertPvToSan, engine]
  );

  // Initialize worker once globally
  useEffect(() => {
    // Only initialize if not already initialized
    if (workerRef.current) {
      return;
    }

    try {
      console.log('[useEngine] Initializing Stockfish worker...');

      const worker = new Worker(
        new URL('../workers/stockfish.worker.ts', import.meta.url)
      );

      worker.onmessage = (event) => {
        handleWorkerMessage(event.data);
      };

      worker.onerror = (error) => {
        console.error('[useEngine] Worker error:', error);
        engine.setEngineReady(false);
        engine.setAnalyzing(false);
        if (onErrorRef.current) {
          onErrorRef.current('Engine worker error occurred');
        }
      };

      // Pass selected variant to worker init
      worker.postMessage({
        type: 'init',
        data: { variant: engine.selectedVariant },
      });
      workerRef.current = worker;

      return () => {
        console.log('[useEngine] Terminating worker...');
        worker.terminate();
        workerRef.current = null;
      };
    } catch (error) {
      console.error(
        '[useEngine] Failed to initialize Stockfish worker:',
        error
      );
      engine.setEngineReady(false);
      if (onErrorRef.current) {
        onErrorRef.current('Unable to initialize Stockfish.');
      }
    }
  }, [handleWorkerMessage, engine]);

  // Handle variant changes - restart worker with new variant
  const prevVariantRef = useRef(engine.selectedVariant);
  useEffect(() => {
    // Only restart if variant actually changed and worker is initialized
    if (
      workerRef.current &&
      prevVariantRef.current !== engine.selectedVariant
    ) {
      console.log(
        `[useEngine] Variant changed from ${prevVariantRef.current} to ${engine.selectedVariant}, restarting worker...`
      );

      // Terminate old worker
      workerRef.current.terminate();
      workerRef.current = null;

      // Reset engine state
      engine.setEngineReady(false);
      engine.setAnalyzing(false);
      engine.clearAnalysis();

      // Create new worker with new variant
      try {
        const worker = new Worker(
          new URL('../workers/stockfish.worker.ts', import.meta.url)
        );

        worker.onmessage = (event) => {
          handleWorkerMessage(event.data);
        };

        worker.onerror = (error) => {
          console.error('[useEngine] Worker error:', error);
          engine.setEngineReady(false);
          engine.setAnalyzing(false);
          if (onErrorRef.current) {
            onErrorRef.current('Engine worker error occurred');
          }
        };

        worker.postMessage({
          type: 'init',
          data: { variant: engine.selectedVariant },
        });
        workerRef.current = worker;

        prevVariantRef.current = engine.selectedVariant;
      } catch (error) {
        console.error('[useEngine] Failed to restart worker:', error);
        engine.setEngineReady(false);
        if (onErrorRef.current) {
          onErrorRef.current('Unable to restart Stockfish.');
        }
      }
    }
  }, [engine.selectedVariant, handleWorkerMessage, engine]);

  const startAnalysis = useCallback(
    (fen: string, analysisDepth?: number, multipv: number = 3) => {
      const targetDepth = analysisDepth || depth;

      if (!engine.isEngineReady) {
        console.warn('[useEngine] Engine not ready');
        if (onErrorRef.current) {
          onErrorRef.current('Engine is not ready yet.');
        }
        return;
      }

      if (!workerRef.current) {
        console.warn('[useEngine] Worker not initialized');
        if (onErrorRef.current) {
          onErrorRef.current('Engine worker not initialized.');
        }
        return;
      }

      console.log(
        `[useEngine] Starting analysis: FEN=${fen.slice(0, 30)}..., Depth=${targetDepth}, MultiPV=${multipv}`
      );

      // Reset analysis state in store
      engine.setCurrentFen(fen);
      engine.clearAnalysis();
      engine.setAnalyzing(true);
      analysisMapRef.current.clear();

      workerRef.current.postMessage({
        type: 'analyze',
        data: { fen, depth: targetDepth, multipv },
      });
    },
    [engine, depth]
  );

  const stopAnalysis = useCallback(() => {
    console.log('[useEngine] Stopping analysis');

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
    }

    engine.setAnalyzing(false);
  }, [engine]);

  // Return store state + local actions
  return {
    isEngineReady: engine.isEngineReady,
    isAnalyzing: engine.isAnalyzing,
    analysis: engine.analysis.slice() as EngineAnalysis[], // Return array copy with proper type
    currentDepth: engine.currentDepth,
    startAnalysis,
    stopAnalysis,
    setDepth,
  };
}
