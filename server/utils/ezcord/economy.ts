import { randomInt } from "node:crypto";
import type { EzcordUser } from "./types";

export const EZCORD_LOBBY_UNLOCK_XP = 1000;
export const EZCORD_CHEST_MIN_REWARD = 5;
export const EZCORD_CHEST_MAX_REWARD = 300;

const CHEST_COSTS = [5, 25, 75] as const;

export function normalizeEzcordUserEconomy(user: EzcordUser): EzcordUser {
  const legacyPoints = Math.max(0, Number(user.points || 0));

  user.points = legacyPoints;
  user.coins = Math.max(0, Number(user.coins ?? legacyPoints));
  user.xp = Math.max(0, Number(user.xp ?? legacyPoints));
  user.chestOpenCount = Math.max(0, Number(user.chestOpenCount || 0));

  return user;
}

export function getEzcordLevelFromXp(xp = 0): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / EZCORD_LOBBY_UNLOCK_XP) + 1);
}

export function isEzcordLobbyUnlocked(user: EzcordUser): boolean {
  const normalized = normalizeEzcordUserEconomy(user);
  return Boolean(normalized.lobbyUnlockedAt) || getEzcordLevelFromXp(normalized.xp) >= 2;
}

export function getEzcordChestCost(openCount = 0): number {
  return CHEST_COSTS[openCount] || 150;
}

export function getEzcordChestState(user: EzcordUser) {
  const normalized = normalizeEzcordUserEconomy(user);
  const nextCost = getEzcordChestCost(normalized.chestOpenCount);

  return {
    openCount: normalized.chestOpenCount,
    nextCost,
    canOpen: normalized.coins >= nextCost,
    minReward: EZCORD_CHEST_MIN_REWARD,
    maxReward: EZCORD_CHEST_MAX_REWARD,
    lobbyUnlockAvailable: !isEzcordLobbyUnlocked(normalized) && normalized.chestOpenCount === 0,
  };
}

export function rollEzcordChestCoinsAward(): number {
  const fraction = randomInt(0, 1_000_000) / 1_000_000;
  const span = EZCORD_CHEST_MAX_REWARD - EZCORD_CHEST_MIN_REWARD + 1;
  return EZCORD_CHEST_MIN_REWARD + Math.floor(Math.pow(fraction, 2.2) * span);
}
