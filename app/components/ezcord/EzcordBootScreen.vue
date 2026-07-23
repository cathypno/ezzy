<template>
  <div class="flex min-h-[calc(100vh-74px)] items-center justify-center p-6 max-[760px]:min-h-[calc(100vh-68px)]">
    <section class="w-full max-w-[420px] rounded-[18px] border border-ez-line bg-gradient-to-b from-ez-card to-ez-card-2 p-[22px] shadow-ez">
      <div class="flex items-center gap-4">
        <span class="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border border-ez-green/25 bg-ez-green-soft text-[26px] text-ez-green">
          <EzcordSpinner />
        </span>
        <div class="grid min-w-0 flex-1 gap-2">
          <span class="h-5 w-32 animate-pulse rounded-full bg-ez-field"></span>
          <span class="h-3 w-44 animate-pulse rounded-full bg-ez-field"></span>
        </div>
      </div>
      <div class="mt-5 grid gap-2">
        <span class="h-3 w-full animate-pulse rounded-full bg-ez-field"></span>
        <span class="h-3 w-10/12 animate-pulse rounded-full bg-ez-field"></span>
        <span class="h-3 w-7/12 animate-pulse rounded-full bg-ez-field"></span>
      </div>
    </section>
  </div>
</template>
