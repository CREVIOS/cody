// Use relative URLs when in browser to leverage Next.js rewrites (avoids CORS issues)
// Use absolute URL when in server context or when NEXT_PUBLIC_API_URL is explicitly set
const getApiBaseUrl = (): string => {
  // Prefer explicit env; otherwise default to backend URL
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

// Note: Defaults to 'http://localhost:8000' if NEXT_PUBLIC_API_URL is not set
const API_BASE_URL = getApiBaseUrl();

// Log the API base URL for debugging (only in browser to avoid server-side noise)
if (typeof window !== 'undefined') {
  console.log('API_BASE_URL:', API_BASE_URL || '(relative - using Next.js rewrites)');
}

/**
 * Custom error class for network errors that can be silently handled
 */
export class NetworkError extends Error {
  isNetworkError: boolean = true;
  originalError: unknown;
  
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Enhanced fetch with timeout and retry logic
 * @param url The URL to fetch
 * @param options Fetch options
 * @param retries Number of retries
 * @param timeout Timeout in milliseconds
 * @returns Promise with the fetch response
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  timeout: number = 5000
): Promise<Response> => {
  // Add timeout to the fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal
  };
  
  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Determine error type for better diagnostics
    let errorMessage = 'Unknown error';
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error: Unable to connect to server. Please ensure the backend is running.';
    } else if (error instanceof Error && error.name === 'AbortError') {
      errorMessage = `Request timeout: Server did not respond within ${timeout}ms`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    if (retries > 0) {
      console.log(`Retrying fetch to ${url}, ${retries} retries left`);
      // Wait before retry (exponential backoff)
      const delay = 1000 * (Math.pow(2, 4 - retries));
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    
    // Create a custom network error with more context
    throw new NetworkError(`Failed to fetch: ${errorMessage} (${url})`, error);
  }
};

export { API_BASE_URL };