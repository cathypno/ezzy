<script setup lang="ts">
import { computed, ref } from "vue";
import EzcordRoomSidebar from "~/components/ezcord/EzcordRoomSidebar.vue";
import EzcordRoomSettingsModal from "~/components/ezcord/EzcordRoomSettingsModal.vue";
import EzcordRoomStage from "~/components/ezcord/EzcordRoomStage.vue";
import type { Peer, Room, RoomGame, RoomGoal, VoiceConnectionDiagnostic } from "~/types/ezcord";

const props = defineProps<{
  connectedCount: number;
  connectionDiagnostics: VoiceConnectionDiagnostic[];
  copied: boolean;
  errorMessage: string;
  isMicOn: boolean;
  isLocalSpeaking: boolean;
  isRoomSettingsSaving: boolean;
  isWaiting: boolean;
  maxRoomParticipants: number;
  micLevel: number;
  participantCount: number;
  peers: Peer[];
  room: Room;
  setAudioSink: (element: HTMLElement | null) => void;
  speakingPeerIds: string[];
  statusMessage: string;
  userId: string;
  userInitial: string;
  userPhotoUrl: string;
  waitingCount: number;
  waveBars: number[];
}>();

const emit = defineEmits<{
  invite: [];
  kick: [peerId: string];
  "toggle-mic": [];
  "update-room": [settings: { name: string; game: RoomGame; goal: RoomGoal }];
}>();

const settingsOpen = ref(false);
const hasSidebarContent = computed(
  () =>
    props.isWaiting ||
    props.connectionDiagnostics.length > 0 ||
    Boolean(props.errorMessage) ||
    Boolean(props.statusMessage),
);

const gameLabels: Record<RoomGame, string> = {
  voicechat: "Войсчат",
  cs2: "CS2",
  dota2: "Dota 2",
  brawl_stars: "Brawl Stars",
};

const goalLabels: Record<RoomGoal, string> = {
  result: "Результат",
  communication: "Общение",
};

function openSettings() {
  if (props.room.createdBy === props.userId) settingsOpen.value = true;
}

function saveSettings(settings: { name: string; game: RoomGame; goal: RoomGoal }) {
  settingsOpen.value = false;
  emit("update-room", settings);
}
</script>

<template>
  <div class="px-[clamp(16px,2.55vw,52px)] pb-[42px] pt-7 max-[760px]:px-3.5">
    <div class="flex items-start justify-between gap-[18px]">
      <div>
        <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Комната</p>
        <h1 class="mt-2 text-[36px] font-black leading-none text-ez-ink max-[760px]:text-[32px]">{{ props.room.name }}</h1>
        <div class="mt-2.5 flex flex-wrap gap-2" aria-label="Параметры комнаты">
          <span class="inline-flex min-h-7 items-center rounded-full border border-ez-line bg-ez-card px-2.5 text-xs font-extrabold text-ez-muted">Игра: {{ gameLabels[props.room.game] }}</span>
          <span class="inline-flex min-h-7 items-center rounded-full border border-ez-line bg-ez-card px-2.5 text-xs font-extrabold text-ez-muted">Цель: {{ goalLabels[props.room.goal] }}</span>
          <span class="inline-flex min-h-7 items-center rounded-full border border-ez-green/35 bg-ez-green-soft px-2.5 text-xs font-extrabold text-ez-green-dark">Участники: {{ props.participantCount }}/{{ props.maxRoomParticipants }}</span>
          <span v-if="props.waitingCount" class="inline-flex min-h-7 items-center rounded-full border border-ez-blue/35 bg-ez-blue-soft px-2.5 text-xs font-extrabold text-ez-blue">Ожидание: {{ props.waitingCount }}</span>
        </div>
      </div>
      <button
        v-if="props.room.createdBy === props.userId"
        class="mt-5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ez-line bg-ez-card text-[22px] leading-none text-ez-muted shadow-ez transition hover:-translate-y-px hover:border-ez-green/55 hover:text-ez-green-dark max-[760px]:mt-4"
        type="button"
        aria-label="Изменить комнату"
        title="Изменить комнату"
        @click="openSettings"
      >
        ✎
      </button>
    </div>

    <div
      class="mt-5 grid gap-4"
      :class="hasSidebarContent ? '[grid-template-columns:minmax(0,1fr)_minmax(190px,220px)] max-[900px]:grid-cols-1' : 'grid-cols-1'"
    >
      <EzcordRoomStage
        :copied="props.copied"
        :is-mic-on="props.isMicOn"
        :is-local-speaking="props.isLocalSpeaking"
        :is-waiting="props.isWaiting"
        :mic-level="props.micLevel"
        :peers="props.peers"
        :room="props.room"
        :set-audio-sink="props.setAudioSink"
        :speaking-peer-ids="props.speakingPeerIds"
        :user-id="props.userId"
        :user-initial="props.userInitial"
        :user-photo-url="props.userPhotoUrl"
        :wave-bars="props.waveBars"
        @invite="$emit('invite')"
        @kick="$emit('kick', $event)"
        @toggle-mic="$emit('toggle-mic')"
      />
      <EzcordRoomSidebar
        v-if="hasSidebarContent"
        :error-message="props.errorMessage"
        :connection-diagnostics="props.connectionDiagnostics"
        :is-waiting="props.isWaiting"
        :status-message="props.statusMessage"
      />
    </div>

    <EzcordRoomSettingsModal
      :open="settingsOpen"
      :room="props.room"
      :saving="props.isRoomSettingsSaving"
      @close="settingsOpen = false"
      @save="saveSettings"
    />
  </div>
</template>
