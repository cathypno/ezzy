export default defineEventHandler(async () => {
  const startedAt = Date.now();
  const metrics = await getEzcordMetrics();

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    dependencies: {
      storage: metrics.storage,
      liveState: metrics.liveState,
    },
    limits: {
      maxRoomParticipants: metrics.maxRoomParticipants,
    },
    realtime: {
      ...getEzcordRealtimeStats(),
    },
  };
});
