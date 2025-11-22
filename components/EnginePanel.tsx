'use client';

import { useEngine } from '@/hooks/useEngine';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';
import EngineVariantSelector from './EngineVariantSelector';
import { getVariantById } from '@/lib/stockfish-variants';

/**
 * Engine Analysis Panel Component (Legacy-compatible version)
 *
 * Displays Stockfish engine analysis with multi-PV support
 * Shows top engine lines with evaluations and principal variations
 * Matches legacy appearance from src/ui.ts
 *
 * Uses MobX observer for efficient reactivity - MobX automatically optimizes
 * re-renders via proxies, no manual throttling needed
 */

interface EngineLineProps {
  multipv: number;
}

/**
 * EngineLine component - accesses store directly for late binding
 * This ensures single source of truth and proper MobX observable tracking
 */

// Lineage colors matching legacy (blue, green, purple/pink) - memoized outside component
const LINEAGE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.6)' }, // blue for #1
  { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.6)' }, // green for #2
  { bg: 'rgba(244, 114, 182, 0.15)', border: 'rgba(244, 114, 182, 0.6)' }, // pink for #3
];

const EngineLine = observer(function EngineLine({ multipv }: EngineLineProps) {
  // Access store as late as possible - single source of truth
  const store = useRootStore();
  const engine = store.engine;

  // Find the analysis line for this multipv
  const analysis = engine.analysis.find((a) => a.multipv === multipv);

  if (!analysis) return null;

  const formatScore = (score: number, scoreType: string) => {
    if (scoreType === 'mate') {
      return score > 0 ? `+M${score}` : `-M${Math.abs(score)}`;
    }
    // Convert centipawns to pawns with sign
    const pawns = (score / 100).toFixed(2);
    return score > 0 ? `+${pawns}` : pawns;
  };

  const scoreColor = (score: number) => {
    if (Math.abs(score) < 50) return '#c8c8c8';
    return score > 0 ? '#10b981' : '#ef4444';
  };

  // multipv is 1-based, array index is 0-based
  const index = multipv - 1;
  const colors = LINEAGE_COLORS[index] || {
    bg: 'rgba(100, 100, 100, 0.1)',
    border: 'rgba(100, 100, 100, 0.4)',
  };

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1.5"
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        boxShadow: 'inset 0 2px 5px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        className="flex items-center justify-between text-xs uppercase tracking-wider"
        style={{ color: '#c8c8c8' }}
      >
        <span>#{multipv}</span>
        <span>depth {analysis.depth}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-lg font-bold"
          style={{ color: scoreColor(analysis.score) }}
        >
          {formatScore(analysis.score, analysis.scoreType)}
        </span>
        <span className="text-base font-semibold" style={{ color: '#fff' }}>
          {analysis.san}
        </span>
      </div>
      {analysis.hasPvSan && (
        <div className="text-sm" style={{ color: '#8f8f8f' }}>
          {analysis.pvSanPreview}
        </div>
      )}
    </div>
  );
});

/**
 * EnginePanel component - uses MobX observer for automatic optimization
 * No manual throttling needed - MobX handles this via proxies
 */
