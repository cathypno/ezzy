export const EZCORD_ROOM_START_PREFIX = "ezroom";

export interface EzcordRoomLaunch {
  roomId: string;
  inviteCode: string;
}

export function encodeEzcordRoomBotStart(roomId: string, inviteCode = ""): string {
  return `${EZCORD_ROOM_START_PREFIX}_${roomId}${inviteCode ? `_invite_${inviteCode}` : ""}`;
}

export function decodeEzcordRoomBotStart(value: string): EzcordRoomLaunch | null {
  const decoded = decodeLaunchValue(value);
  const prefix = `${EZCORD_ROOM_START_PREFIX}_`;
  if (!decoded.startsWith(prefix)) return null;

  const payload = decoded.slice(prefix.length);
  const inviteMarker = "_invite_";
  const inviteIndex = payload.indexOf(inviteMarker);
  const roomId = inviteIndex >= 0 ? payload.slice(0, inviteIndex) : payload;
  const inviteCode = inviteIndex >= 0 ? payload.slice(inviteIndex + inviteMarker.length) : "";

  if (!roomId || (inviteIndex >= 0 && !inviteCode)) return null;
  return { roomId, inviteCode };
}

export function encodeEzcordRoomLaunch(roomId: string, inviteCode = ""): string {
  return [EZCORD_ROOM_START_PREFIX, roomId, inviteCode].filter(Boolean).join(":");
}

export function decodeEzcordRoomLaunch(value: string): EzcordRoomLaunch | null {
  const decoded = decodeLaunchValue(value);
  const [prefix, roomId, inviteCode = ""] = decoded.split(":");

  if (prefix !== EZCORD_ROOM_START_PREFIX || !roomId || decoded.split(":").length > 3) {
    return null;
  }

  return { roomId, inviteCode };
}

function decodeLaunchValue(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}
