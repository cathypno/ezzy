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
const publicRoomCount = computed(() => rooms.value.filter((room) => room.access === "public").length);
const privateRoomCount = computed(() => rooms.value.filter((room) => room.access === "private").length);
const telegramRoomCount = computed(() => rooms.value.filter((room) => room.access === "telegram_chat").length);

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
  <main class="ez-main">
    <header class="ez-topbar">
      <div class="ez-topbar__inner">
        <button class="ez-brand" type="button" @click="activeRoom ? exitRoom() : undefined">
          <img class="ez-brand__logo" src="/ezcord-mark.svg" alt="Ezcord" />
          <span class="min-w-0">
            <span class="ez-brand__title"><span class="ez-brand__title-accent">EZ</span>CORD</span>
            <span class="ez-brand__subtitle">Голосовые комнаты для Telegram</span>
          </span>
        </button>

        <div class="ez-top-actions">
          <button class="ez-icon-btn" type="button" aria-label="Theme">◐</button>
          <button v-if="user && activeRoom" class="ez-nav-btn" type="button" @click="exitRoom">Лобби</button>
          <button v-if="user" class="ez-user-pill" type="button" title="Выйти" @click="logout">
            <span class="ez-user-name">{{ user.displayName }}</span>
            <span class="ez-avatar">{{ userInitial }}</span>
          </button>
        </div>
      </div>
    </header>

    <div class="ez-page-bg">
      <div v-if="isBooting" class="ez-boot">
        <div class="ez-boot-card">
          <img class="ez-brand__logo" src="/ezcord-mark.svg" alt="Ezcord" />
          <div>
            <p class="ez-brand__title"><span class="ez-brand__title-accent">EZ</span>CORD</p>
            <p class="ez-kicker">загрузка</p>
          </div>
        </div>
      </div>

      <div v-else-if="!user" class="ez-shell ez-auth-shell">
        <section class="ez-panel ez-panel--soft">
          <div class="ez-tabs">
            <button class="ez-tab" :class="{ 'ez-tab--active': authMode === 'register' }" type="button" @click="authMode = 'register'">
              Регистрация
            </button>
            <button class="ez-tab" :class="{ 'ez-tab--active': authMode === 'login' }" type="button" @click="authMode = 'login'">
              Вход
            </button>
          </div>

          <form class="ez-form" @submit.prevent="submitAuth">
            <label v-if="authMode === 'register'" class="ez-field">
              <span class="ez-label">Имя</span>
              <input v-model="displayName" class="ez-input" autocomplete="name" placeholder="Ваше имя" type="text" />
            </label>

            <label class="ez-field">
              <span class="ez-label">Email</span>
              <input v-model="email" class="ez-input" autocomplete="email" placeholder="you@mail.com" type="email" />
            </label>

            <label class="ez-field">
              <span class="ez-label">Пароль</span>
              <input v-model="password" class="ez-input" autocomplete="current-password" placeholder="••••••••" type="password" />
            </label>

            <button class="ez-primary" :disabled="isLoading" type="submit">
              {{ authMode === "register" ? "Создать аккаунт" : "Войти" }}
            </button>
          </form>

          <p class="ez-auth-note">В Telegram Mini App вход выполнится автоматически</p>

          <p v-if="errorMessage" class="ez-alert ez-alert--error">{{ errorMessage }}</p>
          <p v-if="statusMessage" class="ez-alert ez-alert--status">{{ statusMessage }}</p>
        </section>

        <section class="ez-hero">
          <span class="ez-pill"><span class="ez-dot"></span>Telegram Mini App</span>
          <h1 class="ez-hero-title"><span class="ez-page-title__accent">EZ</span>CORD</h1>
          <p class="ez-hero-copy">Комнаты, приватные ссылки, доступ по Telegram-чату и email-аккаунт в одном месте.</p>

          <div class="ez-feature-grid">
            <article class="ez-feature-card">
              <span class="ez-feature-icon">ON</span>
              <h2>Голос</h2>
              <p>WebRTC комнаты до {{ maxRoomParticipants }} человек.</p>
            </article>
            <article class="ez-feature-card">
              <span class="ez-feature-icon">TG</span>
              <h2>Telegram</h2>
              <p>Вход без стартового экрана внутри Mini App.</p>
            </article>
            <article class="ez-feature-card">
              <span class="ez-feature-icon">ID</span>
              <h2>Email</h2>
              <p>Почту можно привязать после входа.</p>
            </article>
          </div>

          <aside class="ez-preview-card">
            <div class="ez-room-card-row">
              <div class="min-w-0">
                <span class="ez-badge">LIVE</span>
                <h2 class="ez-room-title">Вечерний подкаст</h2>
                <p class="ez-room-subtitle">Открытая голосовая комната</p>
              </div>
              <span class="ez-dots">•••</span>
            </div>
            <div class="ez-participants">
              <div class="ez-peer-circle ez-peer-circle--self">DK</div>
              <div class="ez-peer-circle">AK</div>
              <div class="ez-circle-btn">+</div>
            </div>
            <div class="ez-preview-room">
              <div class="ez-wave">
                <span v-for="height in waveBars" :key="height" :style="{ height: `${Math.max(12, Math.round(height * 0.62))}px` }"></span>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <div v-else-if="!activeRoom" class="ez-shell ez-lobby-shell">
        <aside class="ez-stack">
          <section class="ez-panel ez-panel--soft">
            <div class="ez-panel-head">
              <div>
                <p class="ez-kicker">Создание</p>
                <h1 class="ez-heading">Новая комната</h1>
              </div>
              <span class="ez-plus-tile">+</span>
            </div>

            <form class="ez-form" @submit.prevent="createRoom">
              <label class="ez-field">
                <span class="ez-label">Название</span>
                <input v-model="roomName" class="ez-input" type="text" />
              </label>

              <label class="ez-field">
                <span class="ez-label">Доступ</span>
                <select v-model="roomAccess" class="ez-select">
                  <option value="public">Открытая</option>
                  <option value="private">Приватная</option>
                  <option value="telegram_chat">Только Telegram-чат</option>
                </select>
              </label>

              <label v-if="roomAccess === 'telegram_chat'" class="ez-field">
                <span class="ez-label">Telegram chat id</span>
                <input v-model="telegramChatId" class="ez-input" placeholder="-100..." type="text" />
              </label>

              <button class="ez-primary" :disabled="isLoading" type="submit">Создать</button>
            </form>
          </section>

          <section class="ez-panel">
            <div class="ez-panel-head">
              <div class="min-w-0">
                <p class="ez-kicker">Аккаунт</p>
                <p class="ez-account-line">{{ hasEmail ? user.email : "Вход через Telegram" }}</p>
                <p class="ez-copy">{{ telegramName || "Telegram не привязан" }}</p>
              </div>
              <button v-if="!user.telegram" class="ez-secondary" type="button" @click="linkTelegram">TG</button>
            </div>
          </section>

          <section v-if="!hasEmail" class="ez-panel">
            <p class="ez-kicker">Email для входа</p>
            <p class="ez-copy">Привяжите почту, чтобы входить без Telegram.</p>
            <form class="ez-form" @submit.prevent="attachEmailAccount">
              <input v-model="accountDisplayName" class="ez-input" autocomplete="name" placeholder="Имя" type="text" />
              <input v-model="accountEmail" class="ez-input" autocomplete="email" placeholder="you@mail.com" type="email" />
              <input v-model="accountPassword" class="ez-input" autocomplete="new-password" placeholder="Пароль от 8 символов" type="password" />
              <button class="ez-primary" :disabled="isLoading" type="submit">Привязать email</button>
            </form>
          </section>

          <p v-if="errorMessage" class="ez-alert ez-alert--error">{{ errorMessage }}</p>
          <p v-if="statusMessage" class="ez-alert ez-alert--status">{{ statusMessage }}</p>
        </aside>

        <section>
          <div class="ez-panel-head">
            <div>
              <p class="ez-kicker">Комнаты</p>
              <h1 class="ez-page-title"><span class="ez-page-title__accent">Лобби</span></h1>
            </div>
            <span class="ez-pill"><span class="ez-dot"></span>до {{ maxRoomParticipants }}</span>
          </div>

          <div class="ez-feature-grid">
            <article class="ez-feature-card">
              <span class="ez-feature-icon">PUB</span>
              <h2>{{ publicRoomCount }}</h2>
              <p>Открытые</p>
            </article>
            <article class="ez-feature-card">
              <span class="ez-feature-icon">INV</span>
              <h2>{{ privateRoomCount }}</h2>
              <p>Приватные</p>
            </article>
            <article class="ez-feature-card">
              <span class="ez-feature-icon">TG</span>
              <h2>{{ telegramRoomCount }}</h2>
              <p>Telegram-чаты</p>
            </article>
          </div>

          <div class="ez-room-list">
            <article v-for="room in rooms" :key="room.id" class="ez-room-card">
              <div class="ez-room-card-row">
                <div class="min-w-0">
                  <div class="ez-room-tags">
                    <span class="ez-badge">{{ accessGlyphs[room.access] }}</span>
                    <span class="ez-badge ez-badge--muted">{{ accessLabels[room.access] }}</span>
                  </div>
                  <h2 class="ez-room-title">{{ room.name }}</h2>
                  <p class="ez-room-subtitle">Голосовая комната</p>
                </div>
                <span class="ez-card-count"><span class="ez-dot"></span>{{ maxRoomParticipants }} max</span>
              </div>

              <div class="ez-room-actions">
                <button v-if="room.inviteUrl" class="ez-secondary" type="button" @click="copyInvite(room)">
                  {{ copiedRoomId === room.id ? "Скопировано" : "Invite" }}
                </button>
                <div class="ez-wave ez-wave--small">
                  <span
                    v-for="height in waveBars.slice(0, 7)"
                    :key="height"
                    :style="{ height: `${Math.max(10, Math.round(height * 0.34))}px` }"
                  ></span>
                </div>
                <button class="ez-primary" type="button" @click="openRoom(room.id)">Войти</button>
              </div>
            </article>

            <div v-if="rooms.length === 0" class="ez-empty">
              <p class="ez-heading">Комнат пока нет</p>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="ez-room-shell">
        <p class="ez-kicker">Комната</p>
        <h1 class="ez-room-heading">{{ activeRoom.name }}</h1>

        <div class="ez-room-grid">
          <section class="ez-room-stage">
            <div class="ez-room-top">
              <div class="ez-room-tags">
                <span class="ez-badge">{{ accessGlyphs[activeRoom.access] }}</span>
                <span class="ez-badge ez-badge--muted">{{ accessLabels[activeRoom.access] }}</span>
                <span class="ez-live"><span class="ez-dot"></span>Активна</span>
              </div>
              <span class="ez-dots">•••</span>
            </div>

            <div class="ez-participants">
              <div class="ez-peer">
                <div class="ez-peer-circle ez-peer-circle--self">{{ userInitial }}</div>
                <p class="ez-peer-label">вы</p>
              </div>

              <div v-for="peer in peers" :key="peer.peerId" class="ez-peer">
                <div class="ez-peer-circle">
                  {{ getInitials(peer.displayName) }}
                  <button v-if="activeRoom.createdBy === user.id" class="ez-kick" type="button" @click="kickPeer(peer.peerId)">×</button>
                </div>
                <p class="ez-peer-label">{{ peer.displayName }}</p>
              </div>

              <button v-if="activeRoom.inviteUrl" class="ez-circle-btn" type="button" @click="copyInvite(activeRoom)">+</button>
            </div>

            <div class="ez-voice-control">
              <div>
                <div class="ez-voice-labels">
                  <span class="ez-kicker">Голос</span>
                  <span class="ez-kicker">{{ isMicOn ? "Live" : "Muted" }}</span>
                </div>
                <div class="ez-wave" :class="{ 'ez-wave--muted': !isMicOn }">
                  <span
                    v-for="height in waveBars"
                    :key="height"
                    :style="{ height: `${Math.max(12, Math.round((height * (micLevel + 28)) / 100))}px` }"
                  ></span>
                </div>
              </div>

              <button class="ez-mic" :class="{ 'ez-mic--on': isMicOn }" type="button" @click="toggleMic">MIC</button>
            </div>

            <div ref="audioSink" class="hidden"></div>
          </section>

          <aside class="ez-stack">
            <div class="ez-stat-card">
              <p class="ez-kicker">Участники</p>
              <p class="ez-stat-value">{{ participantCount }}/{{ maxRoomParticipants }}</p>
            </div>
            <div class="ez-stat-card">
              <p class="ez-kicker">Соединения</p>
              <p class="ez-stat-value">{{ connectedCount }}</p>
            </div>
            <button v-if="activeRoom.inviteUrl" class="ez-secondary" type="button" @click="copyInvite(activeRoom)">
              {{ copiedRoomId === activeRoom.id ? "Скопировано" : "Invite" }}
            </button>
            <button class="ez-secondary" type="button" @click="exitRoom">Выйти в лобби</button>
            <p v-if="errorMessage" class="ez-alert ez-alert--error">{{ errorMessage }}</p>
            <p v-if="statusMessage" class="ez-alert ez-alert--status">{{ statusMessage }}</p>
          </aside>
        </div>
      </div>
    </div>
  </main>
</template>
