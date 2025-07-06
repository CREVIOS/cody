/**
 * Safely extract error message from API response
 */
const getErrorMessage = async (response: Response): Promise<string> => {
    try {
      const errorData = await response.json();
      if (typeof errorData === 'object' && errorData !== null) {
        // Handle array of errors (common in validation)
        if (Array.isArray(errorData)) {
          return errorData.map(err => typeof err === 'string' ? err : err.message || err.detail || JSON.stringify(err)).join(', ');
        }
        
        // Try different possible error message fields
        if (typeof errorData.detail === 'string') return errorData.detail;
        if (typeof errorData.message === 'string') return errorData.message;
        if (typeof errorData.error === 'string') return errorData.error;
        
        // Handle validation errors
        if (errorData.detail && Array.isArray(errorData.detail)) {
          return errorData.detail.map((err: Record<string, unknown>) => 
            typeof err.msg === 'string' ? err.msg : 
            typeof err.message === 'string' ? err.message : 
            JSON.stringify(err)
          ).join(', ');
        }
        
        // Last resort: stringify the object
        return JSON.stringify(errorData);
      }
      return `HTTP error! status: ${response.status}`;
    } catch {
      // If JSON parsing fails, return status-based error
      return `HTTP error! status: ${response.status}`;
    }
  };
  
  export { getErrorMessage };