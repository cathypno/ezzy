export default defineEventHandler((event) => {
  const path = String(event.context.params?.path || "").replace(/^\/+/, "");
  const query = getRequestURL(event).search;
  return sendRedirect(event, `/_nuxt/${path}${query}`, 302);
});
