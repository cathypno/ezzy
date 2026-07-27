import { scryptSync, randomBytes } from "node:crypto";
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import { usePostgresStore } from "./env";
import { getEzcordLevelFromXp, isEzcordLobbyUnlocked, normalizeEzcordUserEconomy } from "./economy";
import { getPgPool, rowToUser } from "./postgres";
import { readEzcordData, writeEzcordData, findJsonUserByEmail } from "./json-store";
import { randomId, normalizeEmail, isValidEmail, safeEqual } from "./id";
import { verifyTelegramInitData } from "./telegram-bot";
import type { EzcordPublicUser, EzcordSession, EzcordTelegramIdentity, EzcordTelegramUserPayload, EzcordUser } from "./types";

export const EZCORD_SESSION_COOKIE = "ezcord_session";
const TELEGRAM_EMAIL_DOMAIN = "telegram.ezcord.local";

export function publicEzcordUser(user: EzcordUser): EzcordPublicUser {
  const normalized = normalizeEzcordUserEconomy({ ...user });
  const level = getEzcordLevelFromXp(normalized.xp);

  return {
    id: user.id,
    email: isSyntheticTelegramEmail(user.email) ? "" : user.email,
    displayName: user.displayName,
    points: normalized.coins,
    coins: normalized.coins,
    xp: normalized.xp,
    level,
    lobbyUnlocked: isEzcordLobbyUnlocked(normalized),
    chestOpenCount: normalized.chestOpenCount,
    onboardingCompletedAt: normalized.onboardingCompletedAt,
    telegram: user.telegram,
  };
}

export async function requireEzcordUser(event: H3Event): Promise<EzcordUser> {
  const user = await getEzcordUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "Нужно войти в Ezcord" });
  }
  return user;
}

export async function getEzcordUser(event: H3Event): Promise<EzcordUser | null> {
  const sessionId = getCookie(event, EZCORD_SESSION_COOKIE);
  if (!sessionId) return null;
  return await getEzcordUserBySessionId(sessionId);
}

export async function getEzcordUserBySessionId(sessionId: string): Promise<EzcordUser | null> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(
      `select u.*
         from ezcord_sessions s
         join ezcord_users u on u.id = s.user_id
        where s.id = $1`,
      [sessionId],
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  const data = readEzcordData();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  return data.users.find((user) => user.id === session.userId) || null;
}

export async function getEzcordUserById(userId: string): Promise<EzcordUser | null> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select * from ezcord_users where id = $1", [userId]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  const data = readEzcordData();
  return data.users.find((user) => user.id === userId) || null;
}

export async function createEzcordSession(event: H3Event, userId: string): Promise<void> {
  const session: EzcordSession = {
    id: randomId("sess"),
    userId,
    createdAt: new Date().toISOString(),
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query("delete from ezcord_sessions where user_id = $1", [userId]);
    await pool.query("insert into ezcord_sessions (id, user_id, created_at) values ($1, $2, $3)", [
      session.id,
      session.userId,
      session.createdAt,
    ]);
  } else {
    const data = readEzcordData();
    data.sessions = data.sessions.filter((item) => item.userId !== userId);
    data.sessions.push(session);
    writeEzcordData(data);
  }

  setCookie(event, EZCORD_SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearEzcordSession(event: H3Event): Promise<void> {
  const sessionId = getCookie(event, EZCORD_SESSION_COOKIE);
  if (sessionId) {
    if (usePostgresStore()) {
      const pool = await getPgPool();
      await pool.query("delete from ezcord_sessions where id = $1", [sessionId]);
    } else {
      const data = readEzcordData();
      data.sessions = data.sessions.filter((item) => item.id !== sessionId);
      writeEzcordData(data);
    }
  }

  deleteCookie(event, EZCORD_SESSION_COOKIE, { path: "/" });
}

export async function createEzcordUser(email: string, password: string, displayName: string): Promise<EzcordUser> {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw createError({ statusCode: 400, message: "Проверьте email" });
  }

  if (isSyntheticTelegramEmail(normalizedEmail)) {
    throw createError({ statusCode: 400, message: "Укажите обычный email" });
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: "Пароль должен быть не короче 8 символов" });
  }

  const fallbackDisplayName = normalizedEmail.split("@")[0] || normalizedEmail;
  const user: EzcordUser = {
    id: randomId("user"),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    displayName: displayName.trim() || fallbackDisplayName,
    points: 0,
    coins: 0,
    xp: 0,
    chestOpenCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    try {
      await pool.query(
        `insert into ezcord_users (id, email, password_hash, display_name, created_at)
         values ($1, $2, $3, $4, $5)`,
        [user.id, user.email, user.passwordHash, user.displayName, user.createdAt],
      );
    } catch (error: any) {
      if (error?.code === "23505") {
        throw createError({ statusCode: 409, message: "Такой email уже зарегистрирован" });
      }
      throw error;
    }
    return user;
  }

  const data = readEzcordData();
  if (data.users.some((item) => item.email === normalizedEmail)) {
    throw createError({ statusCode: 409, message: "Такой email уже зарегистрирован" });
  }
  data.users.push(user);
  writeEzcordData(data);
  return user;
}

