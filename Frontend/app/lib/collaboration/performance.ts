/**
 * Performance Optimization Utilities
 *
 * Helpers for batching, throttling, and debouncing collaboration operations.
 */

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastResult: ReturnType<T>;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(this, args);

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }

    return lastResult;
  };
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(this, args);
      timeout = null;
    }, wait);
  };
}

/**
 * Batch updates over a time window
 */
export class UpdateBatcher<T> {
  private batch: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly flushInterval: number;
  private readonly maxBatchSize: number;
  private readonly onFlush: (batch: T[]) => void;

  constructor(options: {
    flushInterval?: number;
    maxBatchSize?: number;
    onFlush: (batch: T[]) => void;
  }) {
    this.flushInterval = options.flushInterval || 100;
    this.maxBatchSize = options.maxBatchSize || 50;
    this.onFlush = options.onFlush;
  }

  /**
   * Add item to batch
   */
  public add(item: T): void {
    this.batch.push(item);

    // Flush if batch is full
    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.flushInterval);
    }
  }

  /**
   * Manually flush batch
   */
  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.batch.length > 0) {
      this.onFlush([...this.batch]);
      this.batch = [];
    }
  }

  /**
   * Clear batch without flushing
   */
  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.batch = [];
  }

  /**
   * Get current batch size
   */
  public size(): number {
    return this.batch.length;
  }
}

/**
 * Request Animation Frame throttle
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs) {
          func.apply(this, lastArgs);
        }
        rafId = null;
        lastArgs = null;
      });
    }
  };
}

/**
 * Idle callback throttle (runs when browser is idle)
 */
export function idleThrottle<T extends (...args: any[]) => any>(
  func: T,
  options?: IdleRequestOptions
): (...args: Parameters<T>) => void {
  let idleId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;

    if (idleId === null) {
      if (typeof requestIdleCallback !== 'undefined') {
        idleId = requestIdleCallback(() => {
          if (lastArgs) {
            func.apply(this, lastArgs);
          }
          idleId = null;
          lastArgs = null;
        }, options);
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          if (lastArgs) {
            func.apply(this, lastArgs);
          }
          idleId = null;
          lastArgs = null;
        }, 0);
      }
    }
  };
}

/**
 * Rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(options: { maxTokens: number; refillRate: number }) {
    this.maxTokens = options.maxTokens;
    this.refillRate = options.refillRate;
    this.tokens = options.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   */
  public tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  public getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Memory-bounded cache
 */
export class BoundedCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Set item in cache
   */
  public set(key: K, value: V): void {
    // If at capacity, remove oldest item (first item in Map)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  /**
   * Get item from cache
   */
  public get(key: K): V | undefined {
    return this.cache.get(key);
  }

  /**
   * Check if key exists
   */
  public has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete item from cache
   */
  public delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear cache
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  public size(): number {
    return this.cache.size;
  }
}

/**
 * Performance monitor
 */
export class PerformanceMonitor {
  private metrics = new Map<
    string,
    {
      count: number;
      totalTime: number;
      minTime: number;
      maxTime: number;
      avgTime: number;
    }
  >();

  /**
   * Measure execution time of a function
   */
  public async measure<T>(
    name: string,
    func: () => T | Promise<T>
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await func();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      throw error;
    }
  }

  /**
   * Record a metric
   */
  private recordMetric(name: string, duration: number): void {
    const existing = this.metrics.get(name);

    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      this.metrics.set(name, {
        count: 1,
        totalTime: duration,
        minTime: duration,
        maxTime: duration,
        avgTime: duration,
      });
    }
  }

  /**
   * Get metrics
   */
  public getMetrics(): Map<string, any> {
    return new Map(this.metrics);
  }

  /**
   * Get metric by name
   */
  public getMetric(name: string): any {
    return this.metrics.get(name);
  }

  /**
   * Clear metrics
   */
  public clear(): void {
    this.metrics.clear();
  }

  /**
   * Print metrics to console
   */
  public printMetrics(): void {
    console.table(
      Array.from(this.metrics.entries()).map(([name, metric]) => ({
        Name: name,
        Count: metric.count,
        'Avg (ms)': metric.avgTime.toFixed(2),
        'Min (ms)': metric.minTime.toFixed(2),
        'Max (ms)': metric.maxTime.toFixed(2),
        'Total (ms)': metric.totalTime.toFixed(2),
      }))
    );
  }
}
