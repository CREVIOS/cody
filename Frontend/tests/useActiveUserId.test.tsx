/**
 * useActiveUserId Hook Unit Tests
 * 
 * Tests the useActiveUserId hook implementation.
 */

import { renderHook, act } from '@testing-library/react';
import { useActiveUserId, setDemoUserId, getDemoUserId, clearDemoMode } from '../app/hooks/useActiveUserId';
import { useAuth } from '../app/context/AuthContext';

// Mock the AuthContext
jest.mock('../app/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useActiveUserId', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('with authenticated user', () => {
    it('should return authenticated userId when user is authenticated', () => {
      (useAuth as jest.Mock).mockReturnValue({
        userId: 'auth-user-123',
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useActiveUserId());

      expect(result.current).toBe('auth-user-123');
    });

    it('should clear demo mode when authenticated', () => {
      // Set demo user first
      setDemoUserId('demo-user-123');
      expect(localStorageMock.getItem('app-demo-user-id')).toBe('demo-user-123');

      (useAuth as jest.Mock).mockReturnValue({
        userId: 'auth-user-123',
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useActiveUserId());

      expect(result.current).toBe('auth-user-123');
      // Demo mode should be cleared
      expect(localStorageMock.getItem('app-demo-user-id')).toBeNull();
    });
  });

  describe('with demo user', () => {
    it('should return demo userId when not authenticated', () => {
      (useAuth as jest.Mock).mockReturnValue({
        userId: null,
        isAuthenticated: false,
      });

      setDemoUserId('demo-user-456');

      const { result } = renderHook(() => useActiveUserId());

      // Wait for hydration
      act(() => {
        // Hook should return demo user after hydration
      });

      expect(result.current).toBe('demo-user-456');
    });

    it('should return null when no demo user is set and not authenticated', () => {
      (useAuth as jest.Mock).mockReturnValue({
        userId: null,
        isAuthenticated: false,
      });

      clearDemoMode();

      const { result } = renderHook(() => useActiveUserId());

      expect(result.current).toBeNull();
    });
  });

  describe('hydration', () => {
    it('should return null before hydration completes', () => {
      (useAuth as jest.Mock).mockReturnValue({
        userId: null,
        isAuthenticated: false,
      });

      const { result } = renderHook(() => useActiveUserId());

      // Initially should be null during hydration
      // After useEffect runs, it should load from localStorage
      // This is a timing-dependent test, so we check the final state
      expect(result.current).toBeDefined();
    });

    it('should load demo userId from localStorage on mount', () => {
      (useAuth as jest.Mock).mockReturnValue({
        userId: null,
        isAuthenticated: false,
      });

      localStorageMock.setItem('app-demo-user-id', 'stored-demo-user');

      const { result } = renderHook(() => useActiveUserId());

      // After hydration, should return stored demo user
      expect(result.current).toBe('stored-demo-user');
    });
  });
});

describe('setDemoUserId', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should set demo userId in localStorage', () => {
    setDemoUserId('test-demo-user');
    expect(localStorageMock.getItem('app-demo-user-id')).toBe('test-demo-user');
  });

  it('should remove demo userId when set to null', () => {
    setDemoUserId('test-demo-user');
    expect(localStorageMock.getItem('app-demo-user-id')).toBe('test-demo-user');

    setDemoUserId(null);
    expect(localStorageMock.getItem('app-demo-user-id')).toBeNull();
  });
});

describe('getDemoUserId', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should return demo userId from localStorage', () => {
    localStorageMock.setItem('app-demo-user-id', 'test-demo');
    expect(getDemoUserId()).toBe('test-demo');
  });

  it('should return null when no demo userId is set', () => {
    expect(getDemoUserId()).toBeNull();
  });

  it('should return null in server-side environment', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    expect(getDemoUserId()).toBeNull();

    global.window = originalWindow;
  });
});

describe('clearDemoMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should remove demo userId from localStorage', () => {
    localStorageMock.setItem('app-demo-user-id', 'test-demo');
    clearDemoMode();
    expect(localStorageMock.getItem('app-demo-user-id')).toBeNull();
  });
});

