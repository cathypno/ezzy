<script setup lang="ts">
import { computed, ref, watch } from "vue";
import EzcordChestAnimation from "~/components/ezcord/EzcordChestAnimation.vue";
import type { ChestOpening, ChestState, User } from "~/types/ezcord";
import { formatEzcordPoints, getEzcordChestCost, getEzcordUserCoins, getEzcordUserLevel } from "~/utils/ezcord";

const props = defineProps<{
  open: boolean;
  user: User | null;
}>();

const emit = defineEmits<{
  close: [];
  "update-user": [user: User];
}>();

const chest = ref<ChestState | null>(null);
const errorMessage = ref("");
const isAnimating = ref(false);
const isLoading = ref(false);
const isOpening = ref(false);
const openingResult = ref<ChestOpening | null>(null);
const runId = ref(0);

const coins = computed(() => getEzcordUserCoins(props.user));
const level = computed(() => getEzcordUserLevel(props.user));
const nextCost = computed(() => chest.value?.nextCost ?? getEzcordChestCost(props.user?.chestOpenCount || 0));
const missingCoins = computed(() => Math.max(0, nextCost.value - coins.value));
const canPressButton = computed(() => Boolean(!isLoading.value && !isOpening.value && !isAnimating.value && (!chest.value || chest.value.canOpen)));
const buttonLabel = computed(() => {
  if (isLoading.value) return "Загрузка";
  if (isOpening.value) return "Открываем";
  if (isAnimating.value) return "Награда";
  if (!chest.value) return "Обновить";
  if (!chest.value.canOpen) return `Нужно еще ${missingCoins.value}`;
  return `Открыть за ${nextCost.value}`;
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadChest();
      return;
    }

    errorMessage.value = "";
    openingResult.value = null;
    isAnimating.value = false;
  },
  { immediate: true },
);

async function loadChest() {
  if (!props.user || isLoading.value) return;

  errorMessage.value = "";
  isLoading.value = true;

  try {
    const response = await $fetch<{ user: User; chest: ChestState }>("/api/ezcord/rewards/chest");
    chest.value = response.chest;
    emit("update-user", response.user);
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось загрузить сундук";
  } finally {
    isLoading.value = false;
  }
}

async function openChest() {
  if (!props.user || isOpening.value || isAnimating.value) return;
  if (!chest.value) {
    await loadChest();
    return;
  }
  if (!chest.value.canOpen) return;

  errorMessage.value = "";
  isOpening.value = true;
  openingResult.value = null;

  try {
    const response = await $fetch<{ user: User; chest: ChestState; opening: ChestOpening }>("/api/ezcord/rewards/chest/open", {
      method: "POST",
    });
    chest.value = response.chest;
    openingResult.value = response.opening;
    emit("update-user", response.user);
    isAnimating.value = true;
    runId.value += 1;
  } catch (error: any) {
    errorMessage.value = error?.data?.message || "Не получилось открыть сундук";
    await loadChest();
  } finally {
    isOpening.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="fixed inset-0 z-50 grid place-items-center bg-black/78 px-4 py-6 backdrop-blur-[18px]" @click.self="$emit('close')">
      <section class="relative grid max-h-[min(760px,calc(100vh-48px))] w-full max-w-[880px] overflow-hidden rounded-[22px] border border-ez-line bg-[#0b0e0b] shadow-[0_34px_100px_-36px_rgba(0,0,0,0.96)]">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_4%,rgba(99,226,30,.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,.045),transparent_32%)]"></div>

        <div class="relative flex items-start justify-between gap-4 border-b border-ez-line px-5 py-4 max-[560px]:px-4">
          <div>
            <p class="text-xs font-black uppercase leading-[1.2] text-ez-green">Награды</p>
            <h2 class="mt-1 text-[28px] font-black leading-none text-ez-ink max-[560px]:text-[24px]">Сундук</h2>
          </div>
          <button class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ez-line bg-ez-card text-xl font-black text-ez-muted transition hover:border-ez-green/45 hover:text-ez-green" type="button" aria-label="Закрыть" @click="$emit('close')">×</button>
        </div>

        <div class="relative min-h-0 overflow-y-auto p-5 max-[560px]:p-4">
          <div class="grid items-center gap-5 [grid-template-columns:minmax(0,1.18fr)_minmax(260px,.82fr)] max-[760px]:grid-cols-1">
            <div class="rounded-[20px] border border-ez-line bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
              <EzcordChestAnimation
                :lobby-unlocked="Boolean(openingResult?.lobbyUnlocked)"
                :reward-coins="openingResult?.coinsAwarded ?? null"
                :run-id="runId"
                @done="isAnimating = false"
              />
            </div>

            <div class="grid gap-3">
              <div class="grid grid-cols-2 gap-2.5">
                <div class="rounded-[16px] border border-ez-green/25 bg-ez-green-soft px-4 py-3">
                  <p class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-green">Монеты</p>
                  <p class="mt-2 text-[31px] font-black leading-none text-ez-green">{{ formatEzcordPoints(coins) }}</p>
                </div>
                <div class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3">
                  <p class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted">Уровень</p>
                  <p class="mt-2 text-[31px] font-black leading-none text-ez-ink">{{ level }}</p>
                </div>
              </div>

              <div class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted">Следующее открытие</span>
                  <span class="rounded-full border border-[#ffd447]/25 bg-[#ffd447]/10 px-2.5 py-1 text-xs font-black text-[#ffd447]">{{ nextCost }} монет</span>
                </div>
                <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]">
                  <div class="h-full rounded-full bg-ez-green transition-[width] duration-300" :style="{ width: `${Math.min(100, (coins / Math.max(1, nextCost)) * 100)}%` }"></div>
                </div>
              </div>

              <div class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3">
                <p class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted">Внутри</p>
                <p class="mt-2 text-sm font-extrabold leading-[1.45] text-ez-ink">
                  {{ chest?.minReward || 5 }}-{{ chest?.maxReward || 300 }} монет
                  <span v-if="chest?.lobbyUnlockAvailable" class="text-ez-green">+ доступ к лобби</span>
                </p>
              </div>

              <div v-if="openingResult" class="rounded-[16px] border border-[#ffd447]/30 bg-[#211808]/72 px-4 py-3">
                <p class="text-[11px] font-black uppercase tracking-[0.08em] text-[#ffd447]">Получено</p>
                <p class="mt-2 text-sm font-extrabold leading-[1.45] text-[#ffe29a]">
                  +{{ openingResult.coinsAwarded }} монет
                  <span v-if="openingResult.lobbyUnlocked">и лобби открыто</span>
                </p>
              </div>

              <p v-if="errorMessage" class="rounded-[14px] border border-[#e5484d]/35 bg-[#261012] px-4 py-3 text-sm font-extrabold leading-[1.35] text-[#ff9aa2]">{{ errorMessage }}</p>

              <button
                class="inline-flex min-h-[54px] items-center justify-center rounded-[16px] border border-ez-green/35 bg-ez-green px-5 text-[16px] font-black text-[#082900] shadow-[0_22px_44px_-24px_rgba(99,226,30,.8)] transition hover:-translate-y-px disabled:cursor-default disabled:border-ez-line disabled:bg-ez-card disabled:text-ez-muted disabled:shadow-none disabled:hover:translate-y-0"
                :disabled="!canPressButton"
                type="button"
                @click="openChest"
              >
                {{ buttonLabel }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
