export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "rooms", 60);

  const body = await readBody<{
    name?: string;
    access?: "public" | "private" | "telegram_chat";
    game?: "voicechat" | "cs2" | "dota2" | "brawl_stars";
    goal?: "result" | "communication";
    telegramChatId?: string;
  }>(event);

  const access = body.access || "public";
  const game = body.game || "voicechat";
  const goal = body.goal || "communication";
  if (!["public", "private", "telegram_chat"].includes(access)) {
    throw createError({ statusCode: 400, message: "Неверный тип комнаты" });
  }

  if (!["voicechat", "cs2", "dota2", "brawl_stars"].includes(game)) {
    throw createError({ statusCode: 400, message: "Неверная игра" });
  }

  if (!["result", "communication"].includes(goal)) {
    throw createError({ statusCode: 400, message: "Неверная цель комнаты" });
  }

  if (access === "telegram_chat" && !body.telegramChatId) {
    throw createError({ statusCode: 400, message: "Укажите Telegram chat id" });
  }

  const room = await createEzcordRoom({
    name: String(body.name || ""),
    access,
    game,
    goal,
    createdBy: user.id,
    telegramChatId: body.telegramChatId,
  });

  return { ok: true, room: { ...room, inviteUrl: roomInviteUrl(room) } };
});
