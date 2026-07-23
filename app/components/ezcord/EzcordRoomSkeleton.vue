<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    errorMessage?: string;
    isLoading?: boolean;
    showOpenButton?: boolean;
  }>(),
  {
    errorMessage: "",
    isLoading: false,
    showOpenButton: false,
  },
);

defineEmits<{
  open: [];
}>();

const chips = ["w-16", "w-24", "w-28"];
const avatars = [0, 1];
const visualizerBars = Array.from({ length: 34 }, (_, index) => 22 + Math.round(Math.abs(Math.sin(index * 0.74)) * 58));
</script>

<template>
  <div class="px-[clamp(16px,2.55vw,52px)] pb-[42px] pt-7 max-[760px]:px-3.5">
    <div class="flex items-start justify-between gap-[18px]">
      <div class="min-w-0 flex-1">
        <span class="block h-3 w-20 animate-pulse rounded-full bg-ez-field"></span>
        <span class="mt-3 block h-9 w-40 max-w-full animate-pulse rounded-[10px] bg-ez-field max-[760px]:h-8"></span>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <span
            v-for="chip in chips"
            :key="chip"
            class="h-7 animate-pulse rounded-full border border-ez-line bg-ez-card"
            :class="chip"
          ></span>
        </div>
      </div>
      <span class="mt-5 h-10 w-10 shrink-0 animate-pulse rounded-xl border border-ez-line bg-ez-card max-[760px]:mt-4"></span>
    </div>

    <section class="mt-5 overflow-hidden rounded-[18px] bg-gradient-to-b from-ez-widget to-[#0d0f0d] p-[clamp(20px,2.5vw,28px)] text-white shadow-ez-stage max-[760px]:p-[18px]">
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="h-7 w-14 animate-pulse rounded-[9px] bg-ez-green-soft"></span>
        <span class="h-7 w-24 animate-pulse rounded-[9px] bg-white/[.08]"></span>
        <span class="h-[30px] w-28 animate-pulse rounded-full bg-ez-green-soft"></span>
      </div>

      <div class="mt-[26px] flex flex-wrap gap-3.5">
        <div v-for="avatar in avatars" :key="avatar" class="w-[74px] text-center">
          <span class="mx-auto block h-[62px] w-[62px] animate-pulse rounded-full border-[3px] border-transparent bg-ez-widget-field"></span>
          <span class="mx-auto mt-2 block h-3 w-10 animate-pulse rounded-full bg-ez-widget-field"></span>
        </div>
        <span class="grid h-[62px] w-[62px] animate-pulse place-items-center rounded-full border-2 border-dashed border-ez-widget-muted/55 text-ez-widget-muted"></span>
      </div>

      <div class="mt-7 grid items-end gap-4 [grid-template-columns:minmax(0,1fr)_86px] max-[760px]:[grid-template-columns:minmax(0,1fr)_78px]">
        <div>
          <div class="flex items-center justify-between">
            <span class="h-3 w-14 animate-pulse rounded-full bg-ez-widget-field"></span>
            <span class="h-3 w-12 animate-pulse rounded-full bg-ez-widget-field"></span>
          </div>
          <div class="ez-voice-lava relative mt-2.5 h-[74px] overflow-hidden rounded-[14px] border border-white/[.04] bg-ez-widget-field p-3 opacity-[.54]">
            <div class="relative z-10 grid h-full items-end gap-[clamp(3px,0.52vw,8px)] [grid-template-columns:repeat(34,minmax(3px,1fr))]">
              <span
                v-for="(height, index) in visualizerBars"
                :key="index"
                class="ez-voice-bar min-h-3 origin-bottom rounded-full bg-gradient-to-t from-[#237e13] via-ez-green to-[#baff82]"
                :style="{
                  height: `${height}%`,
                  animationDelay: `${index * -0.07}s`,
                  animationDuration: `${0.9 + (index % 7) * 0.09}s`,
                }"
              ></span>
            </div>
          </div>
        </div>
        <span class="h-[86px] w-[86px] animate-pulse rounded-full border border-ez-widget-muted/58 bg-ez-widget-field max-[760px]:h-[78px] max-[760px]:w-[78px]"></span>
      </div>
    </section>

    <button
      v-if="props.showOpenButton"
      class="mt-4 inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-gradient-to-br from-[#8ef25a] to-ez-green-dark px-[18px] text-[15px] font-black text-[#082900] shadow-[0_14px_30px_-12px_rgba(82,207,28,0.72)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
      :disabled="props.isLoading"
      type="button"
      @click="$emit('open')"
    >
      <EzcordSpinner v-if="props.isLoading" class="h-4 w-4" />
      Открыть свою комнату
    </button>
    <p v-if="props.errorMessage" class="mt-3 rounded-[16px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">{{ props.errorMessage }}</p>
  </div>
</template>
