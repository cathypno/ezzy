<script setup lang="ts">
import type { Room } from "~/types/ezcord";

const props = defineProps<{
  connectedCount: number;
  copied: boolean;
  errorMessage: string;
  maxRoomParticipants: number;
  participantCount: number;
  room: Room;
  statusMessage: string;
}>();

defineEmits<{
  invite: [];
}>();
</script>

<template>
  <aside class="ez-stack">
    <div class="ez-stat-card">
      <p class="ez-kicker">Участники</p>
      <p class="ez-stat-value">
        {{ props.participantCount }}/{{ props.maxRoomParticipants }}
      </p>
    </div>

    <button
      v-if="props.room.inviteUrl"
      class="ez-secondary"
      type="button"
      @click="$emit('invite')"
    >
      {{ props.copied ? "Скопировано" : "Пригласить" }}
    </button>
    <p v-if="props.errorMessage" class="ez-alert ez-alert--error">
      {{ props.errorMessage }}
    </p>
    <p v-if="props.statusMessage" class="ez-alert ez-alert--status">
      {{ props.statusMessage }}
    </p>
  </aside>
</template>
