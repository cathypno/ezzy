import { createError } from "h3";
import {
  canAccessRoom,
  appendEzcordSignal,
  checkEzcordRateLimitKey,
  EZCORD_MAX_ROOM_PARTICIPANTS,
  EZCORD_SESSION_COOKIE,
  getEzcordRoom,
  getEzcordUserBySessionId,
  leaveEzcordPeer,
  touchEzcordPeer,
  type EzcordSignal,
  type EzcordUser,
} from "../../utils/ezcord";
import {
  attachEzcordRealtimePeer,
  attachEzcordRealtimeWaitingPeer,
  broadcastEzcordRealtimePeerList,
  detachEzcordRealtimePeer,
  detachEzcordRealtimeWaitingPeer,
  sendEzcordRealtimePeer,
} from "../../utils/ezcordRealtime";

interface EzcordWsContext {
  roomId: string;
  peerId: string;
  user: EzcordUser;
  rateKey: string;
  waiting: boolean;
}

type EzcordClientMessage =
  | { type: "ping" }
  | { type: "leave" }
  | {
      type: "signal";
      toPeerId?: string;
      signalType?: EzcordSignal["type"];
      payload?: any;
    };

export default defineWebSocketHandler({
  async open(peer) {
    try {
      const url = new URL(peer.request.url, "http://localhost");
      const roomId = url.searchParams.get("roomId") || "";
      const peerId = url.searchParams.get("peerId") || "";
      const inviteCode = url.searchParams.get("invite") || "";
      const sessionId = getCookieValue(peer.request.headers.get("cookie") || "", EZCORD_SESSION_COOKIE);

      await checkEzcordRateLimitKey("ws_open", peer.remoteAddress || sessionId || "unknown", 120);

      if (!roomId || !peerId || !sessionId) {
        throw createError({ statusCode: 401, message: "Нужно войти в Ezcord" });
      }

      const user = await getEzcordUserBySessionId(sessionId);
      if (!user) {
        throw createError({ statusCode: 401, message: "Нужно войти в Ezcord" });
      }

      const room = await getEzcordRoom(roomId);
      if (!room) {
        throw createError({ statusCode: 404, message: "Комната не найдена" });
      }

      const allowed = await canAccessRoom(user, room, inviteCode);
      if (!allowed) {
        throw createError({ statusCode: 403, message: "Нет доступа к комнате" });
      }

      const presence = await touchEzcordPeer(room.id, peerId, user);
      peer.context.ezcord = {
        roomId: room.id,
        peerId,
        user,
        rateKey: `${user.id}:${peer.remoteAddress || "unknown"}`,
        waiting: presence.waiting,
      } satisfies EzcordWsContext;

      if (presence.waiting) {
        attachEzcordRealtimeWaitingPeer(room.id, peerId, user.id, peer);
      } else {
        attachEzcordRealtimePeer(room.id, peerId, user.id, peer);
      }
      sendJson(peer, {
        type: "ready",
        roomId: room.id,
        peerId,
        maxParticipants: EZCORD_MAX_ROOM_PARTICIPANTS,
        waiting: presence.waiting,
        waitingCount: presence.waitingCount,
      });
      await broadcastEzcordRealtimePeerList(room.id);
    } catch (error: any) {
      closeWithError(peer, error?.message || "Не получилось подключиться", error?.statusCode === 409 ? 1013 : 1008);
    }
  },

  async message(peer, message) {
    const context = getContext(peer);
    if (!context) {
      closeWithError(peer, "Нет активной комнаты", 1008);
      return;
    }

    let payload: EzcordClientMessage;
    try {
      payload = message.json<EzcordClientMessage>();
    } catch {
      sendJson(peer, { type: "error", message: "Неверный формат сообщения" });
      return;
    }

    try {
      await checkEzcordRateLimitKey("ws_message", context.rateKey, 900);

      if (payload.type === "leave") {
        peer.close?.(1000, "Leave");
        return;
      }

      if (payload.type === "ping") {
        const presence = await touchEzcordPeer(context.roomId, context.peerId, context.user);
        if (context.waiting && !presence.waiting) {
          context.waiting = false;
          detachEzcordRealtimeWaitingPeer(context.roomId, context.peerId, peer);
          attachEzcordRealtimePeer(context.roomId, context.peerId, context.user.id, peer);
          sendJson(peer, { type: "ready", waiting: false, waitingCount: presence.waitingCount });
        } else if (context.waiting) {
          sendJson(peer, { type: "waiting", waiting: true, waitingCount: presence.waitingCount });
        }
        sendJson(peer, { type: "pong", at: new Date().toISOString() });
        await broadcastEzcordRealtimePeerList(context.roomId);
        return;
      }

      if (payload.type === "signal") {
        if (!payload.toPeerId || !payload.signalType || !payload.payload) {
          sendJson(peer, { type: "error", message: "Неполный signal payload" });
          return;
        }

        if (!["offer", "answer", "candidate"].includes(payload.signalType)) {
          sendJson(peer, { type: "error", message: "Неверный signal type" });
          return;
        }

        const signal = await appendEzcordSignal({
          roomId: context.roomId,
          fromPeerId: context.peerId,
          toPeerId: payload.toPeerId,
          type: payload.signalType,
          payload: payload.payload,
        });

        sendEzcordRealtimePeer(context.roomId, payload.toPeerId, {
          type: "signal",
          signal,
        });
      }
    } catch (error: any) {
      closeWithError(peer, error?.message || "WebSocket error", error?.statusCode === 429 ? 1013 : 1008);
    }
  },

  async close(peer) {
    const context = getContext(peer);
    if (!context) return;

    const detached = context.waiting
      ? detachEzcordRealtimeWaitingPeer(context.roomId, context.peerId, peer)
      : detachEzcordRealtimePeer(context.roomId, context.peerId, peer);
    if (detached) {
      await leaveEzcordPeer(context.roomId, context.peerId, context.user.id).catch(() => {});
    }
    await broadcastEzcordRealtimePeerList(context.roomId).catch(() => {});
  },

  async error(peer) {
    const context = getContext(peer);
    if (!context) return;

    const detached = context.waiting
      ? detachEzcordRealtimeWaitingPeer(context.roomId, context.peerId, peer)
      : detachEzcordRealtimePeer(context.roomId, context.peerId, peer);
    if (detached) {
      await leaveEzcordPeer(context.roomId, context.peerId, context.user.id).catch(() => {});
    }
    await broadcastEzcordRealtimePeerList(context.roomId).catch(() => {});
  },
});

function getContext(peer: any): EzcordWsContext | null {
  return (peer.context?.ezcord as EzcordWsContext | undefined) || null;
}

function getCookieValue(cookieHeader: string, name: string): string {
  const prefix = `${name}=`;
  const entry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

function closeWithError(peer: any, message: string, code: number): void {
  sendJson(peer, { type: "error", message });
  peer.close?.(code, message);
}

function sendJson(peer: any, payload: Record<string, any>): void {
  peer.send?.(JSON.stringify(payload));
}
