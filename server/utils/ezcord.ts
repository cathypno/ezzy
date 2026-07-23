import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { join } from "node:path";
import { createError, deleteCookie, getCookie, getHeader, getQuery, getRouterParam, setCookie, type H3Event } from "h3";
import { encodeEzcordRoomBotStart } from "#shared/ezcord-launch";

setDefaultResultOrder("ipv4first");

const DATA_FILE = "ezcord.json";
export const EZCORD_SESSION_COOKIE = "ezcord_session";
const SIGNAL_TTL_SECONDS = 60;
const TELEGRAM_EMAIL_DOMAIN = "telegram.ezcord.local";
const TELEGRAM_LOGIN_TTL_SECONDS = 5 * 60;
const HOST_ROOM_REWARD_POINTS = 10;
const ACTIVITY_REWARD_POINTS = 5;
const ACTIVITY_REWARD_INTERVAL_MS = 15 * 60 * 1000;
const ACTIVITY_REWARD_RESET_GAP_MS = 3 * 60 * 1000;

export const EZCORD_MAX_ROOM_PARTICIPANTS = 5;

export type EzcordRoomAccess = "public" | "private" | "telegram_chat";
export type EzcordRoomGame = "voicechat" | "cs2" | "dota2" | "brawl_stars";
export type EzcordRoomGoal = "result" | "communication";
export type EzcordTelegramLoginStatus = "pending" | "approved" | "consumed" | "expired";

export interface EzcordUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  points: number;
  createdAt: string;
  activityRewardLastSeenAt?: string;
  activityRewardLastAwardedAt?: string;
  telegram?: EzcordTelegramIdentity;
}

export interface EzcordTelegramIdentity {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  linkedAt: string;
}

export interface EzcordRoom {
  id: string;
  name: string;
  access: EzcordRoomAccess;
  game: EzcordRoomGame;
  goal: EzcordRoomGoal;
  inviteCode?: string;
  telegramChatId?: string;
  createdBy: string;
  createdAt: string;
  closedAt?: string;
}

interface EzcordSession {
  id: string;
  userId: string;
  createdAt: string;
}

export interface EzcordPeer {
  roomId: string;
  peerId: string;
  userId: string;
  displayName: string;
  photoUrl?: string;
  lastSeenAt: string;
}

export interface EzcordWaitingPeer {
  roomId: string;
  peerId: string;
  userId: string;
  displayName: string;
  queuedAt: string;
}

export interface EzcordPresenceState {
  peers: EzcordPeer[];
  waiting: boolean;
  waitingCount: number;
}

export interface EzcordSignal {
  id: string;
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  type: "offer" | "answer" | "candidate";
  payload: any;
  createdAt: string;
}

export interface EzcordKickedPeer {
  roomId: string;
  userId: string;
  kickedBy: string;
  kickedAt: string;
}

export interface EzcordTelegramLoginRequest {
  id: string;
  status: EzcordTelegramLoginStatus;
  telegramId?: number;
  userId?: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  consumedAt?: string;
}

export interface EzcordPointEvent {
  id: string;
  userId: string;
  kind: string;
  dedupeKey: string;
  points: number;
  createdAt: string;
}

interface EzcordData {
  users: EzcordUser[];
  sessions: EzcordSession[];
  rooms: EzcordRoom[];
  peers: EzcordPeer[];
  waitingPeers: EzcordWaitingPeer[];
  signals: EzcordSignal[];
  kickedPeers: EzcordKickedPeer[];
  telegramLoginRequests: EzcordTelegramLoginRequest[];
  pointEvents: EzcordPointEvent[];
}

export interface EzcordPublicUser {
  id: string;
  email: string;
  displayName: string;
  points: number;
  telegram?: EzcordTelegramIdentity;
}

export interface EzcordTelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

type TelegramWebAppUser = EzcordTelegramUserPayload;

let pgPoolPromise: Promise<any> | null = null;
let pgSchemaPromise: Promise<void> | null = null;
let redisPromise: Promise<any> | null = null;
const telegramControlMessageIds = new Map<string, number>();
const telegramChatLocks = new Map<string, Promise<void>>();

export function readEzcordData(): EzcordData {
  const path = getEzcordDataPath();
  if (!existsSync(path)) {
    const initial: EzcordData = {
      users: [],
      sessions: [],
      rooms: [],
      peers: [],
      waitingPeers: [],
      signals: [],
      kickedPeers: [],
      telegramLoginRequests: [],
      pointEvents: [],
    };
    writeEzcordData(initial);
    return initial;
  }

  const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<EzcordData>;
  return {
    users: (data.users || []).map((user) => ({
      ...user,
      points: user.points || 0,
    })),
    sessions: data.sessions || [],
    rooms: (data.rooms || []).map((room) => ({
      ...room,
      game: room.game || "voicechat",
      goal: room.goal || "communication",
    })),
    peers: data.peers || [],
    waitingPeers: data.waitingPeers || [],
    signals: data.signals || [],
    kickedPeers: data.kickedPeers || [],
    telegramLoginRequests: data.telegramLoginRequests || [],
    pointEvents: data.pointEvents || [],
  };
}

