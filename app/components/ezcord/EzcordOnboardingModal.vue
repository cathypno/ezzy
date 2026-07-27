<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  completing?: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  complete: [];
}>();

const activeIndex = ref(0);

const slides = [
  {
    kicker: "Комнаты",
    title: "Залетай в голос",
    text: "Создавай комнату, включай микрофон и приглашай до пяти человек. По ссылке человек сразу попадает в нужную комнату.",
    tone: "green",
  },
  {
    kicker: "Лобби",
    title: "Ищи своих",
    text: "Фильтруй живые комнаты по игре и цели: войсчат, CS2, Dota 2, Brawl Stars, общение или результат.",
    tone: "blue",
  },
  {
    kicker: "Награды",
    title: "Открывай сундук",
    text: "За хост и активность копятся монеты. Трать их на сундук, получай лут и открывай новые украшения.",
    tone: "gold",
  },
] as const;

const activeSlide = computed(() => slides[activeIndex.value] || slides[0]);
const isLastSlide = computed(() => activeIndex.value === slides.length - 1);
const secondaryButtonLabel = computed(() => (activeIndex.value === 0 ? "Пропустить" : "Назад"));

watch(
  () => props.open,
  (open) => {
    if (open) activeIndex.value = 0;
  },
);

function goNext() {
  if (props.completing) return;
  if (!isLastSlide.value) {
    activeIndex.value += 1;
    return;
  }
  emit("complete");
}

