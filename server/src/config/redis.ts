import Redis from 'ioredis';

/**
 * Creates and configures a Redis client connection.
 * Used for caching cart state, product prices, and session data.
 */
export function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 3) {
        console.error('Redis: max retries reached, giving up');
        return null;
      }
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: true,
  });

  redis.on('connect', () => {
    console.log('Redis: connected successfully');
  });

  redis.on('error', (err) => {
    console.error('Redis: connection error', err.message);
  });

  redis.on('close', () => {
    console.log('Redis: connection closed');
  });

  return redis;
}

let redisClient: Redis | null = null;

/**
 * Returns the singleton Redis client instance.
 * Creates a new connection if one doesn't exist.
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

/**
 * Closes the Redis connection gracefully.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Wraps a Redis operation with a timeout (default 2 seconds).
 * Ensures that commands fail fast if Redis is unresponsive.
 */
export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number = 2000): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Redis operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timer!);
    return result as T;
  } catch (error) {
    clearTimeout(timer!);
    throw error;
  }
}
