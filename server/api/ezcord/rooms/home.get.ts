export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "rooms", 60);

  const room = await getOrCreateEzcordHomeRoom(user);
  return { ok: true, room: { ...room, inviteUrl: roomInviteUrl(room) } };
});
