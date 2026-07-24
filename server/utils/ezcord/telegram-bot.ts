import { createHmac } from "node:crypto";
import { createError } from "h3";
import { getEzcordEnv, useRedisStore } from "./env";
import { getRedis } from "./redis";
import { safeEqual } from "./id";
import type { EzcordTelegramUserPayload } from "./types";

const telegramControlMessageIds = new Map<string, number>();
const telegramChatLocks = new Map<string, Promise<void>>();

export async function sendTelegramMessage(chatId: number | string, text: string, launchUrl?: string): Promise<number | null> {
  const webAppUrl = launchUrl || getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";
  return await sendTelegramControlMessage(chatId, text, {
    inline_keyboard: [
      [
        {
          text: "Открыть Ezcord",
          web_app: { url: webAppUrl },
        },
      ],
    ],
  });
}

export async function sendTelegramControlMessage(
  chatId: number | string,
  text: string,
  replyMarkup: Record<string, any>,
): Promise<number | null> {
  return await withTelegramChatLock(String(chatId), async () => {
    const previousMessageId = await getTelegramControlMessageId(String(chatId));
    let messageId: number | null;

    if (previousMessageId) {
      try {
        const result = await callTelegramApi("editMessageText", {
          chat_id: chatId,
          message_id: previousMessageId,
          text,
          reply_markup: replyMarkup,
        });
        messageId = Number(result?.message_id || previousMessageId);
      } catch {
        const result = await callTelegramApi("sendMessage", {
          chat_id: chatId,
          text,
          reply_markup: replyMarkup,
        });
        messageId = Number(result?.message_id || 0) || null;
        await deleteTelegramMessage(chatId, previousMessageId);
      }
    } else {
      const result = await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      });
      messageId = Number(result?.message_id || 0) || null;
    }

    if (messageId) {
      await setTelegramControlMessageId(String(chatId), messageId);
    }

    return messageId;
  });
}

export async function answerTelegramCallbackQuery(queryId: string, text?: string): Promise<void> {
  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: queryId,
    ...(text ? { text } : {}),
  });
}

export async function deleteTelegramMessage(chatId: number | string, messageId: number): Promise<void> {
  try {
    await callTelegramApi("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch {
    // The message may already be gone or the bot may lack delete permissions.
  }
}

async function callTelegramApi(method: string, body: Record<string, any>): Promise<any> {
  const token = getEzcordBotToken();
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw createError({ statusCode: 502, message: "Сервер не может подключиться к Telegram API" });
  }
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram API ${method} failed`);
  }

  return payload.result;
}

async function withTelegramChatLock<T>(chatId: string, action: () => Promise<T>): Promise<T> {
  const previous = telegramChatLocks.get(chatId);
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  telegramChatLocks.set(chatId, current);

  await previous?.catch(() => {});
  try {
    return await action();
  } finally {
    release();
    if (telegramChatLocks.get(chatId) === current) {
      telegramChatLocks.delete(chatId);
    }
  }
}

async function getTelegramControlMessageId(chatId: string): Promise<number | null> {
  if (useRedisStore()) {
    const redis = await getRedis();
    const value = await redis.get(telegramControlKey(chatId));
    return value ? Number(value) : null;
  }

  return telegramControlMessageIds.get(chatId) || null;
}

async function setTelegramControlMessageId(chatId: string, messageId: number): Promise<void> {
  if (useRedisStore()) {
    const redis = await getRedis();
    await redis.set(telegramControlKey(chatId), String(messageId));
    return;
  }

  telegramControlMessageIds.set(chatId, messageId);
}

function telegramControlKey(chatId: string): string {
  return `ezcord:telegram:control:${chatId}`;
}

function getEzcordBotToken(): string {
  const token = getEzcordEnv("EZCORD_BOT_TOKEN");
  if (!token) {
    throw createError({ statusCode: 500, message: "EZCORD_BOT_TOKEN не настроен" });
  }
  return token;
}

let telegramBotUsernamePromise: Promise<string> | null = null;

export async function getTelegramBotUsername(): Promise<string> {
  const configured = getEzcordEnv("EZCORD_BOT_USERNAME").replace(/^@/, "");
  if (configured) return configured;

  if (!telegramBotUsernamePromise) {
    telegramBotUsernamePromise = callTelegramApi("getMe", {}).then((bot) => {
      const username = String(bot?.username || "").replace(/^@/, "");
      if (!username) {
        throw createError({ statusCode: 500, message: "Не удалось определить username Telegram-бота" });
      }
      return username;
    });
  }

  return await telegramBotUsernamePromise;
}

export function verifyTelegramInitData(initData: string): EzcordTelegramUserPayload {
  const token = getEzcordBotToken();
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") || "";
  params.delete("hash");

  const authDate = Number(params.get("auth_date") || "0");
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24 * 7) {
    throw createError({ statusCode: 401, message: "Telegram-сессия устарела" });
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeEqual(receivedHash, calculatedHash)) {
    throw createError({ statusCode: 401, message: "Telegram-подпись не прошла проверку" });
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw createError({ statusCode: 400, message: "Telegram не передал пользователя" });
  }

  return JSON.parse(rawUser) as EzcordTelegramUserPayload;
}

export async function isTelegramChatMember(chatId: string, telegramUserId: number): Promise<boolean> {
  const token = getEzcordBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: telegramUserId }),
  });
  const payload = await response.json().catch(() => null);
  const status = payload?.result?.status;

  return Boolean(payload?.ok && status && !["left", "kicked"].includes(status));
}
