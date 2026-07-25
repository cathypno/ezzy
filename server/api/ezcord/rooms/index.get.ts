import { EZCORD_MAX_ROOM_PARTICIPANTS, listEzcordPeers } from "../../../utils/ezcord/presence";

export default defineEventHandler(async (event) => {
  const user = await getEzcordUser(event);
  const rooms = await listEzcordRooms(user);

  return {
    rooms: await Promise.all(
      rooms.map(async (room) => {
        const peers = await listEzcordPeers(room.id);

        return {
          ...room,
          inviteUrl: room.createdBy === user?.id ? await roomInviteUrl(room) : undefined,
          participantCount: peers.length,
          maxParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
        };
      }),
    ),
  };
});
