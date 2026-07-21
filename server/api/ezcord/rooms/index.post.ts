export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "rooms", 60);

  const body = await readBody<{
    name?: string;
    access?: "public" | "private" | "telegram_chat";
    telegramChatId?: string;
  }>(event);

  const access = body.access || "public";
  if (!["public", "private", "telegram_chat"].includes(access)) {
    throw createError({ statusCode: 400, message: "Неверный тип комнаты" });
  }

  if (access === "telegram_chat" && !body.telegramChatId) {
    throw createError({ statusCode: 400, message: "Укажите Telegram chat id" });
  }

  const room = await createEzcordRoom({
    name: String(body.name || ""),
    access,
    createdBy: user.id,
    telegramChatId: body.telegramChatId,
  });

  return { ok: true, room: { ...room, inviteUrl: roomInviteUrl(room) } };
});
