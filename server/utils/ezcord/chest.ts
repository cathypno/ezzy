import { createError } from "h3";
import {
  EZCORD_LOBBY_UNLOCK_XP,
  getEzcordChestCost,
  getEzcordChestState,
  isEzcordLobbyUnlocked,
  normalizeEzcordUserEconomy,
  rollEzcordChestCoinsAward,
} from "./economy";
import { usePostgresStore } from "./env";
import { randomId } from "./id";
import { readEzcordData, writeEzcordData } from "./json-store";
import { getPgPool, rowToUser } from "./postgres";
import type { EzcordUser } from "./types";

export interface EzcordChestOpeningResult {
  index: number;
  cost: number;
  coinsAwarded: number;
  xpAwarded: number;
  lobbyUnlocked: boolean;
  nextCost: number;
}

export async function openEzcordRewardChest(userId: string): Promise<{ user: EzcordUser; opening: EzcordChestOpeningResult }> {
  if (usePostgresStore()) {
    const pool = await getPgPool();
    const client = await pool.connect();

    try {
      await client.query("begin");
      const current = await client.query("select * from ezcord_users where id = $1 for update", [userId]);
      if (current.rowCount === 0) {
        throw createError({ statusCode: 404, message: "Пользователь не найден" });
      }

      const user = normalizeEzcordUserEconomy(rowToUser(current.rows[0]));
      const opening = buildChestOpening(user);
      const nextCoins = user.coins - opening.cost + opening.coinsAwarded;
      const nextXp = opening.lobbyUnlocked ? Math.max(user.xp, EZCORD_LOBBY_UNLOCK_XP) : user.xp;
      const openedAt = new Date().toISOString();

      await client.query(
        `insert into ezcord_chest_openings
          (id, user_id, open_index, cost, coins_awarded, xp_awarded, lobby_unlocked, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomId("chest"), user.id, opening.index, opening.cost, opening.coinsAwarded, opening.xpAwarded, opening.lobbyUnlocked, openedAt],
      );

      const updated = await client.query(
        `update ezcord_users
            set coins = $1,
                xp = $2,
                points = greatest(points, $2),
                chest_open_count = $3,
                lobby_unlocked_at = case
                  when $4::timestamptz is not null then $4::timestamptz
                  else lobby_unlocked_at
                end
          where id = $5
        returning *`,
        [
          nextCoins,
          nextXp,
          user.chestOpenCount + 1,
          opening.lobbyUnlocked ? openedAt : null,
          user.id,
        ],
      );

      await client.query("commit");
      return {
        user: rowToUser(updated.rows[0]),
        opening: {
          ...opening,
          nextCost: getEzcordChestCost(user.chestOpenCount + 1),
        },
      };
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

  normalizeEzcordUserEconomy(user);
  const opening = buildChestOpening(user);
  const openedAt = new Date().toISOString();
  user.coins = user.coins - opening.cost + opening.coinsAwarded;
  if (opening.lobbyUnlocked) {
    user.xp = Math.max(user.xp, EZCORD_LOBBY_UNLOCK_XP);
    user.points = Math.max(user.points || 0, user.xp);
    user.lobbyUnlockedAt = openedAt;
  }
  user.chestOpenCount += 1;
  data.chestOpenings.push({
    id: randomId("chest"),
    userId: user.id,
    openIndex: opening.index,
    cost: opening.cost,
    coinsAwarded: opening.coinsAwarded,
    xpAwarded: opening.xpAwarded,
    lobbyUnlocked: opening.lobbyUnlocked,
    createdAt: openedAt,
  });
  writeEzcordData(data);

  return {
    user,
    opening: {
      ...opening,
      nextCost: getEzcordChestCost(user.chestOpenCount),
    },
  };
}

function buildChestOpening(user: EzcordUser): EzcordChestOpeningResult {
  const state = getEzcordChestState(user);
  if (!state.canOpen) {
    throw createError({
      statusCode: 400,
      message: `Недостаточно монет: нужно еще ${Math.max(0, state.nextCost - user.coins)}`,
    });
  }

  const shouldUnlockLobby = user.chestOpenCount === 0 && !isEzcordLobbyUnlocked(user);
  return {
    index: user.chestOpenCount + 1,
    cost: state.nextCost,
    coinsAwarded: rollEzcordChestCoinsAward(),
    xpAwarded: shouldUnlockLobby ? Math.max(0, EZCORD_LOBBY_UNLOCK_XP - user.xp) : 0,
    lobbyUnlocked: shouldUnlockLobby,
    nextCost: getEzcordChestCost(user.chestOpenCount + 1),
  };
}
