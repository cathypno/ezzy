<script setup lang="ts">
import EzcordRoomSidebar from "~/components/ezcord/EzcordRoomSidebar.vue";
import EzcordRoomStage from "~/components/ezcord/EzcordRoomStage.vue";
import type { Peer, Room } from "~/types/ezcord";

const props = defineProps<{
  connectedCount: number;
  copied: boolean;
  errorMessage: string;
  isMicOn: boolean;
  maxRoomParticipants: number;
  micLevel: number;
  participantCount: number;
  peers: Peer[];
  room: Room;
  setAudioSink: (element: HTMLElement | null) => void;
  statusMessage: string;
  userId: string;
  userInitial: string;
  waveBars: number[];
}>();

defineEmits<{
  invite: [];
  kick: [peerId: string];
  "toggle-mic": [];
}>();
</script>

<template>
  <div class="ez-room-shell">
    <p class="ez-kicker">Комната</p>
    <h1 class="ez-room-heading">{{ props.room.name }}</h1>

    <div class="ez-room-grid">
      <EzcordRoomStage
        :copied="props.copied"
        :is-mic-on="props.isMicOn"
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
        :max-room-participants="props.maxRoomParticipants"
        :participant-count="props.participantCount"
        :room="props.room"
        :status-message="props.statusMessage"
        @invite="$emit('invite')"
      />
    </div>
  </div>
</template>
