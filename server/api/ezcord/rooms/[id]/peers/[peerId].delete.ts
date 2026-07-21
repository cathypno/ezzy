export default defineEventHandler(async (event) => {
  const { user, room } = await requireRoomAccess(event);
  const peerId = getRouterParam(event, "peerId") || "";

  if (!peerId) {
    throw createError({ statusCode: 400, message: "Нет peerId" });
  }

  await kickEzcordPeer(room, peerId, user);
  notifyEzcordPeerKicked(room.id, peerId);
  await broadcastEzcordRealtimePeerList(room.id);
  return { ok: true };
});
