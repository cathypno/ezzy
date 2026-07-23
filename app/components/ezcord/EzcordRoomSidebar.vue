<script setup lang="ts">
import type { Room } from "~/types/ezcord";

const props = defineProps<{
  connectedCount: number;
  copied: boolean;
  errorMessage: string;
  isWaiting: boolean;
  maxRoomParticipants: number;
  participantCount: number;
  room: Room;
  statusMessage: string;
  waitingCount: number;
}>();

defineEmits<{
  invite: [];
}>();
</script>

<template>
  <aside class="grid min-w-0 content-start gap-[18px] max-[900px]:grid-cols-2 max-[760px]:grid-cols-1">
    <div class="rounded-[18px] border border-ez-green/28 bg-ez-green-soft p-[18px] shadow-ez">
      <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Участники</p>
      <p class="mt-3 text-[38px] font-black leading-none text-ez-ink">
        {{ props.participantCount }}/{{ props.maxRoomParticipants }}
      </p>
      <p v-if="props.waitingCount" class="mt-2.5 text-[13px] font-black text-ez-green-dark">
        В ожидании: {{ props.waitingCount }}
      </p>
    </div>
    <button
      v-if="props.room.inviteUrl"
      class="inline-flex min-h-[50px] items-center justify-center rounded-[14px] border border-ez-line bg-ez-card px-[18px] text-[15px] font-black text-ez-ink shadow-ez transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
      type="button"
      @click="$emit('invite')"
    >
      {{ props.copied ? "Скопировано" : "Пригласить" }}
    </button>
    <p v-if="props.isWaiting" class="rounded-[18px] border border-ez-blue/35 bg-ez-blue-soft px-4 py-3.5 text-[13px] font-extrabold text-ez-blue">
      Вы в ожидании свободного места
    </p>
    <p v-if="props.errorMessage" class="rounded-[18px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">
      {{ props.errorMessage }}
    </p>
    <p v-if="props.statusMessage" class="rounded-[18px] border border-ez-green/35 bg-ez-green-soft px-4 py-3.5 text-[13px] font-extrabold text-ez-green-dark">
      {{ props.statusMessage }}
    </p>
  </aside>
</template>
