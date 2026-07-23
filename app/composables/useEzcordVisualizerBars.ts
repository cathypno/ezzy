import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type VisualizerBarOptions = {
  fallback?: number;
  max?: number;
  min?: number;
  pxPerBar?: number;
};

export function useEzcordVisualizerBars(options: VisualizerBarOptions = {}) {
  const visualizerElement = ref<HTMLElement | null>(null);
  const visualizerWidth = ref(0);

  const fallback = options.fallback ?? 34;
  const max = options.max ?? 112;
  const min = options.min ?? 24;
  const pxPerBar = options.pxPerBar ?? 13;

  function updateVisualizerWidth() {
    visualizerWidth.value = visualizerElement.value?.clientWidth || 0;
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    updateVisualizerWidth();

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateVisualizerWidth);
      if (visualizerElement.value) resizeObserver.observe(visualizerElement.value);
      return;
    }

    window.addEventListener("resize", updateVisualizerWidth);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", updateVisualizerWidth);
  });

  const barCount = computed(() => {
    if (!visualizerWidth.value) return fallback;
    return Math.max(min, Math.min(max, Math.round(visualizerWidth.value / pxPerBar)));
  });

  const barGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${barCount.value}, minmax(0, 1fr))`,
  }));

  return {
    barCount,
    barGridStyle,
    visualizerElement,
  };
}
