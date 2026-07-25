import { createError } from "h3";
import { normalizeEzcordUserEconomy } from "./economy";
import { usePostgresStore } from "./env";
import { getPgPool, rowToUser } from "./postgres";
import { readEzcordData, writeEzcordData } from "./json-store";
import { randomId } from "./id";
import type { EzcordRoom, EzcordUser } from "./types";

const HOST_ROOM_REWARD_POINTS = 10;
const ACTIVITY_REWARD_POINTS = 5;
const ACTIVITY_REWARD_INTERVAL_MS = 15 * 60 * 1000;
const ACTIVITY_REWARD_RESET_GAP_MS = 3 * 60 * 1000;

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
                coins = coins + $1,
                xp = xp + $1,
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
  normalizeEzcordUserEconomy(user);
  user.points = (user.points || 0) + reward.points;
  user.coins = (user.coins || 0) + reward.points;
  user.xp = (user.xp || 0) + reward.points;
  user.activityRewardLastSeenAt = reward.lastSeenAt;
  user.activityRewardLastAwardedAt = reward.lastAwardedAt;
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
          ? await client.query("update ezcord_users set points = points + $1, coins = coins + $1, xp = xp + $1 where id = $2 returning *", [points, userId])
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
  normalizeEzcordUserEconomy(user);

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
    user.coins = (user.coins || 0) + points;
    user.xp = (user.xp || 0) + points;
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
