export default defineEventHandler(async (event) => {
  const { room } = await requireRoomAccess(event);
  await checkEzcordRateLimit(event, "signals", 900);

  const query = getQuery(event);
  const peerId = String(query.peerId || "");
  const after = String(query.after || "");

  if (!peerId) {
    throw createError({ statusCode: 400, message: "Нет peerId" });
  }

  return { signals: await getEzcordSignals(room.id, peerId, after) };
});
