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
  <div class="ez-room-shell">
    <div class="ez-room-heading-row">
      <div>
        <p class="ez-kicker">Комната</p>
        <h1 class="ez-room-heading">{{ props.room.name }}</h1>
        <div class="ez-room-meta" aria-label="Параметры комнаты">
          <span>Игра: {{ gameLabels[props.room.game] }}</span>
          <span>Цель: {{ goalLabels[props.room.goal] }}</span>
        </div>
      </div>
      <button
        v-if="props.room.createdBy === props.userId"
        class="ez-room-edit-btn"
        type="button"
        aria-label="Изменить комнату"
        title="Изменить комнату"
        @click="openSettings"
      >
        ✎
      </button>
    </div>

    <div class="ez-room-grid">
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