export function writeEzcordData(data: EzcordData): void {
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(getEzcordDataPath(), JSON.stringify(data, null, 2), "utf-8");
}

export function publicEzcordUser(user: EzcordUser): EzcordPublicUser {
  return {
    id: user.id,
    email: isSyntheticTelegramEmail(user.email) ? "" : user.email,
    displayName: user.displayName,
    points: user.points || 0,
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
  let request: EzcordTelegramLoginRequest | null = null;

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

  const user: EzcordUser = {
    id: randomId("user"),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    displayName: displayName.trim() || normalizedEmail.split("@")[0],
    points: 0,
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

export async function awardEzcordRoomHostPoints(room: EzcordRoom, user: EzcordUser): Promise<EzcordUser> {
  if (room.createdBy !== user.id) return user;
  return (await awardEzcordPointsOnce(user.id, HOST_ROOM_REWARD_POINTS, "host_room", room.id)) || user;
}

export async function touchEzcordActivityReward(userId: string): Promise<EzcordUser> {
  const now = new Date();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await client.query("select * from ezcord_users where id = $1 for update", [userId]);
      if (current.rowCount === 0) {
        throw createError({ statusCode: 404, message: "Пользователь не найден" });
      }

      const reward = calculateActivityReward(rowToUser(current.rows[0]), now);
      const updated = await client.query(
        `update ezcord_users
            set points = points + $1,
                activity_reward_last_seen_at = $2,
                activity_reward_last_awarded_at = $3
          where id = $4
        returning *`,
        [reward.points, reward.lastSeenAt, reward.lastAwardedAt, userId],
      );
      await client.query("commit");
      return rowToUser(updated.rows[0]);
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const data = readEzcordData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    throw createError({ statusCode: 404, message: "Пользователь не найден" });
  }

  const reward = calculateActivityReward(user, now);
  user.points = (user.points || 0) + reward.points;
  user.activityRewardLastSeenAt = reward.lastSeenAt;
  user.activityRewardLastAwardedAt = reward.lastAwardedAt;
  writeEzcordData(data);
  return user;
}

export async function canAccessRoom(user: EzcordUser, room: EzcordRoom, inviteCode?: string): Promise<boolean> {
  if (room.closedAt) return false;
  if (room.createdBy === user.id) return true;
  if (room.access === "public") return true;
  if (room.access === "private") return Boolean(room.inviteCode && room.inviteCode === inviteCode);

  if (room.access === "telegram_chat") {
    if (room.inviteCode && room.inviteCode !== inviteCode) return false;
    if (!room.telegramChatId || !user.telegram?.id) return false;
    return await isTelegramChatMember(room.telegramChatId, user.telegram.id);
  }

  return false;
}

export async function createEzcordRoom(params: {
  name: string;
  access: EzcordRoomAccess;
  game?: EzcordRoomGame;
  goal?: EzcordRoomGoal;
  createdBy: string;
  telegramChatId?: string;
}): Promise<EzcordRoom> {
  const room: EzcordRoom = {
    id: randomId("room"),
    name: params.name.trim() || "Новая комната",
    access: params.access,
    game: params.game || "voicechat",
    goal: params.goal || "communication",
    createdBy: params.createdBy,
    telegramChatId: params.telegramChatId?.trim() || undefined,
    inviteCode: params.access === "public" ? undefined : randomId("invite"),
    createdAt: new Date().toISOString(),
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_rooms
        (id, name, access, game, goal, invite_code, telegram_chat_id, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [room.id, room.name, room.access, room.game, room.goal, room.inviteCode, room.telegramChatId, room.createdBy, room.createdAt],
    );
    return room;
  }

  const data = readEzcordData();
  data.rooms.unshift(room);
  writeEzcordData(data);
  return room;
}

export async function getOrCreateEzcordHomeRoom(user: EzcordUser): Promise<EzcordRoom> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const existing = await pool.query(
      `select *
         from ezcord_rooms
        where closed_at is null
          and created_by = $1
          and access = 'public'
          and telegram_chat_id is null
        order by created_at desc
        limit 1`,
      [user.id],
    );

    if (existing.rows[0]) {
      return rowToRoom(existing.rows[0]);
    }
  } else {
    const data = readEzcordData();
    const existing = data.rooms
      .filter((room) => !room.closedAt && room.createdBy === user.id && room.access === "public" && !room.telegramChatId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

    if (existing) {
      return existing;
    }
  }

  return await createEzcordRoom({
    name: user.displayName.trim() || "Моя комната",
    access: "public",
    createdBy: user.id,
  });
}

export async function listEzcordRooms(user?: EzcordUser | null): Promise<EzcordRoom[]> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(
      `select *
         from ezcord_rooms
        where closed_at is null
          and (access = 'public' or created_by = $1)
        order by created_at desc`,
      [user?.id || ""],
    );
    return result.rows.map(rowToRoom);
  }

  const data = readEzcordData();
  return data.rooms.filter((room) => !room.closedAt).filter((room) => room.access === "public" || room.createdBy === user?.id);
}

