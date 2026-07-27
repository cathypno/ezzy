import { createError } from "h3";
import { getEzcordEnv, useRedisLiveState } from "./env";
import { getRedis, scanKeys } from "./redis";
import { readEzcordData, writeEzcordData } from "./json-store";
import { randomId } from "./id";
import { EZCORD_EMPTY_ROOM_TTL_MS, recordKickedPeer, touchEzcordRoomActivity } from "./rooms";
import type { EzcordPeer, EzcordPresenceState, EzcordRoom, EzcordSignal, EzcordUser, EzcordWaitingPeer } from "./types";

export const EZCORD_MAX_ROOM_PARTICIPANTS = 5;
const SIGNAL_TTL_SECONDS = 60;
const PEER_TTL_MS = 90 * 1000;
const WAITING_PEER_TTL_MS = 15 * 60 * 1000;

export async function touchEzcordPeer(roomId: string, peerId: string, user: EzcordUser): Promise<EzcordPresenceState> {
  const peer: EzcordPeer = {
    roomId,
    peerId,
    userId: user.id,
    displayName: user.displayName,
    photoUrl: user.telegram?.photoUrl,
    lastSeenAt: new Date().toISOString(),
  };

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const key = roomPeersKey(roomId);
    await pruneRedisRoomState(roomId);
    const existingPeers = (await redis.hvals(key)).map((value: string) => JSON.parse(value) as EzcordPeer);
    const duplicatePeerIds = existingPeers.filter((item: EzcordPeer) => item.userId === user.id && item.peerId !== peerId).map((item: EzcordPeer) => item.peerId);

    if (duplicatePeerIds.length > 0) {
      await redis.hdel(key, ...duplicatePeerIds);
      await Promise.all(duplicatePeerIds.map((duplicatePeerId: string) => deleteSignalKeys(roomId, duplicatePeerId)));
    }

    const exists = await redis.hexists(key, peerId);
    if (!exists) {
      const count = await redis.hlen(key);
      if (count >= EZCORD_MAX_ROOM_PARTICIPANTS) {
        const waitingKey = waitingPeersKey(roomId);
        await redis.hset(waitingKey, user.id, JSON.stringify({
          roomId,
          peerId,
          userId: user.id,
          displayName: user.displayName,
          queuedAt: new Date().toISOString(),
        } satisfies EzcordWaitingPeer));
        await redis.expire(waitingKey, getLiveStateKeyTtlSeconds());
        return {
          peers: await listEzcordPeers(roomId, peerId),
          waiting: true,
          waitingCount: await redis.hlen(waitingPeersKey(roomId)),
        };
      }
    }
    await redis.hdel(waitingPeersKey(roomId), user.id);
    await redis.hset(key, peerId, JSON.stringify(peer));
    await redis.expire(key, getLiveStateKeyTtlSeconds());
    await touchEzcordRoomActivity(roomId, peer.lastSeenAt);
    return {
      peers: await listEzcordPeers(roomId, peerId),
      waiting: false,
      waitingCount: await redis.hlen(waitingPeersKey(roomId)),
    };
  }

  const data = readEzcordData();
  pruneJsonRoomState(data, roomId);
  const duplicatePeerIds = data.peers.filter((item) => item.roomId === roomId && item.userId === user.id && item.peerId !== peerId).map((item) => item.peerId);
  if (duplicatePeerIds.length > 0) {
    const duplicatePeerIdSet = new Set(duplicatePeerIds);
    data.peers = data.peers.filter((item) => !(item.roomId === roomId && duplicatePeerIdSet.has(item.peerId)));
    data.signals = data.signals.filter(
      (signal) => signal.roomId !== roomId || (!duplicatePeerIdSet.has(signal.fromPeerId) && !duplicatePeerIdSet.has(signal.toPeerId)),
    );
  }

  data.waitingPeers = data.waitingPeers.filter((item) => !(item.roomId === roomId && item.userId === user.id));
  const existingPeer = data.peers.find((item) => item.roomId === roomId && item.peerId === peerId);
  if (existingPeer) {
    existingPeer.displayName = user.displayName;
    existingPeer.photoUrl = user.telegram?.photoUrl;
    existingPeer.lastSeenAt = peer.lastSeenAt;
  } else {
    const roomPeers = data.peers.filter((item) => item.roomId === roomId);
    if (roomPeers.length >= EZCORD_MAX_ROOM_PARTICIPANTS) {
      data.waitingPeers.push({
        roomId,
        peerId,
        userId: user.id,
        displayName: user.displayName,
        queuedAt: new Date().toISOString(),
      });
      writeEzcordData(data);
      return {
        peers: data.peers.filter((item) => item.roomId === roomId && item.peerId !== peerId),
        waiting: true,
        waitingCount: data.waitingPeers.filter((item) => item.roomId === roomId).length,
      };
    }
    data.peers.push(peer);
  }
  const room = data.rooms.find((item) => item.id === roomId && !item.closedAt);
  if (room) room.lastActiveAt = peer.lastSeenAt;
  writeEzcordData(data);
  return {
    peers: data.peers.filter((item) => item.roomId === roomId && item.peerId !== peerId),
    waiting: false,
    waitingCount: data.waitingPeers.filter((item) => item.roomId === roomId).length,
  };
}

