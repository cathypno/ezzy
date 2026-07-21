export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "auth", 30);

  const body = await readBody<{
    email?: string;
    password?: string;
    displayName?: string;
  }>(event);

  const user = await createEzcordUser(String(body.email || ""), String(body.password || ""), String(body.displayName || ""));
  await createEzcordSession(event, user.id);

  return { ok: true, user: publicEzcordUser(user) };
});