export async function getEzcordRoom(roomId: string): Promise<EzcordRoom | null> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select * from ezcord_rooms where id = $1", [roomId]);
    return result.rows[0] ? rowToRoom(result.rows[0]) : null;
  }

  const data = readEzcordData();
  return data.rooms.find((room) => room.id === roomId) || null;
}

export async function updateEzcordRoomSettings(
  room: EzcordRoom,
  actorId: string,
  params: { name: string; game: EzcordRoomGame; goal: EzcordRoomGoal },
): Promise<EzcordRoom> {
  if (room.createdBy !== actorId) {
    throw createError({ statusCode: 403, message: "Изменять комнату может только администратор" });
  }

  const name = params.name.trim();
  if (!name) {
    throw createError({ statusCode: 400, message: "Введите название комнаты" });
  }

  if (!("voicechat" === params.game || "cs2" === params.game || "dota2" === params.game || "brawl_stars" === params.game)) {
    throw createError({ statusCode: 400, message: "Неверная игра" });
  }

  if (!(params.goal === "result" || params.goal === "communication")) {
    throw createError({ statusCode: 400, message: "Неверная цель комнаты" });
  }

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(
      `update ezcord_rooms
          set name = $1,
              game = $2,
              goal = $3
        where id = $4 and created_by = $5
      returning *`,
      [name, params.game, params.goal, room.id, actorId],
    );
    return result.rows[0] ? rowToRoom(result.rows[0]) : { ...room, name, game: params.game, goal: params.goal };
  }

  const data = readEzcordData();
  const storedRoom = data.rooms.find((item) => item.id === room.id && item.createdBy === actorId);
  if (!storedRoom) {
    throw createError({ statusCode: 404, message: "Комната не найдена" });
  }

  storedRoom.name = name;
  storedRoom.game = params.game;
  storedRoom.goal = params.goal;
  writeEzcordData(data);
  return storedRoom;
}

export async function roomInviteUrl(room: EzcordRoom): Promise<string> {
  const configuredBotUsername = getEzcordEnv("EZCORD_BOT_USERNAME").replace(/^@/, "");
  const botUsername = configuredBotUsername || (await getTelegramBotUsername().catch(() => ""));

  if (botUsername) {
    const payload = encodeEzcordRoomBotStart(room.id, room.inviteCode);
    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
  }

  return ezcordRoomWebAppUrl(room.id, room.inviteCode);
}

export function ezcordRoomWebAppUrl(roomId: string, inviteCode = ""): string {
  const baseUrl = getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";
  const query = new URLSearchParams({ room: roomId });
  if (inviteCode) query.set("invite", inviteCode);
  return `${baseUrl}?${query.toString()}`;
}

export async function requireRoomAccess(event: H3Event): Promise<{ user: EzcordUser; room: EzcordRoom; inviteCode: string }> {
  const user = await requireEzcordUser(event);
  const roomId = getRouterParam(event, "id") || "";
  const inviteCode = String(getQuery(event).invite || "");
  const room = await getEzcordRoom(roomId);

  if (!room) {
    throw createError({ statusCode: 404, message: "Комната не найдена" });
  }

  const allowed = await canAccessRoom(user, room, inviteCode);
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Нет доступа к комнате" });
  }

  return { user, room, inviteCode };
}

