import { EZCORD_MAX_ROOM_PARTICIPANTS, listEzcordPeers } from "./ezcord";

interface EzcordRealtimePeer {
  peer: any;
  roomId: string;
  peerId: string;
  userId: string;
  joinedAt: string;
}

const roomSockets = new Map<string, Map<string, EzcordRealtimePeer>>();

export function attachEzcordRealtimePeer(roomId: string, peerId: string, userId: string, peer: any): void {
  const sockets = getRoomSockets(roomId);
  const existing = sockets.get(peerId);
  if (existing && existing.peer !== peer) {
    sendEzcordRealtimePayload(existing.peer, { type: "replaced", message: "Открыто новое подключение" });
    existing.peer.close?.(1000, "Replaced");
  }

  sockets.set(peerId, {
    peer,
    roomId,
    peerId,
    userId,
    joinedAt: new Date().toISOString(),
  });
}

export function detachEzcordRealtimePeer(roomId: string, peerId: string, peer?: any): void {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;

  const existing = sockets.get(peerId);
  if (!existing || (peer && existing.peer !== peer)) return;

  sockets.delete(peerId);
  if (sockets.size === 0) {
    roomSockets.delete(roomId);
  }
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

export async function broadcastEzcordRealtimePeerList(roomId: string): Promise<void> {
  const sockets = roomSockets.get(roomId);
  if (!sockets || sockets.size === 0) return;

  const allPeers = await listEzcordPeers(roomId);
  for (const socket of sockets.values()) {
    sendEzcordRealtimePayload(socket.peer, {
      type: "peers",
      peers: allPeers.filter((peer) => peer.peerId !== socket.peerId),
      maxParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
    });
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

function sendEzcordRealtimePayload(peer: any, payload: Record<string, any>): boolean {
  try {
    peer.send?.(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
