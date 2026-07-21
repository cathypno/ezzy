export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "telegram_auth", 60);

  const body = await readBody<{ initData?: string }>(event);
  if (!body.initData) {
    throw createError({ statusCode: 400, message: "Нет Telegram initData" });
  }

  const user = await getOrCreateEzcordTelegramUser(body.initData);
  await createEzcordSession(event, user.id);

  return { ok: true, user: publicEzcordUser(user) };
});
