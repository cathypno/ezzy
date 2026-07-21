export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  const roomId = getRouterParam(event, "id") || "";
  const inviteCode = String(getQuery(event).invite || "");
  const room = await getEzcordRoom(roomId);

  if (!room) {
    throw createError({ statusCode: 404, message: "Комната не найдена" });
  }

  const allowed = await canAccessRoom(user, room, inviteCode);
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Нет доступа к комнате" });
  }

  return {
    room: {
      ...room,
      inviteUrl: room.createdBy === user.id ? roomInviteUrl(room) : undefined,
    },
    voice: {
      provider: "webrtc-mesh",
      ready: true,
    },
  };
});
