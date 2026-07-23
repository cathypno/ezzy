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
  <EzcordRoomSkeleton
    :error-message="props.errorMessage"
    :is-loading="props.isLoading"
    show-open-button
    @open="$emit('open')"
  />
</template>
