import { existsSync } from "node:fs";
import { EZCORD_LOBBY_UNLOCK_XP } from "./economy";
import { getEzcordEnv } from "./env";
import { getEzcordDataPath, readEzcordData } from "./json-store";
import { toIso } from "./id";
import type { EzcordRoom, EzcordTelegramLoginRequest, EzcordUser } from "./types";

let pgPoolPromise: Promise<any> | null = null;
let pgSchemaPromise: Promise<void> | null = null;

export async function getPgPool(): Promise<any> {
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
        coins integer not null default 0,
        xp integer not null default 0,
        chest_open_count integer not null default 0,
        lobby_unlocked_at timestamptz,
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

      create table if not exists ezcord_chest_openings (
        id text primary key,
        user_id text not null references ezcord_users(id) on delete cascade,
        open_index integer not null,
        cost integer not null,
        coins_awarded integer not null,
        xp_awarded integer not null default 0,
        lobby_unlocked boolean not null default false,
        created_at timestamptz not null
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
      alter table ezcord_users add column if not exists coins integer not null default 0;
      alter table ezcord_users add column if not exists xp integer not null default 0;
      alter table ezcord_users add column if not exists chest_open_count integer not null default 0;
      alter table ezcord_users add column if not exists lobby_unlocked_at timestamptz;
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
      create index if not exists ezcord_chest_openings_user_id_idx on ezcord_chest_openings(user_id);
    `);

    await migrateEconomyV2(pool);
    await migrateJsonToPostgres(pool);
  })();

  return pgSchemaPromise;
}

async function migrateEconomyV2(pool: any): Promise<void> {
  const meta = await pool.query("select value from ezcord_meta where key = 'economy_v2_migrated'");
  if (meta.rowCount > 0) return;

  await pool.query(
    `update ezcord_users
        set coins = greatest(coins, points),
            xp = greatest(xp, points),
            lobby_unlocked_at = case
              when lobby_unlocked_at is null and greatest(xp, points) >= $1 then now()
              else lobby_unlocked_at
            end`,
    [EZCORD_LOBBY_UNLOCK_XP],
  );

  await pool.query(
    "insert into ezcord_meta (key, value) values ('economy_v2_migrated', $1) on conflict (key) do update set value = excluded.value",
    [new Date().toISOString()],
  );
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
          (id, email, password_hash, display_name, points, coins, xp, chest_open_count, lobby_unlocked_at, created_at, activity_reward_last_seen_at, activity_reward_last_awarded_at, telegram_id, telegram_username, telegram_first_name, telegram_last_name, telegram_photo_url, telegram_linked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         on conflict (id) do nothing`,
        [
          user.id,
          user.email,
          user.passwordHash,
          user.displayName,
          user.points || 0,
          user.coins ?? user.points ?? 0,
          user.xp ?? user.points ?? 0,
          user.chestOpenCount || 0,
          user.lobbyUnlockedAt,
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

    for (const opening of data.chestOpenings) {
      await pool.query(
        `insert into ezcord_chest_openings
          (id, user_id, open_index, cost, coins_awarded, xp_awarded, lobby_unlocked, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (id) do nothing`,
        [
          opening.id,
          opening.userId,
          opening.openIndex,
          opening.cost,
          opening.coinsAwarded,
          opening.xpAwarded,
          opening.lobbyUnlocked,
          opening.createdAt,
        ],
      ).catch(() => {});
    }
  }

  await pool.query("insert into ezcord_meta (key, value) values ('json_migrated', $1) on conflict (key) do update set value = excluded.value", [
    new Date().toISOString(),
  ]);
}

export function rowToUser(row: any): EzcordUser {
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
    coins: Number(row.coins ?? row.points ?? 0),
    xp: Number(row.xp ?? row.points ?? 0),
    chestOpenCount: Number(row.chest_open_count || 0),
    lobbyUnlockedAt: row.lobby_unlocked_at ? toIso(row.lobby_unlocked_at) : undefined,
    createdAt: toIso(row.created_at),
    activityRewardLastSeenAt: row.activity_reward_last_seen_at ? toIso(row.activity_reward_last_seen_at) : undefined,
    activityRewardLastAwardedAt: row.activity_reward_last_awarded_at ? toIso(row.activity_reward_last_awarded_at) : undefined,
    telegram,
  };
}

export function rowToTelegramLoginRequest(row: any): EzcordTelegramLoginRequest {
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

export function rowToRoom(row: any): EzcordRoom {
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
