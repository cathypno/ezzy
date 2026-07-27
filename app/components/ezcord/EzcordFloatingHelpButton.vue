<script setup lang="ts">
const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    class="absolute bottom-5 right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl border border-ez-green/35 bg-[#111611]/94 text-[27px] text-ez-green shadow-[0_18px_48px_-22px_rgba(0,0,0,.95),0_0_22px_rgba(99,226,30,.14)] backdrop-blur-[16px] transition hover:-translate-y-px hover:border-ez-green max-[760px]:bottom-4 max-[760px]:right-3.5 max-[760px]:h-[52px] max-[760px]:w-[52px]"
    type="button"
    aria-label="Открыть FAQ"
    title="FAQ"
    @click="emit('click')"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M0 0h24v24H0z" fill="none" />
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 18h.01M9.4 9.2a2.8 2.8 0 1 1 4.36 2.32c-.98.65-1.76 1.22-1.76 2.48M4.75 6.76a9 9 0 1 0 2.01-2.01" />
    </svg>
  </button>
</template>
