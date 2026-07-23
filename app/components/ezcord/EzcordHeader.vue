<script setup lang="ts">
import type { User } from "~/types/ezcord";

defineProps<{
  theme: "light" | "dark";
  themeLabel: string;
  user: User | null;
  userInitial: string;
}>();

defineEmits<{
  "toggle-theme": [];
  logout: [];
}>();
</script>

<template>
  <header class="ez-topbar">
    <div class="ez-topbar__inner">
      <div class="ez-brand" aria-label="Ezcord">
        <span class="ez-brand__logo" aria-hidden="true">
          <EzcordLogo class="ez-brand__logo-icon" />
        </span>
        <span class="min-w-0">
          <span class="ez-brand__title"><span class="ez-brand__title-accent">EZ</span>CORD</span>
          <span class="ez-brand__subtitle">Голосовые комнаты для Telegram</span>
        </span>
      </div>

      <div class="ez-top-actions">
        <button class="ez-icon-btn" type="button" :aria-label="themeLabel" :title="themeLabel" @click="$emit('toggle-theme')">
          {{ theme === "light" ? "☾" : "☀" }}
        </button>
        <button v-if="user" class="ez-user-pill" type="button" title="Выйти" @click="$emit('logout')">
          <span class="ez-user-name">{{ user.displayName }}</span>
          <span class="ez-avatar">{{ userInitial }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
