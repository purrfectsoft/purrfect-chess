import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';

describe('useBeforeUnload hook', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should register beforeunload event listener when enabled', () => {
      renderHook(() => useBeforeUnload({ enabled: true }));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should not register event listener when disabled', () => {
      renderHook(() => useBeforeUnload({ enabled: false }));

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should register event listener by default', () => {
      renderHook(() => useBeforeUnload());

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });
  });

  describe('cleanup', () => {
    it('should unregister event listener on unmount', () => {
      const { unmount } = renderHook(() => useBeforeUnload({ enabled: true }));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should not unregister event listener if not registered', () => {
      const { unmount } = renderHook(() => useBeforeUnload({ enabled: false }));

      unmount();

      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('callback execution', () => {
    it('should execute onBeforeUnload callback when event is triggered', () => {
      const onBeforeUnload = vi.fn();
      
      renderHook(() => useBeforeUnload({ onBeforeUnload }));

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });

    it('should not execute callback when disabled', () => {
      const onBeforeUnload = vi.fn();
      
      renderHook(() => useBeforeUnload({ enabled: false, onBeforeUnload }));

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(onBeforeUnload).not.toHaveBeenCalled();
    });

    it('should handle async callbacks with warning', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const asyncCallback = vi.fn().mockResolvedValue(undefined);
      
      renderHook(() => useBeforeUnload({ onBeforeUnload: asyncCallback }));

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(asyncCallback).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Async callbacks may not complete')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle errors in callback gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      renderHook(() => useBeforeUnload({ onBeforeUnload: errorCallback }));

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(errorCallback).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in beforeunload callback'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('confirmation dialog', () => {
    it('should set returnValue when message is provided', () => {
      const message = 'Are you sure you want to leave?';
      
      renderHook(() => useBeforeUnload({ message }));

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.returnValue).toBe(message);
    });

    it('should not set returnValue when message is not provided', () => {
      renderHook(() => useBeforeUnload());

      // Simulate beforeunload event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.returnValue).toBeUndefined();
    });
  });

  describe('manual trigger', () => {
    it('should provide triggerBeforeUnload function', () => {
      const { result } = renderHook(() => useBeforeUnload());

      expect(result.current.triggerBeforeUnload).toBeDefined();
      expect(typeof result.current.triggerBeforeUnload).toBe('function');
    });

    it('should execute callback when manually triggered', () => {
      const onBeforeUnload = vi.fn();
      const { result } = renderHook(() => useBeforeUnload({ onBeforeUnload }));

      result.current.triggerBeforeUnload();

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });

    it('should not throw if callback is not provided', () => {
      const { result } = renderHook(() => useBeforeUnload());

      expect(() => {
        result.current.triggerBeforeUnload();
      }).not.toThrow();
    });
  });

  describe('callback updates', () => {
    it('should use the latest callback when it changes', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      const { rerender } = renderHook(
        ({ cb }) => useBeforeUnload({ onBeforeUnload: cb }),
        { initialProps: { cb: callback1 } }
      );

      // Update the callback
      rerender({ cb: callback2 });

      // Trigger event
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
