<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

type Access = "public" | "private" | "telegram_chat";

interface User {
  id: string;
  email: string;
  displayName: string;
  telegram?: {
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
  };
}

interface Room {
  id: string;
  name: string;
  access: Access;
  inviteUrl?: string;
  telegramChatId?: string;
  createdBy: string;
}

interface Peer {
  peerId: string;
  displayName: string;
  lastSeenAt: string;
}

interface SignalMessage {
  id: string;
  fromPeerId: string;
  toPeerId: string;
  type: "offer" | "answer" | "candidate";
  payload: any;
  createdAt: string;
}

const route = useRoute();

const user = ref<User | null>(null);
const rooms = ref<Room[]>([]);
const activeRoom = ref<Room | null>(null);
const authMode = ref<"login" | "register">("register");
const email = ref("");
const password = ref("");
const displayName = ref("");
const roomName = ref("Голосовая");
const roomAccess = ref<Access>("public");
const telegramChatId = ref("");
const statusMessage = ref("");
const errorMessage = ref("");
const isLoading = ref(false);
const isBooting = ref(true);
const isMicOn = ref(false);
const micLevel = ref(0);
const voiceReady = ref(false);
const copiedRoomId = ref("");
const localPeerId = ref("");
const peers = ref<Peer[]>([]);
const connectedPeerIds = ref<string[]>([]);
const audioSink = ref<HTMLElement | null>(null);
const accountEmail = ref("");
const accountPassword = ref("");
const accountDisplayName = ref("");

let mediaStream: MediaStream | null = null;
let animationFrame = 0;
let presenceTimer = 0;
let signalTimer = 0;
let wsPingTimer = 0;
let wsFallbackTimer = 0;
let lastSignalAt = "";
let roomSocket: WebSocket | null = null;
let isLeavingRoom = false;
const peerConnections = new Map<string, RTCPeerConnection>();
const remoteAudios = new Map<string, HTMLAudioElement>();

const roomFromQuery = computed(() => (typeof route.query.room === "string" ? route.query.room : ""));
const inviteFromQuery = computed(() => (typeof route.query.invite === "string" ? route.query.invite : ""));

const telegramName = computed(() => {
  const telegram = user.value?.telegram;
  if (!telegram) return "";
  return telegram.username ? `@${telegram.username}` : [telegram.firstName, telegram.lastName].filter(Boolean).join(" ");
});

const accessLabels: Record<Access, string> = {
  public: "Открытая",
  private: "Приватная",
  telegram_chat: "Telegram-чат",
};

const accessGlyphs: Record<Access, string> = {
  public: "PUB",
  private: "INV",
  telegram_chat: "TG",
};

const waveBars = [18, 30, 46, 26, 58, 74, 34, 50, 24, 62, 40, 22];
const maxRoomParticipants = 5;
const participantCount = computed(() => peers.value.length + (user.value ? 1 : 0));
const connectedCount = computed(() => connectedPeerIds.value.length);
const userInitial = computed(() => getInitials(user.value?.displayName || user.value?.email || "E"));
const hasEmail = computed(() => Boolean(user.value?.email));

async function fetchMe() {
  const response = await $fetch<{ user: User | null }>("/api/ezcord/auth/me");
  user.value = response.user;
}

async function fetchRooms() {
  const response = await $fetch<{ rooms: Room[] }>("/api/ezcord/rooms");
  rooms.value = response.rooms;
}

async function submitAuth() {
  errorMessage.value = "";
  statusMessage.value = "";
  isLoading.value = true;

  try {
    const path = authMode.value === "register" ? "/api/ezcord/auth/register" : "/api/ezcord/auth/login";
    const response = await $fetch<{ user: User }>(path, {
      method: "POST",
      body: {
        email: email.value,
        password: password.value,
        displayName: displayName.value,
      },
    });

    user.value = response.user;
    statusMessage.value = authMode.value === "register" ? "Аккаунт создан" : "Вы вошли";
    await fetchRooms();

    if (roomFromQuery.value) {
      await openRoom(roomFromQuery.value, inviteFromQuery.value);
    }
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось войти";
  } finally {
    isLoading.value = false;
  }
}

async function authenticateTelegram() {
  const initData = getTelegramInitData();
  if (!initData) return false;

  try {
    const response = await $fetch<{ user: User }>("/api/ezcord/auth/telegram", {
      method: "POST",
      body: { initData },
    });
    user.value = response.user;
    statusMessage.value = "Вы вошли через Telegram";
    return true;
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось войти через Telegram";
    return false;
  }
}

async function attachEmailAccount() {
  errorMessage.value = "";
  statusMessage.value = "";
  isLoading.value = true;

  try {
    const response = await $fetch<{ user: User }>("/api/ezcord/auth/email", {
      method: "POST",
      body: {
        email: accountEmail.value,
        password: accountPassword.value,
        displayName: accountDisplayName.value,
      },
    });
    user.value = response.user;
    accountEmail.value = "";
    accountPassword.value = "";
    accountDisplayName.value = user.value.displayName;
    statusMessage.value = "Email привязан";
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось привязать email";
  } finally {
    isLoading.value = false;
  }
}

async function logout() {
  await leaveActiveRoom();
  cleanupVoice();
  await $fetch("/api/ezcord/auth/logout", { method: "POST" });
  user.value = null;
  activeRoom.value = null;
  rooms.value = [];
}

async function linkTelegram() {
  errorMessage.value = "";
  statusMessage.value = "";
  const initData = getTelegramInitData();

  if (!initData) {
    errorMessage.value = "Откройте эту страницу внутри Telegram Mini App";
    return;
  }

  try {
    await $fetch("/api/ezcord/telegram/link", {
      method: "POST",
      body: { initData },
    });
    await fetchMe();
    statusMessage.value = "Telegram привязан";
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось привязать Telegram";
  }
}

