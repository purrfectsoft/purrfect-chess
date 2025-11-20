'use client';

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';

/**
 * Connection status badge props
 */
export interface ConnectionStatusBadgeProps {
  /** Callback when user clicks reconnect button */
  onReconnect?: () => void;
  /** Whether to show the reconnect button */
  showReconnectButton?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Position variant */
  position?: 'inline' | 'floating';
}

/**
 * ConnectionStatusBadge Component
 * 
 * Displays the current connection status to the Supabase Realtime channel
 * and provides manual reconnection option.
 * 
 * Features:
 * - Visual indicator with color coding (green/yellow/red/gray)
 * - Connection status text (Connected/Connecting/Disconnected/Error)
 * - Optional reconnect button when disconnected or in error state
 * - Responsive sizing options
 */
const ConnectionStatusBadge = observer(function ConnectionStatusBadge({
  onReconnect,
  showReconnectButton = true,
  size = 'md',
  position = 'inline',
}: ConnectionStatusBadgeProps) {
  const store = useRootStore();
  const multiplayer = store.multiplayer;
  
  // Only show if in a multiplayer session
  if (!multiplayer.isInSession) {
    return null;
  }

  const status = multiplayer.connectionStatus;
  const isConnected = multiplayer.isConnected;
  
  // Status configuration
  const statusConfig = {
    connected: {
      color: '#4CAF50',
      bgColor: '#e8f5e9',
      icon: '🟢',
      text: 'Connected',
      pulse: false,
    },
    connecting: {
      color: '#ff9800',
      bgColor: '#fff3e0',
      icon: '🟡',
      text: 'Connecting...',
      pulse: true,
    },
    disconnected: {
      color: '#9e9e9e',
      bgColor: '#f5f5f5',
      icon: '⚫',
      text: 'Disconnected',
      pulse: false,
    },
    error: {
      color: '#f44336',
      bgColor: '#ffebee',
      icon: '🔴',
      text: 'Connection Error',
      pulse: true,
    },
  };

  const config = statusConfig[status];
  
  // Size configuration
  const sizeConfig = {
    sm: {
      fontSize: '12px',
      padding: '4px 8px',
      iconSize: '10px',
      gap: '4px',
    },
    md: {
      fontSize: '14px',
      padding: '6px 12px',
      iconSize: '12px',
      gap: '6px',
    },
    lg: {
      fontSize: '16px',
      padding: '8px 16px',
      iconSize: '14px',
      gap: '8px',
    },
  };

  const sizing = sizeConfig[size];
  
  // Show reconnect button if disconnected or error and callback provided
  const showReconnect = showReconnectButton && 
    onReconnect && 
    (status === 'disconnected' || status === 'error');

  return (
    <div
      className={`flex items-center ${position === 'floating' ? 'fixed top-4 right-4 z-50' : ''}`}
      style={{
        gap: sizing.gap,
      }}
    >
      {/* Status badge */}
      <div
        className="flex items-center rounded-full font-semibold transition-all"
        style={{
          background: config.bgColor,
          color: config.color,
          padding: sizing.padding,
          fontSize: sizing.fontSize,
          gap: sizing.gap,
          animation: config.pulse ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
        }}
      >
        <span style={{ fontSize: sizing.iconSize }}>{config.icon}</span>
        <span>{config.text}</span>
      </div>

      {/* Reconnect button */}
      {showReconnect && (
        <button
          onClick={onReconnect}
          className="rounded font-semibold transition-all"
          style={{
            background: '#2196F3',
            color: '#fff',
            padding: sizing.padding,
            fontSize: sizing.fontSize,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)';
          }}
          aria-label="Reconnect to multiplayer session"
        >
          🔄 Reconnect
        </button>
      )}
    </div>
  );
});

export default ConnectionStatusBadge;
