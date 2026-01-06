/**
 * Utility Functions Unit Tests
 * 
 * Tests utility functions from UtilityFunctions.tsx
 */

import {
  isInvitationValid,
  formatExpiryDate,
  formatDate,
  formatDateTime,
  testBackendConnection,
} from '../app/lib/projectAPI/UtilityFunctions';
import { ProjectInvitation } from '../app/lib/projectAPI/TypeDefinitions';

// Mock fetch globally
global.fetch = jest.fn();

// Polyfill Response for Node.js test environment if not available
if (typeof Response === 'undefined') {
  // First ensure Headers is available
  if (typeof Headers === 'undefined') {
    class MockHeaders {
      private _headers: Map<string, string> = new Map();

      constructor(init?: HeadersInit) {
        if (init) {
          if (init instanceof MockHeaders) {
            init.forEach((value, key) => this._headers.set(key, value));
          } else if (Array.isArray(init)) {
            init.forEach(([key, value]) => this._headers.set(key, value));
          } else {
            Object.entries(init).forEach(([key, value]) => this._headers.set(key, value));
          }
        }
      }

      get(name: string): string | null {
        return this._headers.get(name.toLowerCase()) || null;
      }

      set(name: string, value: string): void {
        this._headers.set(name.toLowerCase(), value);
      }

      forEach(callback: (value: string, key: string) => void): void {
        this._headers.forEach((value, key) => callback(value, key));
      }
    }
    (global as any).Headers = MockHeaders;
  }

  // Now define Response mock that uses Headers
  class MockResponse {
    private _body: string;
    private _status: number;
    private _ok: boolean;
    private _headers: any;

    constructor(body: string = '', init?: { status?: number; headers?: HeadersInit }) {
      this._body = body;
      this._status = init?.status || 200;
      this._ok = this._status >= 200 && this._status < 300;
      this._headers = new (global as any).Headers(init?.headers);
    }

    get status() {
      return this._status;
    }

    get ok() {
      return this._ok;
    }

    get headers() {
      return this._headers;
    }

    async json() {
      return JSON.parse(this._body);
    }

    async text() {
      return this._body;
    }

    clone() {
      return new MockResponse(this._body, { status: this._status, headers: this._headers });
    }
  }

  (global as any).Response = MockResponse;
}

describe('Utility Functions', () => {
  describe('isInvitationValid', () => {
    it('should return true for valid pending invitation', () => {
      const invitation: ProjectInvitation = {
        id: '1',
        project_id: 'proj1',
        email: 'test@example.com',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        created_at: new Date().toISOString(),
        token: 'token123',
      };

      expect(isInvitationValid(invitation)).toBe(true);
    });

    it('should return false for expired invitation', () => {
      const invitation: ProjectInvitation = {
        id: '1',
        project_id: 'proj1',
        email: 'test@example.com',
        status: 'pending',
        expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        created_at: new Date().toISOString(),
        token: 'token123',
      };

      expect(isInvitationValid(invitation)).toBe(false);
    });

    it('should return false for accepted invitation', () => {
      const invitation: ProjectInvitation = {
        id: '1',
        project_id: 'proj1',
        email: 'test@example.com',
        status: 'accepted',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        token: 'token123',
      };

      expect(isInvitationValid(invitation)).toBe(false);
    });

    it('should return false for declined invitation', () => {
      const invitation: ProjectInvitation = {
        id: '1',
        project_id: 'proj1',
        email: 'test@example.com',
        status: 'declined',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        token: 'token123',
      };

      expect(isInvitationValid(invitation)).toBe(false);
    });
  });

  describe('formatExpiryDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return "Expired" for past dates', () => {
      const pastDate = new Date('2024-01-14T12:00:00Z').toISOString();
      expect(formatExpiryDate(pastDate)).toBe('Expired');
    });

    it('should return "Expires today" for today', () => {
      const today = new Date('2024-01-15T18:00:00Z').toISOString();
      expect(formatExpiryDate(today)).toBe('Expires today');
    });

    it('should return "Expires tomorrow" for tomorrow', () => {
      const tomorrow = new Date('2024-01-16T12:00:00Z').toISOString();
      expect(formatExpiryDate(tomorrow)).toBe('Expires tomorrow');
    });

    it('should return "Expires in N days" for future dates', () => {
      const futureDate = new Date('2024-01-20T12:00:00Z').toISOString();
      expect(formatExpiryDate(futureDate)).toBe('Expires in 5 days');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const dateString = '2024-01-15T12:00:00Z';
      const formatted = formatDate(dateString);
      
      // Format should be like "Jan 15, 2024"
      expect(formatted).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
      expect(formatted).toContain('2024');
    });

    it('should handle different date formats', () => {
      const dateString = '2024-12-25T00:00:00Z';
      const formatted = formatDate(dateString);
      
      expect(formatted).toContain('2024');
      expect(formatted).toMatch(/Dec/);
    });
  });

  describe('formatDateTime', () => {
    it('should format datetime correctly', () => {
      const dateString = '2024-01-15T14:30:00Z';
      const formatted = formatDateTime(dateString);
      
      // Format should include date and time
      expect(formatted).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
      expect(formatted).toContain('2024');
      // Should include time (AM/PM or 24h format)
      expect(formatted.length).toBeGreaterThan(10);
    });

    it('should include time information', () => {
      const dateString = '2024-01-15T14:30:00Z';
      const formatted = formatDateTime(dateString);
      
      // Should have more characters than just date
      expect(formatted.length).toBeGreaterThan(formatDate(dateString).length);
    });
  });

  describe('testBackendConnection', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
      // Clear cache before each test
      const { clearRequestCache } = require('../app/lib/projectAPI/APIConfiguration');
      clearRequestCache();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return true when backend is healthy', async () => {
      // Mock Response object similar to BaseAPITemplate.test.ts
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await testBackendConnection();
      expect(result).toBe(true);
    });

    it('should return false when backend is not healthy', async () => {
      // Mock Response with 500 status - BaseAPITemplateSilentFail returns fallback on error
      // When response.ok is false, BaseAPITemplate throws an error, which SilentFail catches
      // Create a proper mock Response with ok: false
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal Server Error' }),
        text: async () => 'Internal Server Error',
        headers: new Headers(),
        clone: () => mockResponse,
      } as Response;
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await testBackendConnection();
      expect(result).toBe(false); // Should return fallback value (false) on error
    });

    it('should return false on network error', async () => {
      // NetworkError should be caught by BaseAPITemplateSilentFail
      const { NetworkError } = require('../app/lib/projectAPI/APIConfiguration');
      (global.fetch as jest.Mock).mockRejectedValue(new NetworkError('Network error'));

      const result = await testBackendConnection();
      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      // Timeout should be caught by BaseAPITemplateSilentFail
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new TypeError('Failed to fetch')), 100);
        });
      });

      const result = await testBackendConnection();
      expect(result).toBe(false);
    });
  });
});