export async function findEzcordUserByCredentials(email: string, password: string): Promise<EzcordUser> {
  const normalizedEmail = normalizeEmail(email);
  const user = usePostgresStore() ? await findEzcordUserByEmail(normalizedEmail) : findJsonUserByEmail(normalizedEmail);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw createError({ statusCode: 401, message: "Неверный email или пароль" });
  }

  return user;
}

export async function getOrCreateEzcordTelegramUser(initData: string): Promise<EzcordUser> {
  const webAppUser = verifyTelegramInitData(initData);
  return await getOrCreateEzcordTelegramUserFromPayload(webAppUser);
}

export async function getOrCreateEzcordTelegramUserFromPayload(telegramUser: EzcordTelegramUserPayload): Promise<EzcordUser> {
  const identity = telegramIdentityFromWebAppUser(telegramUser);
  const displayName = telegramDisplayName(identity);
  const existingUser = await findEzcordUserByTelegramId(identity.id);

  if (existingUser) {
    return await updateEzcordUserTelegram(existingUser.id, identity, displayName);
  }

  const user: EzcordUser = {
    id: randomId("user"),
    email: syntheticTelegramEmail(identity.id),
    passwordHash: hashPassword(randomId("telegram")),
    displayName,
    points: 0,
    coins: 0,
    xp: 0,
    chestOpenCount: 0,
    createdAt: new Date().toISOString(),
    telegram: identity,
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_users
        (id, email, password_hash, display_name, created_at, telegram_id, telegram_username, telegram_first_name, telegram_last_name, telegram_photo_url, telegram_linked_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (telegram_id) do nothing`,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.displayName,
        user.createdAt,
        identity.id,
        identity.username,
        identity.firstName,
        identity.lastName,
        identity.photoUrl,
        identity.linkedAt,
      ],
    );

    const createdUser = await findEzcordUserByTelegramId(identity.id);
    if (!createdUser) {
      throw createError({ statusCode: 500, message: "Не получилось создать Telegram-аккаунт" });
    }
    return createdUser;
  }

  const data = readEzcordData();
  const concurrentUser = data.users.find((item) => item.telegram?.id === identity.id);
  if (concurrentUser) return concurrentUser;

  data.users.push(user);
  writeEzcordData(data);
  return user;
}

export async function attachEzcordEmailToUser(userId: string, email: string, password: string, displayName = ""): Promise<EzcordUser> {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw createError({ statusCode: 400, message: "Проверьте email" });
  }

  if (isSyntheticTelegramEmail(normalizedEmail)) {
    throw createError({ statusCode: 400, message: "Укажите обычный email" });
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: "Пароль должен быть не короче 8 символов" });
  }

  const passwordHash = hashPassword(password);
  const nextDisplayName = displayName.trim();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const owner = await pool.query("select id from ezcord_users where email = $1 and id <> $2", [normalizedEmail, userId]);
    if (owner.rowCount > 0) {
      throw createError({ statusCode: 409, message: "Такой email уже зарегистрирован" });
    }

    const result = await pool.query(
      `update ezcord_users
          set email = $1,
              password_hash = $2,
              display_name = case when $3::text <> '' then $3 else display_name end
        where id = $4
        returning *`,
      [normalizedEmail, passwordHash, nextDisplayName, userId],
    );

    if (result.rowCount === 0) {
      throw createError({ statusCode: 404, message: "Пользователь не найден" });
    }
    return rowToUser(result.rows[0]);
  }

  const data = readEzcordData();
  const owner = data.users.find((user) => user.email === normalizedEmail && user.id !== userId);
  if (owner) {
    throw createError({ statusCode: 409, message: "Такой email уже зарегистрирован" });
  }

  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    throw createError({ statusCode: 404, message: "Пользователь не найден" });
  }

  user.email = normalizedEmail;
  user.passwordHash = passwordHash;
  if (nextDisplayName) user.displayName = nextDisplayName;
  writeEzcordData(data);
  return user;
}

export async function linkTelegramToEzcordUser(userId: string, initData: string): Promise<EzcordTelegramIdentity> {
  const webAppUser = verifyTelegramInitData(initData);
  const identity = telegramIdentityFromWebAppUser(webAppUser);

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const owner = await pool.query("select id from ezcord_users where telegram_id = $1 and id <> $2", [identity.id, userId]);
    if (owner.rowCount > 0) {
      throw createError({ statusCode: 409, message: "Этот Telegram уже привязан к другому аккаунту" });
    }

    const result = await pool.query(
      `update ezcord_users
          set telegram_id = $1,
              telegram_username = $2,
              telegram_first_name = $3,
              telegram_last_name = $4,
              telegram_photo_url = $5,
              telegram_linked_at = $6
        where id = $7`,
      [identity.id, identity.username, identity.firstName, identity.lastName, identity.photoUrl, identity.linkedAt, userId],
    );
    if (result.rowCount === 0) {
      throw createError({ statusCode: 404, message: "Пользователь не найден" });
    }
    return identity;
  }

  const data = readEzcordData();
  const owner = data.users.find((user) => user.telegram?.id === webAppUser.id && user.id !== userId);
  if (owner) {
    throw createError({ statusCode: 409, message: "Этот Telegram уже привязан к другому аккаунту" });
  }

  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    throw createError({ statusCode: 404, message: "Пользователь не найден" });
  }

  user.telegram = identity;
  writeEzcordData(data);
  return identity;
}

export async function completeEzcordOnboarding(userId: string): Promise<EzcordUser> {
  const completedAt = new Date().toISOString();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(
      `update ezcord_users
          set onboarding_completed_at = coalesce(onboarding_completed_at, $1)
        where id = $2
        returning *`,
      [completedAt, userId],
    );
    if (result.rowCount === 0) {
      throw createError({ statusCode: 404, message: "Пользователь не найден" });
    }
    return rowToUser(result.rows[0]);
  }

  const data = readEzcordData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    throw createError({ statusCode: 404, message: "Пользователь не найден" });
  }

  user.onboardingCompletedAt ||= completedAt;
  writeEzcordData(data);
  return user;
}

async function findEzcordUserByEmail(email: string): Promise<EzcordUser | null> {
  const pool = await getPgPool();
  const result = await pool.query("select * from ezcord_users where email = $1", [email]);
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

async function findEzcordUserByTelegramId(telegramId: number): Promise<EzcordUser | null> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select * from ezcord_users where telegram_id = $1", [telegramId]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  const data = readEzcordData();
  return data.users.find((item) => item.telegram?.id === telegramId) || null;
}

async function updateEzcordUserTelegram(userId: string, identity: EzcordTelegramIdentity, displayName: string): Promise<EzcordUser> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(
      `update ezcord_users
          set telegram_id = $1,
              telegram_username = $2,
              telegram_first_name = $3,
              telegram_last_name = $4,
              telegram_photo_url = coalesce($5, telegram_photo_url),
              telegram_linked_at = $6,
              display_name = case
                when email like $7 then $8
                else display_name
              end
        where id = $9
        returning *`,
      [
        identity.id,
        identity.username,
        identity.firstName,
        identity.lastName,
        identity.photoUrl,
        identity.linkedAt,
        `%@${TELEGRAM_EMAIL_DOMAIN}`,
        displayName,
        userId,
      ],
    );
    if (result.rowCount === 0) {
      throw createError({ statusCode: 404, message: "Пользователь не найден" });
    }
    return rowToUser(result.rows[0]);
  }

  const data = readEzcordData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    throw createError({ statusCode: 404, message: "Пользователь не найден" });
  }

  user.telegram = {
    ...identity,
    photoUrl: identity.photoUrl || user.telegram?.photoUrl,
  };
  if (isSyntheticTelegramEmail(user.email)) {
    user.displayName = displayName;
  }
  writeEzcordData(data);
  return user;
}

function isSyntheticTelegramEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${TELEGRAM_EMAIL_DOMAIN}`);
}

function syntheticTelegramEmail(telegramId: number): string {
  return `telegram-${telegramId}-${randomBytes(6).toString("hex")}@${TELEGRAM_EMAIL_DOMAIN}`;
}

function telegramIdentityFromWebAppUser(webAppUser: EzcordTelegramUserPayload): EzcordTelegramIdentity {
  return {
    id: webAppUser.id,
    username: webAppUser.username,
    firstName: webAppUser.first_name,
    lastName: webAppUser.last_name,
    photoUrl: webAppUser.photo_url,
    linkedAt: new Date().toISOString(),
  };
}

function telegramDisplayName(identity: EzcordTelegramIdentity): string {
  return (
    [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim() ||
    (identity.username ? `@${identity.username}` : "") ||
    `Telegram ${identity.id}`
  );
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, salt, expectedHash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(actualHash, expectedHash);
}
