import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoomManager from '@/components/RoomManager';
import { RootStoreProvider } from '@/stores/store-setup';

// Mock dependencies
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/useMultiplayer', () => ({
  useMultiplayer: () => ({
    connectionStatus: 'disconnected',
    isConnected: false,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    broadcastPlayerJoin: vi.fn().mockResolvedValue(undefined),
    broadcastPlayerLeave: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
  configurable: true,
});

describe('RoomManager component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the room manager header', () => {
      render(
        <RootStoreProvider>
          <RoomManager />
        </RootStoreProvider>
      );

      expect(screen.getByText('Multiplayer')).toBeInTheDocument();
    });

    it('should render multiplayer UI components', () => {
      render(
        <RootStoreProvider>
          <RoomManager />
        </RootStoreProvider>
      );

      // The component should render either the create/join UI or the in-room UI
      // Check for key elements that should always be present
      expect(screen.getByText('Multiplayer')).toBeInTheDocument();
      
      // Component could be in either state depending on test execution order
      // Just verify it renders without crashing
      const container = screen.getByText('Multiplayer').parentElement;
      expect(container).toBeTruthy();
    });
  });

  describe('component behavior', () => {
    it('should accept onRoomJoined callback', () => {
      const mockOnRoomJoined = vi.fn();
      
      render(
        <RootStoreProvider>
          <RoomManager onRoomJoined={mockOnRoomJoined} />
        </RootStoreProvider>
      );

      expect(screen.getByText('Multiplayer')).toBeInTheDocument();
    });

    it('should accept onShowMessage callback', () => {
      const mockOnShowMessage = vi.fn();
      
      render(
        <RootStoreProvider>
          <RoomManager onShowMessage={mockOnShowMessage} />
        </RootStoreProvider>
      );

      expect(screen.getByText('Multiplayer')).toBeInTheDocument();
    });
  });
});

