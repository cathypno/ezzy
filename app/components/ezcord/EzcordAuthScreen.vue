<script setup lang="ts">
const props = defineProps<{
  authMode: "login" | "register";
  displayName: string;
  email: string;
  errorMessage: string;
  isLoading: boolean;
  password: string;
  statusMessage: string;
  telegramLoginLoading: boolean;
  telegramLoginUrl: string;
}>();

const emit = defineEmits<{
  "update:authMode": [value: "login" | "register"];
  "update:displayName": [value: string];
  "update:email": [value: string];
  "update:password": [value: string];
  submit: [];
  "telegram-login": [];
}>();
</script>

<template>
  <section class="ez-auth-shell ez-auth-shell--compact">
    <div class="ez-panel ez-panel--soft">
      <div class="ez-tabs">
        <button
          class="ez-tab"
          :class="{ 'ez-tab--active': props.authMode === 'register' }"
          type="button"
          @click="emit('update:authMode', 'register')"
        >
          Регистрация
        </button>
        <button
          class="ez-tab"
          :class="{ 'ez-tab--active': props.authMode === 'login' }"
          type="button"
          @click="emit('update:authMode', 'login')"
        >
          Вход
        </button>
      </div>

      <form class="ez-form" @submit.prevent="emit('submit')">
        <label v-if="props.authMode === 'register'" class="ez-field">
          <span class="ez-label">Имя</span>
          <input
            class="ez-input"
            autocomplete="name"
            placeholder="Ваше имя"
            type="text"
            :value="props.displayName"
            @input="emit('update:displayName', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="ez-field">
          <span class="ez-label">Email</span>
          <input
            class="ez-input"
            autocomplete="email"
            placeholder="you@mail.com"
            type="email"
            :value="props.email"
            @input="emit('update:email', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="ez-field">
          <span class="ez-label">Пароль</span>
          <input
            class="ez-input"
            autocomplete="current-password"
            placeholder="••••••••"
            type="password"
            :value="props.password"
            @input="emit('update:password', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <button class="ez-primary" :disabled="props.isLoading" type="submit">
          {{ props.authMode === "register" ? "Создать аккаунт" : "Войти" }}
        </button>
      </form>

      <button
        class="ez-secondary ez-telegram-login"
        :disabled="props.telegramLoginLoading"
        type="button"
        @click="emit('telegram-login')"
      >
        {{ props.telegramLoginLoading ? "Ждем подтверждение..." : "Войти через Telegram" }}
      </button>
      <a
        v-if="props.telegramLoginUrl"
        class="ez-auth-note ez-auth-link"
        :href="props.telegramLoginUrl"
        target="_blank"
        rel="noreferrer"
      >
        Открыть Telegram-бота
      </a>
      <p class="ez-auth-note">Подтвердите вход кнопкой в Telegram-боте</p>
      <p v-if="props.errorMessage" class="ez-alert ez-alert--error">{{ props.errorMessage }}</p>
      <p v-if="props.statusMessage" class="ez-alert ez-alert--status">{{ props.statusMessage }}</p>
    </div>
  </section>
</template>
