/**
 * Performance Utilities Unit Tests
 * 
 * Tests throttle, debounce, UpdateBatcher, RateLimiter, and other performance utilities.
 */

import {
  throttle,
  debounce,
  UpdateBatcher,
  RateLimiter,
  BoundedCache,
} from '../app/lib/collaboration/performance';

describe('Performance Utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('throttle', () => {
    it('should call function immediately on first call', () => {
      const func = jest.fn((x: number) => x * 2);
      const throttled = throttle(func, 100);

      const result = throttled(5);

      expect(func).toHaveBeenCalledTimes(1);
      expect(result).toBe(10);
    });

    it('should throttle subsequent calls within limit', () => {
      const func = jest.fn();
      const throttled = throttle(func, 100);

      throttled();
      throttled();
      throttled();

      expect(func).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      throttled();

      expect(func).toHaveBeenCalledTimes(2);
    });

    it('should return last result during throttle period', () => {
      const func = jest.fn((x: number) => x);
      const throttled = throttle(func, 100);

      throttled(1);
      const result2 = throttled(2);
      const result3 = throttled(3);

      expect(result2).toBe(1); // Returns first result
      expect(result3).toBe(1); // Returns first result
    });
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced();
      expect(func).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced();
      jest.advanceTimersByTime(50);
      expect(func).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should call function with correct arguments', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('UpdateBatcher', () => {
    it('should batch items and flush after interval', () => {
      const onFlush = jest.fn();
      const batcher = new UpdateBatcher({
        flushInterval: 100,
        maxBatchSize: 10,
        onFlush,
      });

      batcher.add('item1');
      batcher.add('item2');
      expect(onFlush).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(onFlush).toHaveBeenCalledWith(['item1', 'item2']);
    });

    it('should flush immediately when max batch size reached', () => {
      const onFlush = jest.fn();
      const batcher = new UpdateBatcher({
        flushInterval: 1000,
        maxBatchSize: 3,
        onFlush,
      });

      batcher.add('item1');
      batcher.add('item2');
      batcher.add('item3');

      expect(onFlush).toHaveBeenCalledWith(['item1', 'item2', 'item3']);
    });

    it('should reset timer after flush', () => {
      const onFlush = jest.fn();
      const batcher = new UpdateBatcher({
        flushInterval: 100,
        maxBatchSize: 10,
        onFlush,
      });

      batcher.add('item1');
      jest.advanceTimersByTime(100);
      expect(onFlush).toHaveBeenCalledTimes(1);

      batcher.add('item2');
      jest.advanceTimersByTime(100);
      expect(onFlush).toHaveBeenCalledTimes(2);
    });

    it('should clear batch after flush', () => {
      const onFlush = jest.fn();
      const batcher = new UpdateBatcher({
        flushInterval: 100,
        maxBatchSize: 10,
        onFlush,
      });

      batcher.add('item1');
      batcher.flush();
      batcher.add('item2');
      jest.advanceTimersByTime(100);

      expect(onFlush).toHaveBeenCalledTimes(2);
      expect(onFlush).toHaveBeenNthCalledWith(1, ['item1']);
      expect(onFlush).toHaveBeenNthCalledWith(2, ['item2']);
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within rate limit', () => {
      // RateLimiter uses token bucket: maxTokens and refillRate (tokens per second)
      const limiter = new RateLimiter({ maxTokens: 5, refillRate: 5 });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getTokens()).toBe(4);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getTokens()).toBe(3);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getTokens()).toBe(2);
    });

    it('should block requests exceeding rate limit', () => {
      const limiter = new RateLimiter({ maxTokens: 2, refillRate: 2 });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getTokens()).toBe(1);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getTokens()).toBe(0);
      expect(limiter.tryConsume()).toBe(false);
    });

    it('should reset after window expires', () => {
      const limiter = new RateLimiter({ maxTokens: 2, refillRate: 2 });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(false);

      // After 1 second, tokens should refill (refillRate = 2 tokens/second)
      jest.advanceTimersByTime(1000);
      expect(limiter.getTokens()).toBeGreaterThan(0);
      expect(limiter.tryConsume()).toBe(true);
    });

    it('should return current token count', () => {
      const limiter = new RateLimiter({ maxTokens: 5, refillRate: 5 });

      expect(limiter.getTokens()).toBe(5);
      limiter.tryConsume();
      expect(limiter.getTokens()).toBe(4);
      limiter.tryConsume();
      expect(limiter.getTokens()).toBe(3);
    });
  });

  describe('BoundedCache', () => {
    it('should store and retrieve values', () => {
      // BoundedCache constructor takes maxSize as a number directly
      const cache = new BoundedCache<string, number>(3);

      cache.set('key1', 1);
      expect(cache.get('key1')).toBe(1);
    });

    it('should evict oldest entries when max size exceeded', () => {
      const cache = new BoundedCache<string, number>(2);

      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);

      // Map maintains insertion order, so first key should be evicted
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe(2);
      expect(cache.get('key3')).toBe(3);
    });

    it('should update existing entries', () => {
      const cache = new BoundedCache<string, number>(2);

      cache.set('key1', 1);
      cache.set('key1', 2);
      expect(cache.get('key1')).toBe(2);
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new BoundedCache<string, number>(2);

      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should support has() method', () => {
      const cache = new BoundedCache<string, number>(2);

      expect(cache.has('key1')).toBe(false);
      cache.set('key1', 1);
      expect(cache.has('key1')).toBe(true);
    });

    it('should support clear() method', () => {
      const cache = new BoundedCache<string, number>(2);

      cache.set('key1', 1);
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('should return correct size', () => {
      const cache = new BoundedCache<string, number>(3);

      expect(cache.size()).toBe(0);
      cache.set('key1', 1);
      expect(cache.size()).toBe(1);
      cache.set('key2', 2);
      expect(cache.size()).toBe(2);
    });
  });
});

