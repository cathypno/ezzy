export default defineEventHandler(async (event) => {
  const user = await requireEzcordUser(event);
  await checkEzcordRateLimit(event, "rooms", 60);

  const room = await getOrCreateEzcordHomeRoom(user);
  const rewardedUser = await awardEzcordRoomHostPoints(room, user);

  return {
    ok: true,
    room: { ...room, inviteUrl: await roomInviteUrl(room) },
    user: publicEzcordUser(rewardedUser),
  };
});
