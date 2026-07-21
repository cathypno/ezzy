export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "telegram_link", 30);

  const body = await readBody<{ initData?: string }>(event);

  if (!body.initData) {
    throw createError({ statusCode: 400, message: "Нет Telegram initData" });
  }

  const telegram = await linkTelegramToEzcordUser(user.id, body.initData);
  return { ok: true, telegram };
});
