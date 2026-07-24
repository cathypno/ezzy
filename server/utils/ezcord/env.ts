import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getEzcordEnv(key: string): string {
  const runtimeValue = process.env[key];
  if (runtimeValue) return runtimeValue;

  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";

  const line = readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));

  if (!line) return "";

  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

export function usePostgresStore(): boolean {
  return Boolean(getEzcordEnv("EZCORD_DATABASE_URL")) && getEzcordEnv("EZCORD_STORAGE") !== "json";
}

export function useRedisStore(): boolean {
  return Boolean(getEzcordEnv("EZCORD_REDIS_URL"));
}

export function useRedisLiveState(): boolean {
  return useRedisStore() && getEzcordEnv("EZCORD_LIVE_STATE") !== "json";
}

export function getRateLimitWindowMs(): number {
  return Number(getEzcordEnv("EZCORD_RATE_LIMIT_WINDOW_MS") || "60000");
}

export function getRateLimitMax(): number {
  return Number(getEzcordEnv("EZCORD_RATE_LIMIT_MAX") || "240");
}
