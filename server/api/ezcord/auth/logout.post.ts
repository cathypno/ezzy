export default defineEventHandler(async (event) => {
  await clearEzcordSession(event);
  return { ok: true };
});