async function createRoom() {
  errorMessage.value = "";
  statusMessage.value = "";
  isLoading.value = true;

  try {
    const response = await $fetch<{ room: Room }>("/api/ezcord/rooms", {
      method: "POST",
      body: {
        name: roomName.value,
        access: roomAccess.value,
        telegramChatId: telegramChatId.value,
      },
    });

    rooms.value = [response.room, ...rooms.value.filter((room) => room.id !== response.room.id)];
    activeRoom.value = response.room;
    voiceReady.value = true;
    startSignaling();
    await nextTick();
    statusMessage.value = "Комната создана";
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось создать комнату";
  } finally {
    isLoading.value = false;
  }
}

async function openRoom(roomId: string, invite = "") {
  errorMessage.value = "";
  statusMessage.value = "";
  await leaveActiveRoom();
  cleanupVoice();
  isLeavingRoom = false;

  try {
    const query = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const response = await $fetch<{ room: Room; voice: { ready: boolean } }>(`/api/ezcord/rooms/${roomId}${query}`);
    activeRoom.value = response.room;
    voiceReady.value = response.voice.ready;
    startSignaling();
    await nextTick();
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Нет доступа к комнате";
  }
}

async function exitRoom() {
  await leaveActiveRoom();
  activeRoom.value = null;
  cleanupVoice();
}

async function copyInvite(room: Room) {
  if (!room.inviteUrl) return;
  await navigator.clipboard?.writeText(room.inviteUrl);
  copiedRoomId.value = room.id;
  window.setTimeout(() => {
    if (copiedRoomId.value === room.id) copiedRoomId.value = "";
  }, 1600);
}

async function toggleMic() {
  if (isMicOn.value) {
    stopMic();
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    isMicOn.value = true;
    watchMicLevel(mediaStream);
    await publishLocalTracks();
  } catch {
    errorMessage.value = "Микрофон недоступен";
  }
}

function stopMic(shouldRenegotiate = true) {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  isMicOn.value = false;
  micLevel.value = 0;

  for (const connection of peerConnections.values()) {
    for (const sender of connection.getSenders()) {
      if (sender.track?.kind === "audio") {
        connection.removeTrack(sender);
      }
    }
  }
  if (shouldRenegotiate) {
    void renegotiateAll();
  }
}

function watchMicLevel(stream: MediaStream) {
  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextConstructor();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.frequencyBinCount);

  analyser.fftSize = 256;
  source.connect(analyser);

  const tick = () => {
    analyser.getByteFrequencyData(samples);
    const sum = samples.reduce((total, value) => total + value, 0);
    micLevel.value = Math.min(100, Math.round((sum / samples.length) * 1.6));
    animationFrame = requestAnimationFrame(tick);
  };

  tick();
}

function startSignaling() {
  if (!activeRoom.value) return;

  localPeerId.value = randomClientId();
  peers.value = [];
  connectedPeerIds.value = [];
  lastSignalAt = "";
  isLeavingRoom = false;

  if (typeof window !== "undefined" && "WebSocket" in window) {
    startWebSocketSignaling();
    return;
  }

  startPollingSignaling();
}

function startPollingSignaling() {
  if (!activeRoom.value || !localPeerId.value) return;

  void announcePresence();
  void pollSignals();

  presenceTimer = window.setInterval(() => void announcePresence(), 2500);
  signalTimer = window.setInterval(() => void pollSignals(), 900);
}

function cleanupVoice() {
  if (presenceTimer) {
    window.clearInterval(presenceTimer);
    presenceTimer = 0;
  }
  if (signalTimer) {
    window.clearInterval(signalTimer);
    signalTimer = 0;
  }
  if (wsPingTimer) {
    window.clearInterval(wsPingTimer);
    wsPingTimer = 0;
  }
  if (wsFallbackTimer) {
    window.clearTimeout(wsFallbackTimer);
    wsFallbackTimer = 0;
  }

  const socket = roomSocket;
  roomSocket = null;
  socket?.close(1000, "Cleanup");

  stopMic(false);
  for (const connection of peerConnections.values()) {
    connection.close();
  }
  peerConnections.clear();
  remoteAudios.forEach((audio) => audio.remove());
  remoteAudios.clear();
  peers.value = [];
  connectedPeerIds.value = [];
  localPeerId.value = "";
  lastSignalAt = "";
}

async function leaveActiveRoom() {
  if (!activeRoom.value || !localPeerId.value) return;

  isLeavingRoom = true;
  if (roomSocket?.readyState === WebSocket.OPEN) {
    roomSocket.send(JSON.stringify({ type: "leave" }));
    roomSocket.close(1000, "Leave");
  }

  await $fetch(roomApiPath("leave"), {
    method: "POST",
    body: { peerId: localPeerId.value },
  }).catch(() => {});
}

function beaconLeaveActiveRoom() {
  if (!activeRoom.value || !localPeerId.value || typeof navigator === "undefined" || !navigator.sendBeacon) return;

  const body = new Blob([JSON.stringify({ peerId: localPeerId.value })], { type: "application/json" });
  navigator.sendBeacon(roomApiPath("leave"), body);
}

async function announcePresence() {
  if (!activeRoom.value || !localPeerId.value) return;

  let response: { peers: Peer[] };
  try {
    response = await $fetch<{ peers: Peer[] }>(roomApiPath("presence"), {
      method: "POST",
      body: { peerId: localPeerId.value },
    });
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось войти в комнату";
    activeRoom.value = null;
    cleanupVoice();
    return;
  }

  await syncPeers(response.peers);
}