function goSecondary() {
  if (props.completing) return;
  if (activeIndex.value === 0) {
    emit("complete");
    return;
  }
  activeIndex.value -= 1;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="fixed inset-0 z-50 grid place-items-center bg-black/80 px-2.5 py-2.5 backdrop-blur-[18px]"
      @click.self="$emit('close')"
    >
      <section
        class="relative grid max-h-[calc(100dvh-20px)] w-full max-w-[410px] overflow-hidden rounded-[22px] border border-ez-line bg-[#0b0e0b] shadow-[0_34px_100px_-34px_rgba(0,0,0,.96)]"
        role="dialog"
        aria-modal="true"
        aria-label="Онбординг Ezcord"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,226,30,.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,.045),transparent_44%)]"></div>

        <div class="relative flex items-center justify-between gap-3 px-4 pt-4">
          <div class="flex items-center gap-2.5">
            <span class="grid h-8 w-8 place-items-center rounded-[12px] border border-ez-green/25 bg-ez-green-soft text-ez-green">
              <EzcordLogo class="h-6 w-6 scale-x-[-1]" />
            </span>
            <span class="text-sm font-black uppercase tracking-[0.08em] text-ez-muted">Ezcord</span>
          </div>
          <button
            class="grid h-9 w-9 place-items-center rounded-xl border border-ez-line bg-ez-card text-lg font-black text-ez-muted transition hover:border-ez-green/45 hover:text-ez-green"
            type="button"
            aria-label="Закрыть онбординг"
            @click="$emit('close')"
          >
            ×
          </button>
        </div>

        <div class="relative min-h-0 overflow-y-auto px-4 pb-4 pt-3">
          <div class="rounded-[20px] border border-ez-line bg-black/34 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
            <div class="relative grid h-[clamp(172px,32dvh,230px)] place-items-center overflow-hidden rounded-[17px] border border-ez-line bg-[radial-gradient(circle_at_50%_35%,rgba(99,226,30,.16),transparent_42%),#070a07] min-[900px]:h-[270px]">
              <div class="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:34px_34px]"></div>

              <div v-if="activeIndex === 0" class="relative grid w-full gap-3 px-5">
                <div class="mx-auto flex items-center gap-3">
                  <span class="grid h-[58px] w-[58px] place-items-center rounded-full bg-ez-green text-xl font-black text-[#071407] shadow-[0_0_28px_rgba(99,226,30,.36)] min-[900px]:h-[72px] min-[900px]:w-[72px] min-[900px]:text-2xl">Вы</span>
                  <span class="h-px w-9 bg-gradient-to-r from-ez-green to-transparent min-[900px]:w-12"></span>
                  <span class="grid h-[48px] w-[48px] place-items-center rounded-full border-[3px] border-ez-green/80 bg-ez-card text-base font-black text-ez-ink min-[900px]:h-[56px] min-[900px]:w-[56px] min-[900px]:text-lg">AK</span>
                </div>
                <div class="mx-auto flex items-center gap-2 rounded-full border border-ez-green/30 bg-ez-green-soft px-3 py-1.5 text-xs font-black text-ez-green min-[900px]:px-4 min-[900px]:py-2 min-[900px]:text-sm">
                  <span class="h-2 w-2 rounded-full bg-ez-green"></span>
                  Комната активна
                </div>
                <div class="mx-auto grid h-12 w-full max-w-[230px] place-items-center overflow-hidden rounded-[16px] bg-white/[.07] min-[900px]:h-14 min-[900px]:max-w-[260px]">
                  <div class="flex h-8 items-center gap-1.5">
                    <span v-for="bar in 13" :key="bar" class="ez-voice-bar block w-1.5 rounded-full bg-ez-green" :style="{ height: `${14 + ((bar * 9) % 22)}px`, animationDelay: `${bar * 0.06}s` }"></span>
                  </div>
                </div>
              </div>

              <div v-else-if="activeIndex === 1" class="relative grid w-full gap-2.5 px-5 min-[900px]:gap-3 min-[900px]:px-7">
                <div class="grid grid-cols-2 gap-2">
                  <span class="rounded-[15px] border border-ez-green/30 bg-ez-green-soft px-3 py-2 text-sm font-black text-ez-green">CS2</span>
                  <span class="rounded-[15px] border border-[#ffd447]/25 bg-[#ffd447]/10 px-3 py-2 text-sm font-black text-[#ffd447]">Общение</span>
                </div>
                <div class="grid gap-2">
                  <div class="rounded-[15px] border border-ez-line bg-ez-card px-4 py-2.5 min-[900px]:py-3">
                    <p class="text-base font-black leading-none text-ez-ink min-[900px]:text-lg">Rin</p>
                    <p class="mt-1.5 text-xs font-black uppercase text-ez-muted min-[900px]:mt-2">Участники 2/5</p>
                  </div>
                  <div class="rounded-[15px] border border-ez-green/35 bg-ez-green-soft px-4 py-2.5 min-[900px]:py-3">
                    <p class="text-base font-black leading-none text-ez-ink min-[900px]:text-lg">KC2</p>
                    <p class="mt-1.5 text-xs font-black uppercase text-ez-green min-[900px]:mt-2">Подходит фильтру</p>
                  </div>
                </div>
                <div class="mx-auto grid h-10 w-10 place-items-center rounded-[14px] border border-ez-line bg-ez-card text-[22px] text-ez-green min-[900px]:h-12 min-[900px]:w-12 min-[900px]:text-[24px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M0 0h14v14H0z" fill="none" />
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9.5 4.75a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m0 5.5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m-5 .5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m0-4.5a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5m2.5 3a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5" />
                      <path d="M.96 10.269a3.13 3.13 0 0 0 2.753 2.76c1.07.119 2.167.221 3.287.221s2.218-.102 3.287-.222a3.13 3.13 0 0 0 2.753-2.76c.114-1.063.21-2.155.21-3.268s-.096-2.205-.21-3.269a3.13 3.13 0 0 0-2.753-2.76C9.217.853 8.12.75 7 .75S4.782.852 3.713.972A3.13 3.13 0 0 0 .96 3.732C.846 4.794.75 5.886.75 7s.096 2.205.21 3.269" />
                    </g>
                  </svg>
                </div>
              </div>

              <div v-else class="relative grid w-full gap-3 px-5 min-[900px]:gap-5 min-[900px]:px-7">
                <div class="mx-auto grid h-[104px] w-[104px] place-items-center rounded-[24px] border border-[#ffd447]/25 bg-[radial-gradient(circle_at_50%_28%,rgba(255,212,71,.28),transparent_54%),rgba(255,212,71,.08)] shadow-[0_0_44px_rgba(255,212,71,.16)] min-[900px]:h-[132px] min-[900px]:w-[132px] min-[900px]:rounded-[30px]">
                  <div class="grid h-[68px] w-[82px] place-items-center rounded-[17px] border border-[#ffd447]/40 bg-[#201806] text-[34px] text-[#ffd447] min-[900px]:h-[86px] min-[900px]:w-[104px] min-[900px]:text-[42px]">?</div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <span class="rounded-[16px] border border-ez-green/25 bg-ez-green-soft px-4 py-3">
                    <span class="block text-xs font-black uppercase text-ez-green">Монеты</span>
                    <span class="mt-1 block text-2xl font-black leading-none text-ez-green">+150</span>
                  </span>
                  <span class="rounded-[16px] border border-ez-line bg-ez-card px-4 py-3">
                    <span class="block text-xs font-black uppercase text-ez-muted">Лут</span>
                    <span class="mt-1 block text-2xl font-black leading-none text-ez-ink">Скин</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 text-center min-[900px]:mt-6">
            <p
              class="text-xs font-black uppercase tracking-[0.1em]"
              :class="{
                'text-ez-green': activeSlide.tone === 'green',
                'text-ez-blue': activeSlide.tone === 'blue',
                'text-[#ffd447]': activeSlide.tone === 'gold',
              }"
            >
              {{ activeSlide.kicker }}
            </p>
            <h2 class="mx-auto mt-1.5 max-w-[340px] text-[clamp(27px,7vw,32px)] font-black leading-[0.98] text-ez-ink min-[900px]:mt-2 min-[900px]:text-[34px]">{{ activeSlide.title }}</h2>
            <p class="mx-auto mt-2 max-w-[340px] text-[13px] font-extrabold leading-[1.42] text-ez-muted min-[900px]:mt-3 min-[900px]:text-sm min-[900px]:leading-[1.5]">{{ activeSlide.text }}</p>
          </div>

          <div class="mt-4 flex items-center justify-center gap-2 min-[900px]:mt-6">
            <button
              v-for="(_, index) in slides"
              :key="index"
              class="h-2.5 rounded-full transition-all"
              :class="index === activeIndex ? 'w-8 bg-ez-green' : 'w-2.5 bg-white/18'"
              type="button"
              :aria-label="`Слайд ${index + 1}`"
              @click="activeIndex = index"
            ></button>
          </div>

          <div class="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 min-[900px]:mt-7">
            <button
              class="inline-flex min-h-[48px] items-center justify-center rounded-[15px] border border-ez-line bg-ez-card px-4 text-sm font-black text-ez-muted transition hover:border-ez-green/45 hover:text-ez-green disabled:cursor-default disabled:opacity-40 min-[900px]:min-h-[52px] min-[900px]:rounded-[16px]"
              :disabled="props.completing"
              type="button"
              @click="goSecondary"
            >
              {{ secondaryButtonLabel }}
            </button>
            <button
              class="inline-flex min-h-[48px] items-center justify-center rounded-[15px] border border-ez-green/35 bg-ez-green px-5 text-[15px] font-black text-[#071407] shadow-[0_22px_44px_-24px_rgba(99,226,30,.8)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0 min-[900px]:min-h-[52px] min-[900px]:rounded-[16px]"
              :disabled="props.completing"
              type="button"
              @click="goNext"
            >
              {{ props.completing ? "Сохраняем" : isLastSlide ? "Начать" : "Дальше" }}
            </button>
          </div>

        </div>
      </section>
    </div>
  </Teleport>
</template>
