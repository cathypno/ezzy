<script setup lang="ts">
import { ref } from "vue";
import type { User } from "~/types/ezcord";
import { formatEzcordPoints, getEzcordLevel } from "~/utils/ezcord";

defineProps<{
  user: User | null;
}>();

const rewardsOpen = ref(false);
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
