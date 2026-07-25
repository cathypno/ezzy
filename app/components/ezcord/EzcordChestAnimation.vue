<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import chestClosed from "~/assets/ezcord/chest/chest-closed.webp";
import chestOpen from "~/assets/ezcord/chest/chest-open.webp";

const props = defineProps<{
  disabled?: boolean;
  hitCount: number;
  hitRunId: number;
  hitTarget: number;
  lobbyUnlocked: boolean;
  rewardCoins: number | null;
  runId: number;
}>();

const emit = defineEmits<{
  done: [];
  hit: [];
}>();

const OPEN_REVEAL_MS = 260;
const DONE_MS = 740;

const isOpen = ref(false);
const isOpening = ref(false);
const burst = ref(false);
const flash = ref(false);
const hitPulse = ref(false);
const hasFrameError = ref(false);
let openTimer = 0;
let doneTimer = 0;
let flashTimer = 0;
let hitTimer = 0;

const particles = Array.from({ length: 18 }, (_, index) => {
  const angle = (-164 + (index / 17) * 148) * (Math.PI / 180);
  const distance = 108 + ((index * 23) % 118);
  const coin = index % 3 !== 0;

  return {
    id: index,
    tx: `${Math.round(Math.cos(angle) * distance)}px`,
    ty: `${Math.round(Math.sin(angle) * distance)}px`,
    rot: `${-180 + ((index * 47) % 360)}deg`,
    size: `${coin ? 13 + (index % 4) * 3 : 10 + (index % 3) * 3}px`,
    duration: `${0.72 + (index % 5) * 0.08}s`,
    delay: `${(index % 6) * 0.025}s`,
    coin,
  };
});

const twinkles = [
  { id: 1, x: "18%", y: "26%", size: "12px", delay: "0s" },
  { id: 2, x: "78%", y: "22%", size: "16px", delay: ".25s" },
  { id: 3, x: "52%", y: "6%", size: "18px", delay: ".45s" },
  { id: 4, x: "31%", y: "44%", size: "10px", delay: ".18s" },
  { id: 5, x: "69%", y: "48%", size: "11px", delay: ".55s" },
];

watch(
  () => props.runId,
  (runId, previousRunId) => {
    if (runId > 0 && runId !== previousRunId) playOpen();
  },
);

watch(
  () => props.hitRunId,
  (hitRunId, previousHitRunId) => {
    if (hitRunId > 0 && hitRunId !== previousHitRunId) playHit();
  },
);

function playHit() {
  if (isOpen.value) return;
  if (hitTimer) {
    window.clearTimeout(hitTimer);
    hitTimer = 0;
  }

  hitPulse.value = false;
  window.requestAnimationFrame(() => {
    hitPulse.value = true;
    hitTimer = window.setTimeout(() => {
      hitPulse.value = false;
      hitTimer = 0;
    }, 300);
  });
}

function playOpen() {
  clearTimers();
  hasFrameError.value = false;
  isOpen.value = false;
  isOpening.value = true;
  burst.value = false;
  flash.value = false;

  openTimer = window.setTimeout(() => {
    isOpen.value = true;
    burst.value = true;
    flash.value = true;
    flashTimer = window.setTimeout(() => {
      flash.value = false;
    }, 260);
  }, OPEN_REVEAL_MS);

  doneTimer = window.setTimeout(() => {
    isOpening.value = false;
    emit("done");
  }, DONE_MS);
}

function clearTimers() {
  if (openTimer) {
    window.clearTimeout(openTimer);
    openTimer = 0;
  }
  if (doneTimer) {
    window.clearTimeout(doneTimer);
    doneTimer = 0;
  }
  if (flashTimer) {
    window.clearTimeout(flashTimer);
    flashTimer = 0;
  }
  if (hitTimer) {
    window.clearTimeout(hitTimer);
    hitTimer = 0;
  }
  hitPulse.value = false;
}

onBeforeUnmount(clearTimers);
</script>

