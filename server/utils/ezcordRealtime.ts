import { EZCORD_MAX_ROOM_PARTICIPANTS, getEzcordWaitingCount, listEzcordPeers } from "./ezcord";

interface EzcordRealtimePeer {
  peer: any;
  roomId: string;
  peerId: string;
  userId: string;
  joinedAt: string;
}

const roomSockets = new Map<string, Map<string, EzcordRealtimePeer>>();
const roomWaitingSockets = new Map<string, Map<string, EzcordRealtimePeer>>();

export function attachEzcordRealtimePeer(roomId: string, peerId: string, userId: string, peer: any): void {
  const sockets = getRoomSockets(roomId);

  for (const [existingPeerId, existing] of Array.from(sockets.entries())) {
    if (existing.peer === peer) continue;
    if (existingPeerId !== peerId && existing.userId !== userId) continue;

    sendEzcordRealtimePayload(existing.peer, { type: "replaced", message: "Открыто новое подключение" });
    existing.peer.close?.(1000, "Replaced");
    sockets.delete(existingPeerId);
  }

  sockets.set(peerId, {
    peer,
    roomId,
    peerId,
    userId,
    joinedAt: new Date().toISOString(),
  });
}

export function detachEzcordRealtimePeer(roomId: string, peerId: string, peer?: any): boolean {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return false;

  const existing = sockets.get(peerId);
  if (!existing || (peer && existing.peer !== peer)) return false;

  sockets.delete(peerId);
  if (sockets.size === 0) {
    roomSockets.delete(roomId);
  }
  return true;
}

export function attachEzcordRealtimeWaitingPeer(roomId: string, peerId: string, userId: string, peer: any): void {
  const sockets = getRoomWaitingSockets(roomId);

  for (const [existingPeerId, existing] of Array.from(sockets.entries())) {
    if (existing.peer === peer) continue;
    if (existingPeerId !== peerId && existing.userId !== userId) continue;

    existing.peer.close?.(1000, "Replaced");
    sockets.delete(existingPeerId);
  }

  sockets.set(peerId, {
    peer,
    roomId,
    peerId,
    userId,
    joinedAt: new Date().toISOString(),
  });
}

export function detachEzcordRealtimeWaitingPeer(roomId: string, peerId: string, peer?: any): boolean {
  const sockets = roomWaitingSockets.get(roomId);
  if (!sockets) return false;

  const existing = sockets.get(peerId);
  if (!existing || (peer && existing.peer !== peer)) return false;

  sockets.delete(peerId);
  if (sockets.size === 0) {
    roomWaitingSockets.delete(roomId);
  }
  return true;
}

export function notifyEzcordPeerKicked(roomId: string, peerId: string): void {
  const socket = roomSockets.get(roomId)?.get(peerId);
  if (!socket) return;

  sendEzcordRealtimePayload(socket.peer, { type: "kicked", message: "Вас кикнули из комнаты" });
  socket.peer.close?.(4003, "Kicked");
  detachEzcordRealtimePeer(roomId, peerId, socket.peer);
}

export function sendEzcordRealtimePeer(roomId: string, peerId: string, payload: Record<string, any>): boolean {
  const socket = roomSockets.get(roomId)?.get(peerId);
  if (!socket) return false;
  return sendEzcordRealtimePayload(socket.peer, payload);
}

export function broadcastEzcordRealtimeRoomSettings(
  roomId: string,
  settings: { name: string; game: string; goal: string },
): void {
  const payload = { type: "room_settings", room: settings };
  for (const socket of roomSockets.get(roomId)?.values() || []) {
    sendEzcordRealtimePayload(socket.peer, payload);
  }
  for (const socket of roomWaitingSockets.get(roomId)?.values() || []) {
    sendEzcordRealtimePayload(socket.peer, payload);
  }
}

export async function broadcastEzcordRealtimePeerList(roomId: string): Promise<void> {
  const sockets = roomSockets.get(roomId);
  const waitingSockets = roomWaitingSockets.get(roomId);
  if ((!sockets || sockets.size === 0) && (!waitingSockets || waitingSockets.size === 0)) return;

  const allPeers = await listEzcordPeers(roomId);
  const waitingCount = await getEzcordWaitingCount(roomId);
  const slotAvailable = allPeers.length < EZCORD_MAX_ROOM_PARTICIPANTS && waitingCount > 0;
  for (const socket of sockets?.values() || []) {
    sendEzcordRealtimePayload(socket.peer, {
      type: "peers",
      peers: allPeers.filter((peer) => peer.peerId !== socket.peerId),
      maxParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
      waiting: false,
      waitingCount,
    });
  }
  for (const socket of waitingSockets?.values() || []) {
    sendEzcordRealtimePayload(socket.peer, {
      type: "peers",
      peers: allPeers,
      maxParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
      waiting: true,
      waitingCount,
    });
    if (slotAvailable) {
      sendEzcordRealtimePayload(socket.peer, { type: "slot_available" });
    }
  }
}

export function getEzcordRealtimeStats(): Record<string, number> {
  let activeWebSockets = 0;
  for (const sockets of roomSockets.values()) {
    activeWebSockets += sockets.size;
  }

  return {
    activeWebSocketRooms: roomSockets.size,
    activeWebSockets,
  };
}

function getRoomSockets(roomId: string): Map<string, EzcordRealtimePeer> {
  let sockets = roomSockets.get(roomId);
  if (!sockets) {
    sockets = new Map();
    roomSockets.set(roomId, sockets);
  }
  return sockets;
}

function getRoomWaitingSockets(roomId: string): Map<string, EzcordRealtimePeer> {
  let sockets = roomWaitingSockets.get(roomId);
  if (!sockets) {
    sockets = new Map();
    roomWaitingSockets.set(roomId, sockets);
  }
  return sockets;
}

function sendEzcordRealtimePayload(peer: any, payload: Record<string, any>): boolean {
  try {
    peer.send?.(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
