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

  if (!chatId || !/^\/(start|voice|ezcord)(@\w+)?/.test(text)) {
    return { ok: true };
  }

  const baseWebAppUrl = getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";
  const launchUrl = ["group", "supergroup"].includes(chatType)
    ? `${baseWebAppUrl}?chat_id=${encodeURIComponent(String(chatId))}`
    : baseWebAppUrl;

  await sendTelegramMessage(
    chatId,
    "Ezcord готовит голосовые комнаты для этого чата. Откройте приложение, войдите по email и привяжите Telegram.",
    launchUrl,
  );

  return { ok: true };
});
