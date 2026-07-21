export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "auth", 30);

  const body = await readBody<{ email?: string; password?: string }>(event);
  const user = await findEzcordUserByCredentials(String(body.email || ""), String(body.password || ""));
  await createEzcordSession(event, user.id);

  return { ok: true, user: publicEzcordUser(user) };
});
