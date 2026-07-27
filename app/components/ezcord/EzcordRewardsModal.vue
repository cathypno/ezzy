<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import EzcordChestAnimation from "~/components/ezcord/EzcordChestAnimation.vue";
import type { ChestOpening, ChestState, User } from "~/types/ezcord";
import {
  formatEzcordPoints,
  getEzcordChestCost,
  getEzcordUserCoins,
  getEzcordUserLevel,
} from "~/utils/ezcord";

const props = defineProps<{
  open: boolean;
  user: User | null;
}>();

const emit = defineEmits<{
  close: [];
  "update-user": [user: User];
}>();

const HITS_TO_OPEN = 4;
const HIT_RESET_MS = 1100;

const chest = ref<ChestState | null>(null);
const errorMessage = ref("");
const chestHitCount = ref(0);
const hitRunId = ref(0);
const isAnimating = ref(false);
const isLoading = ref(false);
const isOpening = ref(false);
const openingResult = ref<ChestOpening | null>(null);
const runId = ref(0);
let hitResetTimer = 0;

const coins = computed(() => getEzcordUserCoins(props.user));
const level = computed(() => getEzcordUserLevel(props.user));
const nextCost = computed(
  () =>
    chest.value?.nextCost ??
    getEzcordChestCost(props.user?.chestOpenCount || 0),
);
const missingCoins = computed(() => Math.max(0, nextCost.value - coins.value));
const progressPercent = computed(() =>
  Math.min(100, (coins.value / Math.max(1, nextCost.value)) * 100),
);
const shouldShowChest = computed(() =>
  Boolean(
    chest.value?.canOpen ||
      isOpening.value ||
      isAnimating.value ||
      openingResult.value,
  ),
);
const progressIsPartial = computed(
  () => progressPercent.value > 0 && progressPercent.value < 100,
);
const canPressButton = computed(() =>
  Boolean(
    !isLoading.value &&
    !isOpening.value &&
    !isAnimating.value &&
    (Boolean(openingResult.value) || !chest.value || chest.value.canOpen),
  ),
);
const canHitChest = computed(
  () => canPressButton.value && !Boolean(openingResult.value),
);
const buttonLabel = computed(() => {
  if (isLoading.value) return "Загрузка";
  if (isOpening.value) return "Открываем";
  if (isAnimating.value) return "Награда";
  if (openingResult.value) return "Закрыть окно";
  if (!chest.value) return "Обновить";
  if (!chest.value.canOpen) return `Нужно еще ${missingCoins.value}`;
  if (chestHitCount.value > 0)
    return `Ударить ${chestHitCount.value}/${HITS_TO_OPEN}`;
  return `Ударить сундук`;
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
    clearHitProgress();
  },
  { immediate: true },
);

onBeforeUnmount(clearHitProgress);

async function loadChest() {
  if (!props.user || isLoading.value) return;

  errorMessage.value = "";
  isLoading.value = true;

  try {
    const response = await $fetch<{ user: User; chest: ChestState }>(
      "/api/ezcord/rewards/chest",
    );
    chest.value = response.chest;
    emit("update-user", response.user);
  } catch (error: any) {
    errorMessage.value =
      error?.data?.message || "Не получилось загрузить сундук";
  } finally {
    isLoading.value = false;
  }
}

function registerChestHit() {
  if (!props.user || isLoading.value || isOpening.value || isAnimating.value)
    return;
  if (openingResult.value) return;
  if (!chest.value) {
    void loadChest();
    return;
  }
  if (!chest.value.canOpen) return;

  errorMessage.value = "";
  hitRunId.value += 1;
  window.clearTimeout(hitResetTimer);

  const nextHitCount = chestHitCount.value + 1;
  if (nextHitCount >= HITS_TO_OPEN) {
    chestHitCount.value = 0;
    void openChest();
    return;
  }

  chestHitCount.value = nextHitCount;
  hitResetTimer = window.setTimeout(() => {
    chestHitCount.value = 0;
    hitResetTimer = 0;
  }, HIT_RESET_MS);
}

function handleChestAction() {
  if (openingResult.value && !isOpening.value && !isAnimating.value) {
    emit("close");
    return;
  }

  registerChestHit();
}

function clearHitProgress() {
  if (hitResetTimer) {
    window.clearTimeout(hitResetTimer);
    hitResetTimer = 0;
  }
  chestHitCount.value = 0;
}

