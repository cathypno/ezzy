import { getEzcordEnv } from "./env";

let redisPromise: Promise<any> | null = null;

export async function getRedis(): Promise<any> {
  if (!redisPromise) {
    redisPromise = (async () => {
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(getEzcordEnv("EZCORD_REDIS_URL"), {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      });
      await redis.ping();
      return redis;
    })();
  }
  return redisPromise;
}

export async function scanKeys(pattern: string): Promise<string[]> {
  const redis = await getRedis();
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}
