export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "rewards", 120);

  const user = await requireEzcordUser(event);
  const rewardedUser = await touchEzcordActivityReward(user.id);

  return {
    ok: true,
    user: publicEzcordUser(rewardedUser),
  };
});
