export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "rewards", 120);

  const user = await requireEzcordUser(event);

  return {
    ok: true,
    user: publicEzcordUser(user),
    chest: getEzcordChestState(user),
  };
});
