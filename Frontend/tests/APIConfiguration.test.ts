/**
 * API Configuration Tests
 * Tests NetworkError class and fetch utilities
 */

import { NetworkError, fetchWithRetry, fetchWithUserId, clearRequestCache, invalidateCache } from '../app/lib/projectAPI/APIConfiguration';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Response
if (typeof Response === 'undefined') {
  class MockResponse {
    private _body: string;
    private _status: number;
    private _ok: boolean;

    constructor(body: string = '', init?: { status?: number }) {
      this._body = body;
      this._status = init?.status || 200;
      this._ok = this._status >= 200 && this._status < 300;
    }

    get status() {
      return this._status;
    }

    get ok() {
      return this._ok;
    }

    async json() {
      return JSON.parse(this._body);
    }

    async text() {
      return this._body;
    }

    clone() {
      return new MockResponse(this._body, { status: this._status });
    }
  }

  (global as any).Response = MockResponse;
}

describe('APIConfiguration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRequestCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('NetworkError', () => {
    it('should create NetworkError with message', () => {
      const error = new NetworkError('Network failed');
      expect(error.message).toBe('Network failed');
      expect(error.name).toBe('NetworkError');
      expect(error.isNetworkError).toBe(true);
    });

    it('should store original error', () => {
      const originalError = new Error('Original');
      const error = new NetworkError('Network failed', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should be instance of Error', () => {
      const error = new NetworkError('Network failed');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('fetchWithRetry', () => {
    beforeEach(() => {
      clearRequestCache();
      (global.fetch as jest.Mock).mockClear();
    });

    it('should return successful response', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const response = await fetchWithRetry('http://test.com/api');
      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should cache GET requests', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api', { method: 'GET' });
      await fetchWithRetry('http://test.com/api', { method: 'GET' });

      // Should only fetch once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not cache non-GET requests', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api', { method: 'POST' });
      await fetchWithRetry('http://test.com/api', { method: 'POST' });

      // Should fetch twice (no caching for POST)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not cache failed responses', async () => {
      const mockResponse = new Response('Error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api', { method: 'GET' });
      await fetchWithRetry('http://test.com/api', { method: 'GET' });

      // Should fetch twice (failed responses not cached)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should expire cache after TTL', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api', { method: 'GET' });
      
      // Advance time past cache TTL (5000ms)
      jest.advanceTimersByTime(6000);
      
      await fetchWithRetry('http://test.com/api', { method: 'GET' });

      // Should fetch twice (cache expired)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on failure', async () => {
      // Use real timers for this test since fetchWithRetry uses setTimeout
      jest.useRealTimers();
      
      const uniqueUrl = 'http://test.com/api/retry-' + Date.now();
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(mockResponse);

      const response = await fetchWithRetry(uniqueUrl, {}, 1);

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should throw NetworkError after retries exhausted', async () => {
      // Use a unique URL to avoid cache issues
      const uniqueUrl = 'http://test.com/api/unique-' + Date.now();
      // Reset mock to ensure fresh state
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchWithRetry(uniqueUrl, {}, 0)).rejects.toThrow(NetworkError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout', async () => {
      const uniqueUrl = 'http://test.com/api/timeout-' + Date.now();
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Request timeout');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      const promise = fetchWithRetry(uniqueUrl, {}, 0, 50);
      jest.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow(NetworkError);
    });

    it('should include timeout in error message', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Request timeout');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      const promise = fetchWithRetry('http://test.com/api', {}, 0, 1000);
      jest.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow(/timeout.*1000ms/);
    });
  });

  describe('clearRequestCache', () => {
    it('should clear all cached requests', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api', { method: 'GET' });
      clearRequestCache();
      await fetchWithRetry('http://test.com/api', { method: 'GET' });

      // Should fetch twice (cache cleared)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate matching cache entries', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api/users', { method: 'GET' });
      await fetchWithRetry('http://test.com/api/projects', { method: 'GET' });
      
      invalidateCache('/users');
      
      await fetchWithRetry('http://test.com/api/users', { method: 'GET' });
      await fetchWithRetry('http://test.com/api/projects', { method: 'GET' });

      // users should be fetched again (invalidated), projects should use cache
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should not invalidate non-matching entries', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRetry('http://test.com/api/users', { method: 'GET' });
      await fetchWithRetry('http://test.com/api/projects', { method: 'GET' });
      
      invalidateCache('/nonexistent');
      
      await fetchWithRetry('http://test.com/api/users', { method: 'GET' });
      await fetchWithRetry('http://test.com/api/projects', { method: 'GET' });

      // Both should use cache (nothing invalidated)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchWithUserId', () => {
    const originalLocation = window.location;
    
    beforeEach(() => {
      // Mock window.location for URL constructor
      delete (window as any).location;
      (window as any).location = {
        origin: 'http://localhost:3000',
      };
    });

    afterEach(() => {
      // Restore original location
      (window as any).location = originalLocation;
    });

    it('should add user_id to GET request body by default', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', { method: 'GET' }, 'user123');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toBe('http://test.com/api');
      expect(JSON.parse(call[1].body)).toEqual({ user_id: 'user123' });
      expect(call[1].method).toBe('GET');
      expect(call[1].headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('should add user_id to query params for GET when addToQuery is true', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', { method: 'GET' }, 'user123', true);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('user_id=user123');
      expect(call[0]).toContain('http://test.com/api');
    });

    it('should add user_id to POST request body', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      }, 'user123');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body).toEqual({ name: 'Test', user_id: 'user123' });
    });

    it('should merge user_id with existing body', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', {
        method: 'POST',
        body: JSON.stringify({ project: 'proj1', name: 'Test' }),
      }, 'user123');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body).toEqual({ project: 'proj1', name: 'Test', user_id: 'user123' });
    });

    it('should not add user_id when userId is null', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', { method: 'GET' }, null);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[1].body).toBeUndefined();
    });

    it('should preserve existing headers', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithUserId('http://test.com/api', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
      }, 'user123');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[1].headers).toMatchObject({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token',
      });
    });
  });
});

