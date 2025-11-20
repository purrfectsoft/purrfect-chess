/**
 * Unit tests for ConnectionStatusBadge component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConnectionStatusBadge from '@/components/ConnectionStatusBadge';
import { RootStoreProvider, useRootStore } from '@/stores/store-setup';
import { observer } from 'mobx-react-lite';

// Helper component to set up store state for testing
const TestWrapper = observer(function TestWrapper({ 
  children, 
  setupStore 
}: { 
  children: React.ReactNode;
  setupStore?: (store: ReturnType<typeof useRootStore>) => void;
}) {
  const store = useRootStore();
  
  if (setupStore) {
    setupStore(store);
  }
  
  return <>{children}</>;
});

describe('ConnectionStatusBadge', () => {
  const renderWithStore = (props = {}, setupStore?: (store: any) => void) => {
    return render(
      <RootStoreProvider>
        <TestWrapper setupStore={setupStore}>
          <ConnectionStatusBadge {...props} />
        </TestWrapper>
      </RootStoreProvider>
    );
  };

  describe('Visibility', () => {
    it('should not render when not in a multiplayer session', () => {
      const { container } = renderWithStore();
      expect(container.firstChild).toBeNull();
    });

    it('should render when in a multiplayer session', () => {
      renderWithStore({}, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
      });
      
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('Connection Status Display', () => {
    it('should display disconnected status', () => {
      renderWithStore({}, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('disconnected');
      });
      
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.getByText('⚫')).toBeInTheDocument();
    });

    it('should display connecting status', () => {
      renderWithStore({}, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connecting');
      });
      
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      expect(screen.getByText('🟡')).toBeInTheDocument();
    });

    it('should display connected status', () => {
      renderWithStore({}, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('🟢')).toBeInTheDocument();
    });

    it('should display error status', () => {
      renderWithStore({}, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('error');
      });
      
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
      expect(screen.getByText('🔴')).toBeInTheDocument();
    });
  });

  describe('Reconnect Button', () => {
    it('should show reconnect button when disconnected and callback provided', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('disconnected');
      });
      
      expect(screen.getByText('🔄 Reconnect')).toBeInTheDocument();
    });

    it('should show reconnect button when in error state and callback provided', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('error');
      });
      
      expect(screen.getByText('🔄 Reconnect')).toBeInTheDocument();
    });

    it('should not show reconnect button when connected', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      
      expect(screen.queryByText('🔄 Reconnect')).not.toBeInTheDocument();
    });

    it('should not show reconnect button when connecting', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connecting');
      });
      
      expect(screen.queryByText('🔄 Reconnect')).not.toBeInTheDocument();
    });

    it('should not show reconnect button when showReconnectButton is false', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect, showReconnectButton: false }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('disconnected');
      });
      
      expect(screen.queryByText('🔄 Reconnect')).not.toBeInTheDocument();
    });

    it('should call onReconnect when reconnect button is clicked', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('disconnected');
      });
      
      const button = screen.getByText('🔄 Reconnect');
      fireEvent.click(button);
      
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Size Variants', () => {
    it('should render with small size', () => {
      const { container } = renderWithStore({ size: 'sm' }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      expect(container.querySelector('div[style*="font-size"]')).toBeInTheDocument();
    });

    it('should render with medium size (default)', () => {
      const { container } = renderWithStore({ size: 'md' }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      expect(container.querySelector('div[style*="font-size"]')).toBeInTheDocument();
    });

    it('should render with large size', () => {
      const { container } = renderWithStore({ size: 'lg' }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      expect(container.querySelector('div[style*="font-size"]')).toBeInTheDocument();
    });
  });

  describe('Position Variants', () => {
    it('should render inline (default)', () => {
      const { container } = renderWithStore({ position: 'inline' }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).not.toMatch(/fixed/);
    });

    it('should render floating', () => {
      const { container } = renderWithStore({ position: 'floating' }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('connected');
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).toMatch(/fixed/);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible reconnect button', () => {
      const onReconnect = vi.fn();
      renderWithStore({ onReconnect }, (store) => {
        store.multiplayer.joinRoom('room-1', 'session-1', 'player-1', 'Test Player');
        store.multiplayer.setConnectionStatus('disconnected');
      });
      
      const button = screen.getByLabelText('Reconnect to multiplayer session');
      expect(button).toBeInTheDocument();
    });
  });
});
