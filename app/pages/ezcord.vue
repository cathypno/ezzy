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
const isMicOn = ref(false);
const micLevel = ref(0);
const voiceReady = ref(false);
const copiedRoomId = ref("");
const localPeerId = ref("");
const peers = ref<Peer[]>([]);
const connectedPeerIds = ref<string[]>([]);
const audioSink = ref<HTMLElement | null>(null);

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

  await fetchMe();
  if (user.value) {
    await fetchRooms();
  }
  if (user.value && roomFromQuery.value) {
    await openRoom(roomFromQuery.value, inviteFromQuery.value);
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
  <main
    class="min-h-screen bg-[#f4f7f1] text-[#151914]"
    style="
      background:
        linear-gradient(135deg, rgba(61, 195, 32, 0.12) 0%, transparent 34%),
        linear-gradient(315deg, rgba(39, 167, 231, 0.13) 0%, transparent 32%),
        #f4f7f1;
    "
  >
    <section class="border-b border-black/10 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div class="flex items-center gap-3">
          <img class="h-12 w-12 rounded-lg object-cover shadow-[0_8px_22px_rgba(23,25,21,0.18)]" src="/ezcord-logo.png" alt="Ezcord" />
          <div>
            <p class="text-2xl font-black uppercase leading-none tracking-normal">
              <span class="text-[#43c51b]">EZ</span><span class="text-[#171915]">CORD</span>
            </p>
            <p class="mt-1 text-xs font-bold text-black/50">Voice rooms for Telegram</p>
          </div>
        </div>

        <div v-if="user" class="flex flex-wrap items-center gap-2">
          <span class="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-black shadow-sm">
            {{ user.displayName }}
          </span>
          <button
            class="inline-flex h-10 items-center rounded-lg border border-black/10 bg-[#171915] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#27a7e7]"
            type="button"
            @click="logout"
          >
            Выйти
          </button>
        </div>
      </div>
    </section>

    <div class="mx-auto grid max-w-6xl gap-5 px-5 py-5 lg:grid-cols-[360px_1fr]">
      <aside class="space-y-5">
        <section v-if="!user" class="rounded-lg border border-black/10 bg-white p-5 shadow-[0_20px_55px_rgba(23,25,21,0.08)]">
          <div class="mb-5 grid grid-cols-2 rounded-lg border border-black/10 bg-[#eef4eb] p-1">
            <button
              class="h-10 rounded-md text-sm font-black transition"
              :class="authMode === 'register' ? 'bg-white text-[#171915] shadow-sm' : 'text-black/45'"
              type="button"
              @click="authMode = 'register'"
            >
              Регистрация
            </button>
            <button
              class="h-10 rounded-md text-sm font-black transition"
              :class="authMode === 'login' ? 'bg-white text-[#171915] shadow-sm' : 'text-black/45'"
              type="button"
              @click="authMode = 'login'"
            >
              Вход
            </button>
          </div>

          <form class="space-y-3" @submit.prevent="submitAuth">
            <label v-if="authMode === 'register'" class="block">
              <span class="text-xs font-black uppercase text-black/45">Имя</span>
              <input
                v-model="displayName"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
                autocomplete="name"
                type="text"
              />
            </label>

            <label class="block">
              <span class="text-xs font-black uppercase text-black/45">Email</span>
              <input
                v-model="email"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
                autocomplete="email"
                type="email"
              />
            </label>

            <label class="block">
              <span class="text-xs font-black uppercase text-black/45">Пароль</span>
              <input
                v-model="password"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
                autocomplete="current-password"
                type="password"
              />
            </label>

            <button
              class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#171915] px-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(23,25,21,0.18)] transition hover:bg-[#43c51b] disabled:opacity-60"
              :disabled="isLoading"
              type="submit"
            >
              {{ authMode === "register" ? "Создать аккаунт" : "Войти" }}
            </button>
          </form>
        </section>

        <section v-else class="rounded-lg border border-black/10 bg-white p-5 shadow-[0_20px_55px_rgba(23,25,21,0.08)]">
          <p class="text-xs font-black uppercase text-black/45">Аккаунт</p>
          <h2 class="mt-1 break-words text-lg font-black">{{ user.email }}</h2>

          <div class="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[#27a7e7]/25 bg-[#eff8ff] p-3">
            <div>
              <p class="text-xs font-black uppercase text-black/45">Telegram</p>
              <p class="mt-1 text-sm font-black">{{ telegramName || "Не привязан" }}</p>
            </div>
            <button
              class="h-10 rounded-lg bg-[#27a7e7] px-3 text-xs font-black text-white shadow-[0_10px_24px_rgba(39,167,231,0.22)] transition hover:bg-[#171915]"
              type="button"
              @click="linkTelegram"
            >
              Привязать
            </button>
          </div>
        </section>

        <section v-if="user" class="rounded-lg border border-black/10 bg-white p-5 shadow-[0_20px_55px_rgba(23,25,21,0.08)]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase text-black/45">Создание</p>
              <h2 class="mt-1 text-xl font-black">Новая комната</h2>
            </div>
            <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#43c51b] text-xl font-black text-white">+</span>
          </div>

          <form class="mt-4 space-y-3" @submit.prevent="createRoom">
            <label class="block">
              <span class="text-xs font-black uppercase text-black/45">Название</span>
              <input
                v-model="roomName"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
                type="text"
              />
            </label>

            <label class="block">
              <span class="text-xs font-black uppercase text-black/45">Доступ</span>
              <select
                v-model="roomAccess"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
              >
                <option value="public">Открытая</option>
                <option value="private">Приватная</option>
                <option value="telegram_chat">Только Telegram-чат</option>
              </select>
            </label>

            <label v-if="roomAccess === 'telegram_chat'" class="block">
              <span class="text-xs font-black uppercase text-black/45">Telegram chat id</span>
              <input
                v-model="telegramChatId"
                class="mt-2 h-12 w-full rounded-lg border border-black/10 bg-[#f8faf6] px-3 text-sm font-bold outline-none transition focus:border-[#43c51b] focus:bg-white focus:ring-4 focus:ring-[#43c51b]/15"
                placeholder="-100..."
                type="text"
              />
            </label>

            <button
              class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#43c51b] px-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(67,197,27,0.22)] transition hover:bg-[#171915] disabled:opacity-60"
              :disabled="isLoading"
              type="submit"
            >
              Создать
            </button>
          </form>
        </section>

        <p v-if="errorMessage" class="rounded-lg border border-[#f4b4b4] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-[#a01818]">
          {{ errorMessage }}
        </p>
        <p v-if="statusMessage" class="rounded-lg border border-[#b7e8c8] bg-[#effbf3] px-4 py-3 text-sm font-bold text-[#17683d]">
          {{ statusMessage }}
        </p>
      </aside>

      <section class="min-h-[640px] overflow-hidden rounded-lg border border-black/10 bg-white p-5 shadow-[0_26px_80px_rgba(23,25,21,0.10)]">
        <div v-if="!user" class="grid min-h-[560px] gap-6 lg:grid-cols-[1fr_320px]">
          <div class="flex flex-col justify-center">
            <div class="inline-flex w-fit items-center gap-2 rounded-lg border border-[#43c51b]/30 bg-[#effbe9] px-3 py-2 text-xs font-black uppercase text-[#229a21]">
              <span class="h-2 w-2 rounded-full bg-[#43c51b]"></span>
              Telegram Mini App
            </div>
            <h1 class="mt-5 text-5xl font-black uppercase leading-none tracking-normal sm:text-7xl">
              <span class="text-[#43c51b]">EZ</span><span class="text-[#171915]">CORD</span>
            </h1>
            <p class="mt-4 max-w-xl text-lg font-bold leading-relaxed text-black/58">
              Голосовые комнаты, приватные ссылки, доступ по Telegram-чату и email-аккаунт в одном приложении.
            </p>

            <div class="mt-7 grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-[#43c51b]/25 bg-white px-4 py-3 shadow-sm">
                <p class="text-sm font-black">Голосовые комнаты</p>
                <p class="mt-1 text-xs font-bold text-black/45">WebRTC audio внутри Telegram</p>
              </div>
              <div class="rounded-lg border border-[#27a7e7]/25 bg-white px-4 py-3 shadow-sm">
                <p class="text-sm font-black">Email + Telegram</p>
                <p class="mt-1 text-xs font-bold text-black/45">Один аккаунт, две точки входа</p>
              </div>
              <div class="rounded-lg border border-[#27a7e7]/25 bg-white px-4 py-3 shadow-sm">
                <p class="text-sm font-black">Приватные ссылки</p>
                <p class="mt-1 text-xs font-bold text-black/45">Invite-доступ к комнатам</p>
              </div>
              <div class="rounded-lg border border-[#43c51b]/25 bg-white px-4 py-3 shadow-sm">
                <p class="text-sm font-black">Telegram-чат</p>
                <p class="mt-1 text-xs font-bold text-black/45">Проверка членства в группе</p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-center">
            <div class="w-full max-w-[320px] rounded-lg border border-black/10 bg-[#171915] p-5 text-white shadow-[0_28px_70px_rgba(23,25,21,0.28)]">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <img class="h-10 w-10 rounded-lg object-cover" src="/ezcord-logo.png" alt="Ezcord" />
                  <div>
                    <p class="text-sm font-black">Ezcord</p>
                    <p class="text-xs font-bold text-white/45">мини-приложение</p>
                  </div>
                </div>
                <span class="text-xl font-black text-white/45">...</span>
              </div>

              <div class="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#43c51b]/12 px-3 py-2 text-xs font-black text-[#7dff4a]">
                <span class="h-2 w-2 rounded-full bg-[#43c51b]"></span>
                Комната активна
              </div>
              <h2 class="mt-4 text-3xl font-black">Вечерний подкаст</h2>
              <p class="mt-1 text-sm font-bold text-white/45">01:24:36</p>

              <div class="mt-6 grid grid-cols-4 gap-3">
                <div class="flex aspect-square items-center justify-center rounded-full border-2 border-[#43c51b] bg-white/10 text-sm font-black">DK</div>
                <div class="flex aspect-square items-center justify-center rounded-full border-2 border-[#43c51b] bg-white/10 text-sm font-black">AK</div>
                <div class="flex aspect-square items-center justify-center rounded-full border-2 border-[#43c51b] bg-white/10 text-sm font-black">TG</div>
                <div class="flex aspect-square items-center justify-center rounded-full border border-white/18 bg-white/8 text-sm font-black">+</div>
              </div>

              <div class="mt-8 flex items-end justify-center gap-1.5">
                <span
                  v-for="height in waveBars"
                  :key="height"
                  class="w-2 rounded-full bg-[#7dff4a]"
                  :style="{ height: `${height}px` }"
                ></span>
              </div>
              <div class="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#43c51b] text-3xl font-black shadow-[0_0_32px_rgba(67,197,27,0.58)]">
                MIC
              </div>
            </div>
          </div>
        </div>

        <section v-else>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase text-black/45">Комнаты</p>
              <h1 class="mt-1 text-4xl font-black uppercase leading-none tracking-normal">
                <span class="text-[#43c51b]">Voice</span> lobby
              </h1>
            </div>
            <button
              v-if="activeRoom"
              class="inline-flex h-10 items-center rounded-lg border border-black/10 bg-[#f4f7f1] px-4 text-sm font-black transition hover:bg-[#171915] hover:text-white"
              type="button"
              @click="exitRoom"
            >
              Лобби
            </button>
          </div>

          <div v-if="activeRoom" class="mt-5 grid gap-5 lg:grid-cols-[1fr_240px]">
            <div class="rounded-lg bg-[#171915] p-5 text-white shadow-[0_26px_70px_rgba(23,25,21,0.24)]">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="inline-flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-xs font-black text-white/78">
                    <span class="text-[#7dff4a]">{{ accessGlyphs[activeRoom.access] }}</span>
                    {{ accessLabels[activeRoom.access] }}
                  </div>
                  <h2 class="mt-4 text-4xl font-black leading-tight">{{ activeRoom.name }}</h2>
                  <p class="mt-2 text-sm font-bold text-white/45">
                    {{ voiceReady ? "WebRTC voice room active" : "Connecting voice room" }}
                  </p>
                </div>

                <button
                  class="h-12 rounded-lg px-5 text-sm font-black text-white shadow-lg transition"
                  :class="isMicOn ? 'bg-[#cf3d3d] hover:bg-[#a92828]' : 'bg-[#43c51b] hover:bg-[#27a7e7]'"
                  type="button"
                  @click="toggleMic"
                >
                  {{ isMicOn ? "Mute" : "Mic on" }}
                </button>
              </div>

              <div class="mt-9 flex h-24 items-end justify-center gap-2 rounded-lg bg-white/6 px-4 py-5">
                <span
                  v-for="height in waveBars"
                  :key="height"
                  class="w-2 rounded-full transition-all"
                  :class="isMicOn ? 'bg-[#7dff4a]' : 'bg-white/22'"
                  :style="{ height: `${Math.max(16, Math.round((height * (micLevel + 28)) / 100))}px` }"
                ></span>
              </div>
              <div class="mt-3 flex items-center justify-between text-xs font-black uppercase text-white/45">
                <span>Input</span>
                <span>{{ micLevel }}%</span>
              </div>

              <div class="mt-6 grid gap-3 sm:grid-cols-2">
                <div class="rounded-lg border border-white/10 bg-white/8 p-3">
                  <p class="text-xs font-black uppercase text-white/45">You</p>
                  <p class="mt-1 text-sm font-black">{{ user.displayName }}</p>
                </div>
                <div v-for="peer in peers" :key="peer.peerId" class="rounded-lg border border-white/10 bg-white/8 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-xs font-black uppercase text-white/45">
                        {{ connectedPeerIds.includes(peer.peerId) ? "Connected" : "Connecting" }}
                      </p>
                      <p class="mt-1 text-sm font-black">{{ peer.displayName }}</p>
                    </div>
                    <button
                      v-if="activeRoom.createdBy === user.id"
                      class="h-8 rounded-lg bg-white/10 px-2 text-xs font-black text-white/70 transition hover:bg-[#cf3d3d] hover:text-white"
                      type="button"
                      @click="kickPeer(peer.peerId)"
                    >
                      Кик
                    </button>
                  </div>
                </div>
              </div>

              <div ref="audioSink" class="hidden"></div>
            </div>

            <div class="grid content-start gap-3">
              <div class="rounded-lg border border-[#43c51b]/25 bg-[#effbe9] p-4">
                <p class="text-xs font-black uppercase text-black/45">Участники</p>
                <p class="mt-2 text-4xl font-black">{{ participantCount }}/{{ maxRoomParticipants }}</p>
              </div>
              <div class="rounded-lg border border-[#27a7e7]/25 bg-[#eff8ff] p-4">
                <p class="text-xs font-black uppercase text-black/45">Соединения</p>
                <p class="mt-2 text-4xl font-black">{{ connectedCount }}</p>
              </div>
            </div>
          </div>

          <div v-else class="mt-5 grid gap-3">
            <article
              v-for="room in rooms"
              :key="room.id"
              class="rounded-lg border border-black/10 bg-[#f8faf6] p-4 shadow-sm transition hover:border-[#43c51b] hover:bg-white"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black shadow-sm">
                    <span class="text-[#43c51b]">{{ accessGlyphs[room.access] }}</span>
                    {{ accessLabels[room.access] }}
                  </div>
                  <h2 class="mt-3 text-xl font-black">{{ room.name }}</h2>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="room.inviteUrl"
                    class="h-10 rounded-lg border border-[#27a7e7]/30 bg-white px-3 text-sm font-black text-[#147ab0] transition hover:bg-[#eff8ff]"
                    type="button"
                    @click="copyInvite(room)"
                  >
                    {{ copiedRoomId === room.id ? "Скопировано" : "Invite" }}
                  </button>
                  <button
                    class="h-10 rounded-lg bg-[#171915] px-4 text-sm font-black text-white transition hover:bg-[#43c51b]"
                    type="button"
                    @click="openRoom(room.id)"
                  >
                    Войти
                  </button>
                </div>
              </div>
            </article>

            <div v-if="rooms.length === 0" class="rounded-lg border border-dashed border-black/20 bg-[#f8faf6] p-8 text-center">
              <p class="text-lg font-black">Комнат пока нет</p>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
