export function getInitials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || "EZ").toUpperCase();
}

export function formatEzcordPoints(points = 0) {
  const value = Math.max(0, points);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function getEzcordLevel(points = 0) {
  return Math.max(1, Math.floor(Math.max(0, points) / 1000) + 1);
}
