export default defineEventHandler(async (event) => {
  const { user, room } = await requireRoomAccess(event);
  const body = await readBody<{ peerId?: string }>(event);
  const peerId = String(body.peerId || "");

  if (!peerId) {
    throw createError({ statusCode: 400, message: "Нет peerId" });
  }

  await leaveEzcordPeer(room.id, peerId, user.id);
  return { ok: true };
});
