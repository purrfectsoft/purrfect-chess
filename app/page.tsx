'use client';

import { observer } from 'mobx-react-lite';
import NotificationContainer from '@/components/NotificationContainer';
import { MainLayout, GameLayout, ControlPanel } from '@/components/layout';
import { PlayerControls, BoardSection } from '@/components/features';
import RoomManager from '@/components/RoomManager';
import { useRootStore } from '@/stores/store-setup';
import { useEngine } from '@/hooks/useEngine';
import { useAutoEvaluation } from '@/hooks/useAutoEvaluation';
import { useEasterEgg } from '@/hooks/useEasterEgg';
import { useNotification } from '@/hooks/useNotification';
import { useMoveReview } from '@/hooks/useMoveReview';
import { useState, useCallback, useRef, useEffect } from 'react';

const Home = observer(() => {
  const { notifications, showMessage, dismissNotification } = useNotification();

  const handleError = useCallback(
    (error: string) => {
      showMessage('error', error);
    },
    [showMessage]
  );

  // State for editable PGN/FEN text areas
  const [pgnInput, setPgnInput] = useState('');
  const [fenInput, setFenInput] = useState('');

  // Use MobX store - access slices directly, keep references for reactivity
  const store = useRootStore();
  const engine = store.engine;

  // Initialize engine (hook manages worker lifecycle)
  const {
    isEngineReady,
    isAnalyzing,
    currentDepth,
    startAnalysis,
    stopAnalysis,
  } = useEngine({
    onError: handleError,
  });

  // Auto-start engine analysis when eval bar is visible
  useAutoEvaluation({
    startAnalysis,
    stopAnalysis,
    isEngineReady,
    depth: 15, // Use depth 15 for auto-evaluation (lighter than full analysis)
  });

  const {
    isReviewing,
    currentBadge,
    reviewStatus,
    reviewLastMove,
    clearBadge,
  } = useMoveReview();

  const { setTargetElement } = useEasterEgg({
    onReveal: () => store.ui.showEnginePanel(),
  });

  // Handle room query parameter for shareable URLs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam && !store.multiplayer.isInSession) {
      // Auto-join room from URL parameter
      showMessage('info', `Joining room ${roomParam}...`);
    }
  }, [store.multiplayer.isInSession, showMessage]);

  // Get engine highlights and best eval from store (shared global state)
  const engineHighlights = engine.engineHighlights;
  const bestEval = engine.bestEvaluation;

  // Show notifications for game-ending conditions
  const prevGameOverRef = useRef(false);
  useEffect(() => {
    const { game } = store;
    if (store.game.isGameOver && !prevGameOverRef.current) {
      // Game just ended
      if (store.game.checkmate) {
        const winner = store.game.turn === 'w' ? 'Black' : 'White';
        showMessage('info', `Checkmate! ${winner} wins! 👑`);
      } else if (store.game.stalemate) {
        showMessage('info', 'Stalemate! The game is a draw. 🤝');
      } else {
        // Timeout
        const winner = store.game.turn === 'w' ? 'Black' : 'White';
        showMessage('info', `Time out! ${winner} wins on time. ⏰`);
      }
    }
    prevGameOverRef.current = store.game.isGameOver;
  }, [
    store.game.isGameOver,
    store.game.checkmate,
    store.game.stalemate,
    store.game.turn,
    showMessage,
    store,
  ]);

  return (
    <MainLayout>
      <NotificationContainer
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      <h1 className="text-4xl font-bold text-center mb-4 text-gray-100">
        🐱 Purrfect Chess
      </h1>

      <div className="mb-6 text-center">
        <p className="text-sm text-gray-400">
          Phase X: Functional & Visual Parity Complete ✅ | Next.js Migration
          Success
        </p>
      </div>

      {/* Game Status - Fixed height to prevent layout shift */}
      <div
        className="mb-4 text-center"
        style={{
          minHeight: '3rem', // Reserve space for status messages
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {(store.game.isGameOver || store.game.check) && (
          <>
            {store.game.checkmate && (
              <div className="text-2xl font-bold text-red-600">
                Checkmate! 👑
              </div>
            )}
            {store.game.stalemate && (
              <div className="text-2xl font-bold text-yellow-600">
                Stalemate! 🤝
              </div>
            )}
            {store.game.isGameOver &&
              !store.game.checkmate &&
              !store.game.stalemate && (
                <div className="text-2xl font-bold text-orange-600">
                  Time Out! ⏰
                </div>
              )}
            {store.game.check && !store.game.checkmate && (
              <div className="text-xl font-bold text-orange-600">Check! ⚠️</div>
            )}
          </>
        )}
      </div>

      <GameLayout
        leftPanel={
          <ControlPanel title="White Controls">
            <PlayerControls player="w" showTimePresets={true} />
          </ControlPanel>
        }
        centerPanel={
          <BoardSection
            engineHighlights={engineHighlights}
            bestEval={bestEval}
            isAnalyzing={isAnalyzing}
            currentDepth={currentDepth}
            onShowMessage={showMessage}
            onReviewLastMove={reviewLastMove}
            isReviewing={isReviewing}
            reviewStatus={reviewStatus}
            currentBadge={currentBadge}
            clearBadge={clearBadge}
            setTargetElement={setTargetElement}
            onError={handleError}
          />
        }
        rightPanel={
          <>
            <ControlPanel title="Black Controls">
              <PlayerControls
                player="b"
                showMoveHistory={true}
                onShowMessage={showMessage}
                pgnInput={pgnInput}
                setPgnInput={setPgnInput}
                fenInput={fenInput}
                setFenInput={setFenInput}
              />
            </ControlPanel>
            
            {/* Multiplayer Room Manager */}
            <div className="mt-4">
              <RoomManager
                onRoomJoined={(roomId, sessionId) => {
                  showMessage('success', `Joined room: ${roomId}`);
                }}
                onShowMessage={showMessage}
              />
            </div>
          </>
        }
      />

      <div className="mt-8 text-center text-sm" style={{ color: '#999' }}>
        <p>
          <strong>Phase X Complete:</strong> Functional & visual parity achieved
          ✅ | Board rendering ✓, Piece movement ✓, Time controls ✓, Engine
          analysis ✓, Appearance controls ✓, All features validated
        </p>
        <p className="mt-2">
          <strong>Easter Egg:</strong> Select the text above and type a secret
          code to unlock hidden features...
        </p>
      </div>
    </MainLayout>
  );
});

export default Home;
