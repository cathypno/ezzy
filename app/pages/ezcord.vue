<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import EzcordAuthScreen from "~/components/ezcord/EzcordAuthScreen.vue";
import EzcordHeader from "~/components/ezcord/EzcordHeader.vue";
import EzcordRoomScreen from "~/components/ezcord/EzcordRoomScreen.vue";
import { useEzcordVoice } from "~/composables/useEzcordVoice";
import type { Room, RoomGame, RoomGoal, User } from "~/types/ezcord";
import { getInitials } from "~/utils/ezcord";

const route = useRoute();
const runtimeConfig = useRuntimeConfig();

const user = ref<User | null>(null);
const activeRoom = ref<Room | null>(null);
const authMode = ref<"login" | "register">("register");
const email = ref("");
const password = ref("");
const displayName = ref("");
const statusMessage = ref("");
const errorMessage = ref("");
const isLoading = ref(false);
const isBooting = ref(true);
const copiedRoomId = ref("");
const theme = ref<"light" | "dark">("light");
const isRoomSettingsSaving = ref(false);

const roomFromQuery = computed(() => (typeof route.query.room === "string" ? route.query.room : ""));
const inviteFromQuery = computed(() => (typeof route.query.invite === "string" ? route.query.invite : ""));
const isUiMode = computed(() => runtimeConfig.public.ezcordUiMode === "mock");
const waveBars = [18, 30, 46, 26, 58, 74, 34, 50, 24, 62, 40, 22];
const maxRoomParticipants = 5;

const mockUser: User = {
  id: "ui-user",
  email: "ui@ezcord.local",
  displayName: "cathypno",
  telegram: {
    id: 100000001,
    username: "cathypno",
    firstName: "Cathy",
  },
};

const mockRoom: Room = {
  id: "ui-room",
  name: "Вечерний подкаст",
  access: "public",
  game: "voicechat",
  goal: "communication",
  inviteUrl: "http://localhost:3100/ezcord?room=ui-room&invite=ui-demo",
  createdBy: mockUser.id,
};

const mockPeers = [
  { peerId: "ui-peer-1", userId: "ui-user-2", displayName: "Марина", lastSeenAt: new Date().toISOString() },
  { peerId: "ui-peer-2", userId: "ui-user-3", displayName: "Алексей", lastSeenAt: new Date().toISOString() },
];
const mockMicOn = ref(false);
const mockMicLevel = ref(68);

const {
  connectedPeerIds,
  isWaiting,
  isMicOn,
  kickPeer,
  leaveActiveRoom,
  beaconLeaveActiveRoom,
  cleanupVoice,
  micLevel,
  peers,
  setAudioSink,
  startSignaling,
  toggleMic,
  waitingCount,
} = useEzcordVoice({
  activeRoom,
  user,
  invite: inviteFromQuery,
  errorMessage,
  statusMessage,
});

const participantCount = computed(() => peers.value.length + (isWaiting.value ? 0 : user.value ? 1 : 0));
const connectedCount = computed(() => (isUiMode.value ? peers.value.length : connectedPeerIds.value.length));
const visibleMicOn = computed(() => (isUiMode.value ? mockMicOn.value : isMicOn.value));
const visibleMicLevel = computed(() => (isUiMode.value ? mockMicLevel.value : micLevel.value));
const userInitial = computed(() => getInitials(user.value?.displayName || user.value?.email || "E"));
const themeLabel = computed(() => (theme.value === "light" ? "Включить темную тему" : "Включить светлую тему"));

async function fetchMe() {
  const response = await $fetch<{ user: User | null }>("/api/ezcord/auth/me");
  user.value = response.user;
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
    await enterStartRoom();
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
    return true;
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось войти через Telegram";
    return false;
  }
}

async function logout() {
  if (isUiMode.value) {
    user.value = null;
    activeRoom.value = null;
    peers.value = [];
    return;
  }

  await leaveActiveRoom();
  cleanupVoice();
  await $fetch("/api/ezcord/auth/logout", { method: "POST" });
  user.value = null;
  activeRoom.value = null;
}

function toggleTheme() {
  theme.value = theme.value === "light" ? "dark" : "light";
  window.localStorage.setItem("ezcord-theme", theme.value);
}

async function enterStartRoom() {
  if (!user.value) return;

  if (isUiMode.value) {
    openMockRoom();
    return;
  }

  if (roomFromQuery.value) {
    await openRoom(roomFromQuery.value, inviteFromQuery.value);
    return;
  }

  await openHomeRoom();
}

