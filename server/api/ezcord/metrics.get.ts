export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  const metrics = await getEzcordMetrics();

  return {
    ok: true,
    userId: user.id,
    metrics: {
      ...metrics,
      ...getEzcordRealtimeStats(),
    },
  };
});
