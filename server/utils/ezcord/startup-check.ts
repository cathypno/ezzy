import { getEzcordEnv } from "./env";

export function validateEzcordEnv(): void {
  const problems: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (!getEzcordEnv("EZCORD_DATABASE_URL") && getEzcordEnv("EZCORD_STORAGE") !== "json") {
      problems.push(
        "EZCORD_DATABASE_URL is not set. Production requires Postgres (see README) — set EZCORD_STORAGE=json to opt into the local JSON fallback instead.",
      );
    }

    if (!getEzcordEnv("EZCORD_REDIS_URL") && getEzcordEnv("EZCORD_LIVE_STATE") !== "json") {
      problems.push(
        "EZCORD_REDIS_URL is not set. Production requires Redis (see README) — set EZCORD_LIVE_STATE=json to opt into the local JSON fallback instead.",
      );
    }
  }

  if (getEzcordEnv("EZCORD_BOT_TOKEN") && !getEzcordEnv("EZCORD_WEBHOOK_SECRET")) {
    console.warn(
      "[ezcord] EZCORD_BOT_TOKEN is set but EZCORD_WEBHOOK_SECRET is not. " +
        "The Telegram webhook endpoint will accept unauthenticated requests from anyone who finds its URL.",
    );
  }

  if (problems.length > 0) {
    throw new Error(`Ezcord misconfiguration:\n- ${problems.join("\n- ")}`);
  }
}
