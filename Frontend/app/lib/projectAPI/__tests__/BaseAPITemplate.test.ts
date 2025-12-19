/**
 * Template Method Pattern Test Suite
 * Tests BaseAPITemplate template method implementation
 *
 * This test suite verifies that the Template Method pattern is correctly
 * implemented in BaseAPITemplate, ensuring:
 * - Template method structure is enforced
 * - Hook methods are called in correct order
 * - Abstract methods must be implemented
 * - Error handling works correctly
 * - Network errors are properly handled
 */

import { BaseAPITemplate, BaseAPITemplateWithUser, BaseAPITemplateSilentFail } from '../BaseAPITemplate';
import { NetworkError } from '../APIConfiguration';

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

describe('BaseAPITemplate - Template Method Pattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Template Method Structure', () => {
    it('should execute template method in correct order', async () => {
      const executionLog: string[] = [];

      class TestTemplate extends BaseAPITemplate<{ data: string }> {
        protected buildURL(): string {
          executionLog.push('1. buildURL');
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          executionLog.push('2. buildOptions');
          return { method: 'GET' };
        }

        protected async performRequest(url: string, options: RequestInit): Promise<Response> {
          executionLog.push('3. performRequest');
          return new Response(JSON.stringify({ data: 'success' }), { status: 200 }) as any;
        }

        protected async parseResponse(response: Response): Promise<{ data: string }> {
          executionLog.push('4. parseResponse');
          return response.json();
        }

        protected onSuccess(data: { data: string }, response: Response): void {
          executionLog.push('5. onSuccess');
        }
      }

      const template = new TestTemplate();
      const result = await template.execute();

      expect(executionLog).toEqual([
        '1. buildURL',
        '2. buildOptions',
        '3. performRequest',
        '4. parseResponse',
        '5. onSuccess'
      ]);
      expect(result).toEqual({ data: 'success' });
    });
  });

  describe('Hook Methods', () => {
    it('should call onSuccess hook after successful response', async () => {
      let successCalled = false;
      let successData: any = null;

      class TestTemplate extends BaseAPITemplate<{ value: number }> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response(JSON.stringify({ value: 42 }), { status: 200 }) as any;
        }

        protected onSuccess(data: { value: number }, response: Response): void {
          successCalled = true;
          successData = data;
        }
      }

      const template = new TestTemplate();
      await template.execute();

      expect(successCalled).toBe(true);
      expect(successData).toEqual({ value: 42 });
    });

    it('should call onError hook before throwing error', async () => {
      let errorCalled = false;
      let errorMessage = '';

      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response('Not Found', { status: 404 }) as any;
        }

        protected async onError(message: string, response: Response): Promise<void> {
          errorCalled = true;
          errorMessage = message;
        }
      }

      const template = new TestTemplate();

      try {
        await template.execute();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        // Error was thrown as expected
      }
      
      expect(errorCalled).toBe(true);
      expect(errorMessage).toContain('404');
    });

    it('should allow custom parseResponse implementation', async () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response('plain text response', { status: 200 }) as any;
        }

        protected async parseResponse(response: Response): Promise<string> {
          return response.text();
        }
      }

      const template = new TestTemplate();
      const result = await template.execute();

      expect(result).toBe('plain text response');
    });

    it('should allow custom getErrorMessage implementation', async () => {
      let customErrorCalled = false;

      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response('Custom error', { status: 500 }) as any;
        }

        protected async getErrorMessage(response: Response): Promise<string> {
          customErrorCalled = true;
          const text = await response.text();
          return `Custom: ${text}`;
        }
      }

      const template = new TestTemplate();

      await expect(template.execute()).rejects.toThrow('Custom: Custom error');
      expect(customErrorCalled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle NetworkError with user-friendly message', async () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          throw new NetworkError('Connection failed');
        }
      }

      const template = new TestTemplate();

      await expect(template.execute()).rejects.toThrow('Unable to connect to backend server');
    });

    it('should handle TypeError Failed to fetch', async () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          const error = new TypeError('Failed to fetch');
          throw error;
        }
      }

      const template = new TestTemplate();

      await expect(template.execute()).rejects.toThrow('Unable to connect to backend server');
    });

    it('should throw error when response is not ok', async () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response('Unauthorized', { status: 401 }) as any;
        }
      }

      const template = new TestTemplate();

      await expect(template.execute()).rejects.toThrow();
    });

    it('should propagate errors from hook methods', async () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response(JSON.stringify({ data: 'test' }), { status: 200 }) as any;
        }

        protected async parseResponse(): Promise<string> {
          throw new Error('Parse error');
        }
      }

      const template = new TestTemplate();

      await expect(template.execute()).rejects.toThrow('Parse error');
    });
  });

  describe('Helper Methods', () => {
    it('should provide getBaseURL helper', () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return `${this.getBaseURL()}/api/test`;
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }
      }

      const template = new TestTemplate();
      const url = (template as any).buildURL();

      expect(url).toContain('/api/test');
    });

    it('should provide invalidateCache helper', () => {
      class TestTemplate extends BaseAPITemplate<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected onSuccess(): void {
          this.invalidateCache('http://test.com/api/*');
        }
      }

      const template = new TestTemplate();
      
      // Should not throw
      const mockResponse = new Response('{}', { status: 200 }) as any;
      expect(() => (template as any).onSuccess({}, mockResponse)).not.toThrow();
    });
  });

  describe('BaseAPITemplateWithUser', () => {
    it('should include userId in constructor', () => {
      class TestTemplate extends BaseAPITemplateWithUser<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }
      }

      const template = new TestTemplate('user123');
      expect((template as any).userId).toBe('user123');
    });

    it('should override performRequest to use fetchWithUserId', async () => {
      // This test verifies the pattern structure, actual fetchWithUserId behavior
      // would be tested in integration tests
      class TestTemplate extends BaseAPITemplateWithUser<string> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(url: string, options: RequestInit): Promise<Response> {
          // Verify userId is available
          expect((this as any).userId).toBe('user123');
          return new Response(JSON.stringify({ data: 'success' }), { status: 200 }) as any;
        }
      }

      const template = new TestTemplate('user123');
      const result = await template.execute();

      expect(result).toEqual({ data: 'success' });
    });
  });

  describe('BaseAPITemplateSilentFail', () => {
    it('should return fallback value on NetworkError', async () => {
      class TestTemplate extends BaseAPITemplateSilentFail<string[]> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          throw new NetworkError('Connection failed');
        }

        protected getFallbackValue(): string[] {
          return [];
        }
      }

      const template = new TestTemplate();
      const result = await template.execute();

      expect(result).toEqual([]);
    });

    it('should return fallback value on other errors', async () => {
      class TestTemplate extends BaseAPITemplateSilentFail<{ items: string[] }> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response('Error', { status: 500 });
        }

        protected getFallbackValue(): { items: string[] } {
          return { items: [] };
        }
      }

      const template = new TestTemplate();
      const result = await template.execute();

      expect(result).toEqual({ items: [] });
    });

    it('should return actual result when request succeeds', async () => {
      class TestTemplate extends BaseAPITemplateSilentFail<{ data: string }> {
        protected buildURL(): string {
          return 'http://test.com/api';
        }

        protected buildOptions(): RequestInit {
          return { method: 'GET' };
        }

        protected async performRequest(): Promise<Response> {
          return new Response(JSON.stringify({ data: 'success' }), { status: 200 }) as any;
        }

        protected getFallbackValue(): { data: string } {
          return { data: 'fallback' };
        }
      }

      const template = new TestTemplate();
      const result = await template.execute();

      expect(result).toEqual({ data: 'success' });
    });
  });

  describe('Real-world Usage Pattern', () => {
    it('should work like FileVersionsAPI.saveFileContent pattern', async () => {
      interface TestResponse {
        id: string;
        status: string;
      }

      class SaveFileContentCall extends BaseAPITemplate<TestResponse> {
        constructor(
          private fileId: string,
          private projectId: string,
          private userId: string,
          private content: string
        ) {
          super();
        }

        protected buildURL(): string {
          const queryParams = new URLSearchParams({
            user_id: this.userId,
            project_id: this.projectId,
          });
          return `http://test.com/api/files/${this.fileId}/save-content?${queryParams.toString()}`;
        }

        protected buildOptions(): RequestInit {
          return {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: this.content,
            }),
          };
        }

        protected async performRequest(url: string, options: RequestInit): Promise<Response> {
          // Verify URL construction
          expect(url).toContain(`/files/${this.fileId}/save-content`);
          expect(url).toContain(`user_id=${this.userId}`);
          expect(url).toContain(`project_id=${this.projectId}`);

          // Verify body
          const body = JSON.parse(options.body as string);
          expect(body.content).toBe(this.content);

          return new Response(
            JSON.stringify({ id: 'v1', status: 'saved' }),
            { status: 200 }
          ) as any;
        }

        protected async getErrorMessage(response: Response): Promise<string> {
          const errorText = await response.text().catch(() => '');
          return `Failed to save file: ${response.status} ${errorText}`.trim();
        }
      }

      const call = new SaveFileContentCall('file1', 'proj1', 'user1', 'test content');
      const result = await call.execute();

      expect(result).toEqual({ id: 'v1', status: 'saved' });
    });
  });
});

