export default defineEventHandler(async (event) => {
  const { user, room } = await requireRoomAccess(event);
  await checkEzcordRateLimit(event, "presence", 600);

  const body = await readBody<{ peerId?: string }>(event);
  const peerId = String(body.peerId || "");

  if (!peerId) {
    throw createError({ statusCode: 400, message: "Нет peerId" });
  }

  const peers = await touchEzcordPeer(room.id, peerId, user);
  return { peers };
});
