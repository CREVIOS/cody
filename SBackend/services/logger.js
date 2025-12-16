/**
 * Structured Logger for Collaboration Service
 *
 * Provides structured logging with:
 * - Different log levels (debug, info, warn, error)
 * - Contextual metadata
 * - Performance metrics
 * - JSON formatting for log aggregation
 */

class Logger {
  constructor(context = {}) {
    this.context = context;
    this.metrics = new Map();
    this.silent = process.env.NODE_ENV === 'test';
  }

  /**
   * Format log entry
   */
  format(level, message, data = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    });
  }

  /**
   * Debug log
   */
  debug(message, data = {}) {
    if (this.silent) return;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(this.format('debug', message, data));
    }
  }

  /**
   * Info log
   */
  info(message, data = {}) {
    if (this.silent) return;
    console.log(this.format('info', message, data));
  }

  /**
   * Warning log
   */
  warn(message, data = {}) {
    if (this.silent) return;
    console.warn(this.format('warn', message, data));
  }

  /**
   * Error log
   */
  error(message, error, data = {}) {
    if (this.silent) return;
    console.error(
      this.format('error', message, {
        ...data,
        error: {
          message: error?.message,
          stack: error?.stack,
          code: error?.code,
        },
      })
    );
  }

  /**
   * Log metric
   */
  metric(name, value, unit = '', tags = {}) {
    if (this.silent) return;
    const metric = {
      timestamp: new Date().toISOString(),
      name,
      value,
      unit,
      tags: { ...this.context, ...tags },
    };

    console.log(this.format('metric', `Metric: ${name}`, metric));

    // Store for aggregation
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push(metric);
  }

  /**
   * Log event
   */
  event(eventName, data = {}) {
    this.info(`Event: ${eventName}`, {
      event: eventName,
      ...data,
    });
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext = {}) {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const summary = {};

    for (const [name, values] of this.metrics.entries()) {
      const nums = values.map((v) => v.value).filter((v) => typeof v === 'number');

      if (nums.length > 0) {
        summary[name] = {
          count: nums.length,
          sum: nums.reduce((a, b) => a + b, 0),
          avg: nums.reduce((a, b) => a + b, 0) / nums.length,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    }

    return summary;
  }
}

/**
 * Create a logger instance
 */
function createLogger(context = {}) {
  return new Logger(context);
}

module.exports = { Logger, createLogger };
