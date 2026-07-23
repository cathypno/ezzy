export default defineEventHandler(async (event) => {
  const user = await getEzcordUser(event);
  const rooms = await listEzcordRooms(user);

  return {
    rooms: await Promise.all(
      rooms.map(async (room) => ({
        ...room,
        inviteUrl: room.createdBy === user?.id ? await roomInviteUrl(room) : undefined,
      })),
    ),
  };
});
