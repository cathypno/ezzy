<script setup lang="ts">
import type { Peer, Room } from "~/types/ezcord";
import { getInitials } from "~/utils/ezcord";

const props = defineProps<{
  copied: boolean;
  isMicOn: boolean;
  isWaiting: boolean;
  micLevel: number;
  peers: Peer[];
  room: Room;
  setAudioSink: (element: HTMLElement | null) => void;
  userId: string;
  userInitial: string;
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
</script>

<template>
  <section class="ez-room-stage">
    <div class="ez-room-top">
      <div class="ez-room-tags">
        <span class="ez-badge">{{ accessGlyphs[props.room.access] }}</span>
        <span class="ez-badge ez-badge--muted">{{
          accessLabels[props.room.access]
        }}</span>
        <span class="ez-live"><span class="ez-dot"></span>Активна</span>
      </div>
    </div>

    <div class="ez-participants">
      <div class="ez-peer">
        <div class="ez-peer-circle ez-peer-circle--self" :class="{ 'ez-peer-circle--waiting': props.isWaiting }">
          {{ props.userInitial }}
        </div>
        <p class="ez-peer-label">{{ props.isWaiting ? "в ожидании" : "вы" }}</p>
      </div>

      <div v-for="peer in props.peers" :key="peer.peerId" class="ez-peer">
        <div class="ez-peer-circle">
          {{ getInitials(peer.displayName) }}
          <button
            v-if="props.room.createdBy === props.userId"
            class="ez-kick"
            type="button"
            aria-label="Кикнуть участника"
            title="Кикнуть участника"
            @click="$emit('kick', peer.peerId)"
          >
            ×
          </button>
        </div>
        <p class="ez-peer-label">{{ peer.displayName }}</p>
      </div>

      <button
        v-if="props.room.inviteUrl"
        class="ez-circle-btn"
        :class="{ 'ez-circle-btn--copied': props.copied }"
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

    <div class="ez-voice-control">
      <div>
        <div class="ez-voice-labels">
          <span class="ez-kicker">Голос</span>
          <span class="ez-kicker">{{ props.isMicOn ? "Live" : "Muted" }}</span>
        </div>
        <div class="ez-wave" :class="{ 'ez-wave--muted': !props.isMicOn }">
          <span
            v-for="height in props.waveBars"
            :key="height"
            :style="{
              height: `${Math.max(12, Math.round((height * (props.micLevel + 28)) / 100))}px`,
            }"
          ></span>
        </div>
        <button
          class="ez-mic"
          :class="{ 'ez-mic--on': props.isMicOn, 'ez-mic--disabled': props.isWaiting }"
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
    </div>

    <div :ref="props.setAudioSink" class="hidden"></div>
  </section>
</template>
