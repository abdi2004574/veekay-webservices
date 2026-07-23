import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL as string);

export async function resetRedis(): Promise<void> {
  await redis.flushdb();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