const EnginePanel = observer(function EnginePanel() {
  const store = useRootStore();
  const ui = store.ui;
  const game = store.game;
  const engine = store.engine;

  const { isEngineReady, isAnalyzing, startAnalysis, stopAnalysis } =
    useEngine();

  const [depth, setDepth] = useState(18);

  const handleAnalyzeClick = () => {
    const fen = game.fen;
    if (isAnalyzing) {
      stopAnalysis();
    } else {
      startAnalysis(fen, depth, 3);
    }
  };

  const handleClose = () => {
    if (isAnalyzing) {
      stopAnalysis();
    }
    ui.hideEnginePanel();
  };

  const handleOverlayModeChange = (mode: 'squares' | 'arrows' | 'both') => {
    ui.setEngineDisplayMode(mode);
  };

  return (
    <div
      className="w-full rounded-xl p-4"
      style={{
        background: '#2f2f2f',
        border: '1px solid #575757',
        boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Header with Close button (matching legacy) */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ color: '#f0f0f0' }}>
          Engine Analysis
        </h3>
        <button
          onClick={handleClose}
          className="px-3 py-1.5 text-sm rounded-lg font-semibold transition-all"
          style={{
            background: '#555',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#666')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#555')}
        >
          Close
        </button>
      </div>

      {/* Variant Selector */}
      <EngineVariantSelector />

      {/* Depth Control (matching legacy) */}
      <label className="grid grid-cols-[auto_auto_1fr] items-center gap-2 mb-4 text-sm">
        <span style={{ color: '#dcdcdc' }}>Search Depth:</span>
        <span
          className="font-semibold min-w-[2rem] text-center"
          style={{ color: '#f0f0f0' }}
        >
          {depth}
        </span>
        <input
          type="range"
          min="6"
          max="30"
          step="1"
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value, 10))}
          className="w-full"
          style={{
            accentColor: '#9198e5',
          }}
        />
      </label>

      {/* Start/Stop Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleAnalyzeClick}
          disabled={!isEngineReady || isAnalyzing}
          className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all"
          style={{
            background:
              isEngineReady && !isAnalyzing
                ? 'linear-gradient(135deg, #e66465, #9198e5)'
                : '#555',
            color: '#fff',
            border: 'none',
            cursor: isEngineReady && !isAnalyzing ? 'pointer' : 'not-allowed',
            boxShadow:
              isEngineReady && !isAnalyzing
                ? '0 6px 18px rgba(230, 100, 101, 0.35)'
                : 'none',
          }}
        >
          Start Analysis
        </button>
        <button
          onClick={() => stopAnalysis()}
          disabled={!isAnalyzing}
          className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all"
          style={{
            background: isAnalyzing ? '#dc2626' : '#555',
            color: '#fff',
            border: 'none',
            cursor: isAnalyzing ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (isAnalyzing) e.currentTarget.style.background = '#b91c1c';
          }}
          onMouseLeave={(e) => {
            if (isAnalyzing) e.currentTarget.style.background = '#dc2626';
          }}
        >
          Stop
        </button>
      </div>

      {/* Overlay Controls (matching legacy) */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-sm" style={{ color: '#dcdcdc' }}>
          Overlay:
        </span>
        <div className="flex gap-2 flex-wrap">
          {(['squares', 'arrows', 'both'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleOverlayModeChange(mode)}
              className="px-4 py-1.5 text-sm rounded-lg font-semibold transition-all min-w-[96px]"
              style={{
                background:
                  ui.engineDisplayModeValue === mode
                    ? 'linear-gradient(135deg, #e66465, #9198e5)'
                    : '#555',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow:
                  ui.engineDisplayModeValue === mode
                    ? '0 6px 18px rgba(230, 100, 101, 0.35)'
                    : 'none',
              }}
              onMouseEnter={(e) => {
                if (ui.engineDisplayModeValue !== mode)
                  e.currentTarget.style.background = '#666';
              }}
              onMouseLeave={(e) => {
                if (ui.engineDisplayModeValue !== mode)
                  e.currentTarget.style.background = '#555';
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Engine Status */}
      <div className="mb-3 text-sm">
        {!isEngineReady && (
          <div className="flex items-center gap-2" style={{ color: '#999' }}>
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            Initializing Stockfish...
          </div>
        )}
        {isEngineReady && !isAnalyzing && (
          <div style={{ color: '#4ade80' }}>✓ Engine ready</div>
        )}
        {isAnalyzing && (
          <div className="flex items-center gap-2" style={{ color: '#60a5fa' }}>
            <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full" />
            Analyzing... (depth {engine.currentDepth})
          </div>
        )}
      </div>

      {/* Analysis Lines */}
      <div
        className="rounded-lg overflow-hidden p-2.5"
        style={{
          background: '#1f1f1f',
          border: '1px solid #444',
        }}
      >
        {engine.analysis.length === 0 ? (
          <div className="p-4 text-center text-sm" style={{ color: '#999' }}>
            {isAnalyzing
              ? 'Computing best moves...'
              : isEngineReady
                ? 'Click Start Analysis to begin'
                : 'Waiting for engine...'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {engine.analysis.map((line) => (
              <EngineLine key={line.multipv} multipv={line.multipv} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-center" style={{ color: '#999' }}>
        Powered by Stockfish 17 ({getVariantById(engine.selectedVariant)?.name || `Unknown variant: ${engine.selectedVariant}`})
      </div>
    </div>
  );
});

export default EnginePanel;