function startWebSocketSignaling() {
  if (!activeRoom.value || !localPeerId.value) return;

  let opened = false;
  const socket = new WebSocket(roomWsPath());
  roomSocket = socket;

  wsFallbackTimer = window.setTimeout(() => {
    if (opened || roomSocket !== socket) return;
    roomSocket = null;
    socket.close();
    startPollingSignaling();
  }, 3500);

  socket.onopen = () => {
    opened = true;
    if (wsFallbackTimer) {
      window.clearTimeout(wsFallbackTimer);
      wsFallbackTimer = 0;
    }
    wsPingTimer = window.setInterval(() => {
      if (roomSocket?.readyState === WebSocket.OPEN) {
        roomSocket.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000);
  };

  socket.onmessage = (event) => {
    void handleSocketMessage(event);
  };

  socket.onerror = () => {
    if (!opened && roomSocket === socket) {
      roomSocket = null;
      startPollingSignaling();
    }
  };

  socket.onclose = (event) => {
    if (wsPingTimer) {
      window.clearInterval(wsPingTimer);
      wsPingTimer = 0;
    }
    if (wsFallbackTimer) {
      window.clearTimeout(wsFallbackTimer);
      wsFallbackTimer = 0;
    }
    if (roomSocket === socket) {
      roomSocket = null;
    }

    if (isLeavingRoom || !activeRoom.value) return;

    if (event.code === 4003) {
      errorMessage.value = "Вас кикнули из комнаты";
      activeRoom.value = null;
      cleanupVoice();
      return;
    }

    if (!presenceTimer) {
      statusMessage.value = "WebSocket недоступен, включен fallback";
      startPollingSignaling();
    }
  };
}

async function handleSocketMessage(event: MessageEvent) {
  let message: any;
  try {
    message = JSON.parse(String(event.data));
  } catch {
    return;
  }

  if (message.type === "peers") {
    await syncPeers(message.peers || []);
    return;
  }

  if (message.type === "signal" && message.signal) {
    lastSignalAt = message.signal.createdAt || lastSignalAt;
    await handleSignal(message.signal);
    return;
  }

  if (message.type === "kicked") {
    errorMessage.value = message.message || "Вас кикнули из комнаты";
    activeRoom.value = null;
    cleanupVoice();
    return;
  }

  if (message.type === "error") {
    errorMessage.value = message.message || "Ошибка голосовой комнаты";
  }
}

async function syncPeers(remotePeers: Peer[]) {
  peers.value = remotePeers;
  const remoteIds = new Set(remotePeers.map((peer) => peer.peerId));

  for (const peer of remotePeers) {
    await ensurePeerConnection(peer.peerId, localPeerId.value < peer.peerId);
  }

  for (const peerId of Array.from(peerConnections.keys())) {
    if (!remoteIds.has(peerId)) {
      closePeer(peerId);
    }
  }
}

async function kickPeer(peerId: string) {
  if (!activeRoom.value) return;

  try {
    await $fetch(roomApiPath(`peers/${peerId}`), { method: "DELETE" });
    closePeer(peerId);
    peers.value = peers.value.filter((peer) => peer.peerId !== peerId);
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось кикнуть участника";
  }
}

async function pollSignals() {
  if (!activeRoom.value || !localPeerId.value) return;

  const query = new URLSearchParams({ peerId: localPeerId.value });
  if (lastSignalAt) query.set("after", lastSignalAt);
  if (inviteFromQuery.value) query.set("invite", inviteFromQuery.value);

  const response = await $fetch<{ signals: SignalMessage[] }>(`/api/ezcord/rooms/${activeRoom.value.id}/signals?${query}`);

  for (const signal of response.signals) {
    lastSignalAt = signal.createdAt;
    await handleSignal(signal);
  }
}

async function handleSignal(signal: SignalMessage) {
  const connection = await ensurePeerConnection(signal.fromPeerId, false);

  if (signal.type === "offer") {
    await connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    await addLocalTracks(connection);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await sendSignal(signal.fromPeerId, "answer", answer);
    return;
  }

  if (signal.type === "answer") {
    if (connection.signalingState !== "stable") {
      await connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
    }
    return;
  }

  if (signal.type === "candidate") {
    await connection.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(() => {});
  }
}

async function ensurePeerConnection(peerId: string, shouldOffer: boolean) {
  const existing = peerConnections.get(peerId);
  if (existing) return existing;

  const connection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnections.set(peerId, connection);
  if (mediaStream) {
    await addLocalTracks(connection);
  } else {
    connection.addTransceiver("audio", { direction: "recvonly" });
  }

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      void sendSignal(peerId, "candidate", event.candidate.toJSON());
    }
  };

  connection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) attachRemoteAudio(peerId, stream);
  };

  connection.onconnectionstatechange = () => updateConnectedPeers();

  if (shouldOffer) {
    await createOffer(peerId, connection);
  }

  return connection;
}

async function createOffer(peerId: string, connection = peerConnections.get(peerId)) {
  if (!connection) return;
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await sendSignal(peerId, "offer", offer);
}

async function sendSignal(toPeerId: string, type: SignalMessage["type"], payload: any) {
  if (!activeRoom.value || !localPeerId.value) return;

  if (roomSocket?.readyState === WebSocket.OPEN) {
    roomSocket.send(
      JSON.stringify({
        type: "signal",
        toPeerId,
        signalType: type,
        payload,
      }),
    );
    return;
  }

  await $fetch(roomApiPath("signals"), {
    method: "POST",
    body: {
      fromPeerId: localPeerId.value,
      toPeerId,
      type,
      payload,
    },
  });
}

async function addLocalTracks(connection: RTCPeerConnection) {
  if (!mediaStream) return;
  const hasAudioSender = connection.getSenders().some((sender) => sender.track?.kind === "audio");
  if (hasAudioSender) return;

  const track = mediaStream.getAudioTracks()[0];
  if (!track) return;

  const idleTransceiver = connection
    .getTransceivers()
    .find((transceiver) => transceiver.receiver.track.kind === "audio" && !transceiver.sender.track);

  if (idleTransceiver) {
    await idleTransceiver.sender.replaceTrack(track);
    idleTransceiver.direction = "sendrecv";
  } else {
    connection.addTrack(track, mediaStream);
  }
}

