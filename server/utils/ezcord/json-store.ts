import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EzcordData } from "./types";

const DATA_FILE = "ezcord.json";

export function getEzcordDataPath(): string {
  return join(process.cwd(), "data", DATA_FILE);
}

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
      chestOpenings: [],
    };
    writeEzcordData(initial);
    return initial;
  }

  const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<EzcordData>;
  return {
    users: (data.users || []).map((user) => {
      const points = user.points || 0;
      const xp = user.xp ?? points;
      return {
        ...user,
        points,
        coins: user.coins ?? points,
        xp,
        chestOpenCount: user.chestOpenCount || 0,
        lobbyUnlockedAt: user.lobbyUnlockedAt,
        onboardingCompletedAt: user.onboardingCompletedAt,
      };
    }),
    sessions: data.sessions || [],
    rooms: (data.rooms || []).map((room) => ({
      ...room,
      game: room.game || "voicechat",
      goal: room.goal || "communication",
      lastActiveAt: room.lastActiveAt || room.createdAt,
    })),
    peers: data.peers || [],
    waitingPeers: data.waitingPeers || [],
    signals: data.signals || [],
    kickedPeers: data.kickedPeers || [],
    telegramLoginRequests: data.telegramLoginRequests || [],
    pointEvents: data.pointEvents || [],
    chestOpenings: data.chestOpenings || [],
  };
}

export function writeEzcordData(data: EzcordData): void {
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(getEzcordDataPath(), JSON.stringify(data, null, 2), "utf-8");
}

export function findJsonUserByEmail(email: string) {
  const data = readEzcordData();
  return data.users.find((item) => item.email === email) || null;
}
