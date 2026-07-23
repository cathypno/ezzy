import {
  answerTelegramCallbackQuery,
  approveTelegramLoginRequest,
  bindTelegramLoginRequest,
  deleteTelegramMessage,
  getEzcordEnv,
  sendTelegramControlMessage,
  sendTelegramMessage,
} from "../../../utils/ezcord";

export default defineEventHandler(async (event) => {
  const expectedSecret = getEzcordEnv("EZCORD_WEBHOOK_SECRET");
  const actualSecret = getHeader(event, "x-telegram-bot-api-secret-token") || "";

  if (expectedSecret && expectedSecret !== actualSecret) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const update = await readBody<any>(event);
  const callbackQuery = update.callback_query;

  if (callbackQuery) {
    const callbackData = String(callbackQuery.data || "");
    if (!callbackData.startsWith("ezlogin:")) {
      return { ok: true };
    }

    const requestId = callbackData.slice("ezlogin:".length);
    const chatId = callbackQuery.message?.chat?.id || callbackQuery.from?.id;
    const telegramId = Number(callbackQuery.from?.id || 0);

    try {
      if (!telegramId) {
        throw createError({ statusCode: 400, message: "Telegram-пользователь не определен" });
      }
      const user = await approveTelegramLoginRequest(requestId, {
        id: telegramId,
        first_name: callbackQuery.from?.first_name,
        last_name: callbackQuery.from?.last_name,
        username: callbackQuery.from?.username,
        photo_url: callbackQuery.from?.photo_url,
      });
      await answerTelegramCallbackQuery(String(callbackQuery.id), "Вход подтвержден");

      if (chatId) {
        await sendTelegramMessage(
          chatId,
          `Ezcord\nВход подтвержден для ${user.displayName}. Теперь можно вернуться на сайт.`,
          getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord",
        );
      }
    } catch (error: any) {
      const message = error?.message || "Не получилось подтвердить вход";
      await answerTelegramCallbackQuery(String(callbackQuery.id), message.slice(0, 190)).catch(() => {});
      if (chatId) {
        await sendTelegramControlMessage(chatId, `Ezcord\n${message}`, { inline_keyboard: [] }).catch(() => {});
      }
    }

    return { ok: true };
  }

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

  const startPayload = text.match(/^\/(?:start|voice|ezcord)(?:@\w+)?(?:\s+(.+))?$/)?.[1]?.trim() || "";
  if (startPayload.startsWith("ezlogin_")) {
    let requestId = "";
    try {
      requestId = decodeURIComponent(startPayload.slice("ezlogin_".length));
    } catch {
      return { ok: true };
    }
    const telegramId = Number(message.from?.id || 0);

    try {
      if (!telegramId) {
        throw createError({ statusCode: 400, message: "Telegram-пользователь не определен" });
      }
      await bindTelegramLoginRequest(requestId, telegramId);
      const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || "вашего Telegram";
      await sendTelegramControlMessage(
        chatId,
        `Ezcord\nПодтвердите вход как ${displayName}.`,
        {
          inline_keyboard: [[{ text: "Авторизоваться", callback_data: `ezlogin:${requestId}` }]],
        },
      );
    } catch (error: any) {
      await sendTelegramControlMessage(chatId, `Ezcord\n${error?.message || "Ссылка авторизации устарела"}`, {
        inline_keyboard: [],
      }).catch(() => {});
    }

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
