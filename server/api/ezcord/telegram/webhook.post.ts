export default defineEventHandler(async (event) => {
  const expectedSecret = getEzcordEnv("EZCORD_WEBHOOK_SECRET");
  const actualSecret = getHeader(event, "x-telegram-bot-api-secret-token") || "";

  if (expectedSecret && expectedSecret !== actualSecret) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const update = await readBody<any>(event);
  const message = update.message || update.edited_message;
  const chatId = message?.chat?.id;
  const chatType = String(message?.chat?.type || "");
  const text = String(message?.text || "");
  const messageId = Number(message?.message_id || 0);

  if (!chatId) {
    return { ok: true };
  }

  if (messageId) {
    await deleteTelegramMessage(chatId, messageId);
  }

  if (!/^\/(start|voice|ezcord)(@\w+)?(?:\s|$)/.test(text)) {
    return { ok: true };
  }

  const baseWebAppUrl = getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";
  const launchUrl = ["group", "supergroup"].includes(chatType)
    ? `${baseWebAppUrl}?chat_id=${encodeURIComponent(String(chatId))}`
    : baseWebAppUrl;

  await sendTelegramMessage(
    chatId,
    ["group", "supergroup"].includes(chatType) ? "Ezcord\nГолосовая комната для этого чата." : "Ezcord\nВаша голосовая комната.",
    launchUrl,
  );

  return { ok: true };
});
