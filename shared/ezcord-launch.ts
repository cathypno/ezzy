export const EZCORD_ROOM_START_PREFIX = "ezroom";

export interface EzcordRoomLaunch {
  roomId: string;
  inviteCode: string;
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