export async function getEzcordWaitingCount(roomId: string): Promise<number> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    await pruneRedisRoomState(roomId);
    return await redis.hlen(waitingPeersKey(roomId));
  }

  const data = readEzcordData();
  const changed = pruneJsonRoomState(data, roomId);
  if (changed) writeEzcordData(data);
  return data.waitingPeers.filter((item) => item.roomId === roomId).length;
}

export async function listEzcordPeers(roomId: string, excludePeerId = ""): Promise<EzcordPeer[]> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    await pruneRedisRoomState(roomId);
    const values = await redis.hvals(roomPeersKey(roomId));
    return normalizeEzcordPeerList(
      values.map((value: string) => JSON.parse(value) as EzcordPeer),
      excludePeerId,
    );
  }

  const data = readEzcordData();
  const changed = pruneJsonRoomState(data, roomId);
  if (changed) writeEzcordData(data);
  return normalizeEzcordPeerList(
    data.peers.filter((peer) => peer.roomId === roomId),
    excludePeerId,
  );
}

export async function leaveEzcordPeer(roomId: string, peerId: string, userId: string): Promise<void> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    const rawPeer = await redis.hget(roomPeersKey(roomId), peerId);
    let removedPeer = false;
    if (rawPeer) {
      const peer = JSON.parse(rawPeer) as EzcordPeer;
      if (peer.userId === userId) {
        await redis.hdel(roomPeersKey(roomId), peerId);
        removedPeer = true;
      }
    }
    await redis.hdel(waitingPeersKey(roomId), userId);
    await deleteSignalKeys(roomId, peerId);
    if (removedPeer && (await redis.hlen(roomPeersKey(roomId))) === 0) {
      await touchEzcordRoomActivity(roomId);
    }
    return;
  }

  const data = readEzcordData();
  const peerCountBefore = data.peers.length;
  data.peers = data.peers.filter((peer) => !(peer.roomId === roomId && peer.peerId === peerId && peer.userId === userId));
  data.waitingPeers = data.waitingPeers.filter((peer) => !(peer.roomId === roomId && peer.peerId === peerId && peer.userId === userId));
  data.signals = data.signals.filter((signal) => signal.roomId !== roomId || (signal.fromPeerId !== peerId && signal.toPeerId !== peerId));
  const removedPeer = data.peers.length !== peerCountBefore;
  if (removedPeer && !data.peers.some((peer) => peer.roomId === roomId)) {
    const room = data.rooms.find((item) => item.id === roomId && !item.closedAt);
    if (room) room.lastActiveAt = new Date().toISOString();
  }
  writeEzcordData(data);
}

