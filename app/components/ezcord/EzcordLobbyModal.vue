<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
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

const gameFilter = ref<RoomGame>("voicechat");
const goalFilter = ref<RoomGoal>("communication");
const searchOpen = ref(false);
const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);

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

const selectedGameIcon = computed(() => gameFilter.value);
const selectedGoalIcon = computed(() => goalFilter.value);

const activeRooms = computed(() => props.rooms.filter((room) => getParticipantCount(room) > 0));
const filteredRooms = computed(() =>
  activeRooms.value.filter((room) => {
    if (room.game !== gameFilter.value) return false;
    if (room.goal !== goalFilter.value) return false;
    if (searchQuery.value.trim() && !room.name.toLowerCase().includes(searchQuery.value.trim().toLowerCase())) return false;
    return true;
  }),
);

const emptyStateTitle = computed(() => (activeRooms.value.length ? "Комнат не найдено" : "Комнат нет"));
const emptyStateSubtitle = computed(() => (activeRooms.value.length ? "Попробуй изменить игру, цель или поиск." : "Живые комнаты появятся здесь, когда в них зайдут участники."));

function getParticipantCount(room: Room) {
  return Math.max(0, room.participantCount || 0);
}

function getMaxParticipants(room: Room) {
  return room.maxParticipants || 5;
}

function openSearch() {
  searchOpen.value = true;
  void nextTick(() => searchInputRef.value?.focus());
}

function clearSearch() {
  searchQuery.value = "";
  searchOpen.value = false;
}

