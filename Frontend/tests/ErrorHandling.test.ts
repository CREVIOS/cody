/**
 * Error Handling Tests
 * Tests error message extraction from API responses
 */

import { getErrorMessage } from '../app/lib/projectAPI/ErrorHandling';

// Mock Response polyfill
global.fetch = jest.fn();

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
  }

  (global as any).Response = MockResponse;
}

describe('ErrorHandling', () => {
  describe('getErrorMessage', () => {
    it('should extract message from error object', async () => {
      const response = new Response(JSON.stringify({ message: 'Error occurred' }), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('Error occurred');
    });

    it('should extract detail from error object', async () => {
      const response = new Response(JSON.stringify({ detail: 'Detailed error message' }), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('Detailed error message');
    });

    it('should extract error field from error object', async () => {
      const response = new Response(JSON.stringify({ error: 'Error field message' }), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('Error field message');
    });

    it('should handle array of error strings', async () => {
      const response = new Response(JSON.stringify(['Error 1', 'Error 2']), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('Error 1, Error 2');
    });

    it('should handle array of error objects', async () => {
      const response = new Response(JSON.stringify([
        { message: 'Error 1' },
        { detail: 'Error 2' },
        'Error 3'
      ]), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('Error 1, Error 2, Error 3');
    });

    it('should handle validation errors with detail array', async () => {
      const response = new Response(JSON.stringify({
        detail: [
          { msg: 'Validation error 1' },
          { message: 'Validation error 2' },
          { field: 'value' }
        ]
      }), { status: 422 });
      const error = await getErrorMessage(response);
      expect(error).toContain('Validation error 1');
      expect(error).toContain('Validation error 2');
    });

    it('should stringify complex objects', async () => {
      const response = new Response(JSON.stringify({ 
        code: 'ERROR_CODE',
        data: { nested: 'value' }
      }), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toContain('ERROR_CODE');
      expect(error).toContain('nested');
    });

    it('should return status-based error when JSON parsing fails', async () => {
      const response = {
        status: 500,
        json: async () => { throw new Error('Parse error'); },
      } as Response;
      
      const error = await getErrorMessage(response);
      expect(error).toBe('HTTP error! status: 500');
    });

    it('should return status-based error for non-JSON responses', async () => {
      const response = {
        status: 404,
        json: async () => { throw new Error('Not JSON'); },
      } as Response;
      
      const error = await getErrorMessage(response);
      expect(error).toBe('HTTP error! status: 404');
    });

    it('should handle null response body', async () => {
      const response = new Response(JSON.stringify(null), { status: 400 });
      const error = await getErrorMessage(response);
      expect(error).toBe('HTTP error! status: 400');
    });
  });
});

