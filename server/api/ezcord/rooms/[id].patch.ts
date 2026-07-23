import { checkEzcordRateLimit, requireRoomAccess, roomInviteUrl, updateEzcordRoomSettings } from "../../../utils/ezcord";
import { broadcastEzcordRealtimeRoomSettings } from "../../../utils/ezcordRealtime";

export default defineEventHandler(async (event) => {
  const { user, room } = await requireRoomAccess(event);
  await checkEzcordRateLimit(event, "room_settings", 60);

  const body = await readBody<{
    name?: string;
    game?: "voicechat" | "cs2" | "dota2" | "brawl_stars";
    goal?: "result" | "communication";
  }>(event);

  const updatedRoom = await updateEzcordRoomSettings(room, user.id, {
    name: String(body.name || ""),
    game: body.game || "voicechat",
    goal: body.goal || "communication",
  });
  broadcastEzcordRealtimeRoomSettings(updatedRoom.id, {
    name: updatedRoom.name,
    game: updatedRoom.game,
    goal: updatedRoom.goal,
  });

  return {
    ok: true,
    room: {
      ...updatedRoom,
      inviteUrl: await roomInviteUrl(updatedRoom),
    },
  };
});
