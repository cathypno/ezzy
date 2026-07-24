import { usePostgresStore, useRedisLiveState } from "./env";
import { getPgPool } from "./postgres";
import { getRedis, scanKeys } from "./redis";
import { readEzcordData } from "./json-store";
import { EZCORD_MAX_ROOM_PARTICIPANTS } from "./presence";

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
