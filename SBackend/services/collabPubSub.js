/**
 * Collaboration Pub/Sub bridge
 *
 * Small wrapper around Redis pub/sub to fan-out Yjs updates
 * across multiple backend instances. Uses base64 to transport
 * binary update payloads safely.
 */

const DEFAULT_CHANNEL = process.env.COLLAB_REDIS_CHANNEL || 'collab:updates';
const REDIS_URL = process.env.COLLAB_REDIS_URL || process.env.WS_REDIS_URL || process.env.REDIS_URL;
const REDIS_TLS = process.env.COLLAB_REDIS_TLS === 'true' || process.env.REDIS_TLS === 'true';
const REDIS_PASSWORD = process.env.COLLAB_REDIS_PASSWORD || process.env.REDIS_PASSWORD;

class CollabPubSub {
  constructor(instanceId, logger = console) {
    this.instanceId = instanceId;
    this.logger = logger;
    this.channel = DEFAULT_CHANNEL;
    this.enabled = false;
    this.publisher = null;
    this.subscriber = null;
    this.onUpdate = null; // function ({ docId, type, payload })
    this.reconnecting = false;
    this.stats = {
      publishes: 0,
      received: 0,
      reconnects: 0,
    };
  }

  async init() {
    if (!REDIS_URL) {
      this.logger.info?.('ℹ️  Collaboration pub/sub disabled (no COLLAB_REDIS_URL/WS_REDIS_URL/REDIS_URL set)');
      return;
    }

    await this.connectWithRetry();
  }

  async publish(payload) {
    if (!this.enabled || !this.publisher) return;
    try {
      await this.publisher.publish(
        this.channel,
        JSON.stringify({
          ...payload,
          originId: this.instanceId,
        })
      );
      this.stats.publishes += 1;
    } catch (err) {
      this.logger.error?.('Failed to publish collaboration update to Redis:', err);
    }
  }

  async close() {
    try {
      if (this.subscriber) {
        await this.subscriber.unsubscribe(this.channel);
        await this.subscriber.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
    } catch (err) {
      this.logger.error?.('Error closing collaboration pub/sub clients:', err);
    }
  }

  async connectWithRetry() {
    let createClient;
    try {
      ({ createClient } = require('redis'));
    } catch (err) {
      this.logger.warn?.('⚠️  Redis client not installed; skipping collaboration pub/sub', err.message);
      return;
    }

    let attempt = 0;
    const maxDelay = 30_000;

    while (!this.enabled) {
      try {
        attempt += 1;
        const baseOpts = {
          url: REDIS_URL,
          password: REDIS_PASSWORD,
          socket: {
            reconnectStrategy: () => false,
            tls: REDIS_TLS ? {} : undefined,
          },
        };

        this.publisher = createClient(baseOpts);
        this.subscriber = createClient(baseOpts);

        const onFatal = async (err) => {
          this.logger.warn?.('Redis connection lost, scheduling reconnect', { error: err?.message });
          this.enabled = false;
          if (!this.reconnecting) {
            this.reconnecting = true;
            this.stats.reconnects += 1;
            await this.safeClose();
            await this.connectWithRetry();
          }
        };

        this.publisher.on('error', onFatal);
        this.subscriber.on('error', onFatal);

        await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

        await this.subscriber.subscribe(this.channel, (raw) => {
          try {
            const msg = JSON.parse(raw);
            if (!msg || msg.originId === this.instanceId) {
              return;
            }

            this.stats.received += 1;

            if (typeof this.onUpdate === 'function') {
              this.onUpdate(msg);
            }
          } catch (err) {
            this.logger.error?.('Failed to process collab pub/sub payload:', err);
          }
        });

        this.enabled = true;
        this.reconnecting = false;
        this.logger.info?.(`📡 Collaboration pub/sub enabled on channel \"${this.channel}\" after ${attempt} attempt(s)`);
        break;
      } catch (err) {
        const jitter = 0.5 + Math.random(); // 0.5x–1.5x
        const delay = Math.min(maxDelay, 1000 * Math.pow(2, attempt) * jitter);
        this.logger.warn?.(`Redis connect attempt ${attempt} failed; retrying in ${Math.round(delay)}ms`, { error: err?.message });
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  async safeClose() {
    try {
      if (this.subscriber) {
        await this.subscriber.quit();
      }
    } catch (_) {}
    try {
      if (this.publisher) {
        await this.publisher.quit();
      }
    } catch (_) {}
  }
}

module.exports = { CollabPubSub };
