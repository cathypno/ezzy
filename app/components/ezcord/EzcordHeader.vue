<script setup lang="ts">
import { ref } from "vue";
import type { User } from "~/types/ezcord";
import { formatEzcordPoints, getEzcordLevel } from "~/utils/ezcord";

defineProps<{
  canUseLobby: boolean;
  user: User | null;
}>();

const emit = defineEmits<{
  "open-lobby": [];
}>();

const rewardsOpen = ref(false);

function openLobby() {
  rewardsOpen.value = false;
  emit("open-lobby");
}
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-ez-line bg-[#0b0e0b]/90 backdrop-blur-[18px]">
    <div class="flex min-h-[74px] items-center justify-between gap-4 px-[clamp(16px,2.55vw,52px)] py-3 max-[760px]:min-h-[68px] max-[760px]:px-3.5">
      <div class="flex min-w-0 items-center gap-3" aria-label="Ezcord">
        <span class="grid h-12 w-12 shrink-0 place-items-center text-ez-green max-[760px]:h-[42px] max-[760px]:w-[42px]" aria-hidden="true">
          <EzcordLogo class="h-12 w-12 scale-x-[-1] max-[760px]:h-[42px] max-[760px]:w-[42px]" />
        </span>
        <span class="min-w-0">
          <span class="block text-[22px] font-black leading-none text-ez-ink max-[760px]:text-xl"><span class="text-ez-green">EZ</span>CORD</span>
          <span class="mt-1 block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap text-xs font-extrabold text-ez-muted max-[760px]:hidden">Голосовые комнаты для Telegram</span>
        </span>
      </div>

      <div class="relative flex shrink-0 items-center gap-2.5">
        <button
          v-if="user && canUseLobby"
          class="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-2xl border border-ez-line bg-ez-card text-[24px] text-ez-green shadow-ez transition hover:-translate-y-px hover:border-ez-green/45 max-[760px]:h-[50px] max-[760px]:w-[50px]"
          type="button"
          aria-label="Открыть лобби"
          title="Лобби"
          @click="openLobby"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M0 0h24v24H0z" fill="none" />
            <path fill="currentColor" fill-rule="evenodd" d="M8.485 2.75a5.7 5.7 0 0 0-2.86.771a5.7 5.7 0 0 0-1.992 1.917l.121.082c.23.16.545.4.907.733c.725.667 1.638 1.704 2.43 3.206c.55 1.042.892 2.024 1.105 2.865c.384-.907.914-1.762 1.64-2.488q.461-.458.983-.818c-.31-.433-.618-.924-.91-1.477a12.7 12.7 0 0 1-1.317-3.89c-.056-.346-.088-.65-.107-.901m1.525.203a10 10 0 0 0 .063.46a11.2 11.2 0 0 0 1.162 3.428c.29.55.597 1.027.9 1.437a10.7 10.7 0 0 1 2.046-.67a5.7 5.7 0 0 0-.702-1.982a5.73 5.73 0 0 0-3.469-2.673m5.65 4.408a7.2 7.2 0 0 0-.882-2.485a7.24 7.24 0 0 0-5.41-3.573A7.249 7.249 0 0 0 7.36 15.659q-.017.145-.03.29a20 20 0 0 0-.018 3.356a3.645 3.645 0 0 0 3.382 3.382c.962.073 2.134.1 3.357-.017c2.09-.202 4.442-.837 6.112-2.506c1.67-1.67 2.305-4.021 2.506-6.112c.117-1.223.09-2.395.017-3.357a3.645 3.645 0 0 0-3.382-3.382a20 20 0 0 0-3.644.048m-8.67 6.686a5.73 5.73 0 0 1-3.469-2.673a5.73 5.73 0 0 1-.52-4.549c.17.125.392.3.645.533c.616.566 1.417 1.47 2.119 2.801a11.2 11.2 0 0 1 1.162 3.428q.04.25.063.46M17.754 8.75l3.496 3.496c-.002-.51-.025-.995-.059-1.437a2.145 2.145 0 0 0-2-2a20 20 0 0 0-1.437-.059m3.385 5.506l-5.395-5.395c-1.827.22-3.615.803-4.847 2.036c-1.233 1.232-1.815 3.02-2.036 4.847l5.395 5.395c1.827-.22 3.615-.803 4.847-2.036c1.233-1.232 1.815-3.02 2.036-4.847m-8.893 6.994L8.75 17.754c.002.51.025.995.059 1.437a2.146 2.146 0 0 0 2 2c.442.034.927.057 1.437.059m2.724-9.28a.75.75 0 0 1 1.06 0l.47.47l.47-.47a.75.75 0 0 1 1.06 1.06l-.47.47l.47.47a.75.75 0 0 1-1.06 1.06l-.47-.47l-.44.44l.47.47a.75.75 0 0 1-1.06 1.06l-.47-.47l-.44.44l.47.47a.75.75 0 0 1-1.06 1.06l-.47-.47l-.47.47a.75.75 0 0 1-1.06-1.06l.47-.47l-.47-.47a.75.75 0 1 1 1.06-1.06l.47.47l.44-.44l-.47-.47a.75.75 0 1 1 1.06-1.06l.47.47l.44-.44l-.47-.47a.75.75 0 0 1 0-1.06" clip-rule="evenodd" />
          </svg>
        </button>

        <button
          v-if="user"
          class="inline-flex min-h-[54px] items-center gap-3 rounded-2xl border border-ez-line bg-ez-card px-4 py-2 text-left shadow-ez transition hover:-translate-y-px max-[760px]:min-h-[50px] max-[760px]:px-3"
          type="button"
          :aria-expanded="rewardsOpen"
          aria-label="Звезды и уровень"
          title="Звезды"
          @click="rewardsOpen = !rewardsOpen"
        >
          <span class="grid min-w-[74px] leading-none max-[760px]:min-w-[62px]">
            <span class="flex items-center gap-1.5 text-[26px] font-black text-[#ffd447] max-[760px]:text-[22px]">{{ formatEzcordPoints(user.points) }}</span>
            <span class="mt-1 text-[11px] font-black uppercase tracking-[0.08em] text-ez-muted max-[760px]:text-[10px]">Level {{ getEzcordLevel(user.points) }}</span>
          </span>
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[#ffd447]/25 bg-[#ffd447]/10 text-[21px] text-[#ffd447] max-[760px]:h-8 max-[760px]:w-8" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
              <path d="M0 0h24v24H0z" fill="none" />
              <path fill="currentColor" d="m19 1l-1.26 2.75L15 5l2.74 1.26L19 9l1.25-2.74L23 5l-2.75-1.25M9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5M19 15l-1.26 2.74L15 19l2.74 1.25L19 23l1.25-2.75L23 19l-2.75-1.26" />
            </svg>
          </span>
        </button>

        <div
          v-if="user && rewardsOpen"
          class="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(320px,calc(100vw-28px))] rounded-[18px] border border-[#ffd447]/25 bg-[#10120f] p-4 text-left shadow-[0_22px_60px_-28px_rgba(0,0,0,0.95)]"
        >
          <p class="text-xs font-black uppercase leading-[1.2] text-[#ffd447]">Звезды</p>
          <p class="mt-2 text-sm font-extrabold leading-[1.45] text-ez-ink">Набирайте звезды, чтобы обменивать их на приятные бонусы: аватарки, украшения профиля и другие ништяки.</p>
          <button
            class="mt-3 inline-flex min-h-9 items-center justify-center rounded-[12px] border border-ez-line bg-ez-card px-3 text-xs font-black text-ez-ink transition hover:border-[#ffd447]/45"
            type="button"
            @click="rewardsOpen = false"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
