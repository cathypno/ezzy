import {
  checkEzcordRateLimit,
  createTelegramLoginRequest,
  getTelegramBotUsername,
} from "../../../../utils/ezcord";

export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "telegram_login_request", 10);

  const request = await createTelegramLoginRequest();
  const botUsername = await getTelegramBotUsername();

  return {
    ok: true,
    requestId: request.id,
    expiresAt: request.expiresAt,
    botUrl: `https://t.me/${botUsername}?start=ezlogin_${encodeURIComponent(request.id)}`,
  };
});
