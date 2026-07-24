import { createError, type H3Event } from "h3";
import { getEzcordEnv } from "./env";
import { requireEzcordUser } from "./auth";
import type { EzcordUser } from "./types";

export function isEzcordAdminUser(user: EzcordUser): boolean {
  const admins = getEzcordEnv("EZCORD_ADMIN_EMAILS")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(user.email.toLowerCase());
}

export async function requireEzcordAdmin(event: H3Event): Promise<EzcordUser> {
  const user = await requireEzcordUser(event);
  if (!isEzcordAdminUser(user)) {
    throw createError({ statusCode: 403, message: "Доступно только администраторам" });
  }
  return user;
}
