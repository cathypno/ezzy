import { createError } from "h3";
import { usePostgresStore, useRedisStore } from "./env";
import { getPgPool, rowToTelegramLoginRequest } from "./postgres";
import { getRedis } from "./redis";
import { readEzcordData, writeEzcordData } from "./json-store";
import { randomId } from "./id";
import { getOrCreateEzcordTelegramUserFromPayload } from "./auth";
import type { EzcordTelegramLoginRequest, EzcordTelegramUserPayload, EzcordUser } from "./types";

const TELEGRAM_LOGIN_TTL_SECONDS = 5 * 60;

export async function createTelegramLoginRequest(): Promise<EzcordTelegramLoginRequest> {
  const now = Date.now();
  const request: EzcordTelegramLoginRequest = {
    id: randomId("tglogin"),
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TELEGRAM_LOGIN_TTL_SECONDS * 1000).toISOString(),
  };

  if (useRedisStore()) {
    const redis = await getRedis();
    await redis.set(telegramLoginRequestKey(request.id), JSON.stringify(request), "EX", TELEGRAM_LOGIN_TTL_SECONDS);
    return request;
  }

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_telegram_login_requests (id, status, created_at, expires_at)
       values ($1, $2, $3, $4)`,
      [request.id, request.status, request.createdAt, request.expiresAt],
    );
    return request;
  }

  const data = readEzcordData();
  data.telegramLoginRequests = data.telegramLoginRequests
    .filter((item) => new Date(item.expiresAt).getTime() > now - 24 * 60 * 60 * 1000)
    .concat(request);
  writeEzcordData(data);
  return request;
}

export async function getTelegramLoginRequest(requestId: string): Promise<EzcordTelegramLoginRequest | null> {
  let request: EzcordTelegramLoginRequest | null;

  if (useRedisStore()) {
    const redis = await getRedis();
    const raw = await redis.get(telegramLoginRequestKey(requestId));
    request = raw ? (JSON.parse(raw) as EzcordTelegramLoginRequest) : null;
  } else if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select * from ezcord_telegram_login_requests where id = $1", [requestId]);
    request = result.rows[0] ? rowToTelegramLoginRequest(result.rows[0]) : null;
  } else {
    const data = readEzcordData();
    request = data.telegramLoginRequests.find((item) => item.id === requestId) || null;
  }

  if (request && request.status === "pending" && new Date(request.expiresAt).getTime() <= Date.now()) {
    request.status = "expired";
    await saveTelegramLoginRequest(request);
  }

  return request;
}

export async function bindTelegramLoginRequest(requestId: string, telegramId: number): Promise<void> {
  const request = await getTelegramLoginRequest(requestId);
  if (!request) {
    throw createError({ statusCode: 404, message: "Запрос авторизации не найден" });
  }
  if (request.status !== "pending") {
    throw createError({ statusCode: 410, message: "Запрос авторизации уже недействителен" });
  }
  if (request.telegramId && request.telegramId !== telegramId) {
    throw createError({ statusCode: 403, message: "Запрос создан для другого Telegram-аккаунта" });
  }

  request.telegramId = telegramId;
  await saveTelegramLoginRequest(request);
}

export async function approveTelegramLoginRequest(
  requestId: string,
  telegramUser: EzcordTelegramUserPayload,
): Promise<EzcordUser> {
  const request = await getTelegramLoginRequest(requestId);
  if (!request) {
    throw createError({ statusCode: 404, message: "Запрос авторизации не найден" });
  }
  if (request.status !== "pending") {
    throw createError({ statusCode: 410, message: "Запрос авторизации уже недействителен" });
  }
  if (request.telegramId && request.telegramId !== telegramUser.id) {
    throw createError({ statusCode: 403, message: "Подтвердить может только тот Telegram, который открыл запрос" });
  }

  const user = await getOrCreateEzcordTelegramUserFromPayload(telegramUser);
  request.telegramId = telegramUser.id;
  request.userId = user.id;
  request.status = "approved";
  request.confirmedAt = new Date().toISOString();
  await saveTelegramLoginRequest(request);
  return user;
}

export async function consumeTelegramLoginRequest(requestId: string): Promise<string | null> {
  const request = await getTelegramLoginRequest(requestId);
  if (!request || request.status !== "approved" || !request.userId) return null;

  request.status = "consumed";
  request.consumedAt = new Date().toISOString();
  await saveTelegramLoginRequest(request);
  return request.userId;
}

async function saveTelegramLoginRequest(request: EzcordTelegramLoginRequest): Promise<void> {
  if (useRedisStore()) {
    const redis = await getRedis();
    const ttl = ["consumed", "expired"].includes(request.status)
      ? 60
      : Math.max(1, Math.ceil((new Date(request.expiresAt).getTime() - Date.now()) / 1000));
    await redis.set(telegramLoginRequestKey(request.id), JSON.stringify(request), "EX", ttl);
    return;
  }

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `update ezcord_telegram_login_requests
          set status = $2,
              telegram_id = $3,
              user_id = $4,
              confirmed_at = $5,
              consumed_at = $6
        where id = $1`,
      [request.id, request.status, request.telegramId, request.userId, request.confirmedAt, request.consumedAt],
    );
    return;
  }

  const data = readEzcordData();
  const index = data.telegramLoginRequests.findIndex((item) => item.id === request.id);
  if (index >= 0) data.telegramLoginRequests[index] = request;
  writeEzcordData(data);
}

function telegramLoginRequestKey(requestId: string): string {
  return `ezcord:telegram:login:${requestId}`;
}
