<script setup lang="ts">
import type { Room, VoiceConnectionDiagnostic } from "~/types/ezcord";

const props = defineProps<{
  connectionDiagnostics: VoiceConnectionDiagnostic[];
  errorMessage: string;
  isWaiting: boolean;
  maxRoomParticipants: number;
  participantCount: number;
  room: Room;
  statusMessage: string;
  waitingCount: number;
}>();

function formatDiagnosticState(value: string) {
  return value === "new" ? "ожидание" : value;
}
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
    <p v-if="props.isWaiting" class="rounded-[18px] border border-ez-blue/35 bg-ez-blue-soft px-4 py-3.5 text-[13px] font-extrabold text-ez-blue">
      Вы в ожидании свободного места
    </p>
    <div v-if="props.connectionDiagnostics.length" class="rounded-[18px] border border-ez-line bg-ez-card px-4 py-3.5 text-[12px] font-extrabold text-ez-muted">
      <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Связь</p>
      <div v-for="diagnostic in props.connectionDiagnostics" :key="diagnostic.peerId" class="mt-2 grid gap-1">
        <p>ICE: {{ formatDiagnosticState(diagnostic.iceConnectionState) }}</p>
        <p>RTC: {{ formatDiagnosticState(diagnostic.connectionState) }}</p>
        <p v-if="diagnostic.selectedCandidateType">Route: {{ diagnostic.selectedCandidateType }}</p>
        <p v-if="diagnostic.hasRemoteAudioTrack">Audio track: да</p>
        <p v-if="diagnostic.autoplayBlocked" class="text-[#ff9aa2]">Audio play: заблокирован</p>
      </div>
    </div>
    <p v-if="props.errorMessage" class="rounded-[18px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">
      {{ props.errorMessage }}
    </p>
    <p v-if="props.statusMessage" class="rounded-[18px] border border-ez-green/35 bg-ez-green-soft px-4 py-3.5 text-[13px] font-extrabold text-ez-green-dark">
      {{ props.statusMessage }}
    </p>
  </aside>
</template>
