<script setup lang="ts">
const props = defineProps<{
  errorMessage: string;
  isLoading: boolean;
}>();

defineEmits<{
  open: [];
}>();
</script>

<template>
  <div class="flex min-h-[calc(100vh-74px)] items-center justify-center px-6 py-7 max-[760px]:px-3.5">
    <section class="grid w-full max-w-[420px] gap-3.5 rounded-[18px] border border-ez-line bg-gradient-to-b from-ez-card to-ez-card-2 p-[22px] shadow-ez">
      <div class="flex items-center gap-3">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-ez-green/25 bg-ez-green-soft text-[24px] text-ez-green">
          <EzcordSpinner />
        </span>
        <div class="grid min-w-0 flex-1 gap-2">
          <span class="h-5 w-36 animate-pulse rounded-full bg-ez-field"></span>
          <span class="h-3 w-48 animate-pulse rounded-full bg-ez-field"></span>
        </div>
      </div>
      <button
        class="inline-flex min-h-[50px] items-center justify-center gap-2.5 rounded-[14px] bg-gradient-to-br from-[#8ef25a] to-ez-green-dark px-[18px] text-[15px] font-black text-[#082900] shadow-[0_14px_30px_-12px_rgba(82,207,28,0.72)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
        :disabled="props.isLoading"
        type="button"
        @click="$emit('open')"
      >
        <EzcordSpinner v-if="props.isLoading" class="h-4 w-4" />
        Открыть свою комнату
      </button>
      <p v-if="props.errorMessage" class="rounded-[18px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">{{ props.errorMessage }}</p>
    </section>
  </div>
</template>
