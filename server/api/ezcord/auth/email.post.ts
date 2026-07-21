export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "email_attach", 30);

  const body = await readBody<{
    email?: string;
    password?: string;
    displayName?: string;
  }>(event);

  const updatedUser = await attachEzcordEmailToUser(
    user.id,
    String(body.email || ""),
    String(body.password || ""),
    String(body.displayName || ""),
  );

  return { ok: true, user: publicEzcordUser(updatedUser) };
});
