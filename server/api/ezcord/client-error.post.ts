type EzcordClientErrorBody = {
  kind?: unknown;
  message?: unknown;
  stack?: unknown;
  source?: unknown;
  url?: unknown;
  userAgent?: unknown;
  viewport?: unknown;
};

export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "client_error", 30, 60_000);

  const body = await readBody<EzcordClientErrorBody>(event).catch(() => ({}));
  const user = await getEzcordUser(event).catch(() => null);
  const report = {
    at: new Date().toISOString(),
    userId: user?.id || "",
    ip: getClientIp(event),
    kind: cleanString(body.kind, 40),
    message: cleanString(body.message, 500),
    source: cleanString(body.source, 240),
    stack: cleanString(body.stack, 1600),
    url: cleanString(body.url, 700),
    userAgent: cleanString(body.userAgent, 500),
    viewport: cleanString(body.viewport, 80),
  };

  console.warn("[ezcord-client-error]", JSON.stringify(report));

  return { ok: true };
});

function cleanString(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getClientIp(event: any) {
  return (
    getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ||
    getHeader(event, "x-real-ip") ||
    event.node.req.socket.remoteAddress ||
    "unknown"
  );
}
