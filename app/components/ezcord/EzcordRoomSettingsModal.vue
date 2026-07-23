<script setup lang="ts">
import { ref, watch } from "vue";
import type { Room, RoomGame, RoomGoal } from "~/types/ezcord";

const props = defineProps<{
  open: boolean;
  room: Room;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: { name: string; game: RoomGame; goal: RoomGoal }];
}>();

const name = ref("");
const game = ref<RoomGame>("voicechat");
const goal = ref<RoomGoal>("communication");

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

function resetDraft() {
  name.value = props.room.name;
  game.value = props.room.game || "voicechat";
  goal.value = props.room.goal || "communication";
}

watch(
  () => [props.open, props.room.id, props.room.name, props.room.game, props.room.goal],
  () => {
    if (props.open) resetDraft();
  },
  { immediate: true },
);

function submit() {
  emit("save", { name: name.value, game: game.value, goal: goal.value });
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 grid place-items-center bg-[rgba(5,8,5,0.56)] p-5 backdrop-blur-lg" @click.self="$emit('close')">
    <section class="max-h-[min(720px,calc(100vh-40px))] w-full max-w-[460px] overflow-auto rounded-[18px] border border-ez-line bg-ez-card p-[22px] shadow-[0_28px_70px_-30px_rgba(0,0,0,0.72)]" role="dialog" aria-modal="true" aria-labelledby="ez-room-settings-title">
      <div class="flex items-start justify-between gap-[18px]">
        <div>
          <p class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Настройки комнаты</p>
          <h2 id="ez-room-settings-title" class="mt-2 text-2xl font-black leading-[1.05] text-ez-ink">Изменить комнату</h2>
        </div>
        <button class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-ez-line bg-ez-field text-[22px] leading-none text-ez-muted" type="button" aria-label="Закрыть" title="Закрыть" @click="$emit('close')">×</button>
      </div>

      <form class="mt-[22px] grid gap-3.5" @submit.prevent="submit">
        <label class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Название</span>
          <input v-model="name" class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition placeholder:text-ez-muted/70 focus:border-ez-green focus:ring-4 focus:ring-ez-green/20" maxlength="80" autocomplete="off" autofocus placeholder="Название комнаты" type="text" />
        </label>

        <label class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Игра</span>
          <select v-model="game" class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
            <option v-for="(label, value) in gameLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>

        <label class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Цель</span>
          <select v-model="goal" class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition focus:border-ez-green focus:ring-4 focus:ring-ez-green/20">
            <option v-for="(label, value) in goalLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>

        <div class="mt-1 flex justify-end gap-2.5 max-[760px]:grid max-[760px]:grid-cols-2">
          <button class="inline-flex min-h-[50px] min-w-[120px] items-center justify-center rounded-[14px] border border-ez-line bg-ez-card px-[18px] text-[15px] font-black text-ez-ink shadow-ez transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0 max-[760px]:min-w-0" type="button" @click="$emit('close')">Отмена</button>
          <button class="inline-flex min-h-[50px] min-w-[120px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8ef25a] to-ez-green-dark px-[18px] text-[15px] font-black text-[#082900] shadow-[0_14px_30px_-12px_rgba(82,207,28,0.72)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0 max-[760px]:min-w-0" :disabled="props.saving" type="submit">
            {{ props.saving ? "Сохраняем..." : "Сохранить" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