async function publishLocalTracks() {
  for (const [peerId, connection] of peerConnections.entries()) {
    await addLocalTracks(connection);
    await createOffer(peerId, connection);
  }
}

async function renegotiateAll() {
  for (const [peerId, connection] of peerConnections.entries()) {
    if (connection.connectionState !== "closed") {
      await createOffer(peerId, connection).catch(() => {});
    }
  }
}

function attachRemoteAudio(peerId: string, stream: MediaStream) {
  let audio = remoteAudios.get(peerId);
  if (!audio) {
    audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.peerId = peerId;
    audioSink.value?.appendChild(audio);
    remoteAudios.set(peerId, audio);
  }
  audio.srcObject = stream;
}

function closePeer(peerId: string) {
  peerConnections.get(peerId)?.close();
  peerConnections.delete(peerId);
  remoteAudios.get(peerId)?.remove();
  remoteAudios.delete(peerId);
  updateConnectedPeers();
}

function updateConnectedPeers() {
  connectedPeerIds.value = Array.from(peerConnections.entries())
    .filter(([, connection]) => ["connected", "completed"].includes(connection.connectionState))
    .map(([peerId]) => peerId);
}

function roomApiPath(action: string) {
  if (!activeRoom.value) return "";
  const query = inviteFromQuery.value ? `?invite=${encodeURIComponent(inviteFromQuery.value)}` : "";
  return `/api/ezcord/rooms/${activeRoom.value.id}/${action}${query}`;
}

function roomWsPath() {
  const query = new URLSearchParams({
    roomId: activeRoom.value?.id || "",
    peerId: localPeerId.value,
  });
  if (inviteFromQuery.value) query.set("invite", inviteFromQuery.value);

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/ezcord/ws?${query.toString()}`;
}

function randomClientId() {
  return `peer_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function getInitials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || "EZ").toUpperCase();
}

function getTelegramInitData() {
  return typeof window !== "undefined" ? (window as any).Telegram?.WebApp?.initData || "" : "";
}

function prepareTelegramApp() {
  const app = (window as any).Telegram?.WebApp;
  if (!app) return;
  app.ready?.();
  app.expand?.();
}

