import { createClient } from 'redis';

class CacheManager {
  constructor() {
    this.client = null;
    this.isEnabled = false;
  }

  async connect(redisUrl, enabled = false) {
    if (!enabled) {
      console.log('redis caching disabled - using inmemory fallback');
      this.isEnabled = false;
      return;
    }

    try {
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('redis max retries reached');
              return new Error('max retries reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('redis client error:', err);
      });

      this.client.on('connect', () => {
        console.log('redis connected');
      });

      this.client.on('reconnecting', () => {
        console.log('redis reconnecting..');
      });

      await this.client.connect();
      this.isEnabled = true;
      console.log('reddis cache enabled');
    } catch (error) {
      console.error('redis connection failed:', error.message);
      console.log('falling back to in-memory caching');
      this.isEnabled = false
    }
  }

  async get(key) {
    if (!this.isEnabled || !this.client) return null;
    






    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key, value, expirationSeconds = 3600) {
    if (!this.isEnabled || !this.client) return false;
    
    try {
      await this.client.setEx(key, expirationSeconds, JSON.stringify(value));
      return true
    } catch (error) {
      console.error('Redis SET error:', error);
      return false
    }
  }


  async del(key) {
    if (!this.isEnabled || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('redis DEL error:', error);
      return false;
    }
  }

  async publish(channel, message) {
    if (!this.isEnabled || !this.client) return false;
    
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
      return false
    }
  }

  async subscribe(channel, callback) {
    if (!this.isEnabled || !this.client) return null;
    
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      
      await subscriber.subscribe(channel, (message) => {
        try {
          callback(JSON.parse(message));
        } catch (error) {
          console.error('Error parsing redis message:', error);
        }
      });
      
      return subscriber;
    } catch (error) {
      console.error('redis SUBSCRIBE error:', error);
      return null;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      console.log('redis disconnected');
    }
  }

  isActive() {
    return this.isEnabled && this.client?.isOpen;
  }
}

export default new CacheManager();