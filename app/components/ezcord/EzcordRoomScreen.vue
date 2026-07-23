<script setup lang="ts">
import { ref } from "vue";
import EzcordRoomSidebar from "~/components/ezcord/EzcordRoomSidebar.vue";
import EzcordRoomSettingsModal from "~/components/ezcord/EzcordRoomSettingsModal.vue";
import EzcordRoomStage from "~/components/ezcord/EzcordRoomStage.vue";
import type { Peer, Room, RoomGame, RoomGoal } from "~/types/ezcord";

const props = defineProps<{
  connectedCount: number;
  copied: boolean;
  errorMessage: string;
  isMicOn: boolean;
  isRoomSettingsSaving: boolean;
  isWaiting: boolean;
  maxRoomParticipants: number;
  micLevel: number;
  participantCount: number;
  peers: Peer[];
  room: Room;
  setAudioSink: (element: HTMLElement | null) => void;
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
  <div class="mx-auto max-w-[1320px] px-[clamp(16px,3vw,36px)] pb-[42px] pt-7 max-[760px]:px-3.5">
    <div class="flex items-start justify-between gap-[18px]">
      <div>
        <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Комната</p>
        <h1 class="mt-2 text-[36px] font-black leading-none text-ez-ink max-[760px]:text-[32px]">{{ props.room.name }}</h1>
        <div class="mt-2.5 flex flex-wrap gap-2" aria-label="Параметры комнаты">
          <span class="inline-flex min-h-7 items-center rounded-full border border-ez-line bg-ez-card px-2.5 text-xs font-extrabold text-ez-muted">Игра: {{ gameLabels[props.room.game] }}</span>
          <span class="inline-flex min-h-7 items-center rounded-full border border-ez-line bg-ez-card px-2.5 text-xs font-extrabold text-ez-muted">Цель: {{ goalLabels[props.room.goal] }}</span>
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

    <div class="mt-5 grid gap-4 [grid-template-columns:minmax(0,1fr)_minmax(190px,220px)] max-[900px]:grid-cols-1">
      <EzcordRoomStage
        :copied="props.copied"
        :is-mic-on="props.isMicOn"
        :is-waiting="props.isWaiting"
        :mic-level="props.micLevel"
        :peers="props.peers"
        :room="props.room"
        :set-audio-sink="props.setAudioSink"
        :user-id="props.userId"
        :user-initial="props.userInitial"
        :user-photo-url="props.userPhotoUrl"
        :wave-bars="props.waveBars"
        @invite="$emit('invite')"
        @kick="$emit('kick', $event)"
        @toggle-mic="$emit('toggle-mic')"
      />
      <EzcordRoomSidebar
        :connected-count="props.connectedCount"
        :copied="props.copied"
        :error-message="props.errorMessage"
        :is-waiting="props.isWaiting"
        :max-room-participants="props.maxRoomParticipants"
        :participant-count="props.participantCount"
        :room="props.room"
        :status-message="props.statusMessage"
        :waiting-count="props.waitingCount"
        @invite="$emit('invite')"
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