onMounted(async () => {
  prepareTelegramApp();
  window.addEventListener("pagehide", beaconLeaveActiveRoom);
  if (typeof route.query.chat_id === "string") {
    telegramChatId.value = route.query.chat_id;
    roomAccess.value = "telegram_chat";
  }

  try {
    await fetchMe();
    if (!user.value) {
      await authenticateTelegram();
    }
    if (user.value) {
      accountDisplayName.value = user.value.displayName;
      await fetchRooms();
    }
    if (user.value && roomFromQuery.value) {
      await openRoom(roomFromQuery.value, inviteFromQuery.value);
    }
  } finally {
    isBooting.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", beaconLeaveActiveRoom);
  beaconLeaveActiveRoom();
  cleanupVoice();
});

useHead({
  title: "Ezcord",
  meta: [{ name: "robots", content: "noindex,nofollow" }],
  script: [{ src: "https://telegram.org/js/telegram-web-app.js?63" }],
});
</script>

<template>
  <main class="min-h-screen overflow-hidden bg-[#f4f7f1] text-[#10110f]">
    <header class="border-b border-black/10 bg-white/90 backdrop-blur">
      <div class="mx-auto flex min-h-[96px] max-w-[1560px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button class="flex min-w-0 items-center gap-4 text-left" type="button" @click="activeRoom ? exitRoom() : undefined">
          <img
            class="h-[58px] w-[58px] shrink-0 rounded-[18px] object-cover shadow-[0_8px_18px_rgba(16,17,15,0.18)] sm:h-[68px] sm:w-[68px]"
            src="/ezcord-logo.png"
            alt="Ezcord"
          />
          <span class="min-w-0">
            <span class="block text-[28px] font-black uppercase leading-none tracking-normal sm:text-[34px]">
              <span class="text-[#42d11d]">EZ</span><span class="text-[#10110f]">CORD</span>
            </span>
            <span class="mt-2 block truncate text-sm font-extrabold text-[#858d82] sm:text-base">Голосовые комнаты для Telegram</span>
          </span>
        </button>

        <div class="flex shrink-0 items-center gap-2 sm:gap-4">
          <button
            class="flex h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-black/10 bg-white text-2xl shadow-sm transition hover:border-[#42d11d]/50 hover:bg-[#f0fee9] sm:h-[64px] sm:w-[64px]"
            type="button"
            aria-label="Theme"
          >
            🌙
          </button>
          <button
            v-if="user && activeRoom"
            class="hidden h-[64px] items-center rounded-[18px] border border-black/10 bg-white px-7 text-lg font-black shadow-sm transition hover:bg-[#10110f] hover:text-white sm:inline-flex"
            type="button"
            @click="exitRoom"
          >
            Лобби
          </button>
          <button
            v-if="user"
            class="flex h-[64px] min-w-0 items-center gap-4 rounded-[18px] border border-black/10 bg-white px-3 pl-5 text-left shadow-sm transition hover:border-[#42d11d]/50"
            type="button"
            title="Выйти"
            @click="logout"
          >
            <span class="hidden max-w-[160px] truncate text-lg font-black sm:block">{{ user.displayName }}</span>
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#42d11d] text-xl font-black text-[#10110f]">
              {{ userInitial }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <div
      class="min-h-[calc(100vh-96px)] bg-[radial-gradient(circle_at_64%_10%,rgba(66,209,29,0.12),transparent_34%),linear-gradient(180deg,#f7faf5_0%,#eef5ec_100%)]"
    >
      <div v-if="isBooting" class="mx-auto flex min-h-[calc(100vh-96px)] max-w-[1560px] items-center justify-center px-4">
        <div class="flex items-center gap-5 rounded-[28px] border border-black/10 bg-white px-7 py-6 shadow-[0_28px_70px_rgba(16,17,15,0.12)]">
          <img class="h-16 w-16 rounded-[18px] object-cover" src="/ezcord-logo.png" alt="Ezcord" />
          <div>
            <p class="text-3xl font-black uppercase leading-none">
              <span class="text-[#42d11d]">EZ</span><span class="text-[#10110f]">CORD</span>
            </p>
            <p class="mt-2 text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">загрузка</p>
          </div>
        </div>
      </div>

      <div v-else-if="!user" class="mx-auto grid max-w-[1500px] gap-7 px-4 py-7 sm:px-6 lg:grid-cols-[470px_1fr] lg:px-8 lg:py-10 xl:gap-10">
        <section class="self-start rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_28px_70px_rgba(16,17,15,0.12)] sm:p-8">
          <div class="mb-8 grid grid-cols-2 rounded-[24px] bg-[#f0f1ee] p-2">
            <button
              class="h-16 rounded-[18px] text-lg font-black transition sm:h-[76px] sm:text-xl"
              :class="authMode === 'register' ? 'bg-white text-[#10110f] shadow-[0_14px_30px_rgba(16,17,15,0.09)]' : 'text-[#858d82]'"
              type="button"
              @click="authMode = 'register'"
            >
              Регистрация
            </button>
            <button
              class="h-16 rounded-[18px] text-lg font-black transition sm:h-[76px] sm:text-xl"
              :class="authMode === 'login' ? 'bg-white text-[#10110f] shadow-[0_14px_30px_rgba(16,17,15,0.09)]' : 'text-[#858d82]'"
              type="button"
              @click="authMode = 'login'"
            >
              Вход
            </button>
          </div>

          <form class="space-y-6" @submit.prevent="submitAuth">
            <label v-if="authMode === 'register'" class="block">
              <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Имя</span>
              <input
                v-model="displayName"
                class="mt-3 h-[68px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-lg font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="name"
                placeholder="Ваше имя"
                type="text"
              />
            </label>

            <label class="block">
              <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Email</span>
              <input
                v-model="email"
                class="mt-3 h-[68px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-lg font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="email"
                placeholder="you@mail.com"
                type="email"
              />
            </label>

            <label class="block">
              <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Пароль</span>
              <input
                v-model="password"
                class="mt-3 h-[68px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-lg font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="current-password"
                placeholder="••••••••"
                type="password"
              />
            </label>

            <button
              class="mt-3 flex h-[72px] w-full items-center justify-center rounded-[18px] bg-[#10110f] px-6 text-xl font-black text-white shadow-[0_18px_36px_rgba(16,17,15,0.22)] transition hover:bg-[#42d11d] hover:text-[#10110f] disabled:opacity-60"
              :disabled="isLoading"
              type="submit"
            >
              {{ authMode === "register" ? "Создать аккаунт" : "Войти" }}
            </button>
          </form>

          <p class="mt-7 text-center text-base font-extrabold text-[#858d82]">
            или через <span class="text-[#2fa8f4]">Telegram</span>
          </p>

          <p v-if="errorMessage" class="mt-6 rounded-[18px] border border-[#f4b4b4] bg-[#fff1f1] px-5 py-4 text-sm font-bold text-[#a01818]">
            {{ errorMessage }}
          </p>
          <p v-if="statusMessage" class="mt-6 rounded-[18px] border border-[#b7e8c8] bg-[#effbf3] px-5 py-4 text-sm font-bold text-[#17683d]">
            {{ statusMessage }}
          </p>
        </section>

        <section class="min-w-0 py-4 lg:py-2">
          <div
            class="inline-flex items-center gap-3 rounded-full border border-[#42d11d]/30 bg-[#ebfde4] px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#2c9d23]"
          >
            <span class="h-3 w-3 rounded-full bg-[#8fe37c]"></span>
            Telegram Mini App
          </div>

          <h1 class="mt-9 text-[76px] font-black uppercase leading-[0.86] tracking-normal sm:text-[112px] lg:text-[136px] xl:text-[150px]">
            <span class="text-[#42d11d]">EZ</span><span class="text-[#10110f]">CORD</span>
          </h1>
          <p class="mt-8 max-w-[760px] text-3xl font-extrabold leading-tight text-[#858d82] lg:text-[34px]">
            Голосовые комнаты, приватные ссылки, доступ по Telegram-чату и email-аккаунт в одном приложении.
          </p>

          <div class="mt-10 grid gap-5 xl:grid-cols-[1fr_390px]">
            <div class="grid gap-5 sm:grid-cols-2">
              <article class="rounded-[24px] border border-black/10 bg-white p-7 shadow-[0_22px_50px_rgba(16,17,15,0.06)]">
                <div class="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#e7fddd] text-3xl text-[#31a826]">♬</div>
                <h2 class="mt-7 text-2xl font-black">Голосовые комнаты</h2>
                <p class="mt-3 text-xl font-bold leading-snug text-[#858d82]">WebRTC audio внутри Telegram</p>
              </article>
              <article class="rounded-[24px] border border-black/10 bg-white p-7 shadow-[0_22px_50px_rgba(16,17,15,0.06)]">
                <div class="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#e8f5ff] text-3xl text-[#2fa8f4]">✉</div>
                <h2 class="mt-7 text-2xl font-black">Email + Telegram</h2>
                <p class="mt-3 text-xl font-bold leading-snug text-[#858d82]">Один аккаунт, две точки входа</p>
              </article>
              <article class="rounded-[24px] border border-black/10 bg-white p-7 shadow-[0_22px_50px_rgba(16,17,15,0.06)]">
                <div class="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#e8f5ff] text-3xl text-[#2fa8f4]">↗</div>
                <h2 class="mt-7 text-2xl font-black">Приватные ссылки</h2>
                <p class="mt-3 text-xl font-bold leading-snug text-[#858d82]">Invite-доступ к комнатам</p>
              </article>
              <article class="rounded-[24px] border border-black/10 bg-white p-7 shadow-[0_22px_50px_rgba(16,17,15,0.06)]">
                <div class="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#e7fddd] text-3xl text-[#31a826]">▢</div>
                <h2 class="mt-7 text-2xl font-black">Telegram-чат</h2>
                <p class="mt-3 text-xl font-bold leading-snug text-[#858d82]">Проверка членства в группе</p>
              </article>
            </div>

            <aside class="rounded-[28px] bg-[#111210] p-7 text-white shadow-[0_28px_65px_rgba(16,17,15,0.28)]">
              <div class="flex items-center justify-between gap-4">
                <div class="flex min-w-0 items-center gap-4">
                  <img class="h-14 w-14 rounded-[16px] object-cover" src="/ezcord-logo.png" alt="Ezcord" />
                  <div class="min-w-0">
                    <p class="truncate text-xl font-black">Ezcord</p>
                    <p class="mt-1 truncate text-sm font-bold text-white/50">мини-приложение</p>
                  </div>
                </div>
                <span class="text-3xl font-black text-white/50">•••</span>
              </div>

              <div class="mt-8 inline-flex items-center gap-2 rounded-full bg-[#e7fddd] px-4 py-2 text-sm font-black text-[#42d11d]">
                <span class="h-2.5 w-2.5 rounded-full bg-[#42d11d]"></span>
                Комната активна
              </div>
              <h2 class="mt-6 text-4xl font-black leading-none">Вечерний подкаст</h2>
              <p class="mt-4 text-2xl font-black text-[#42d11d]">01:24:36</p>

              <div class="mt-7 flex gap-4">
                <div class="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#42d11d] text-lg font-black">DK</div>
                <div class="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#42d11d] text-lg font-black">AK</div>
                <div class="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-white/30 text-2xl font-black text-white/60">+</div>
              </div>

              <div class="mt-9 flex items-end gap-5">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between text-sm font-black uppercase tracking-[0.08em]">
                    <span class="text-white/50">Голос</span>
                    <span class="text-[#42d11d]">Live</span>
                  </div>
                  <div class="mt-4 flex h-24 items-end justify-center gap-2 rounded-[20px] bg-white/10 px-5 py-5">
                    <span
                      v-for="height in waveBars"
                      :key="height"
                      class="w-2 rounded-full bg-[#72ee41]"
                      :style="{ height: `${Math.max(14, Math.round(height * 0.65))}px` }"
                    ></span>
                  </div>
                </div>
                <div class="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full bg-[#55dc2b] text-2xl font-black text-[#10110f] shadow-[0_0_42px_rgba(85,220,43,0.62)]">
                  MIC
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>

      <div v-else-if="!activeRoom" class="mx-auto grid max-w-[1560px] gap-7 px-4 py-7 sm:px-6 lg:grid-cols-[470px_1fr] lg:px-8 lg:py-10">
        <aside class="space-y-7">
          <section class="rounded-[28px] border border-black/10 bg-white p-7 shadow-[0_28px_70px_rgba(16,17,15,0.12)] sm:p-9">
            <div class="flex items-start justify-between gap-5">
              <div>
                <p class="text-sm font-black uppercase tracking-[0.14em] text-[#858d82]">Создание</p>
                <h1 class="mt-9 text-4xl font-black leading-tight sm:text-5xl">Новая комната</h1>
              </div>
              <span class="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[18px] bg-[#42d11d] text-4xl font-black text-white">+</span>
            </div>

            <form class="mt-8 space-y-7" @submit.prevent="createRoom">
              <label class="block">
                <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Название</span>
                <input
                  v-model="roomName"
                  class="mt-3 h-[72px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-xl font-black outline-none transition focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                  type="text"
                />
              </label>

              <label class="block">
                <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Доступ</span>
                <select
                  v-model="roomAccess"
                  class="mt-3 h-[72px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-xl font-black outline-none transition focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                >
                  <option value="public">Открытая</option>
                  <option value="private">Приватная</option>
                  <option value="telegram_chat">Только Telegram-чат</option>
                </select>
              </label>

              <label v-if="roomAccess === 'telegram_chat'" class="block">
                <span class="text-sm font-black uppercase tracking-[0.12em] text-[#858d82]">Telegram chat id</span>
                <input
                  v-model="telegramChatId"
                  class="mt-3 h-[72px] w-full rounded-[18px] border border-black/10 bg-[#f5f6f3] px-6 text-xl font-black outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                  placeholder="-100..."
                  type="text"
                />
              </label>

              <button
                class="flex h-[76px] w-full items-center justify-center rounded-[18px] bg-[#42d11d] px-6 text-xl font-black text-white shadow-[0_20px_44px_rgba(66,209,29,0.24)] transition hover:bg-[#10110f] disabled:opacity-60"
                :disabled="isLoading"
                type="submit"
              >
                Создать
              </button>
            </form>
          </section>

          <section class="rounded-[24px] border border-[#2fa8f4]/20 bg-[#eff8ff] p-6">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-black uppercase tracking-[0.12em] text-[#2fa8f4]">Аккаунт</p>
                <p class="mt-2 truncate text-lg font-black">{{ hasEmail ? user.email : "Вход через Telegram" }}</p>
                <p class="mt-1 truncate text-sm font-extrabold text-[#858d82]">{{ telegramName || "Telegram не привязан" }}</p>
              </div>
              <button
                v-if="!user.telegram"
                class="h-12 rounded-[16px] bg-[#2fa8f4] px-5 text-sm font-black text-white transition hover:bg-[#10110f]"
                type="button"
                @click="linkTelegram"
              >
                Telegram
              </button>
            </div>
          </section>

          <section v-if="!hasEmail" class="rounded-[24px] border border-[#42d11d]/25 bg-white p-6 shadow-[0_18px_45px_rgba(16,17,15,0.06)]">
            <p class="text-sm font-black uppercase tracking-[0.12em] text-[#42d11d]">Email для входа</p>
            <p class="mt-2 text-base font-extrabold leading-snug text-[#858d82]">Привяжите почту, чтобы входить без Telegram.</p>

            <form class="mt-5 space-y-4" @submit.prevent="attachEmailAccount">
              <input
                v-model="accountDisplayName"
                class="h-[58px] w-full rounded-[16px] border border-black/10 bg-[#f5f6f3] px-5 text-base font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="name"
                placeholder="Имя"
                type="text"
              />
              <input
                v-model="accountEmail"
                class="h-[58px] w-full rounded-[16px] border border-black/10 bg-[#f5f6f3] px-5 text-base font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="email"
                placeholder="you@mail.com"
                type="email"
              />
              <input
                v-model="accountPassword"
                class="h-[58px] w-full rounded-[16px] border border-black/10 bg-[#f5f6f3] px-5 text-base font-bold outline-none transition placeholder:text-[#858d82] focus:border-[#42d11d] focus:bg-white focus:ring-4 focus:ring-[#42d11d]/15"
                autocomplete="new-password"
                placeholder="Пароль от 8 символов"
                type="password"
              />
              <button
                class="flex h-[58px] w-full items-center justify-center rounded-[16px] bg-[#42d11d] px-5 text-base font-black text-[#10110f] shadow-[0_16px_34px_rgba(66,209,29,0.22)] transition hover:bg-[#10110f] hover:text-white disabled:opacity-60"
                :disabled="isLoading"
                type="submit"
              >
                Привязать email
              </button>
            </form>
          </section>

          <p v-if="errorMessage" class="rounded-[20px] border border-[#f4b4b4] bg-[#fff1f1] px-6 py-5 text-lg font-black text-[#a01818]">
            {{ errorMessage }}
          </p>
          <p v-if="statusMessage" class="rounded-[20px] border border-[#b7e8c8] bg-[#e8fbdf] px-6 py-5 text-lg font-black text-[#2c9d23]">
            {{ statusMessage }}
          </p>
        </aside>

        <section class="min-h-[700px] rounded-[28px] border border-black/10 bg-white p-7 shadow-[0_28px_70px_rgba(16,17,15,0.12)] sm:p-9">
          <p class="text-sm font-black uppercase tracking-[0.14em] text-[#858d82]">Комнаты</p>
          <h1 class="mt-5 text-5xl font-black uppercase leading-none tracking-normal sm:text-6xl lg:text-7xl">
            <span class="text-[#42d11d]">Лобби</span>
          </h1>

          <div class="mt-10 grid gap-6">
            <article
              v-for="room in rooms"
              :key="room.id"
              class="rounded-[28px] bg-[#111210] p-7 text-white shadow-[0_28px_60px_rgba(16,17,15,0.18)]"
            >
              <div class="flex flex-wrap items-start justify-between gap-5">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-4">
                    <span class="rounded-[12px] bg-[#e7fddd] px-4 py-2 text-sm font-black text-[#42d11d]">{{ accessGlyphs[room.access] }}</span>
                    <span class="text-lg font-black text-white/60">{{ accessLabels[room.access] }}</span>
                  </div>
                  <h2 class="mt-8 break-words text-4xl font-black leading-none sm:text-5xl">{{ room.name }}</h2>
                  <p class="mt-4 text-xl font-extrabold text-white/50">Голосовая комната</p>
                </div>

                <div class="flex items-center gap-3 text-xl font-black text-white/60">
                  <span class="h-3 w-3 rounded-full bg-[#42d11d]"></span>
                  до {{ maxRoomParticipants }}
                </div>
              </div>

              <div class="mt-9 flex flex-wrap items-center justify-between gap-4">
                <div class="flex flex-wrap gap-3">
                  <button
                    v-if="room.inviteUrl"
                    class="h-[58px] rounded-[18px] border border-white/20 bg-white/5 px-8 text-lg font-black text-white transition hover:bg-white hover:text-[#10110f]"
                    type="button"
                    @click="copyInvite(room)"
                  >
                    {{ copiedRoomId === room.id ? "Скопировано" : "Invite" }}
                  </button>
                </div>
                <div class="flex items-center gap-8">
                  <div class="hidden h-14 items-end gap-2 sm:flex">
                    <span
                      v-for="height in waveBars.slice(0, 7)"
                      :key="height"
                      class="w-2 rounded-full bg-[#42d11d]"
                      :style="{ height: `${Math.max(12, Math.round(height * 0.45))}px` }"
                    ></span>
                  </div>
                  <button
                    class="h-[62px] rounded-[18px] bg-[#55dc2b] px-9 text-xl font-black text-[#10110f] shadow-[0_18px_44px_rgba(85,220,43,0.36)] transition hover:bg-white"
                    type="button"
                    @click="openRoom(room.id)"
                  >
                    Войти →
                  </button>
                </div>
              </div>
            </article>

            <div v-if="rooms.length === 0" class="rounded-[28px] border border-dashed border-black/20 bg-[#f8faf6] p-12 text-center">
              <p class="text-3xl font-black">Комнат пока нет</p>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section class="rounded-[24px] border border-black/10 bg-white p-5 shadow-[0_22px_55px_rgba(16,17,15,0.1)] sm:p-6 lg:p-7">
          <p class="text-sm font-black uppercase tracking-[0.14em] text-[#858d82]">Комната</p>
          <h1 class="mt-4 break-words text-4xl font-black leading-none tracking-normal sm:text-5xl lg:text-6xl xl:text-[64px]">
            {{ activeRoom.name }}
          </h1>

          <div class="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div class="rounded-[24px] bg-[#111210] p-5 text-white shadow-[0_24px_55px_rgba(16,17,15,0.2)] sm:p-6 lg:p-7">
              <div class="flex items-start justify-between gap-5">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-4">
                    <span class="rounded-[12px] bg-[#e7fddd] px-4 py-2 text-sm font-black text-[#42d11d]">
                      {{ accessGlyphs[activeRoom.access] }}
                    </span>
                    <span class="text-lg font-black text-white/60">{{ accessLabels[activeRoom.access] }}</span>
                  </div>
                  <div class="mt-6 inline-flex items-center gap-2 rounded-full bg-[#e7fddd] px-4 py-2 text-sm font-black text-[#42d11d]">
                    <span class="h-3 w-3 rounded-full bg-[#42d11d]"></span>
                    Комната активна
                  </div>
                </div>
                <span class="text-3xl font-black text-white/50">•••</span>
              </div>

              <div class="mt-7 flex flex-wrap items-start gap-4">
                <div>
                  <div
                    class="flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-[#42d11d] bg-[#55dc2b] text-xl font-black text-[#10110f] shadow-[0_0_22px_rgba(85,220,43,0.32)] sm:h-[72px] sm:w-[72px] sm:text-2xl"
                  >
                    {{ userInitial }}
                  </div>
                  <p class="mt-3 text-center text-sm font-black text-white/60">вы</p>
                </div>
                <div v-for="peer in peers" :key="peer.peerId" class="group">
                  <div class="relative flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-[#42d11d] bg-white/10 text-xl font-black sm:h-[72px] sm:w-[72px] sm:text-2xl">
                    {{ getInitials(peer.displayName) }}
                    <button
                      v-if="activeRoom.createdBy === user.id"
                      class="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#cf3d3d] text-xs font-black opacity-100 transition hover:bg-white hover:text-[#cf3d3d] sm:opacity-0 sm:group-hover:opacity-100"
                      type="button"
                      @click="kickPeer(peer.peerId)"
                    >
                      ×
                    </button>
                  </div>
                  <p class="mt-3 max-w-24 truncate text-center text-sm font-black text-white/60">{{ peer.displayName }}</p>
                </div>
                <button
                  v-if="activeRoom.inviteUrl"
                  class="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-dashed border-white/30 text-3xl font-black text-white/60 transition hover:border-[#42d11d] hover:text-[#42d11d] sm:h-[72px] sm:w-[72px]"
                  type="button"
                  @click="copyInvite(activeRoom)"
                >
                  +
                </button>
              </div>

              <div class="mt-8 grid gap-5 lg:grid-cols-[1fr_112px] lg:items-end">
                <div>
                  <div class="flex items-center justify-between text-base font-black uppercase tracking-[0.1em]">
                    <span class="text-white/50">Голос</span>
                    <span :class="isMicOn ? 'text-[#42d11d]' : 'text-white/50'">{{ isMicOn ? "Live" : "Muted" }}</span>
                  </div>
                  <div class="mt-4 flex h-[82px] items-end justify-center gap-2.5 rounded-[18px] bg-white/6 px-5 py-5">
                    <span
                      v-for="height in waveBars"
                      :key="height"
                      class="w-2.5 rounded-full transition-all"
                      :class="isMicOn ? 'bg-[#72ee41]' : 'bg-white/25'"
                      :style="{ height: `${Math.max(16, Math.round((height * (micLevel + 28)) / 100))}px` }"
                    ></span>
                  </div>
                </div>
                <button
                  class="mx-auto flex h-[104px] w-[104px] items-center justify-center rounded-full border text-4xl transition"
                  :class="
                    isMicOn
                      ? 'border-[#55dc2b] bg-[#55dc2b] text-[#10110f] shadow-[0_0_44px_rgba(85,220,43,0.54)]'
                      : 'border-white/40 bg-white/10 text-white/60 hover:border-[#55dc2b] hover:text-[#55dc2b]'
                  "
                  type="button"
                  @click="toggleMic"
                >
                  🎙
                </button>
              </div>

              <div ref="audioSink" class="hidden"></div>
            </div>

            <aside class="grid content-start gap-5">
              <div class="rounded-[20px] border border-[#42d11d]/25 bg-[#e8fbdf] p-5">
                <p class="text-sm font-black uppercase tracking-[0.12em] text-[#2c9d23]">Участники</p>
                <p class="mt-4 text-5xl font-black">{{ participantCount }}/{{ maxRoomParticipants }}</p>
              </div>
              <div class="rounded-[20px] border border-[#2fa8f4]/25 bg-[#e8f5ff] p-5">
                <p class="text-sm font-black uppercase tracking-[0.12em] text-[#2fa8f4]">Соединения</p>
                <p class="mt-4 text-5xl font-black">{{ connectedCount }}</p>
              </div>
              <button
                class="h-16 rounded-[18px] border border-black/10 bg-white px-6 text-lg font-black shadow-sm transition hover:bg-[#10110f] hover:text-white"
                type="button"
                @click="exitRoom"
              >
                Выйти в лобби
              </button>
              <p v-if="errorMessage" class="rounded-[20px] border border-[#f4b4b4] bg-[#fff1f1] px-6 py-5 text-base font-black text-[#a01818]">
                {{ errorMessage }}
              </p>
              <p v-if="statusMessage" class="rounded-[20px] border border-[#b7e8c8] bg-[#e8fbdf] px-6 py-5 text-base font-black text-[#2c9d23]">
                {{ statusMessage }}
              </p>
            </aside>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
