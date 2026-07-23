import { createHmac } from "node:crypto";

const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;

export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "voice_ice", 120);
  await requireEzcordUser(event);

  const iceServers: RTCIceServer[] = [];
  const stunUrls = parseIceUrls(getEzcordEnv("EZCORD_STUN_URLS") || "stun:stun.l.google.com:19302");
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  const turnUrls = parseIceUrls(getEzcordEnv("EZCORD_TURN_URLS"));
  const turnSecret = getEzcordEnv("EZCORD_TURN_SECRET");
  if (turnUrls.length > 0 && turnSecret) {
    const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    const username = String(expiresAt);
    const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
    iceServers.push({ urls: turnUrls, username, credential });
  }

  return {
    iceServers,
    ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS,
  };
});

function parseIceUrls(value: string): string[] {
  return value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}
