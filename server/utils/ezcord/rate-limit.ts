import { createError, getHeader, type H3Event } from "h3";
import { getRateLimitMax, getRateLimitWindowMs, useRedisLiveState } from "./env";
import { getRedis } from "./redis";

export async function checkEzcordRateLimit(event: H3Event, action: string, max = getRateLimitMax(), windowMs = getRateLimitWindowMs()): Promise<void> {
  const ip =
    getHeader(event, "x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ||
    getHeader(event, "x-real-ip") ||
    event.node.req.socket.remoteAddress ||
    "unknown";

  await checkEzcordRateLimitKey(action, ip, max, windowMs);
}

export async function checkEzcordRateLimitKey(action: string, keyPart: string, max = getRateLimitMax(), windowMs = getRateLimitWindowMs()): Promise<void> {
  if (!useRedisLiveState()) return;

  const redis = await getRedis();
  const key = `ezcord:rate:${action}:${keyPart}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  if (count > max) {
    throw createError({ statusCode: 429, message: "Слишком много запросов" });
  }
}
