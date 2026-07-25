export function getInitials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || "EZ").toUpperCase();
}

export function formatEzcordPoints(points = 0) {
  const value = Math.max(0, points);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function getEzcordLevel(xp = 0) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 1000) + 1);
}

export function getEzcordUserCoins(user?: { coins?: number; points?: number } | null) {
  return Math.max(0, Number(user?.coins ?? user?.points ?? 0));
}

export function getEzcordUserXp(user?: { xp?: number; points?: number } | null) {
  return Math.max(0, Number(user?.xp ?? user?.points ?? 0));
}

export function getEzcordUserLevel(user?: { level?: number; xp?: number; points?: number } | null) {
  return Math.max(1, Number(user?.level || getEzcordLevel(getEzcordUserXp(user))));
}

export function getEzcordChestCost(openCount = 0) {
  return [5, 25, 75][openCount] || 150;
}

export function canOpenEzcordChest(user?: { chestOpenCount?: number; coins?: number; points?: number } | null) {
  return getEzcordUserCoins(user) >= getEzcordChestCost(user?.chestOpenCount || 0);
}