async function openHomeRoom() {
  if (!user.value) return;

  if (isUiMode.value) {
    openMockRoom();
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  isLoading.value = true;

  await leaveActiveRoom();
  cleanupVoice();

  try {
    const response = await $fetch<{ room: Room }>("/api/ezcord/rooms/home");
    activeRoom.value = response.room;
    startSignaling();
    scrollToAppTop();
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось открыть комнату";
  } finally {
    isLoading.value = false;
  }
}

async function openRoom(roomId: string, invite = "") {
  if (isUiMode.value) {
    openMockRoom(roomId);
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  await leaveActiveRoom();
  cleanupVoice();

  try {
    const query = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const response = await $fetch<{ room: Room }>(`/api/ezcord/rooms/${roomId}${query}`);
    activeRoom.value = response.room;
    startSignaling();
    scrollToAppTop();
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Нет доступа к комнате";
  }
}

function openMockRoom(roomId = mockRoom.id) {
  activeRoom.value = { ...mockRoom, id: roomId };
  user.value = { ...mockUser };
  peers.value = mockPeers.map((peer) => ({ ...peer }));
  mockMicOn.value = false;
  statusMessage.value = "UI-режим: данные тестовые";
  errorMessage.value = "";
  scrollToAppTop();
}

function handleToggleMic() {
  if (!isUiMode.value) {
    void toggleMic();
    return;
  }

  mockMicOn.value = !mockMicOn.value;
  statusMessage.value = mockMicOn.value ? "Микрофон включен" : "Микрофон выключен";
}

function handleKickPeer(peerId: string) {
  if (!isUiMode.value) {
    void kickPeer(peerId);
    return;
  }

  peers.value = peers.value.filter((peer) => peer.peerId !== peerId);
  statusMessage.value = "Участник удален из тестовой комнаты";
}

async function updateRoomSettings(settings: { name: string; game: RoomGame; goal: RoomGoal }) {
  if (!activeRoom.value || !user.value) return;

  errorMessage.value = "";
  isRoomSettingsSaving.value = true;

  try {
    if (isUiMode.value) {
      activeRoom.value = { ...activeRoom.value, ...settings };
    } else {
      const response = await $fetch<{ room: Room }>(`/api/ezcord/rooms/${activeRoom.value.id}`, {
        method: "PATCH",
        body: settings,
      });
      activeRoom.value = response.room;
    }
    statusMessage.value = "Настройки комнаты сохранены";
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось сохранить настройки";
  } finally {
    isRoomSettingsSaving.value = false;
  }
}

async function copyInvite(room: Room) {
  if (!room.inviteUrl) {
    errorMessage.value = "Ссылка приглашения недоступна";
    return;
  }

  const copied = await writeClipboardText(room.inviteUrl);
  if (!copied) {
    errorMessage.value = "Не получилось скопировать ссылку";
    return;
  }

  errorMessage.value = "";
  copiedRoomId.value = room.id;
  statusMessage.value = "Ссылка приглашения скопирована";
  window.setTimeout(() => {
    if (copiedRoomId.value === room.id) copiedRoomId.value = "";
  }, 1600);
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Telegram WebView can deny Clipboard API even on a user click.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
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

function scrollToAppTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

onMounted(async () => {
  if (isUiMode.value) {
    const savedTheme = window.localStorage.getItem("ezcord-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      theme.value = savedTheme;
    }
    openMockRoom();
    isBooting.value = false;
    return;
  }

  prepareTelegramApp();
  const savedTheme = window.localStorage.getItem("ezcord-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    theme.value = savedTheme;
  }
  window.addEventListener("pagehide", beaconLeaveActiveRoom);

  try {
    await fetchMe();
    if (!user.value) {
      await authenticateTelegram();
    }
    if (user.value) {
      await enterStartRoom();
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
  script: isUiMode.value ? [] : [{ src: "https://telegram.org/js/telegram-web-app.js?63" }],
});
</script>

<template>
  <main class="ez-main" :data-theme="theme">
    <EzcordHeader :theme="theme" :theme-label="themeLabel" :user="user" :user-initial="userInitial" @logout="logout" @toggle-theme="toggleTheme" />

    <div class="ez-page-bg">
      <div v-if="isBooting" class="ez-boot">
        <div class="ez-boot-card">
          <span class="ez-brand__logo" aria-hidden="true">
            <EzcordLogo class="ez-brand__logo-icon" />
          </span>
          <div>
            <p class="ez-brand__title"><span class="ez-brand__title-accent">EZ</span>CORD</p>
            <p class="ez-kicker">загрузка комнаты</p>
          </div>
        </div>
      </div>

      <EzcordAuthScreen
        v-else-if="!user"
        v-model:auth-mode="authMode"
        v-model:display-name="displayName"
        v-model:email="email"
        v-model:password="password"
        :error-message="errorMessage"
        :is-loading="isLoading"
        :status-message="statusMessage"
        @submit="submitAuth"
      />

      <div v-else-if="!activeRoom" class="ez-room-shell ez-room-shell--pending">
        <section class="ez-panel ez-panel--soft ez-room-pending">
          <p class="ez-kicker">Комната</p>
          <h1 class="ez-heading">Готовим комнату</h1>
          <p class="ez-copy">Откроем комнату из ссылки или вашу пустую комнату.</p>
          <button class="ez-primary" :disabled="isLoading" type="button" @click="openHomeRoom">Открыть свою комнату</button>
          <p v-if="errorMessage" class="ez-alert ez-alert--error">{{ errorMessage }}</p>
        </section>
      </div>

      <EzcordRoomScreen
        v-else
        :connected-count="connectedCount"
        :copied="copiedRoomId === activeRoom.id"
        :error-message="errorMessage"
        :is-mic-on="visibleMicOn"
        :is-room-settings-saving="isRoomSettingsSaving"
        :is-waiting="isUiMode ? false : isWaiting"
        :max-room-participants="maxRoomParticipants"
        :mic-level="visibleMicLevel"
        :participant-count="participantCount"
        :peers="peers"
        :room="activeRoom"
        :set-audio-sink="setAudioSink"
        :status-message="statusMessage"
        :user-id="user.id"
        :user-initial="userInitial"
        :waiting-count="isUiMode ? 0 : waitingCount"
        :wave-bars="waveBars"
        @invite="copyInvite(activeRoom)"
        @kick="handleKickPeer"
        @toggle-mic="handleToggleMic"
        @update-room="updateRoomSettings"
      />
    </div>
  </main>
</template>
