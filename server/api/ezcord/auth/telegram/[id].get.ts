import {
  checkEzcordRateLimit,
  consumeTelegramLoginRequest,
  createEzcordSession,
  getEzcordUserById,
  getTelegramLoginRequest,
  publicEzcordUser,
} from "../../../../utils/ezcord";

export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "telegram_login_status", 180);

  const requestId = getRouterParam(event, "id") || "";
  const request = await getTelegramLoginRequest(requestId);
  if (!request) {
    throw createError({ statusCode: 404, message: "Запрос авторизации не найден" });
  }

  if (request.status !== "approved") {
    return { ok: true, status: request.status, expiresAt: request.expiresAt };
  }

  const userId = await consumeTelegramLoginRequest(request.id);
  if (!userId) {
    return { ok: true, status: "consumed", expiresAt: request.expiresAt };
  }

  const user = await getEzcordUserById(userId);
  if (!user) {
    throw createError({ statusCode: 500, message: "Telegram-пользователь не найден" });
  }

  await createEzcordSession(event, user.id);
  return { ok: true, status: "approved", expiresAt: request.expiresAt, user: publicEzcordUser(user) };
});
