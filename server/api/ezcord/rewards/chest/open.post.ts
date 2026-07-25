export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "chest", 20);

  const user = await requireEzcordUser(event);
  const result = await openEzcordRewardChest(user.id);

  return {
    ok: true,
    user: publicEzcordUser(result.user),
    chest: getEzcordChestState(result.user),
    opening: result.opening,
  };
});