<template>
  <button
    class="group relative mx-auto aspect-square w-full max-w-[360px] select-none overflow-visible rounded-[24px] text-left outline-none transition disabled:cursor-default max-[560px]:max-w-[300px]"
    :class="disabled ? '' : 'cursor-pointer focus-visible:ring-4 focus-visible:ring-ez-green/25'"
    :disabled="disabled"
    type="button"
    aria-label="Ударить по сундуку"
    @click="emit('hit')"
  >
    <div class="absolute left-1/2 top-[54%] h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ez-green/20 blur-[58px] transition-opacity duration-300" :class="isOpen ? 'opacity-100' : 'opacity-45'"></div>
    <div class="absolute left-1/2 top-[52%] h-[84%] w-[84%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,transparent_0_9deg,rgba(99,226,30,.32)_9deg_12deg,transparent_12deg_30deg)] opacity-0 mix-blend-screen [mask:radial-gradient(circle,transparent_22%,#000_42%,transparent_74%)]" :class="isOpen ? 'animate-[ez-chest-spin_20s_linear_infinite] opacity-100' : ''"></div>
    <div class="absolute bottom-[12%] left-1/2 h-10 w-[68%] -translate-x-1/2 rounded-full bg-black/70 blur-[12px]"></div>

    <img
      v-if="!hasFrameError"
      class="relative z-10 h-full w-full object-contain transition-[opacity,transform,filter] duration-300 ease-out drop-shadow-[0_28px_38px_rgba(0,0,0,.58)]"
      :class="[
        isOpen ? 'scale-[.96] -translate-y-1 opacity-0' : 'scale-100 opacity-100',
        (isOpening && !isOpen) || hitPulse ? 'animate-[ez-chest-rumble_.28s_ease-in-out_both]' : '',
      ]"
      :src="chestClosed"
      alt=""
      draggable="false"
      @error="hasFrameError = true"
    />
    <img
      v-if="!hasFrameError"
      class="absolute inset-0 z-10 h-full w-full object-contain transition-[opacity,transform,filter] duration-300 ease-out drop-shadow-[0_0_26px_rgba(99,226,30,.22)]"
      :class="isOpen ? 'scale-[1.04] -translate-y-2 opacity-100' : 'scale-[.94] translate-y-2 opacity-0'"
      :src="chestOpen"
      alt=""
      draggable="false"
      @error="hasFrameError = true"
    />
    <div v-else class="relative z-10 grid h-full w-full place-items-center">
      <div class="relative h-[46%] w-[58%] rounded-b-[22px] border border-[#6b5a38] bg-[linear-gradient(135deg,#5b341c,#9a5b28_52%,#4a2918)] shadow-[0_26px_38px_rgba(0,0,0,.5)]">
        <div class="absolute -top-[38%] left-1/2 h-[48%] w-[88%] -translate-x-1/2 rounded-t-[999px] border border-[#75633f] bg-[linear-gradient(135deg,#6b3d1e,#bd7631_52%,#4d2b18)]"></div>
        <div class="absolute left-0 top-[32%] h-[18%] w-full bg-[#232625]/80"></div>
        <div class="absolute left-1/2 top-[26%] grid h-[32%] w-[22%] -translate-x-1/2 place-items-center rounded-[12px] border border-[#ffd447]/45 bg-[#b47a24] text-[18px] text-ez-green shadow-[0_0_24px_rgba(99,226,30,.28)]">◆</div>
      </div>
    </div>

    <div
      v-if="isOpen && rewardCoins !== null"
      class="absolute left-1/2 top-[17%] z-20 -translate-x-1/2 animate-[ez-chest-pop_.48s_cubic-bezier(.22,1.45,.45,1)_both] whitespace-nowrap rounded-full border border-[#ffd447]/40 bg-[#211808]/92 px-4 py-2 text-center shadow-[0_16px_36px_-18px_rgba(255,212,71,.65)] backdrop-blur-[14px]"
    >
      <p class="text-[24px] font-black leading-none text-[#ffd447]">+{{ rewardCoins }}</p>
      <p class="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#ffe29a]/80">монет</p>
    </div>

    <div
      v-if="isOpen && lobbyUnlocked"
      class="absolute bottom-[11%] left-1/2 z-20 -translate-x-1/2 animate-[ez-chest-pop_.5s_cubic-bezier(.22,1.45,.45,1)_both] whitespace-nowrap rounded-full border border-ez-green/40 bg-[#10220c]/92 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-ez-green"
    >
      Лобби открыто
    </div>

    <div v-if="hitCount > 0 && !isOpen" class="absolute bottom-[7%] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-ez-green/30 bg-black/55 px-3 py-2 backdrop-blur-[12px]">
      <span
        v-for="index in hitTarget"
        :key="index"
        class="block h-2 w-6 rounded-full transition"
        :class="index <= hitCount ? 'bg-ez-green shadow-[0_0_10px_rgba(99,226,30,.65)]' : 'bg-white/14'"
      ></span>
    </div>

    <div v-if="burst" class="pointer-events-none absolute left-1/2 top-[44%] z-30 h-0 w-0">
      <span
        v-for="particle in particles"
        :key="particle.id"
        class="ez-chest-particle absolute left-0 top-0 block rounded-full"
        :class="particle.coin ? 'bg-[radial-gradient(circle_at_35%_30%,#fff4a6,#ffd447_45%,#b97912)] shadow-[0_0_10px_rgba(255,212,71,.72)]' : 'bg-ez-green shadow-[0_0_12px_rgba(99,226,30,.65)] [clip-path:polygon(50%_0,61%_39%,100%_50%,61%_61%,50%_100%,39%_61%,0_50%,39%_39%)]'"
        :style="{
          width: particle.size,
          height: particle.size,
          '--tx': particle.tx,
          '--ty': particle.ty,
          '--rot': particle.rot,
          '--dur': particle.duration,
          '--delay': particle.delay,
        }"
      ></span>
    </div>

    <div v-if="isOpen" class="pointer-events-none absolute left-1/2 top-[40%] z-30 h-[52%] w-[74%] -translate-x-1/2 -translate-y-1/2">
      <span
        v-for="twinkle in twinkles"
        :key="twinkle.id"
        class="absolute block animate-[ez-chest-twinkle_2.5s_ease-in-out_infinite] bg-[#efffe5] shadow-[0_0_10px_rgba(99,226,30,.8)] [clip-path:polygon(50%_0,61%_39%,100%_50%,61%_61%,50%_100%,39%_61%,0_50%,39%_39%)]"
        :style="{ left: twinkle.x, top: twinkle.y, width: twinkle.size, height: twinkle.size, animationDelay: twinkle.delay }"
      ></span>
    </div>

    <div v-if="flash" class="pointer-events-none fixed inset-0 z-[70] bg-[radial-gradient(circle_at_50%_42%,rgba(238,255,229,.88),rgba(238,255,229,0)_58%)]"></div>
  </button>
</template>
