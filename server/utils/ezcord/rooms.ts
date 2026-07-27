import { createError, getQuery, getRouterParam, type H3Event } from "h3";
import { encodeEzcordRoomBotStart } from "#shared/ezcord-launch";
import { getEzcordEnv, usePostgresStore } from "./env";
import { getPgPool, rowToRoom } from "./postgres";
import { readEzcordData, writeEzcordData } from "./json-store";
import { randomId } from "./id";
import { requireEzcordUser } from "./auth";
import { getTelegramBotUsername, isTelegramChatMember } from "./telegram-bot";
import type { EzcordRoom, EzcordRoomAccess, EzcordRoomGame, EzcordRoomGoal, EzcordUser } from "./types";

export const EZCORD_EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const INACTIVE_ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;

let inactiveRoomCleanupLastRunAt = 0;
let inactiveRoomCleanupPromise: Promise<void> | null = null;

export async function canAccessRoom(user: EzcordUser, room: EzcordRoom, inviteCode?: string): Promise<boolean> {
  if (room.closedAt) return false;
  if (room.createdBy === user.id) return true;
  if (await isUserKickedFromRoom(room.id, user.id)) return false;
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
  const now = new Date().toISOString();
  const room: EzcordRoom = {
    id: randomId("room"),
    name: params.name.trim() || "Новая комната",
    access: params.access,
    game: params.game || "voicechat",
    goal: params.goal || "communication",
    createdBy: params.createdBy,
    telegramChatId: params.telegramChatId?.trim() || undefined,
    inviteCode: params.access === "public" ? undefined : randomId("invite"),
    createdAt: now,
    lastActiveAt: now,
  };

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `insert into ezcord_rooms
        (id, name, access, game, goal, invite_code, telegram_chat_id, created_by, created_at, last_active_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        room.id,
        room.name,
        room.access,
        room.game,
        room.goal,
        room.inviteCode,
        room.telegramChatId,
        room.createdBy,
        room.createdAt,
        room.lastActiveAt,
      ],
    );
    return room;
  }

  const data = readEzcordData();
  data.rooms.unshift(room);
  writeEzcordData(data);
  return room;
}

export async function getOrCreateEzcordHomeRoom(user: EzcordUser): Promise<EzcordRoom> {
  await closeInactiveEzcordRooms();

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
  await closeInactiveEzcordRooms();

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
  await closeInactiveEzcordRooms();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select * from ezcord_rooms where id = $1", [roomId]);
    return result.rows[0] ? rowToRoom(result.rows[0]) : null;
  }

  const data = readEzcordData();
  return data.rooms.find((room) => room.id === roomId) || null;
}

export async function touchEzcordRoomActivity(roomId: string, at = new Date().toISOString()): Promise<void> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query("update ezcord_rooms set last_active_at = $2 where id = $1 and closed_at is null", [roomId, at]);
    return;
  }

  const data = readEzcordData();
  const room = data.rooms.find((item) => item.id === roomId && !item.closedAt);
  if (!room) return;
  room.lastActiveAt = at;
  writeEzcordData(data);
}

export async function closeInactiveEzcordRooms(options: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (inactiveRoomCleanupPromise) {
    await inactiveRoomCleanupPromise;
    return;
  }
  if (!options.force && now - inactiveRoomCleanupLastRunAt < INACTIVE_ROOM_CLEANUP_INTERVAL_MS) return;

  inactiveRoomCleanupLastRunAt = now;
  inactiveRoomCleanupPromise = closeInactiveEzcordRoomsNow(now).finally(() => {
    inactiveRoomCleanupPromise = null;
  });
  await inactiveRoomCleanupPromise;
}

async function closeInactiveEzcordRoomsNow(now: number): Promise<void> {
  const closedAt = new Date(now).toISOString();
  const inactiveBefore = new Date(now - getEmptyRoomTtlMs()).toISOString();

  if (usePostgresStore()) {
    const pool = await getPgPool();
    await pool.query(
      `update ezcord_rooms
          set closed_at = $1
        where closed_at is null
          and last_active_at < $2`,
      [closedAt, inactiveBefore],
    );
    return;
  }

  const data = readEzcordData();
  let changed = false;
  for (const room of data.rooms) {
    const lastActiveAt = room.lastActiveAt || room.createdAt;
    if (!room.closedAt && new Date(lastActiveAt).getTime() < new Date(inactiveBefore).getTime()) {
      room.closedAt = closedAt;
      changed = true;
    }
  }
  if (changed) writeEzcordData(data);
}

function getEmptyRoomTtlMs(): number {
  const configured = Number(getEzcordEnv("EZCORD_EMPTY_ROOM_TTL_MS") || "");
  return Number.isFinite(configured) && configured > 0 ? configured : EZCORD_EMPTY_ROOM_TTL_MS;
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

export async function isUserKickedFromRoom(roomId: string, userId: string): Promise<boolean> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const result = await pool.query("select 1 from ezcord_kicked_peers where room_id = $1 and user_id = $2", [roomId, userId]);
    return result.rowCount > 0;
  }

  const data = readEzcordData();
  return data.kickedPeers.some((peer) => peer.roomId === roomId && peer.userId === userId);
}

export async function recordKickedPeer(roomId: string, userId: string, kickedBy: string): Promise<void> {
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
