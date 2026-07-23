<script setup lang="ts">
import { computed, ref } from "vue";
import type { Room, RoomGame, RoomGoal } from "~/types/ezcord";

const props = defineProps<{
  loading: boolean;
  open: boolean;
  rooms: Room[];
}>();

const emit = defineEmits<{
  close: [];
  empty: [];
  join: [room: Room];
}>();

const gameFilter = ref<RoomGame | "all">("all");
const goalFilter = ref<RoomGoal | "all">("all");

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

const filteredRooms = computed(() =>
  props.rooms.filter((room) => {
    if (gameFilter.value !== "all" && room.game !== gameFilter.value) return false;
    if (goalFilter.value !== "all" && room.goal !== goalFilter.value) return false;
    return true;
  }),
);

function joinRandomRoom() {
  const pool = filteredRooms.value;
  if (!pool.length) {
    emit("empty");
    return;
  }

  emit("join", pool[Math.floor(Math.random() * pool.length)]);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-[16px]" @click.self="$emit('close')">
      <section class="grid max-h-[min(720px,calc(100vh-48px))] w-full max-w-[760px] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-ez-line bg-[#0b0e0b] shadow-[0_30px_90px_-32px_rgba(0,0,0,0.95)]">
        <div class="flex items-start justify-between gap-4 border-b border-ez-line px-5 py-4">
          <div>
            <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Лобби</p>
            <h2 class="mt-1 text-[28px] font-black leading-none text-ez-ink">Комнаты</h2>
          </div>
          <button class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ez-line bg-ez-card text-xl font-black text-ez-muted transition hover:border-ez-green/45 hover:text-ez-green" type="button" aria-label="Закрыть лобби" @click="$emit('close')">×</button>
        </div>

        <div class="grid gap-2.5 border-b border-ez-line px-5 py-4 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_52px] max-[640px]:grid-cols-1">
          <label class="block">
            <span class="text-[11px] font-black uppercase leading-[1.2] text-ez-muted">Игра</span>
            <select v-model="gameFilter" class="mt-2 h-11 w-full rounded-[13px] border border-ez-field-line bg-ez-field px-3 text-sm font-extrabold text-ez-ink outline-none focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
              <option value="all">Любая</option>
              <option value="voicechat">Войсчат</option>
              <option value="cs2">CS2</option>
              <option value="dota2">Dota 2</option>
              <option value="brawl_stars">Brawl Stars</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[11px] font-black uppercase leading-[1.2] text-ez-muted">Цель</span>
            <select v-model="goalFilter" class="mt-2 h-11 w-full rounded-[13px] border border-ez-field-line bg-ez-field px-3 text-sm font-extrabold text-ez-ink outline-none focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
              <option value="all">Любая</option>
              <option value="communication">Общение</option>
              <option value="result">Результат</option>
            </select>
          </label>
          <button
            class="mt-[19px] grid h-11 w-[52px] place-items-center rounded-[13px] border border-ez-green/35 bg-ez-green-soft text-[21px] text-ez-green transition hover:-translate-y-px hover:border-ez-green disabled:cursor-default disabled:opacity-[.45] disabled:hover:translate-y-0 max-[640px]:mt-0 max-[640px]:w-full"
            :disabled="props.loading || !filteredRooms.length"
            type="button"
            aria-label="Случайная комната"
            title="Случайная комната"
            @click="joinRandomRoom"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 14 14">
              <path d="M0 0h14v14H0z" fill="none" />
              <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.5 4.75a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m0 5.5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m-5 .5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m0-4.5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m2.5 3a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5" />
                <path d="M.96 10.269a3.13 3.13 0 0 0 2.753 2.76c1.07.119 2.167.221 3.287.221s2.218-.102 3.287-.222a3.13 3.13 0 0 0 2.753-2.76c.114-1.063.21-2.155.21-3.268s-.096-2.205-.21-3.269a3.13 3.13 0 0 0-2.753-2.76C9.217.853 8.12.75 7 .75S4.782.852 3.713.972A3.13 3.13 0 0 0 .96 3.732C.846 4.794.75 5.886.75 7s.096 2.205.21 3.269" />
              </g>
            </svg>
          </button>
        </div>

        <div class="min-h-0 overflow-y-auto px-5 py-4">
          <div v-if="props.loading" class="grid gap-2.5">
            <div v-for="index in 4" :key="index" class="h-[74px] animate-pulse rounded-[16px] border border-ez-line bg-ez-card"></div>
          </div>
          <div v-else-if="!filteredRooms.length" class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-5 text-sm font-extrabold text-ez-muted">
            Нет комнат под фильтр
          </div>
          <div v-else class="grid gap-2.5">
            <button
              v-for="room in filteredRooms"
              :key="room.id"
              class="grid min-h-[74px] gap-2 rounded-[16px] border border-ez-line bg-ez-card px-4 py-3 text-left transition hover:-translate-y-px hover:border-ez-green/45"
              type="button"
              @click="$emit('join', room)"
            >
              <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[17px] font-black leading-none text-ez-ink">{{ room.name }}</span>
              <span class="flex flex-wrap gap-2">
                <span class="rounded-full border border-ez-line bg-ez-card-2 px-2.5 py-1 text-[11px] font-black text-ez-muted">{{ gameLabels[room.game] }}</span>
                <span class="rounded-full border border-ez-line bg-ez-card-2 px-2.5 py-1 text-[11px] font-black text-ez-muted">{{ goalLabels[room.goal] }}</span>
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
