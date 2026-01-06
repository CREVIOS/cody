/**
 * BaseAPITemplate - Template Method Pattern Implementation
 *
 * This abstract base class provides a standardized template algorithm for all API calls
 * in the projectAPI layer. It implements the Template Method design pattern to enforce
 * consistency while allowing flexibility through hook methods.
 *
 * Template Algorithm (execute method):
 * 1. Build URL (abstract - must be implemented)
 * 2. Build request options (abstract - must be implemented)
 * 3. Perform network request (concrete with override capability)
 * 4. Handle errors if response not ok
 * 5. Parse response (hook with default implementation)
 * 6. Call success hook (optional)
 * 7. Return parsed data
 */

import {
  API_BASE_URL,
  fetchWithRetry,
  fetchWithUserId,
  invalidateCache,
  NetworkError
} from './APIConfiguration';
import { getErrorMessage as getErrorMessageFromResponse } from './ErrorHandling';

/**
 * Abstract base class implementing the Template Method pattern for API calls.
 *
 * @template TResponse - The expected response type from the API call
 */
export abstract class BaseAPITemplate<TResponse> {
  /**
   * Template Method - defines the skeleton algorithm for all API calls.
   * This method orchestrates the entire API call lifecycle and should NOT be overridden.
   *
   * @returns Promise resolving to the parsed response data
   * @throws Error if the request fails or response is not ok
   */
  public async execute(): Promise<TResponse> {
    try {
      // Step 1: Build the URL (implemented by subclass)
      const url = this.buildURL();

      // Step 2: Build request options (implemented by subclass)
      const options = this.buildOptions();

      // Step 3: Perform the network request (default implementation, can be overridden)
      const response = await this.performRequest(url, options);

      // Step 4: Handle error responses
      if (!response.ok) {
        const errorMessage = await this.getErrorMessage(response);

        // Call error hook (allows custom error handling/logging)
        await this.onError(errorMessage, response);

        // Throw standardized error
        throw new Error(errorMessage);
      }

      // Step 5: Parse the response (hook with default JSON parsing)
      const parsed = await this.parseResponse(response);

      // Step 6: Call success hook (allows custom post-processing/logging)
      this.onSuccess(parsed, response);

      // Step 7: Return parsed data
      return parsed;
    } catch (error) {
      // Handle network errors thrown by fetchWithRetry with a more helpful message
      if (error instanceof NetworkError) {
        const baseLabel = API_BASE_URL || '(relative via Next.js rewrites)';
        throw new Error(
          `Unable to connect to backend server at ${baseLabel}. Please ensure the backend is running (default port 8000).`
        );
      }

      // Handle network errors with user-friendly messages
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const networkError = new Error(
          'Unable to connect to backend server. Please check if the server is running on port 8000.'
        );
        throw networkError;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Abstract method: Build the complete URL for the API request.
   * Subclasses must implement this to construct the appropriate endpoint URL.
   *
   * @returns The complete URL string including query parameters if needed
   */
  protected abstract buildURL(): string;

  /**
   * Abstract method: Build the request options (method, headers, body, etc.).
   * Subclasses must implement this to specify request configuration.
   *
   * @returns RequestInit object with method, headers, body, etc.
   */
  protected abstract buildOptions(): RequestInit;

  /**
   * Hook method: Resolve an error message for non-OK responses.
   * Default delegates to the shared getErrorMessage(response) helper.
   * Override this for endpoints that return plain text errors, etc.
   */
  protected async getErrorMessage(response: Response): Promise<string> {
    return getErrorMessageFromResponse(response);
  }

  /**
   * Concrete method: Perform the actual network request.
   * Default implementation uses fetchWithRetry for better reliability.
   * Subclasses can override this to use different fetch strategies:
   * - Basic fetch() for simple requests
   * - fetchWithUserId() for user-specific operations
   * - Custom implementations for special cases
   *
   * @param url - The URL to fetch
   * @param options - The request options
   * @returns Promise resolving to the Response object
   */
  protected async performRequest(url: string, options: RequestInit): Promise<Response> {
    return fetchWithRetry(url, options);
  }

  /**
   * Hook method: Parse the response body.
   * Default implementation assumes JSON response.
   * Override this to handle different response types or extract nested data.
   *
   * @param response - The Response object from the fetch call
   * @returns Promise resolving to the parsed response data
   */
  protected async parseResponse(response: Response): Promise<TResponse> {
    return response.json();
  }

  /**
   * Hook method: Called after successful response parsing.
   * Override this to add custom success handling such as:
   * - Cache invalidation for mutations
   * - Success logging
   * - Analytics tracking
   * - UI notifications
   *
   * @param data - The parsed response data
   * @param response - The original Response object
   */
  protected onSuccess(data: TResponse, response: Response): void {
    // Default: no-op
    // Subclasses can override for custom behavior
  }

  /**
   * Hook method: Called when an error response is received (response.ok is false).
   * Override this to add custom error handling such as:
   * - Error logging with context
   * - Error transformation
   * - Retry logic
   * - User notifications
   *
   * Note: This is called BEFORE the error is thrown, allowing preprocessing.
   *
   * @param message - The error message from getErrorMessage()
   * @param response - The Response object
   */
  protected async onError(message: string, response: Response): Promise<void> {
    // Default: no-op
    // Subclasses can override for custom error handling
  }

  /**
   * Helper method: Get the API base URL.
   * Provides easy access to the configured API base URL.
   *
   * @returns The API base URL string
   */
  protected getBaseURL(): string {
    return API_BASE_URL;
  }

  /**
   * Helper method: Invalidate cache for a specific URL pattern.
   * Useful for mutation operations that need to clear cached GET requests.
   *
   * @param urlPattern - The URL pattern to invalidate
   */
  protected invalidateCache(urlPattern: string): void {
    invalidateCache(urlPattern);
  }
}

/**
 * Specialized base class for API calls that require user context.
 * Extends BaseAPITemplate to automatically include user_id in requests.
 */
export abstract class BaseAPITemplateWithUser<TResponse> extends BaseAPITemplate<TResponse> {
  /**
   * @param userId - The user ID to include in the request
   */
  constructor(protected userId: string) {
    super();
  }

  /**
   * Override performRequest to use fetchWithUserId instead of fetchWithRetry.
   * This automatically includes the user_id in the request.
   */
  protected async performRequest(url: string, options: RequestInit): Promise<Response> {
    return fetchWithUserId(url, options, this.userId);
  }
}

/**
 * Specialized base class for API calls that should fail silently on network errors.
 * Some operations (like fetching notifications or invitations) should return empty
 * results rather than throwing when the backend is unavailable.
 */
export abstract class BaseAPITemplateSilentFail<TResponse> extends BaseAPITemplate<TResponse> {
  /**
   * Override execute to catch NetworkError and return fallback value.
   */
  public async execute(): Promise<TResponse> {
    try {
      return await super.execute();
    } catch (error) {
      if (error instanceof NetworkError) {
        console.debug(`Backend unavailable for ${this.constructor.name}, returning fallback value`);
        return this.getFallbackValue();
      }

      // For non-network errors, log and return fallback
      console.error(`Error in ${this.constructor.name}:`, error);
      return this.getFallbackValue();
    }
  }

  /**
   * Abstract method: Provide fallback value when request fails.
   * Typically an empty array or default object.
   */
  protected abstract getFallbackValue(): TResponse;
}
