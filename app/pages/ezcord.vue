<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import EzcordAuthScreen from "~/components/ezcord/EzcordAuthScreen.vue";
import EzcordHeader from "~/components/ezcord/EzcordHeader.vue";
import EzcordRoomScreen from "~/components/ezcord/EzcordRoomScreen.vue";
import { useEzcordVoice } from "~/composables/useEzcordVoice";
import type { Room, RoomGame, RoomGoal, User } from "~/types/ezcord";
import { getInitials } from "~/utils/ezcord";

const route = useRoute();

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
const isRoomSettingsSaving = ref(false);
const isTelegramLoginLoading = ref(false);
const telegramLoginUrl = ref("");
let telegramLoginTimer = 0;
let telegramLoginPollInFlight = false;

const roomFromQuery = computed(() => (typeof route.query.room === "string" ? route.query.room : ""));
const inviteFromQuery = computed(() => (typeof route.query.invite === "string" ? route.query.invite : ""));
const waveBars = [18, 30, 46, 26, 58, 74, 34, 50, 24, 62, 40, 22];
const maxRoomParticipants = 5;

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
const connectedCount = computed(() => connectedPeerIds.value.length);
const visibleMicOn = computed(() => isMicOn.value);
const visibleMicLevel = computed(() => micLevel.value);
const userInitial = computed(() => getInitials(user.value?.displayName || user.value?.email || "E"));
const userPhotoUrl = computed(() => user.value?.telegram?.photoUrl || "");

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
  const initData = await waitForTelegramInitData();
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
  stopTelegramLoginPolling();
  await leaveActiveRoom();
  cleanupVoice();
  await $fetch("/api/ezcord/auth/logout", { method: "POST" });
  user.value = null;
  activeRoom.value = null;
}

async function startTelegramLogin() {
  if (isTelegramLoginLoading.value) return;

  errorMessage.value = "";
  statusMessage.value = "Откройте Telegram и подтвердите вход кнопкой в сообщении бота";
  isTelegramLoginLoading.value = true;
  telegramLoginUrl.value = "";

  const telegramWindow = window.open("about:blank", "_blank");

  try {
    const response = await $fetch<{ requestId: string; botUrl: string }>("/api/ezcord/auth/telegram/request", {
      method: "POST",
    });
    telegramLoginUrl.value = response.botUrl;
    telegramWindow?.location.assign(response.botUrl);
    telegramLoginTimer = window.setInterval(() => void pollTelegramLogin(response.requestId), 1500);
    await pollTelegramLogin(response.requestId);
  } catch (error: any) {
    telegramWindow?.close();
    stopTelegramLoginPolling();
    isTelegramLoginLoading.value = false;
    errorMessage.value = error?.data?.message || "Не получилось начать вход через Telegram";
  }
}

async function pollTelegramLogin(requestId: string) {
  if (!isTelegramLoginLoading.value || telegramLoginPollInFlight) return;
  telegramLoginPollInFlight = true;

  try {
    const response = await $fetch<{ status: "pending" | "approved" | "consumed" | "expired"; user?: User }>(
      `/api/ezcord/auth/telegram/${encodeURIComponent(requestId)}`,
    );

    if (response.status === "approved" && response.user) {
      stopTelegramLoginPolling();
      isTelegramLoginLoading.value = false;
      telegramLoginUrl.value = "";
      user.value = response.user;
      statusMessage.value = "Вы вошли через Telegram";
      await enterStartRoom();
      return;
    }

    if (response.status === "expired" || response.status === "consumed") {
      stopTelegramLoginPolling();
      isTelegramLoginLoading.value = false;
      statusMessage.value = "Запрос авторизации истек, начните вход еще раз";
    }
  } catch (error: any) {
    stopTelegramLoginPolling();
    isTelegramLoginLoading.value = false;
    errorMessage.value = error?.data?.message || "Не получилось проверить вход через Telegram";
  } finally {
    telegramLoginPollInFlight = false;
  }
}

function stopTelegramLoginPolling() {
  if (telegramLoginTimer) {
    window.clearInterval(telegramLoginTimer);
    telegramLoginTimer = 0;
  }
}

async function enterStartRoom() {
  if (!user.value) return;

  if (roomFromQuery.value) {
    await openRoom(roomFromQuery.value, inviteFromQuery.value);
    return;
  }

  await openHomeRoom();
}