export async function touchEzcordPeer(roomId: string, peerId: string, user: EzcordUser): Promise<EzcordPresenceState> {
  const peer: EzcordPeer = {
    roomId,
    peerId,
    userId: user.id,
    displayName: user.displayName,
    photoUrl: user.telegram?.photoUrl,
    lastSeenAt: new Date().toISOString(),
  };

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const key = roomPeersKey(roomId);
    const existingPeers = (await redis.hvals(key)).map((value: string) => JSON.parse(value) as EzcordPeer);
    const duplicatePeerIds = existingPeers.filter((item: EzcordPeer) => item.userId === user.id && item.peerId !== peerId).map((item) => item.peerId);

    if (duplicatePeerIds.length > 0) {
      await redis.hdel(key, ...duplicatePeerIds);
      await Promise.all(duplicatePeerIds.map((duplicatePeerId) => deleteSignalKeys(roomId, duplicatePeerId)));
    }

    const exists = await redis.hexists(key, peerId);
    if (!exists) {
      const count = await redis.hlen(key);
      if (count >= EZCORD_MAX_ROOM_PARTICIPANTS) {
        await redis.hset(waitingPeersKey(roomId), user.id, JSON.stringify({
          roomId,
          peerId,
          userId: user.id,
          displayName: user.displayName,
          queuedAt: new Date().toISOString(),
        } satisfies EzcordWaitingPeer));
        return {
          peers: await listEzcordPeers(roomId, peerId),
          waiting: true,
          waitingCount: await redis.hlen(waitingPeersKey(roomId)),
        };
      }
    }
    await redis.hdel(waitingPeersKey(roomId), user.id);
    await redis.hset(key, peerId, JSON.stringify(peer));
    return {
      peers: await listEzcordPeers(roomId, peerId),
      waiting: false,
      waitingCount: await redis.hlen(waitingPeersKey(roomId)),
    };
  }

  const data = readEzcordData();
  const duplicatePeerIds = data.peers.filter((item) => item.roomId === roomId && item.userId === user.id && item.peerId !== peerId).map((item) => item.peerId);
  if (duplicatePeerIds.length > 0) {
    const duplicatePeerIdSet = new Set(duplicatePeerIds);
    data.peers = data.peers.filter((item) => !(item.roomId === roomId && duplicatePeerIdSet.has(item.peerId)));
    data.signals = data.signals.filter(
      (signal) => signal.roomId !== roomId || (!duplicatePeerIdSet.has(signal.fromPeerId) && !duplicatePeerIdSet.has(signal.toPeerId)),
    );
  }

  data.waitingPeers = data.waitingPeers.filter((item) => !(item.roomId === roomId && item.userId === user.id));
  const existingPeer = data.peers.find((item) => item.roomId === roomId && item.peerId === peerId);
  if (existingPeer) {
    existingPeer.displayName = user.displayName;
    existingPeer.photoUrl = user.telegram?.photoUrl;
    existingPeer.lastSeenAt = peer.lastSeenAt;
  } else {
    const roomPeers = data.peers.filter((item) => item.roomId === roomId);
    if (roomPeers.length >= EZCORD_MAX_ROOM_PARTICIPANTS) {
      data.waitingPeers.push({
        roomId,
        peerId,
        userId: user.id,
        displayName: user.displayName,
        queuedAt: new Date().toISOString(),
      });
      writeEzcordData(data);
      return {
        peers: data.peers.filter((item) => item.roomId === roomId && item.peerId !== peerId),
        waiting: true,
        waitingCount: data.waitingPeers.filter((item) => item.roomId === roomId).length,
      };
    }
    data.peers.push(peer);
  }
  writeEzcordData(data);
  return {
    peers: data.peers.filter((item) => item.roomId === roomId && item.peerId !== peerId),
    waiting: false,
    waitingCount: data.waitingPeers.filter((item) => item.roomId === roomId).length,
  };
}

export async function getEzcordWaitingCount(roomId: string): Promise<number> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    return await redis.hlen(waitingPeersKey(roomId));
  }

  return readEzcordData().waitingPeers.filter((item) => item.roomId === roomId).length;
}

export async function listEzcordPeers(roomId: string, excludePeerId = ""): Promise<EzcordPeer[]> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    const values = await redis.hvals(roomPeersKey(roomId));
    return normalizeEzcordPeerList(
      values.map((value: string) => JSON.parse(value) as EzcordPeer),
      excludePeerId,
    );
  }

  const data = readEzcordData();
  return normalizeEzcordPeerList(
    data.peers.filter((peer) => peer.roomId === roomId),
    excludePeerId,
  );
}

export async function leaveEzcordPeer(roomId: string, peerId: string, userId: string): Promise<void> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    const rawPeer = await redis.hget(roomPeersKey(roomId), peerId);
    if (rawPeer) {
      const peer = JSON.parse(rawPeer) as EzcordPeer;
      if (peer.userId === userId) {
        await redis.hdel(roomPeersKey(roomId), peerId);
      }
    }
    await redis.hdel(waitingPeersKey(roomId), userId);
    await deleteSignalKeys(roomId, peerId);
    return;
  }

  const data = readEzcordData();
  data.peers = data.peers.filter((peer) => !(peer.roomId === roomId && peer.peerId === peerId && peer.userId === userId));
  data.waitingPeers = data.waitingPeers.filter((peer) => !(peer.roomId === roomId && peer.peerId === peerId && peer.userId === userId));
  data.signals = data.signals.filter((signal) => signal.roomId !== roomId || (signal.fromPeerId !== peerId && signal.toPeerId !== peerId));
  writeEzcordData(data);
}

function normalizeEzcordPeerList(peers: EzcordPeer[], excludePeerId = ""): EzcordPeer[] {
  const latestByUser = new Map<string, EzcordPeer>();

  for (const peer of peers) {
    const key = peer.userId || peer.peerId;
    const existing = latestByUser.get(key);
    if (!existing || new Date(peer.lastSeenAt).getTime() >= new Date(existing.lastSeenAt).getTime()) {
      latestByUser.set(key, peer);
    }
  }

  return Array.from(latestByUser.values()).filter((peer) => peer.peerId !== excludePeerId);
}