function normalizeEzcordPeerList(peers: EzcordPeer[], excludePeerId = ""): EzcordPeer[] {
  const latestByUser = new Map<string, EzcordPeer>();

  for (const peer of peers) {
    if (isPeerStale(peer)) continue;

    const key = peer.userId || peer.peerId;
    const existing = latestByUser.get(key);
    if (!existing || new Date(peer.lastSeenAt).getTime() >= new Date(existing.lastSeenAt).getTime()) {
      latestByUser.set(key, peer);
    }
  }

  return Array.from(latestByUser.values()).filter((peer) => peer.peerId !== excludePeerId);
}

export async function kickEzcordPeer(room: EzcordRoom, peerId: string, actor: EzcordUser): Promise<EzcordPeer | null> {
  if (room.createdBy !== actor.id) {
    throw createError({ statusCode: 403, message: "Кикать участников может только создатель комнаты" });
  }

  const targetPeer = await getLivePeer(room.id, peerId);
  if (targetPeer?.userId === actor.id) {
    throw createError({ statusCode: 400, message: "Нельзя кикнуть себя" });
  }

  if (targetPeer) {
    await recordKickedPeer(room.id, targetPeer.userId, actor.id);
  }

  if (useRedisLiveState()) {
    const redis = await getRedis();
    await redis.hdel(roomPeersKey(room.id), peerId);
    await deleteSignalKeys(room.id, peerId);
    return targetPeer;
  }

  const data = readEzcordData();
  data.peers = data.peers.filter((peer) => !(peer.roomId === room.id && peer.peerId === peerId));
  data.signals = data.signals.filter((signal) => signal.roomId !== room.id || (signal.fromPeerId !== peerId && signal.toPeerId !== peerId));
  writeEzcordData(data);
  return targetPeer;
}

async function getLivePeer(roomId: string, peerId: string): Promise<EzcordPeer | null> {
  if (useRedisLiveState()) {
    const redis = await getRedis();
    await pruneRedisRoomState(roomId);
    const raw = await redis.hget(roomPeersKey(roomId), peerId);
    return raw ? (JSON.parse(raw) as EzcordPeer) : null;
  }

  const data = readEzcordData();
  const changed = pruneJsonRoomState(data, roomId);
  if (changed) writeEzcordData(data);
  return data.peers.find((peer) => peer.roomId === roomId && peer.peerId === peerId) || null;
}

async function pruneRedisRoomState(roomId: string): Promise<void> {
  const redis = await getRedis();
  const peerKey = roomPeersKey(roomId);
  const waitingKey = waitingPeersKey(roomId);
  const peerEntries = await redis.hgetall(peerKey);
  const stalePeerIds: string[] = [];

  for (const [peerId, value] of Object.entries(peerEntries)) {
    const peer = parseJsonPeer(value);
    if (!peer || isPeerStale(peer)) {
      stalePeerIds.push(peerId);
    }
  }

  if (stalePeerIds.length > 0) {
    await redis.hdel(peerKey, ...stalePeerIds);
    await Promise.all(stalePeerIds.map((stalePeerId) => deleteSignalKeys(roomId, stalePeerId)));
  }

  const waitingEntries = await redis.hgetall(waitingKey);
  const staleWaitingUserIds: string[] = [];
  for (const [userId, value] of Object.entries(waitingEntries)) {
    const waiting = parseJsonWaitingPeer(value);
    if (!waiting || isWaitingPeerStale(waiting)) {
      staleWaitingUserIds.push(userId);
    }
  }

  if (staleWaitingUserIds.length > 0) {
    await redis.hdel(waitingKey, ...staleWaitingUserIds);
  }

  if ((await redis.hlen(peerKey)) > 0) {
    await redis.expire(peerKey, getLiveStateKeyTtlSeconds());
  }
  if ((await redis.hlen(waitingKey)) > 0) {
    await redis.expire(waitingKey, getLiveStateKeyTtlSeconds());
  }
}

function pruneJsonRoomState(data: ReturnType<typeof readEzcordData>, roomId: string): boolean {
  const peerCount = data.peers.length;
  const waitingCount = data.waitingPeers.length;
  data.peers = data.peers.filter((peer) => peer.roomId !== roomId || !isPeerStale(peer));
  data.waitingPeers = data.waitingPeers.filter((peer) => peer.roomId !== roomId || !isWaitingPeerStale(peer));
  return data.peers.length !== peerCount || data.waitingPeers.length !== waitingCount;
}

