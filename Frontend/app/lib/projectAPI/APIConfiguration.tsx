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

// Simple in-memory cache for GET requests
const requestCache = new Map<string, { data: Response; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds cache for GET requests

/**
 * Enhanced fetch with timeout, retry logic, keep-alive, and caching
 * @param url The URL to fetch
 * @param options Fetch options
 * @param retries Number of retries
 * @param timeout Timeout in milliseconds
 * @returns Promise with the fetch response
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries: number = 2,  // Reduced retries for faster failure
  timeout: number = 10000  // Increased timeout for slow connections
): Promise<Response> => {
  const method = options.method?.toUpperCase() || 'GET';
  const cacheKey = `${method}:${url}`;
  
  // Check cache for GET requests
  if (method === 'GET') {
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data.clone();
    }
  }
  
  // Add timeout to the fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    // Enable keep-alive for connection reuse
    keepalive: true,
    headers: {
      ...options.headers,
      'Connection': 'keep-alive',
    },
  };
  
  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // Cache successful GET responses
    if (method === 'GET' && response.ok) {
      requestCache.set(cacheKey, { data: response.clone(), timestamp: Date.now() });
    }
    
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
      // Wait before retry (shorter delays)
      const delay = 500 * (3 - retries);  // 500ms, 1000ms
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    
    // Create a custom network error with more context
    throw new NetworkError(`Failed to fetch: ${errorMessage} (${url})`, error);
  }
};

/**
 * Clear the request cache (call after mutations)
 */
export const clearRequestCache = () => {
  requestCache.clear();
};

/**
 * Invalidate specific cache entries by URL pattern
 */
export const invalidateCache = (urlPattern: string) => {
  for (const key of requestCache.keys()) {
    if (key.includes(urlPattern)) {
      requestCache.delete(key);
    }
  }
};

/**
 * Enhanced fetch that automatically includes user_id in requests
 * For POST/PUT/PATCH: adds user_id to request body
 * For GET: adds user_id to query params (or body if specified)
 * 
 * @param url The URL to fetch
 * @param options Fetch options
 * @param userId The active user ID (from useActiveUserId hook)
 * @param addToQuery For GET requests, whether to add user_id to query params (default: false, adds to body)
 * @returns Promise with the fetch response
 */
export const fetchWithUserId = async (
  url: string,
  options: RequestInit = {},
  userId: string | null,
  addToQuery: boolean = false
): Promise<Response> => {
  const method = options.method?.toUpperCase() || 'GET';
  const isGetRequest = method === 'GET';
  
  let finalUrl = url;
  let finalOptions = { ...options };
  
  if (userId) {
    if (isGetRequest && addToQuery) {
      // Add user_id to query params for GET requests
      const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      urlObj.searchParams.append('user_id', userId);
      finalUrl = urlObj.toString();
    } else {
      // Add user_id to request body for all requests
      const body = options.body 
        ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
        : {};
      
      // Merge user_id into body
      const bodyWithUserId = {
        ...body,
        user_id: userId
      };
      
      finalOptions = {
        ...options,
        body: JSON.stringify(bodyWithUserId),
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      };
    }
  }
  
  return fetchWithRetry(finalUrl, finalOptions);
};

export { API_BASE_URL };