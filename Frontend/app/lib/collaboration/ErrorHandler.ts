/**
 * CRDT Error Handler
 * 
 * Comprehensive error handling for Yjs collaboration system.
 * Features:
 * - Network error recovery
 * - Sync conflict resolution
 * - Connection failure handling
 * - User-friendly error messages
 * - Automatic retry with exponential backoff
 */

export enum CRDTErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SYNC_ERROR = 'SYNC_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface CRDTError {
  type: CRDTErrorType;
  message: string;
  originalError?: Error;
  timestamp: number;
  recoverable: boolean;
  retryable: boolean;
  metadata?: Record<string, any>;
}

export interface ErrorHandlerOptions {
  /**
   * Maximum retry attempts
   * Default: 5
   */
  maxRetries?: number;

  /**
   * Base delay for exponential backoff (ms)
   * Default: 1000
   */
  baseDelay?: number;

  /**
   * Maximum delay between retries (ms)
   * Default: 30000
   */
  maxDelay?: number;

  /**
   * Callback when error occurs
   */
  onError?: (error: CRDTError) => void;

  /**
   * Callback when error is recovered
   */
  onRecover?: (error: CRDTError) => void;

  /**
   * Enable logging
   */
  logging?: boolean;
}

export class CRDTErrorHandler {
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;
  private onErrorCallback?: (error: CRDTError) => void;
  private onRecoverCallback?: (error: CRDTError) => void;
  private logging: boolean;

  private errorHistory: CRDTError[] = [];
  private retryCounts: Map<string, number> = new Map();

  constructor(options: ErrorHandlerOptions = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.onErrorCallback = options.onError;
    this.onRecoverCallback = options.onRecover;
    this.logging = options.logging !== false;
  }

  /**
   * Handle an error
   */
  public handleError(
    error: Error | string,
    type: CRDTErrorType = CRDTErrorType.UNKNOWN_ERROR,
    metadata?: Record<string, any>
  ): CRDTError {
    const crdtError: CRDTError = {
      type,
      message: typeof error === 'string' ? error : error.message,
      originalError: typeof error === 'string' ? undefined : error,
      timestamp: Date.now(),
      recoverable: this.isRecoverable(type),
      retryable: this.isRetryable(type),
      metadata,
    };

    // Add to history
    this.errorHistory.push(crdtError);

    // Keep only last 50 errors
    if (this.errorHistory.length > 50) {
      this.errorHistory.shift();
    }

    if (this.logging) {
      console.error('[CRDTErrorHandler]', crdtError);
    }

    // Call callback
    if (this.onErrorCallback) {
      this.onErrorCallback(crdtError);
    }

    return crdtError;
  }

  /**
   * Check if error type is recoverable
   */
  private isRecoverable(type: CRDTErrorType): boolean {
    return [
      CRDTErrorType.NETWORK_ERROR,
      CRDTErrorType.CONNECTION_ERROR,
      CRDTErrorType.SYNC_ERROR,
    ].includes(type);
  }

  /**
   * Check if error type is retryable
   */
  private isRetryable(type: CRDTErrorType): boolean {
    return [
      CRDTErrorType.NETWORK_ERROR,
      CRDTErrorType.CONNECTION_ERROR,
      CRDTErrorType.PERSISTENCE_ERROR,
    ].includes(type);
  }

  /**
   * Get user-friendly error message
   */
  public getUserMessage(error: CRDTError): string {
    switch (error.type) {
      case CRDTErrorType.NETWORK_ERROR:
        return 'Network connection lost. Changes are saved locally and will sync when connection is restored.';
      
      case CRDTErrorType.CONNECTION_ERROR:
        return 'Unable to connect to collaboration server. Retrying...';
      
      case CRDTErrorType.SYNC_ERROR:
        return 'Synchronization error. Your changes are safe and will be merged automatically.';
      
      case CRDTErrorType.PERSISTENCE_ERROR:
        return 'Unable to save changes locally. Please check your browser storage settings.';
      
      case CRDTErrorType.VALIDATION_ERROR:
        return 'Document validation failed. Please refresh the page.';
      
      default:
        return 'An unexpected error occurred. Your changes are saved locally.';
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  public async retry<T>(
    operation: () => Promise<T>,
    errorKey: string,
    onRetry?: (attempt: number) => void
  ): Promise<T> {
    const retryCount = this.retryCounts.get(errorKey) || 0;

    if (retryCount >= this.maxRetries) {
      throw new Error(`Max retries (${this.maxRetries}) exceeded for: ${errorKey}`);
    }

    try {
      const result = await operation();
      
      // Success - reset retry count
      this.retryCounts.delete(errorKey);
      
      return result;
    } catch (error) {
      const newRetryCount = retryCount + 1;
      this.retryCounts.set(errorKey, newRetryCount);

      if (onRetry) {
        onRetry(newRetryCount);
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.baseDelay * Math.pow(2, retryCount),
        this.maxDelay
      );

      if (this.logging) {
        console.log(`[CRDTErrorHandler] Retrying ${errorKey} (attempt ${newRetryCount}/${this.maxRetries}) in ${delay}ms`);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));

      // Recursive retry
      return this.retry(operation, errorKey, onRetry);
    }
  }

  /**
   * Mark error as recovered
   */
  public markRecovered(error: CRDTError): void {
    if (this.onRecoverCallback) {
      this.onRecoverCallback(error);
    }

    if (this.logging) {
      console.log('[CRDTErrorHandler] Error recovered:', error.type);
    }
  }

  /**
   * Get error history
   */
  public getErrorHistory(): CRDTError[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
    this.retryCounts.clear();
  }

  /**
   * Get recent errors of a specific type
   */
  public getRecentErrors(type: CRDTErrorType, count: number = 10): CRDTError[] {
    return this.errorHistory
      .filter(e => e.type === type)
      .slice(-count);
  }
}

/**
 * Create an error handler
 */
export function createErrorHandler(
  options?: ErrorHandlerOptions
): CRDTErrorHandler {
  return new CRDTErrorHandler(options);
}

