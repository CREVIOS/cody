const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Log the API base URL for debugging
console.log('API_BASE_URL:', API_BASE_URL);

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
    
    if (retries > 0) {
      console.log(`Retrying fetch to ${url}, ${retries} retries left`);
      // Wait before retry (exponential backoff)
      const delay = 1000 * (Math.pow(2, 4 - retries));
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    
    throw new Error(`Failed to fetch: API may be unavailable (${url})`);
  }
};

export { API_BASE_URL };