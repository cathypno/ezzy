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
  <div v-if="props.open" class="ez-modal-backdrop" @click.self="$emit('close')">
    <section class="ez-modal" role="dialog" aria-modal="true" aria-labelledby="ez-room-settings-title">
      <div class="ez-modal-head">
        <div>
          <p class="ez-kicker">Настройки комнаты</p>
          <h2 id="ez-room-settings-title" class="ez-modal-title">Изменить комнату</h2>
        </div>
        <button class="ez-modal-close" type="button" aria-label="Закрыть" title="Закрыть" @click="$emit('close')">×</button>
      </div>

      <form class="ez-form ez-room-settings-form" @submit.prevent="submit">
        <label class="ez-field">
          <span class="ez-label">Название</span>
          <input v-model="name" class="ez-input" maxlength="80" autocomplete="off" autofocus placeholder="Название комнаты" type="text" />
        </label>

        <label class="ez-field">
          <span class="ez-label">Игра</span>
          <select v-model="game" class="ez-select">
            <option v-for="(label, value) in gameLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>

        <label class="ez-field">
          <span class="ez-label">Цель</span>
          <select v-model="goal" class="ez-select">
            <option v-for="(label, value) in goalLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>

        <div class="ez-modal-actions">
          <button class="ez-secondary" type="button" @click="$emit('close')">Отмена</button>
          <button class="ez-primary" :disabled="props.saving" type="submit">
            {{ props.saving ? "Сохраняем..." : "Сохранить" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