function parseJsonPeer(value: unknown): EzcordPeer | null {
  try {
    return JSON.parse(String(value)) as EzcordPeer;
  } catch {
    return null;
  }
}

function parseJsonWaitingPeer(value: unknown): EzcordWaitingPeer | null {
  try {
    return JSON.parse(String(value)) as EzcordWaitingPeer;
  } catch {
    return null;
  }
}

function isPeerStale(peer: EzcordPeer): boolean {
  return Date.now() - new Date(peer.lastSeenAt).getTime() > getPeerTtlMs();
}

function isWaitingPeerStale(peer: EzcordWaitingPeer): boolean {
  return Date.now() - new Date(peer.queuedAt).getTime() > getWaitingPeerTtlMs();
}

function getPeerTtlMs(): number {
  const configured = Number(getEzcordEnv("EZCORD_PEER_TTL_MS") || "");
  return Number.isFinite(configured) && configured > 0 ? configured : PEER_TTL_MS;
}

function getWaitingPeerTtlMs(): number {
  const configured = Number(getEzcordEnv("EZCORD_WAITING_PEER_TTL_MS") || "");
  return Number.isFinite(configured) && configured > 0 ? configured : WAITING_PEER_TTL_MS;
}

function getLiveStateKeyTtlSeconds(): number {
  const configured = Number(getEzcordEnv("EZCORD_EMPTY_ROOM_TTL_MS") || "");
  const emptyRoomTtlMs = Number.isFinite(configured) && configured > 0 ? configured : EZCORD_EMPTY_ROOM_TTL_MS;
  return Math.ceil((emptyRoomTtlMs + 60 * 1000) / 1000);
}

export async function appendEzcordSignal(signal: Omit<EzcordSignal, "id" | "createdAt">): Promise<EzcordSignal> {
  const item: EzcordSignal = {
    ...signal,
    id: randomId("sig"),
    createdAt: new Date().toISOString(),
  };

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const key = peerSignalsKey(item.roomId, item.toPeerId);
    await redis.rpush(key, JSON.stringify(item));
    await redis.expire(key, SIGNAL_TTL_SECONDS);
    return item;
  }

  const data = readEzcordData();
  const staleBefore = Date.now() - SIGNAL_TTL_SECONDS * 1000;
  data.signals = data.signals.filter((entry) => new Date(entry.createdAt).getTime() > staleBefore);
  data.signals.push(item);
  writeEzcordData(data);
  return item;
}

export async function getEzcordSignals(roomId: string, peerId: string, after = ""): Promise<EzcordSignal[]> {
  const afterTime = after ? new Date(after).getTime() : 0;

  if (useRedisLiveState()) {
    const redis = await getRedis();
    const values = await redis.lrange(peerSignalsKey(roomId, peerId), 0, -1);
    return values
      .map((value: string) => JSON.parse(value) as EzcordSignal)
      .filter((signal: EzcordSignal) => new Date(signal.createdAt).getTime() > afterTime)
      .sort((left: EzcordSignal, right: EzcordSignal) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  const data = readEzcordData();
  return data.signals
    .filter((signal) => signal.roomId === roomId && signal.toPeerId === peerId)
    .filter((signal) => new Date(signal.createdAt).getTime() > afterTime)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

async function deleteSignalKeys(roomId: string, peerId: string): Promise<void> {
  if (!useRedisLiveState()) return;
  const redis = await getRedis();
  const keys = await scanKeys(`ezcord:room:${roomId}:signals:*`);
  const toDelete = keys.filter((key) => key.endsWith(`:${peerId}`));
  if (toDelete.length > 0) {
    await redis.del(...toDelete);
  }
}

function roomPeersKey(roomId: string): string {
  return `ezcord:room:${roomId}:peers`;
}

function waitingPeersKey(roomId: string): string {
  return `ezcord:room:${roomId}:waiting`;
}

function peerSignalsKey(roomId: string, peerId: string): string {
  return `ezcord:room:${roomId}:signals:${peerId}`;
}