async function openChest() {
  if (!props.user || isOpening.value || isAnimating.value) return;
  if (!chest.value) {
    await loadChest();
    return;
  }
  if (!chest.value.canOpen) return;

  clearHitProgress();
  errorMessage.value = "";
  isOpening.value = true;
  openingResult.value = null;

  try {
    const response = await $fetch<{
      user: User;
      chest: ChestState;
      opening: ChestOpening;
    }>("/api/ezcord/rewards/chest/open", {
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
    <div
      v-if="props.open"
      class="fixed inset-0 z-50 grid place-items-center bg-black/78 px-4 py-6 backdrop-blur-[18px]"
      @click.self="$emit('close')"
    >
      <section
        class="relative grid max-h-[min(760px,calc(100vh-48px))] w-full max-w-[880px] overflow-hidden rounded-[22px] border border-ez-line bg-[#0b0e0b] shadow-[0_34px_100px_-36px_rgba(0,0,0,0.96)]"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_4%,rgba(99,226,30,.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,.045),transparent_32%)]"
        ></div>

        <div
          class="relative flex items-start justify-between gap-4 border-b border-ez-line px-5 py-4 max-[560px]:px-4"
        >
          <div>
            <p class="text-xs font-black uppercase leading-[1.2] text-ez-green">
              Награды
            </p>
            <h2
              class="mt-1 text-[28px] font-black leading-none text-ez-ink max-[560px]:text-[24px]"
            >
              Сундук
            </h2>
          </div>
          <button
            class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ez-line bg-ez-card text-xl font-black text-ez-muted transition hover:border-ez-green/45 hover:text-ez-green"
            type="button"
            aria-label="Закрыть"
            @click="$emit('close')"
          >
            ×
          </button>
        </div>

        <div class="relative min-h-0 overflow-y-auto p-5 max-[560px]:p-4">
          <div
            class="grid items-center gap-5 [grid-template-columns:minmax(0,1.18fr)_minmax(260px,.82fr)] max-[760px]:grid-cols-1"
          >
            <div
              class="rounded-[20px] border border-ez-line bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
            >
              <EzcordChestAnimation
                v-if="shouldShowChest"
                :disabled="!canHitChest"
                :hit-count="chestHitCount"
                :hit-run-id="hitRunId"
                :hit-target="HITS_TO_OPEN"
                :lobby-unlocked="Boolean(openingResult?.lobbyUnlocked)"
                :reward-coins="openingResult?.coinsAwarded ?? null"
                :run-id="runId"
                @done="isAnimating = false"
                @hit="registerChestHit"
              />
              <div v-else class="grid min-h-[300px] place-items-center rounded-[18px] border border-ez-line bg-[radial-gradient(circle_at_50%_20%,rgba(99,226,30,.12),transparent_42%),rgba(255,255,255,.02)] px-5 text-center max-[560px]:min-h-[250px]">
                <div class="mx-auto max-w-[330px]">
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-ez-line bg-ez-card text-[30px] text-ez-muted shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                      <path d="M0 0h24v24H0z" fill="none" />
                      <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5m-3 7V7a3 3 0 1 1 6 0v2zm4 5.73V17a1 1 0 1 1-2 0v-2.27a2 2 0 1 1 2 0" />
                    </svg>
                  </div>
                  <p class="mt-4 text-[20px] font-black leading-none text-ez-ink">{{ isLoading ? "Проверяем сундук" : "Сундук пока закрыт" }}</p>
                  <p class="mx-auto mt-2 text-sm font-extrabold leading-[1.45] text-ez-muted">
                    {{ isLoading ? "Считаем баланс и стоимость следующего открытия." : "Как только наберете достаточно монет, появится возможность открыть сундук." }}
                  </p>
                </div>
              </div>
            </div>

            <div class="grid gap-3">
              <div class="grid grid-cols-2 gap-2.5">
                <div
                  class="rounded-[16px] border border-ez-green/25 bg-ez-green-soft px-4 py-3"
                >
                  <p
                    class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-green"
                  >
                    Монеты
                  </p>
                  <p
                    class="mt-2 text-[31px] font-black leading-none text-ez-green"
                  >
                    {{ formatEzcordPoints(coins) }}
                  </p>
                </div>
                <div
                  class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3"
                >
                  <p
                    class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted"
                  >
                    Уровень
                  </p>
                  <p
                    class="mt-2 text-[31px] font-black leading-none text-ez-ink"
                  >
                    {{ level }}
                  </p>
                </div>
              </div>

              <div
                class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <span
                    class="text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted"
                    >Следующее открытие</span
                  >
                  <span
                    class="rounded-full border border-[#ffd447]/25 bg-[#ffd447]/10 px-2.5 py-1 text-xs font-black text-[#ffd447]"
                    >{{ nextCost }} монет</span
                  >
                </div>
                <div
                  class="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]"
                >
                  <div
                    class="h-full rounded-full bg-ez-green transition-[width] duration-300"
                    :class="progressIsPartial ? 'ez-chest-progress-fill' : ''"
                    :style="{
                      width: `${progressPercent}%`,
                    }"
                  ></div>
                </div>
              </div>

              <div
                v-if="openingResult"
                class="rounded-[16px] border border-[#ffd447]/30 bg-[#211808]/72 px-4 py-3"
              >
                <p
                  class="text-[11px] font-black uppercase tracking-[0.08em] text-[#ffd447]"
                >
                  Получено
                </p>
                <p
                  class="mt-2 text-sm font-extrabold leading-[1.45] text-[#ffe29a]"
                >
                  +{{ openingResult.coinsAwarded }} монет
                  <span v-if="openingResult.lobbyUnlocked"
                    >и лобби открыто</span
                  >
                </p>
              </div>

              <p
                v-if="errorMessage"
                class="rounded-[14px] border border-[#e5484d]/35 bg-[#261012] px-4 py-3 text-sm font-extrabold leading-[1.35] text-[#ff9aa2]"
              >
                {{ errorMessage }}
              </p>

              <button
                class="inline-flex min-h-[54px] items-center justify-center rounded-[16px] border border-ez-green/35 bg-ez-green px-5 text-[16px] font-black text-[#082900] shadow-[0_22px_44px_-24px_rgba(99,226,30,.8)] transition hover:-translate-y-px disabled:cursor-default disabled:border-ez-line disabled:bg-ez-card disabled:text-ez-muted disabled:shadow-none disabled:hover:translate-y-0"
                :disabled="!canPressButton"
                type="button"
                @click="handleChestAction"
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