export async function kickEzcordPeer(room: EzcordRoom, peerId: string, actor: EzcordUser): Promise<EzcordPeer | null> {
  if (room.createdBy !== actor.id) {
    throw createError({ statusCode: 403, message: "Кикать участников может только создатель комнаты" });
  }

  const targetPeer = await getLivePeer(room.id, peerId);
  if (targetPeer?.userId === actor.id) {
    throw createError({ statusCode: 400, message: "Нельзя кикнуть себя" });
  }

  if (useRedisLiveState()) {
    const redis = await getRedis();
    await redis.hdel(roomPeersKey(room.id), peerId);
    await deleteSignalKeys(room.id, peerId);
    return targetPeer;
  }

  const data = readEzcordData();
  data.peers = data.peers.filter((peer) => !(peer.roomId === room.id && peer.peerId === peerId));
  data.signals = data.signals.filter((signal) => signal.roomId !== room.id || (signal.fromPeerId !== peerId && signal.toPeerId !== peerId));
  writeEzcordData(data);
  return targetPeer;
}

export async function appendEzcordSignal(signal: Omit<EzcordSignal, "id" | "createdAt">): Promise<EzcordSignal> {
  const item: EzcordSignal = {
    ...signal,
    id: randomId("sig"),
    createdAt: new Date().toISOString(),
  };

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const key = peerSignalsKey(item.roomId, item.toPeerId);
    await redis.rpush(key, JSON.stringify(item));
    await redis.expire(key, SIGNAL_TTL_SECONDS);
    return item;
  }

  const data = readEzcordData();
  const staleBefore = Date.now() - SIGNAL_TTL_SECONDS * 1000;
  data.signals = data.signals.filter((entry) => new Date(entry.createdAt).getTime() > staleBefore);
  data.signals.push(item);
  writeEzcordData(data);
  return item;
}

