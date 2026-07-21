import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { createError, deleteCookie, getCookie, getHeader, getQuery, getRouterParam, setCookie, type H3Event } from "h3";

const DATA_FILE = "ezcord.json";
export const EZCORD_SESSION_COOKIE = "ezcord_session";
const SIGNAL_TTL_SECONDS = 60;

export const EZCORD_MAX_ROOM_PARTICIPANTS = 5;

export type EzcordRoomAccess = "public" | "private" | "telegram_chat";

export interface EzcordUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
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
  lastSeenAt: string;
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

interface EzcordData {
  users: EzcordUser[];
  sessions: EzcordSession[];
  rooms: EzcordRoom[];
  peers: EzcordPeer[];
  signals: EzcordSignal[];
  kickedPeers: EzcordKickedPeer[];
}

export interface EzcordPublicUser {
  id: string;
  email: string;
  displayName: string;
  telegram?: EzcordTelegramIdentity;
}

interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

let pgPoolPromise: Promise<any> | null = null;
let pgSchemaPromise: Promise<void> | null = null;
let redisPromise: Promise<any> | null = null;

export function readEzcordData(): EzcordData {
  const path = getEzcordDataPath();
  if (!existsSync(path)) {
    const initial: EzcordData = { users: [], sessions: [], rooms: [], peers: [], signals: [], kickedPeers: [] };
    writeEzcordData(initial);
    return initial;
  }

  const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<EzcordData>;
  return {
    users: data.users || [],
    sessions: data.sessions || [],
    rooms: data.rooms || [],
    peers: data.peers || [],
    signals: data.signals || [],
    kickedPeers: data.kickedPeers || [],
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
    email: user.email,
    displayName: user.displayName,
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

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: "Пароль должен быть не короче 8 символов" });
  }

  const user: EzcordUser = {
    id: randomId("user"),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    displayName: displayName.trim() || normalizedEmail.split("@")[0],
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

export async function linkTelegramToEzcordUser(userId: string, initData: string): Promise<EzcordTelegramIdentity> {
  const webAppUser = verifyTelegramInitData(initData);
  const identity: EzcordTelegramIdentity = {
    id: webAppUser.id,
    username: webAppUser.username,
    firstName: webAppUser.first_name,
    lastName: webAppUser.last_name,
    photoUrl: webAppUser.photo_url,
    linkedAt: new Date().toISOString(),
  };

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

export async function canAccessRoom(user: EzcordUser, room: EzcordRoom, inviteCode?: string): Promise<boolean> {
  if (room.closedAt) return false;
  if (await isUserKickedFromRoom(room.id, user.id)) return false;
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
  createdBy: string;
  telegramChatId?: string;
}): Promise<EzcordRoom> {
  const room: EzcordRoom = {
    id: randomId("room"),
    name: params.name.trim() || "Новая комната",
    access: params.access,
    createdBy: params.createdBy,
    telegramChatId: params.telegramChatId?.trim() || undefined,
    inviteCode: params.access === "public" ? undefined : randomId("invite"),
    createdAt: new Date().toISOString(),
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_rooms
        (id, name, access, invite_code, telegram_chat_id, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [room.id, room.name, room.access, room.inviteCode, room.telegramChatId, room.createdBy, room.createdAt],
    );
    return room;
  }

  const data = readEzcordData();
  data.rooms.unshift(room);
  writeEzcordData(data);
  return room;
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

export function roomInviteUrl(room: EzcordRoom): string {
  const baseUrl = getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";
  if (!room.inviteCode) return `${baseUrl}?room=${room.id}`;
  return `${baseUrl}?room=${room.id}&invite=${room.inviteCode}`;
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

export async function touchEzcordPeer(roomId: string, peerId: string, user: EzcordUser): Promise<EzcordPeer[]> {
  if (await isUserKickedFromRoom(roomId, user.id)) {
    throw createError({ statusCode: 403, message: "Вас кикнули из этой комнаты" });
  }

  const peer: EzcordPeer = {
    roomId,
    peerId,
    userId: user.id,
    displayName: user.displayName,
    lastSeenAt: new Date().toISOString(),
  };

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const key = roomPeersKey(roomId);
    const exists = await redis.hexists(key, peerId);
    if (!exists) {
      const count = await redis.hlen(key);
      if (count >= EZCORD_MAX_ROOM_PARTICIPANTS) {
        throw createError({ statusCode: 409, message: `Комната заполнена: максимум ${EZCORD_MAX_ROOM_PARTICIPANTS} участников` });
      }
    }
    await redis.hset(key, peerId, JSON.stringify(peer));
    return await listEzcordPeers(roomId, peerId);
  }

  const data = readEzcordData();
  const existingPeer = data.peers.find((item) => item.roomId === roomId && item.peerId === peerId);
  if (existingPeer) {
    existingPeer.displayName = user.displayName;
    existingPeer.lastSeenAt = peer.lastSeenAt;
  } else {
    const roomPeers = data.peers.filter((item) => item.roomId === roomId);
    if (roomPeers.length >= EZCORD_MAX_ROOM_PARTICIPANTS) {
      throw createError({ statusCode: 409, message: `Комната заполнена: максимум ${EZCORD_MAX_ROOM_PARTICIPANTS} участников` });
    }
    data.peers.push(peer);
  }
  writeEzcordData(data);
  return data.peers.filter((item) => item.roomId === roomId && item.peerId !== peerId);
}

export async function listEzcordPeers(roomId: string, excludePeerId = ""): Promise<EzcordPeer[]> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    const values = await redis.hvals(roomPeersKey(roomId));
    return values.map((value: string) => JSON.parse(value) as EzcordPeer).filter((peer: EzcordPeer) => peer.peerId !== excludePeerId);
  }

  const data = readEzcordData();
  return data.peers.filter((peer) => peer.roomId === roomId && peer.peerId !== excludePeerId);
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
    await deleteSignalKeys(roomId, peerId);
    return;
  }

  const data = readEzcordData();
  data.peers = data.peers.filter((peer) => !(peer.roomId === roomId && peer.peerId === peerId && peer.userId === userId));
  data.signals = data.signals.filter((signal) => signal.roomId !== roomId || (signal.fromPeerId !== peerId && signal.toPeerId !== peerId));
  writeEzcordData(data);
}

