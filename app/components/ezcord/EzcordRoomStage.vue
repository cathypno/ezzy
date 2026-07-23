<script setup lang="ts">
import { computed } from "vue";
import { useEzcordVisualizerBars } from "~/composables/useEzcordVisualizerBars";
import type { Peer, Room } from "~/types/ezcord";
import { getInitials } from "~/utils/ezcord";

const props = defineProps<{
  copied: boolean;
  isMicOn: boolean;
  isLocalSpeaking: boolean;
  isWaiting: boolean;
  micLevel: number;
  peers: Peer[];
  room: Room;
  setAudioSink: (element: HTMLElement | null) => void;
  speakingPeerIds: string[];
  userId: string;
  userInitial: string;
  userPhotoUrl: string;
  waveBars: number[];
}>();

defineEmits<{
  invite: [];
  kick: [peerId: string];
  "toggle-mic": [];
}>();

const accessLabels: Record<Room["access"], string> = {
  public: "Открытая",
  private: "Приватная",
  telegram_chat: "Telegram-чат",
};

const accessGlyphs: Record<Room["access"], string> = {
  public: "PUB",
  private: "INV",
  telegram_chat: "TG",
};

function hideBrokenAvatar(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  image.classList.add("hidden");
  (image.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
}

function isPeerSpeaking(peerId: string) {
  return props.speakingPeerIds.includes(peerId);
}

const { barCount, barGridStyle, visualizerElement } = useEzcordVisualizerBars();

const visualizerBars = computed(() =>
  Array.from({ length: barCount.value }, (_, index) => {
    const base = props.waveBars[index % props.waveBars.length] || 32;
    const swell = Math.round(Math.abs(Math.sin(index * 0.72)) * 34);
    return Math.max(22, Math.min(96, Math.round((base + swell) * 0.92)));
  }),
);
</script>

<template>
  <section class="relative overflow-hidden rounded-[18px] bg-gradient-to-b from-ez-widget to-[#0d0f0d] p-[clamp(20px,2.5vw,28px)] text-white shadow-ez-stage max-[760px]:p-[18px]">
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="inline-flex min-h-7 items-center justify-center rounded-[9px] bg-ez-green-soft px-2.5 text-xs font-black text-ez-green-dark">{{ accessGlyphs[props.room.access] }}</span>
        <span class="inline-flex min-h-7 items-center justify-center rounded-[9px] bg-white/[.08] px-2.5 text-xs font-black text-ez-widget-muted">{{ accessLabels[props.room.access] }}</span>
        <span class="inline-flex min-h-[30px] items-center gap-2 rounded-full bg-ez-green-soft px-3 text-xs font-black text-ez-green-dark"><span class="h-[7px] w-[7px] shrink-0 rounded-full bg-ez-green shadow-[0_0_14px_rgba(99,226,30,0.58)]"></span>Активна</span>
      </div>
    </div>

    <div class="mt-[26px] flex flex-wrap gap-3.5">
      <div class="w-[74px] text-center">
        <div
          class="relative mx-auto grid h-[62px] w-[62px] place-items-center rounded-full border-[3px] text-[19px] font-black"
          :class="props.isWaiting ? 'border-dashed border-ez-widget-muted bg-ez-widget-field text-ez-widget-muted' : props.isLocalSpeaking ? 'animate-[ez-speaking-pulse_1.05s_ease-in-out_infinite] border-ez-green bg-ez-green text-[#082900] shadow-[0_0_26px_rgba(99,226,30,0.42)]' : 'border-transparent bg-ez-green text-[#082900]'"
        >
          <img
            v-if="props.userPhotoUrl"
            class="h-full w-full rounded-[inherit] object-cover"
            :src="props.userPhotoUrl"
            alt=""
            @error="hideBrokenAvatar"
          />
          <span class="text-inherit" :class="{ hidden: props.userPhotoUrl }">{{ props.userInitial }}</span>
        </div>
        <p class="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-extrabold text-ez-widget-muted">{{ props.isWaiting ? "в ожидании" : "вы" }}</p>
      </div>

      <div v-for="peer in props.peers" :key="peer.peerId" class="w-[74px] text-center">
        <div
          class="relative mx-auto grid h-[62px] w-[62px] place-items-center rounded-full border-[3px] bg-white/[.08] text-[19px] font-black text-white"
          :class="isPeerSpeaking(peer.peerId) ? 'animate-[ez-speaking-pulse_1.05s_ease-in-out_infinite] border-ez-green shadow-[0_0_24px_rgba(99,226,30,0.38)]' : 'border-transparent'"
        >
          <img
            v-if="peer.photoUrl"
            class="h-full w-full rounded-[inherit] object-cover"
            :src="peer.photoUrl"
            :alt="peer.displayName"
            @error="hideBrokenAvatar"
          />
          <span class="text-inherit" :class="{ hidden: peer.photoUrl }">{{ getInitials(peer.displayName) }}</span>
          <button
            v-if="props.room.createdBy === props.userId"
            class="absolute -right-[7px] -top-[7px] grid h-6 w-6 place-items-center rounded-full border-2 border-ez-widget bg-[#e5484d] text-xs font-black text-white"
            type="button"
            aria-label="Кикнуть участника"
            title="Кикнуть участника"
            @click="$emit('kick', peer.peerId)"
          >
            ×
          </button>
        </div>
        <p class="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-extrabold text-ez-widget-muted">{{ peer.displayName }}</p>
      </div>

      <button
        v-if="props.room.inviteUrl"
        class="grid h-[62px] w-[62px] place-items-center rounded-full text-[19px] font-black"
        :class="props.copied ? 'border-2 border-solid border-ez-green bg-ez-green text-[#082900] shadow-[0_0_24px_rgba(99,226,30,0.38)]' : 'border-2 border-dashed border-ez-widget-muted/55 bg-transparent text-ez-widget-muted'"
        type="button"
        :aria-label="
          props.copied
            ? 'Ссылка приглашения скопирована'
            : 'Скопировать ссылку приглашения'
        "
        :title="props.copied ? 'Скопировано' : 'Скопировать приглашение'"
        @click="$emit('invite')"
      >
        {{ props.copied ? "🔗" : "+" }}
      </button>
    </div>

    <div class="mt-7 grid items-end gap-4 [grid-template-columns:minmax(0,1fr)_86px] max-[760px]:[grid-template-columns:minmax(0,1fr)_78px]">
      <div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-widget-muted">Голос</span>
          <span class="text-xs font-black uppercase leading-[1.2]" :class="props.isMicOn ? 'text-[#ff4d4f]' : 'text-ez-widget-muted'">{{ props.isMicOn ? "Live" : "Muted" }}</span>
        </div>
        <div ref="visualizerElement" class="ez-voice-lava relative mt-2.5 h-[74px] overflow-hidden rounded-[14px] border border-white/[.04] bg-ez-widget-field p-3" :class="props.isMicOn ? 'opacity-100' : 'opacity-[.58]'">
          <div class="relative z-10 grid h-full items-end" :style="barGridStyle">
          <span
            v-for="(height, index) in visualizerBars"
            :key="index"
            class="ez-voice-bar min-h-3 w-[clamp(3px,0.34vw,5px)] origin-bottom justify-self-center rounded-full bg-gradient-to-t from-[#237e13] via-ez-green to-[#baff82]"
            :class="props.isMicOn ? '' : 'bg-none bg-ez-widget-muted/45'"
            :style="{
              height: `${Math.max(18, Math.round((height * (props.micLevel + 48)) / 138))}%`,
              animationDelay: `${index * -0.07}s`,
              animationDuration: `${0.9 + (index % 7) * 0.09}s`,
            }"
          />
          </div>
        </div>
      </div>
      <button
        class="grid h-[86px] w-[86px] place-items-center rounded-full text-[19px] font-black transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-[.55] disabled:hover:translate-y-0 max-[760px]:h-[78px] max-[760px]:w-[78px]"
        :class="props.isMicOn ? 'border border-transparent bg-ez-green text-[#082900] shadow-[0_0_38px_rgba(99,226,30,0.66)]' : 'border border-ez-widget-muted/58 bg-ez-widget-field text-ez-widget-muted'"
        :disabled="props.isWaiting"
        type="button"
        :title="props.isWaiting ? 'Место освободится — вы в очереди' : 'Переключить микрофон'"
        @click="$emit('toggle-mic')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          viewBox="0 0 24 24"
        >
          <path d="M0 0h24v24H0z" fill="none" />
          <path
            fill="currentColor"
            d="M9.875 13.125Q9 12.25 9 11V5q0-1.25.875-2.125T12 2t2.125.875T15 5v6q0 1.25-.875 2.125T12 14t-2.125-.875M11 20v-2.075q-2.3-.325-3.937-1.95t-1.988-3.95q-.05-.425.225-.725T6 11t.713.288T7.1 12q.35 1.75 1.738 2.875T12 16q1.8 0 3.175-1.137T16.9 12q.1-.425.388-.712T18 11t.7.3t.225.725q-.35 2.275-1.975 3.925T13 17.925V20q0 .425-.288.713T12 21t-.712-.288T11 20"
          />
        </svg>
      </button>
    </div>

    <div :ref="props.setAudioSink" class="pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden opacity-0"></div>
  </section>
</template>
