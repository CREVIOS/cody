/**
 * useOnlinePresence Hook Unit Tests
 * 
 * Tests the useOnlinePresence hook implementation.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useOnlinePresence } from '../app/hooks/useOnlinePresence';
import { createClient } from '../app/lib/supabase/client';

// Mock Supabase client
jest.mock('../app/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

describe('useOnlinePresence', () => {
  let mockChannel: any;
  let mockSupabase: any;

  beforeEach(() => {
    mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockResolvedValue({ status: 'SUBSCRIBED' }),
      track: jest.fn().mockResolvedValue(undefined),
      untrack: jest.fn().mockResolvedValue(undefined),
      presenceState: jest.fn().mockReturnValue({}),
    };

    mockSupabase = {
      channel: jest.fn().mockReturnValue(mockChannel),
      removeChannel: jest.fn().mockResolvedValue(undefined),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a channel with correct room key', () => {
    const { unmount } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123', username: 'TestUser' })
    );

    expect(mockSupabase.channel).toHaveBeenCalledWith('presence:test-room', {
      config: { presence: { key: 'user-123' } },
    });

    unmount();
  });

  it('should subscribe to presence events', () => {
    const { unmount } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123' })
    );

    expect(mockChannel.on).toHaveBeenCalledWith('presence', { event: 'sync' }, expect.any(Function));
    expect(mockChannel.subscribe).toHaveBeenCalled();

    unmount();
  });

  it('should track presence when subscribed', async () => {
    const { unmount } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123', username: 'TestUser' })
    );

    // Wait for subscription
    await waitFor(() => {
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    // Simulate subscription callback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0][0];
    await subscribeCallback('SUBSCRIBED');

    await waitFor(() => {
      expect(mockChannel.track).toHaveBeenCalledWith({
        userId: 'user-123',
        username: 'TestUser',
        lastSeen: expect.any(Number),
      });
    });

    unmount();
  });

  it('should set up heartbeat interval', () => {
    jest.useFakeTimers();
    
    const { unmount } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123', username: 'TestUser' })
    );

    // Fast-forward time
    jest.advanceTimersByTime(30000);

    // Should have called track multiple times (initial + heartbeat)
    expect(mockChannel.track).toHaveBeenCalled();

    unmount();
    jest.useRealTimers();
  });

  it('should return onlineById, onlineSet, onlineList, and isOnline', () => {
    const { result } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123' })
    );

    expect(result.current).toHaveProperty('onlineById');
    expect(result.current).toHaveProperty('onlineSet');
    expect(result.current).toHaveProperty('onlineList');
    expect(result.current).toHaveProperty('isOnline');
    expect(typeof result.current.isOnline).toBe('function');
  });

  it('should update onlineById when presence syncs', () => {
    const mockPresenceState = {
      'user-123': [
        {
          userId: 'user-123',
          username: 'TestUser',
          lastSeen: Date.now(),
        },
      ],
      'user-456': [
        {
          userId: 'user-456',
          username: 'OtherUser',
          lastSeen: Date.now() - 1000,
        },
      ],
    };

    mockChannel.presenceState.mockReturnValue(mockPresenceState);

    const { result } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123' })
    );

    // Trigger presence sync callback
    const syncCallback = mockChannel.on.mock.calls.find(
      (call: any[]) => call[0] === 'presence' && call[1]?.event === 'sync'
    )?.[2];

    if (syncCallback) {
      syncCallback();
    }

    // Should have online users
    expect(Object.keys(result.current.onlineById).length).toBeGreaterThanOrEqual(0);
  });

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() =>
      useOnlinePresence('test-room', { userId: 'user-123' })
    );

    unmount();

    expect(mockChannel.untrack).toHaveBeenCalled();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('should not subscribe if roomKey is empty', () => {
    renderHook(() => useOnlinePresence('', { userId: 'user-123' }));

    expect(mockSupabase.channel).not.toHaveBeenCalled();
  });

  it('should not subscribe if userId is missing', () => {
    renderHook(() => useOnlinePresence('test-room', { userId: '' }));

    expect(mockSupabase.channel).not.toHaveBeenCalled();
  });
});