export async function kickEzcordPeer(room: EzcordRoom, peerId: string, actor: EzcordUser): Promise<EzcordPeer | null> {
  if (room.createdBy !== actor.id) {
    throw createError({ statusCode: 403, message: "Кикать участников может только создатель комнаты" });
  }

  const targetPeer = await getLivePeer(room.id, peerId);
  if (targetPeer?.userId === actor.id) {
    throw createError({ statusCode: 400, message: "Нельзя кикнуть себя" });
  }

  if (targetPeer) {
    await recordKickedPeer(room.id, targetPeer.userId, actor.id);
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

export async function sendTelegramMessage(chatId: number | string, text: string, launchUrl?: string): Promise<void> {
  const token = getEzcordBotToken();
  const webAppUrl = launchUrl || getEzcordEnv("EZCORD_WEBAPP_URL") || "https://rocketseven.ru/ezcord";

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть Ezcord",
              web_app: { url: webAppUrl },
            },
          ],
          [
            {
              text: "Открыть ссылкой",
              url: webAppUrl,
            },
          ],
        ],
      },
    }),
  });
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

function useRedisLiveState(): boolean {
  return Boolean(getEzcordEnv("EZCORD_REDIS_URL")) && getEzcordEnv("EZCORD_LIVE_STATE") !== "json";
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
        created_at timestamptz not null,
        telegram_id bigint unique,
        telegram_username text,
        telegram_first_name text,
        telegram_last_name text,
        telegram_photo_url text,
        telegram_linked_at timestamptz
      );

      create table if not exists ezcord_sessions (
        id text primary key,
        user_id text not null references ezcord_users(id) on delete cascade,
        created_at timestamptz not null
      );

      create table if not exists ezcord_rooms (
        id text primary key,
        name text not null,
        access text not null,
        invite_code text,
        telegram_chat_id text,
        created_by text not null references ezcord_users(id) on delete cascade,
        created_at timestamptz not null,
        closed_at timestamptz
      );

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
          (id, email, password_hash, display_name, created_at, telegram_id, telegram_username, telegram_first_name, telegram_last_name, telegram_photo_url, telegram_linked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (id) do nothing`,
        [
          user.id,
          user.email,
          user.passwordHash,
          user.displayName,
          user.createdAt,
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
        `insert into ezcord_rooms (id, name, access, invite_code, telegram_chat_id, created_by, created_at, closed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (id) do nothing`,
        [room.id, room.name, room.access, room.inviteCode, room.telegramChatId, room.createdBy, room.createdAt, room.closedAt],
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
    createdAt: toIso(row.created_at),
    telegram,
  };
}

function rowToRoom(row: any): EzcordRoom {
  return {
    id: row.id,
    name: row.name,
    access: row.access,
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

function getEzcordBotToken(): string {
  const token = getEzcordEnv("EZCORD_BOT_TOKEN");
  if (!token) {
    throw createError({ statusCode: 500, message: "EZCORD_BOT_TOKEN не настроен" });
  }
  return token;
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