export async function getEzcordSignals(roomId: string, peerId: string, after = ""): Promise<EzcordSignal[]> {
  const afterTime = after ? new Date(after).getTime() : 0;

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const values = await redis.lrange(peerSignalsKey(roomId, peerId), 0, -1);
    return values
      .map((value: string) => JSON.parse(value) as EzcordSignal)
      .filter((signal: EzcordSignal) => new Date(signal.createdAt).getTime() > afterTime)
      .sort((left: EzcordSignal, right: EzcordSignal) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  const data = readEzcordData();
  return data.signals
    .filter((signal) => signal.roomId === roomId && signal.toPeerId === peerId)
    .filter((signal) => new Date(signal.createdAt).getTime() > afterTime)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export async function checkEzcordRateLimit(event: H3Event, action: string, max = getRateLimitMax(), windowMs = getRateLimitWindowMs()): Promise<void> {
  const ip =
    getHeader(event, "x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ||
    getHeader(event, "x-real-ip") ||
    event.node.req.socket.remoteAddress ||
    "unknown";

  await checkEzcordRateLimitKey(action, ip, max, windowMs);
}

export async function checkEzcordRateLimitKey(action: string, keyPart: string, max = getRateLimitMax(), windowMs = getRateLimitWindowMs()): Promise<void> {
  if (!useRedisLiveState()) return;

  const redis = await getRedis();
  const key = `ezcord:rate:${action}:${keyPart}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  if (count > max) {
    throw createError({ statusCode: 429, message: "Слишком много запросов" });
  }
}

export async function getEzcordMetrics(): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {
    storage: usePostgresStore() ? "postgres" : "json",
    liveState: useRedisLiveState() ? "redis" : "json",
    maxRoomParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query(`
      select
        (select count(*)::int from ezcord_users) as users,
        (select count(*)::int from ezcord_rooms where closed_at is null) as rooms,
        (select count(*)::int from ezcord_sessions) as sessions,
        (select count(*)::int from ezcord_kicked_peers) as kicked
    `);
    Object.assign(metrics, result.rows[0]);
  } else {
    const data = readEzcordData();
    Object.assign(metrics, {
      users: data.users.length,
      rooms: data.rooms.filter((room) => !room.closedAt).length,
      sessions: data.sessions.length,
      kicked: data.kickedPeers.length,
    });
  }

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const roomKeys = await scanKeys("ezcord:room:*:peers");
    let livePeers = 0;
    for (const key of roomKeys) {
      livePeers += await redis.hlen(key);
    }
    metrics.liveRooms = roomKeys.length;
    metrics.livePeers = livePeers;
  } else {
    const data = readEzcordData();
    metrics.liveRooms = new Set(data.peers.map((peer) => peer.roomId)).size;
    metrics.livePeers = data.peers.length;
  }

  return metrics;
}

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
    let messageId = previousMessageId;

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

function telegramLoginRequestKey(requestId: string): string {
  return `ezcord:telegram:login:${requestId}`;
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function getEzcordEnv(key: string): string {
  const runtimeValue = process.env[key];
  if (runtimeValue) return runtimeValue;

  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";

  const line = readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));

  if (!line) return "";

  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

function usePostgresStore(): boolean {
  return Boolean(getEzcordEnv("EZCORD_DATABASE_URL")) && getEzcordEnv("EZCORD_STORAGE") !== "json";
}

function useRedisStore(): boolean {
  return Boolean(getEzcordEnv("EZCORD_REDIS_URL"));
}

function useRedisLiveState(): boolean {
  return useRedisStore() && getEzcordEnv("EZCORD_LIVE_STATE") !== "json";
}

async function getPgPool(): Promise<any> {
  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: getEzcordEnv("EZCORD_DATABASE_URL"),
        max: Number(getEzcordEnv("EZCORD_PG_POOL_MAX") || "10"),
      });
      await ensurePgSchema(pool);
      return pool;
    })();
  }
  return pgPoolPromise;
}

async function getRedis(): Promise<any> {
  if (!redisPromise) {
    redisPromise = (async () => {
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(getEzcordEnv("EZCORD_REDIS_URL"), {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      });
      await redis.ping();
      return redis;
    })();
  }
  return redisPromise;
}

async function ensurePgSchema(pool: any): Promise<void> {
  if (pgSchemaPromise) return pgSchemaPromise;

  pgSchemaPromise = (async () => {
    await pool.query(`
      create table if not exists ezcord_meta (
        key text primary key,
        value text not null
      );

      create table if not exists ezcord_users (
        id text primary key,
        email text not null unique,
        password_hash text not null,
        display_name text not null,
        points integer not null default 0,
        created_at timestamptz not null,
        activity_reward_last_seen_at timestamptz,
        activity_reward_last_awarded_at timestamptz,
        telegram_id bigint unique,
        telegram_username text,
        telegram_first_name text,
        telegram_last_name text,
        telegram_photo_url text,
        telegram_linked_at timestamptz
      );

      create table if not exists ezcord_point_events (
        id text primary key,
        user_id text not null references ezcord_users(id) on delete cascade,
        kind text not null,
        dedupe_key text not null,
        points integer not null,
        created_at timestamptz not null,
        unique (user_id, kind, dedupe_key)
      );

      create table if not exists ezcord_sessions (
        id text primary key,
        user_id text not null references ezcord_users(id) on delete cascade,
        created_at timestamptz not null
      );

      create table if not exists ezcord_telegram_login_requests (
        id text primary key,
        status text not null,
        telegram_id bigint,
        user_id text references ezcord_users(id) on delete set null,
        created_at timestamptz not null,
        expires_at timestamptz not null,
        confirmed_at timestamptz,
        consumed_at timestamptz
      );

      create table if not exists ezcord_rooms (
        id text primary key,
        name text not null,
        access text not null,
        game text not null default 'voicechat',
        goal text not null default 'communication',
        invite_code text,
        telegram_chat_id text,
        created_by text not null references ezcord_users(id) on delete cascade,
        created_at timestamptz not null,
        closed_at timestamptz
      );

      alter table ezcord_users add column if not exists points integer not null default 0;
      alter table ezcord_users add column if not exists activity_reward_last_seen_at timestamptz;
      alter table ezcord_users add column if not exists activity_reward_last_awarded_at timestamptz;
      alter table ezcord_rooms add column if not exists game text not null default 'voicechat';
      alter table ezcord_rooms add column if not exists goal text not null default 'communication';

      create table if not exists ezcord_kicked_peers (
        room_id text not null references ezcord_rooms(id) on delete cascade,
        user_id text not null references ezcord_users(id) on delete cascade,
        kicked_by text not null references ezcord_users(id) on delete cascade,
        kicked_at timestamptz not null,
        primary key (room_id, user_id)
      );

      create index if not exists ezcord_rooms_created_by_idx on ezcord_rooms(created_by);
      create index if not exists ezcord_rooms_access_idx on ezcord_rooms(access);
      create index if not exists ezcord_sessions_user_id_idx on ezcord_sessions(user_id);
      create index if not exists ezcord_telegram_login_requests_expires_idx on ezcord_telegram_login_requests(expires_at);
      create index if not exists ezcord_point_events_user_id_idx on ezcord_point_events(user_id);
    `);

    await migrateJsonToPostgres(pool);
  })();

  return pgSchemaPromise;
}

async function migrateJsonToPostgres(pool: any): Promise<void> {
  const meta = await pool.query("select value from ezcord_meta where key = 'json_migrated'");
  if (meta.rowCount > 0) return;

  const path = getEzcordDataPath();
  if (existsSync(path)) {
    const data = readEzcordData();
    for (const user of data.users) {
      await pool.query(
        `insert into ezcord_users
          (id, email, password_hash, display_name, points, created_at, activity_reward_last_seen_at, activity_reward_last_awarded_at, telegram_id, telegram_username, telegram_first_name, telegram_last_name, telegram_photo_url, telegram_linked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (id) do nothing`,
        [
          user.id,
          user.email,
          user.passwordHash,
          user.displayName,
          user.points || 0,
          user.createdAt,
          user.activityRewardLastSeenAt,
          user.activityRewardLastAwardedAt,
          user.telegram?.id,
          user.telegram?.username,
          user.telegram?.firstName,
          user.telegram?.lastName,
          user.telegram?.photoUrl,
          user.telegram?.linkedAt,
        ],
      );
    }

    for (const session of data.sessions) {
      await pool.query(
        `insert into ezcord_sessions (id, user_id, created_at)
         values ($1,$2,$3)
         on conflict (id) do nothing`,
        [session.id, session.userId, session.createdAt],
      ).catch(() => {});
    }

    for (const room of data.rooms) {
      await pool.query(
        `insert into ezcord_rooms (id, name, access, game, goal, invite_code, telegram_chat_id, created_by, created_at, closed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (id) do nothing`,
        [room.id, room.name, room.access, room.game, room.goal, room.inviteCode, room.telegramChatId, room.createdBy, room.createdAt, room.closedAt],
      ).catch(() => {});
    }

    for (const kicked of data.kickedPeers) {
      await pool.query(
        `insert into ezcord_kicked_peers (room_id, user_id, kicked_by, kicked_at)
         values ($1,$2,$3,$4)
         on conflict (room_id, user_id) do nothing`,
        [kicked.roomId, kicked.userId, kicked.kickedBy, kicked.kickedAt],
      ).catch(() => {});
    }
  }

  await pool.query("insert into ezcord_meta (key, value) values ('json_migrated', $1) on conflict (key) do update set value = excluded.value", [
    new Date().toISOString(),
  ]);
}

function rowToUser(row: any): EzcordUser {
  const telegram =
    row.telegram_id == null
      ? undefined
      : {
          id: Number(row.telegram_id),
          username: row.telegram_username || undefined,
          firstName: row.telegram_first_name || undefined,
          lastName: row.telegram_last_name || undefined,
          photoUrl: row.telegram_photo_url || undefined,
          linkedAt: toIso(row.telegram_linked_at),
        };

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    points: Number(row.points || 0),
    createdAt: toIso(row.created_at),
    activityRewardLastSeenAt: row.activity_reward_last_seen_at ? toIso(row.activity_reward_last_seen_at) : undefined,
    activityRewardLastAwardedAt: row.activity_reward_last_awarded_at ? toIso(row.activity_reward_last_awarded_at) : undefined,
    telegram,
  };
}

function rowToTelegramLoginRequest(row: any): EzcordTelegramLoginRequest {
  return {
    id: row.id,
    status: row.status,
    telegramId: row.telegram_id == null ? undefined : Number(row.telegram_id),
    userId: row.user_id || undefined,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    confirmedAt: row.confirmed_at ? toIso(row.confirmed_at) : undefined,
    consumedAt: row.consumed_at ? toIso(row.consumed_at) : undefined,
  };
}

function rowToRoom(row: any): EzcordRoom {
  return {
    id: row.id,
    name: row.name,
    access: row.access,
    game: row.game || "voicechat",
    goal: row.goal || "communication",
    inviteCode: row.invite_code || undefined,
    telegramChatId: row.telegram_chat_id || undefined,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    closedAt: row.closed_at ? toIso(row.closed_at) : undefined,
  };
}

async function findEzcordUserByEmail(email: string): Promise<EzcordUser | null> {
  const pool = await getPgPool();
  const result = await pool.query("select * from ezcord_users where email = $1", [email]);
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

function findJsonUserByEmail(email: string): EzcordUser | null {
  const data = readEzcordData();
  return data.users.find((item) => item.email === email) || null;
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

async function awardEzcordPointsOnce(userId: string, points: number, kind: string, dedupeKey: string): Promise<EzcordUser | null> {
  const now = new Date().toISOString();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query(
        `insert into ezcord_point_events (id, user_id, kind, dedupe_key, points, created_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, kind, dedupe_key) do nothing
         returning id`,
        [randomId("points"), userId, kind, dedupeKey, points, now],
      );

      const result =
        inserted.rowCount > 0
          ? await client.query("update ezcord_users set points = points + $1 where id = $2 returning *", [points, userId])
          : await client.query("select * from ezcord_users where id = $1", [userId]);

      await client.query("commit");
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const data = readEzcordData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;

  const exists = data.pointEvents.some((event) => event.userId === userId && event.kind === kind && event.dedupeKey === dedupeKey);
  if (!exists) {
    data.pointEvents.push({
      id: randomId("points"),
      userId,
      kind,
      dedupeKey,
      points,
      createdAt: now,
    });
    user.points = (user.points || 0) + points;
    writeEzcordData(data);
  }
  return user;
}

function calculateActivityReward(user: EzcordUser, now: Date): { points: number; lastSeenAt: string; lastAwardedAt: string } {
  const nowTime = now.getTime();
  const lastSeenTime = user.activityRewardLastSeenAt ? new Date(user.activityRewardLastSeenAt).getTime() : 0;
  const lastAwardedTime = user.activityRewardLastAwardedAt ? new Date(user.activityRewardLastAwardedAt).getTime() : 0;
  const lastSeenAt = now.toISOString();

  if (!lastSeenTime || !lastAwardedTime || nowTime - lastSeenTime > ACTIVITY_REWARD_RESET_GAP_MS || nowTime <= lastAwardedTime) {
    return {
      points: 0,
      lastSeenAt,
      lastAwardedAt: lastSeenAt,
    };
  }

  const intervals = Math.floor((nowTime - lastAwardedTime) / ACTIVITY_REWARD_INTERVAL_MS);
  if (intervals <= 0) {
    return {
      points: 0,
      lastSeenAt,
      lastAwardedAt: user.activityRewardLastAwardedAt || lastSeenAt,
    };
  }

  return {
    points: intervals * ACTIVITY_REWARD_POINTS,
    lastSeenAt,
    lastAwardedAt: new Date(lastAwardedTime + intervals * ACTIVITY_REWARD_INTERVAL_MS).toISOString(),
  };
}

async function isUserKickedFromRoom(roomId: string, userId: string): Promise<boolean> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select 1 from ezcord_kicked_peers where room_id = $1 and user_id = $2", [roomId, userId]);
    return result.rowCount > 0;
  }

  const data = readEzcordData();
  return data.kickedPeers.some((peer) => peer.roomId === roomId && peer.userId === userId);
}

async function recordKickedPeer(roomId: string, userId: string, kickedBy: string): Promise<void> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_kicked_peers (room_id, user_id, kicked_by, kicked_at)
       values ($1, $2, $3, $4)
       on conflict (room_id, user_id) do update set kicked_by = excluded.kicked_by, kicked_at = excluded.kicked_at`,
      [roomId, userId, kickedBy, new Date().toISOString()],
    );
    return;
  }

  const data = readEzcordData();
  if (!data.kickedPeers.some((peer) => peer.roomId === roomId && peer.userId === userId)) {
    data.kickedPeers.push({ roomId, userId, kickedBy, kickedAt: new Date().toISOString() });
    writeEzcordData(data);
  }
}

async function getLivePeer(roomId: string, peerId: string): Promise<EzcordPeer | null> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    const raw = await redis.hget(roomPeersKey(roomId), peerId);
    return raw ? (JSON.parse(raw) as EzcordPeer) : null;
  }

  const data = readEzcordData();
  return data.peers.find((peer) => peer.roomId === roomId && peer.peerId === peerId) || null;
}

async function deleteSignalKeys(roomId: string, peerId: string): Promise<void> {
  if (!useRedisLiveState()) return;
  const redis = await getRedis();
  const keys = await scanKeys(`ezcord:room:${roomId}:signals:*`);
  const toDelete = keys.filter((key) => key.endsWith(`:${peerId}`));
  if (toDelete.length > 0) {
    await redis.del(...toDelete);
  }
}

async function scanKeys(pattern: string): Promise<string[]> {
  const redis = await getRedis();
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

function roomPeersKey(roomId: string): string {
  return `ezcord:room:${roomId}:peers`;
}

function waitingPeersKey(roomId: string): string {
  return `ezcord:room:${roomId}:waiting`;
}

function peerSignalsKey(roomId: string, peerId: string): string {
  return `ezcord:room:${roomId}:signals:${peerId}`;
}

function getEzcordDataPath(): string {
  return join(process.cwd(), "data", DATA_FILE);
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSyntheticTelegramEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${TELEGRAM_EMAIL_DOMAIN}`);
}

function syntheticTelegramEmail(telegramId: number): string {
  return `telegram-${telegramId}-${randomBytes(6).toString("hex")}@${TELEGRAM_EMAIL_DOMAIN}`;
}

function telegramIdentityFromWebAppUser(webAppUser: TelegramWebAppUser): EzcordTelegramIdentity {
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

function verifyTelegramInitData(initData: string): TelegramWebAppUser {
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

  return JSON.parse(rawUser) as TelegramWebAppUser;
}

async function isTelegramChatMember(chatId: string, telegramUserId: number): Promise<boolean> {
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

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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

function getRateLimitWindowMs(): number {
  return Number(getEzcordEnv("EZCORD_RATE_LIMIT_WINDOW_MS") || "60000");
}

function getRateLimitMax(): number {
  return Number(getEzcordEnv("EZCORD_RATE_LIMIT_MAX") || "240");
}

function toIso(value: any): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
