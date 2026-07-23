<script setup lang="ts">
import type { User } from "~/types/ezcord";

defineProps<{
  user: User | null;
  userInitial: string;
}>();

defineEmits<{
  logout: [];
}>();
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

      <div class="flex shrink-0 items-center gap-2.5">
        <button
          v-if="user"
          class="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-ez-line bg-ez-card px-1.5 py-[5px] pl-4 text-left text-ez-ink shadow-ez transition hover:-translate-y-px"
          type="button"
          title="Выйти"
          @click="$emit('logout')"
        >
          <span class="max-w-[170px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-black max-[760px]:hidden">{{ user.displayName }}</span>
          <span class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] bg-ez-green text-sm font-black text-[#082900]">{{ userInitial }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
