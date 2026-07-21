export default defineEventHandler(async (event) => {
  const user = await getEzcordUser(event);
  return { user: user ? publicEzcordUser(user) : null };
});
