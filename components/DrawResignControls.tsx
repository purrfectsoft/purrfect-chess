'use client';

import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';

interface DrawResignControlsProps {
  /** Callback to broadcast draw offer */
  onOfferDraw?: () => void;
  /** Callback to broadcast draw response */
  onDrawResponse?: (accepted: boolean) => void;
  /** Callback to broadcast resignation */
  onResign?: () => void;
  /** Callback to show messages */
  onShowMessage?: (type: 'success' | 'error' | 'info', message: string) => void;
}

/**
 * DrawResignControls Component
 * 
 * Provides UI for players to:
 * - Offer a draw to the opponent
 * - Accept or decline a draw offer
 * - Resign the game
 * 
 * Features:
 * - Confirmation modal for resignation
 * - Visual indicators for pending draw offers
 * - Disable controls when game is over
 * - Only shows in multiplayer sessions
 */
const DrawResignControls = observer(function DrawResignControls({
  onOfferDraw,
  onDrawResponse,
  onResign,
  onShowMessage,
}: DrawResignControlsProps) {
  const store = useRootStore();
  const multiplayer = store.multiplayer;
  const game = store.game;

  const [showResignConfirm, setShowResignConfirm] = useState(false);

  // All hooks must be called before any conditional returns
  const handleOfferDraw = useCallback(() => {
    if (multiplayer.hasPendingDrawOffer) {
      onShowMessage?.('info', 'A draw offer is already pending');
      return;
    }

    const success = multiplayer.offerDraw();
    if (success) {
      onOfferDraw?.();
      onShowMessage?.('success', 'Draw offer sent to opponent');
    }
  }, [multiplayer, onOfferDraw, onShowMessage]);

  const handleAcceptDraw = useCallback(() => {
    const success = multiplayer.acceptDraw();
    if (success) {
      onDrawResponse?.(true);
      onShowMessage?.('info', 'Draw accepted! Game ended in a draw 🤝');
    }
  }, [multiplayer, onDrawResponse, onShowMessage]);

  const handleDeclineDraw = useCallback(() => {
    const success = multiplayer.declineDraw();
    if (success) {
      onDrawResponse?.(false);
      onShowMessage?.('info', 'Draw offer declined');
    }
  }, [multiplayer, onDrawResponse, onShowMessage]);

  const handleResignClick = useCallback(() => {
    setShowResignConfirm(true);
  }, []);

  const handleConfirmResign = useCallback(() => {
    const success = multiplayer.resign();
    if (success) {
      onResign?.();
      setShowResignConfirm(false);
      const winner = multiplayer.localPlayer?.color === 'white' ? 'Black' : 'White';
      onShowMessage?.('info', `You resigned. ${winner} wins! 👑`);
    } else {
      onShowMessage?.('error', 'Unable to resign at this time');
    }
  }, [multiplayer, onResign, onShowMessage]);

  const handleCancelResign = useCallback(() => {
    setShowResignConfirm(false);
  }, []);

  // Don't show controls if not in a multiplayer session
  if (!multiplayer.isInSession) {
    return null;
  }

  // Don't show controls if game is already over
  const isGameOver = multiplayer.sessionState === 'completed' || game.isGameOver;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg" style={{ background: '#2a2a2a' }}>
      <h4 className="text-md font-bold text-gray-100">Game Actions</h4>

      {/* Show draw offer controls */}
      {multiplayer.isDrawOfferedByRemotePlayer && !isGameOver && (
        <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#3a3a3a' }}>
          <div className="text-sm text-yellow-400 font-semibold mb-1">
            🤝 Your opponent offers a draw
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptDraw}
              className="flex-1 px-3 py-2 rounded font-semibold text-sm transition-all"
              style={{
                background: '#4CAF50',
                color: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              ✓ Accept Draw
            </button>
            <button
              onClick={handleDeclineDraw}
              className="flex-1 px-3 py-2 rounded font-semibold text-sm transition-all"
              style={{
                background: '#f44336',
                color: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              ✗ Decline
            </button>
          </div>
        </div>
      )}

      {/* Show waiting message if local player offered draw */}
      {multiplayer.isDrawOfferedByLocalPlayer && !isGameOver && (
        <div className="p-3 rounded text-sm text-yellow-300" style={{ background: '#3a3a3a' }}>
          ⏳ Waiting for opponent to respond to your draw offer...
        </div>
      )}

      {/* Regular action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleOfferDraw}
          disabled={isGameOver || multiplayer.hasPendingDrawOffer}
          className="flex-1 px-3 py-2 rounded font-semibold text-sm transition-all"
          style={{
            background: isGameOver || multiplayer.hasPendingDrawOffer ? '#444' : '#2196F3',
            color: '#fff',
            cursor: isGameOver || multiplayer.hasPendingDrawOffer ? 'not-allowed' : 'pointer',
            opacity: isGameOver || multiplayer.hasPendingDrawOffer ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isGameOver && !multiplayer.hasPendingDrawOffer) {
              e.currentTarget.style.filter = 'brightness(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)';
          }}
        >
          🤝 Offer Draw
        </button>
        <button
          onClick={handleResignClick}
          disabled={isGameOver}
          className="flex-1 px-3 py-2 rounded font-semibold text-sm transition-all"
          style={{
            background: isGameOver ? '#444' : '#ff5722',
            color: '#fff',
            cursor: isGameOver ? 'not-allowed' : 'pointer',
            opacity: isGameOver ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isGameOver) {
              e.currentTarget.style.filter = 'brightness(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)';
          }}
        >
          🏳️ Resign
        </button>
      </div>

      {/* Resign confirmation modal */}
      {showResignConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0, 0, 0, 0.7)' }}
          onClick={handleCancelResign}
        >
          <div
            className="p-6 rounded-lg max-w-md w-full mx-4"
            style={{ background: '#2a2a2a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-100 mb-4">
              Confirm Resignation
            </h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to resign? This will end the game immediately and your opponent will win.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmResign}
                className="flex-1 px-4 py-2 rounded font-semibold text-sm transition-all"
                style={{
                  background: '#f44336',
                  color: '#fff',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
              >
                Yes, Resign
              </button>
              <button
                onClick={handleCancelResign}
                className="flex-1 px-4 py-2 rounded font-semibold text-sm transition-all"
                style={{
                  background: '#555',
                  color: '#fff',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show game result if completed */}
      {isGameOver && multiplayer.gameResult && (
        <div className="p-3 rounded text-sm font-semibold" style={{ background: '#3a3a3a' }}>
          <div className="text-green-400 mb-1">Game Over</div>
          <div className="text-gray-300">
            Result: {multiplayer.gameResult}
          </div>
          {multiplayer.resultReason && (
            <div className="text-gray-400 text-xs mt-1">
              {multiplayer.resultReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default DrawResignControls;
