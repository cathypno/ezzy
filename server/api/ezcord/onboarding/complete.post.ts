export default defineEventHandler(async (event) => {
  await checkEzcordRateLimit(event, "onboarding", 30, 60_000);

  const user = await requireEzcordUser(event);
  const updatedUser = await completeEzcordOnboarding(user.id);

  return {
    ok: true,
    user: publicEzcordUser(updatedUser),
  };
});