function joinRandomRoom() {
  const pool = filteredRooms.value;
  if (!pool.length) {
    emit("empty");
    return;
  }

  const room = pool[Math.floor(Math.random() * pool.length)];
  if (room) emit("join", room);
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

        <div class="border-b border-ez-line px-5 py-3">
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px_44px] gap-2">
            <label class="block min-w-0">
              <span class="sr-only">Игра</span>
              <span class="relative block">
                <EzcordMetaIcon v-if="selectedGameIcon" :name="selectedGameIcon" class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[18px] text-ez-green" />
                <select v-model="gameFilter" class="h-11 w-full appearance-none rounded-[13px] border border-ez-field-line bg-ez-field py-0 pl-10 pr-8 text-sm font-extrabold text-ez-ink outline-none focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
                  <option value="voicechat">Войсчат</option>
                  <option value="cs2">CS2</option>
                  <option value="dota2">Dota 2</option>
                  <option value="brawl_stars">Brawl Stars</option>
                </select>
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-ez-muted">⌄</span>
              </span>
            </label>
            <label class="block min-w-0">
              <span class="sr-only">Цель</span>
              <span class="relative block">
                <EzcordMetaIcon v-if="selectedGoalIcon" :name="selectedGoalIcon" class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[18px] text-[#ffd447]" />
                <select v-model="goalFilter" class="h-11 w-full appearance-none rounded-[13px] border border-ez-field-line bg-ez-field py-0 pl-10 pr-8 text-sm font-extrabold text-ez-ink outline-none focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
                  <option value="communication">Общение</option>
                  <option value="result">Результат</option>
                </select>
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-ez-muted">⌄</span>
              </span>
            </label>
            <button
              class="grid h-11 w-11 place-items-center rounded-[13px] border text-[20px] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.45] disabled:hover:translate-y-0"
              :class="searchOpen || searchQuery ? 'border-ez-green/50 bg-ez-green-soft text-ez-green' : 'border-ez-line bg-ez-card text-ez-muted hover:border-ez-green/45 hover:text-ez-green'"
              :disabled="props.loading"
              type="button"
              aria-label="Поиск комнаты"
              title="Поиск комнаты"
              @click="openSearch"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                <path d="M0 0h24v24H0z" fill="none" />
                <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6" />
              </svg>
            </button>
            <button
              class="grid h-11 w-11 place-items-center rounded-[13px] border border-ez-green/35 bg-ez-green-soft text-[21px] text-ez-green transition hover:-translate-y-px hover:border-ez-green disabled:cursor-default disabled:opacity-[.45] disabled:hover:translate-y-0"
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
          <label v-if="searchOpen || searchQuery" class="relative mt-2 block">
            <span class="sr-only">Поиск по названию комнаты</span>
            <svg class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ez-muted" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M0 0h24v24H0z" fill="none" />
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="h-11 w-full rounded-[13px] border border-ez-field-line bg-ez-field py-0 pl-10 pr-11 text-sm font-extrabold text-ez-ink outline-none placeholder:text-ez-muted/60 focus:border-ez-green focus:ring-4 focus:ring-ez-green/20"
              placeholder="Название комнаты"
              type="search"
            />
            <button v-if="searchQuery" class="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-sm font-black text-ez-muted transition hover:bg-white/5 hover:text-ez-ink" type="button" aria-label="Очистить поиск" @click="clearSearch">×</button>
          </label>
        </div>

        <div class="min-h-0 overflow-y-auto px-5 py-4">
          <div v-if="props.loading" class="grid gap-2.5">
            <div v-for="index in 4" :key="index" class="h-[74px] animate-pulse rounded-[16px] border border-ez-line bg-ez-card"></div>
          </div>
          <div v-else-if="!filteredRooms.length" class="grid min-h-[190px] place-items-center rounded-[18px] border border-ez-line bg-ez-card px-5 py-8 text-center">
            <div>
              <div class="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-ez-line bg-ez-card-2 text-[38px] text-ez-muted">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256">
                  <path d="M0 0h256v256H0z" fill="none" />
                  <path fill="currentColor" d="m198.24 62.63l15.68-17.25a8 8 0 0 0-11.84-10.76L186.4 51.86A95.95 95.95 0 0 0 57.76 193.37l-15.68 17.25a8 8 0 1 0 11.84 10.76l15.68-17.24A95.95 95.95 0 0 0 198.24 62.63M48 128a80 80 0 0 1 127.6-64.25l-107 117.73A79.63 79.63 0 0 1 48 128m80 80a79.55 79.55 0 0 1-47.6-15.75l107-117.73A79.95 79.95 0 0 1 128 208" />
                </svg>
              </div>
              <p class="mt-4 text-xl font-black leading-none text-ez-ink">{{ emptyStateTitle }}</p>
              <p class="mx-auto mt-2 max-w-[320px] text-sm font-bold leading-[1.35] text-ez-muted">{{ emptyStateSubtitle }}</p>
            </div>
          </div>
          <div v-else class="grid gap-2.5">
            <button
              v-for="room in filteredRooms"
              :key="room.id"
              class="grid min-h-[74px] grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[16px] border border-ez-line bg-ez-card px-4 py-3 text-left transition hover:-translate-y-px hover:border-ez-green/45"
              type="button"
              @click="$emit('join', room)"
            >
              <span class="min-w-0">
                <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[17px] font-black leading-none text-ez-ink">{{ room.name }}</span>
                <span class="mt-2 flex min-w-0 flex-wrap gap-2">
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-ez-line bg-ez-card-2 px-2.5 py-1 text-[11px] font-black text-ez-muted">
                    <EzcordMetaIcon :name="room.game" class="text-[14px] text-ez-green" />
                    {{ gameLabels[room.game] }}
                  </span>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-ez-line bg-ez-card-2 px-2.5 py-1 text-[11px] font-black text-ez-muted">
                    <EzcordMetaIcon :name="room.goal" class="text-[14px] text-[#ffd447]" />
                    {{ goalLabels[room.goal] }}
                  </span>
                </span>
              </span>
              <span class="self-start whitespace-nowrap rounded-full border border-ez-green/30 bg-ez-green-soft px-2.5 py-1 text-[11px] font-black uppercase text-ez-green">
                Участники {{ getParticipantCount(room) }}/{{ getMaxParticipants(room) }}
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