async function openHomeRoom() {
  if (!user.value) return;

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

function handleToggleMic() {
  void toggleMic();
}

function handleKickPeer(peerId: string) {
  void kickPeer(peerId);
}

async function updateRoomSettings(settings: { name: string; game: RoomGame; goal: RoomGoal }) {
  if (!activeRoom.value || !user.value) return;

  errorMessage.value = "";
  isRoomSettingsSaving.value = true;

  try {
    const response = await $fetch<{ room: Room }>(`/api/ezcord/rooms/${activeRoom.value.id}`, {
      method: "PATCH",
      body: settings,
    });
    activeRoom.value = response.room;
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

async function waitForTelegramInitData() {
  if (typeof window === "undefined") return "";

  const startedAt = Date.now();
  const timeoutMs = 5000;

  while (Date.now() - startedAt < timeoutMs) {
    prepareTelegramApp();
    const initData = getTelegramInitData();
    if (initData) return initData;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return getTelegramInitData();
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
  prepareTelegramApp();
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
  stopTelegramLoginPolling();
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
  <main class="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,rgba(82,207,28,0.14),transparent_250px),linear-gradient(180deg,#0b0e0b,#060806)] text-ez-ink">
    <EzcordHeader :user="user" :user-initial="userInitial" @logout="logout" />

    <div class="min-h-[calc(100vh-74px)]">
      <div v-if="isBooting" class="flex min-h-[calc(100vh-74px)] items-center justify-center p-6">
        <div class="flex items-center gap-4 rounded-[18px] border border-ez-line bg-ez-card p-[18px] shadow-ez">
          <span class="grid h-12 w-12 shrink-0 place-items-center text-ez-green" aria-hidden="true">
            <EzcordLogo class="h-12 w-12 scale-x-[-1]" />
          </span>
          <div>
            <p class="block text-[22px] font-black leading-none text-ez-ink"><span class="text-ez-green">EZ</span>CORD</p>
            <p class="mt-1 text-xs font-black uppercase leading-[1.2] text-ez-muted">загрузка комнаты</p>
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
        :telegram-login-loading="isTelegramLoginLoading"
        :telegram-login-url="telegramLoginUrl"
        @submit="submitAuth"
        @telegram-login="startTelegramLogin"
      />

      <div v-else-if="!activeRoom" class="flex min-h-[calc(100vh-74px)] items-center justify-center px-6 py-7 max-[760px]:px-3.5">
        <section class="grid w-full max-w-[420px] gap-3.5 rounded-[18px] border border-ez-line bg-gradient-to-b from-ez-card to-ez-card-2 p-[22px] shadow-ez">
          <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Комната</p>
          <h1 class="-mt-1 text-[25px] font-black leading-[1.08] text-ez-ink">Готовим комнату</h1>
          <p class="text-sm font-bold leading-[1.55] text-ez-muted">Откроем комнату из ссылки или вашу пустую комнату.</p>
          <button
            class="inline-flex min-h-[50px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8ef25a] to-ez-green-dark px-[18px] text-[15px] font-black text-[#082900] shadow-[0_14px_30px_-12px_rgba(82,207,28,0.72)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
            :disabled="isLoading"
            type="button"
            @click="openHomeRoom"
          >
            Открыть свою комнату
          </button>
          <p v-if="errorMessage" class="rounded-[18px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">{{ errorMessage }}</p>
        </section>
      </div>

      <EzcordRoomScreen
        v-else
        :connected-count="connectedCount"
        :copied="copiedRoomId === activeRoom.id"
        :error-message="errorMessage"
        :is-mic-on="visibleMicOn"
        :is-room-settings-saving="isRoomSettingsSaving"
        :is-waiting="isWaiting"
        :max-room-participants="maxRoomParticipants"
        :mic-level="visibleMicLevel"
        :participant-count="participantCount"
        :peers="peers"
        :room="activeRoom"
        :set-audio-sink="setAudioSink"
        :status-message="statusMessage"
        :user-id="user.id"
        :user-initial="userInitial"
        :user-photo-url="userPhotoUrl"
        :waiting-count="waitingCount"
        :wave-bars="waveBars"
        @invite="copyInvite(activeRoom)"
        @kick="handleKickPeer"
        @toggle-mic="handleToggleMic"
        @update-room="updateRoomSettings"
      />
    </div>
  </main>
</template>
