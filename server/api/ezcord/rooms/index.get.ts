export default defineEventHandler(async (event) => {
  const user = await getEzcordUser(event);
  const rooms = await listEzcordRooms(user);

  return {
    rooms: rooms.map((room) => ({
      ...room,
      inviteUrl: room.createdBy === user?.id ? roomInviteUrl(room) : undefined,
    })),
  };
});
