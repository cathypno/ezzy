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
  <section class="flex min-h-[calc(100vh-74px)] w-full items-center justify-center px-6 py-7 max-[760px]:min-h-[calc(100vh-68px)] max-[760px]:px-3.5 max-[760px]:py-5">
    <div class="w-full max-w-[520px] rounded-[18px] border border-ez-line bg-gradient-to-b from-ez-card to-ez-card-2 p-[22px] shadow-ez">
      <div class="grid grid-cols-2 gap-1.5 rounded-[15px] bg-ez-field p-1.5">
        <button
          class="min-h-11 rounded-xl bg-transparent text-sm font-black text-ez-muted transition hover:text-ez-ink"
          :class="props.authMode === 'register' ? 'bg-ez-card text-ez-ink shadow-ez' : ''"
          type="button"
          @click="emit('update:authMode', 'register')"
        >
          Регистрация
        </button>
        <button
          class="min-h-11 rounded-xl bg-transparent text-sm font-black text-ez-muted transition hover:text-ez-ink"
          :class="props.authMode === 'login' ? 'bg-ez-card text-ez-ink shadow-ez' : ''"
          type="button"
          @click="emit('update:authMode', 'login')"
        >
          Вход
        </button>
      </div>

      <form class="mt-[18px] grid gap-3.5" @submit.prevent="emit('submit')">
        <label v-if="props.authMode === 'register'" class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Имя</span>
          <input
            class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition placeholder:text-ez-muted/70 focus:border-ez-green focus:ring-4 focus:ring-ez-green/20"
            autocomplete="name"
            placeholder="Ваше имя"
            type="text"
            :value="props.displayName"
            @input="emit('update:displayName', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Email</span>
          <input
            class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition placeholder:text-ez-muted/70 focus:border-ez-green focus:ring-4 focus:ring-ez-green/20"
            autocomplete="email"
            placeholder="you@mail.com"
            type="email"
            :value="props.email"
            @input="emit('update:email', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="block">
          <span class="text-xs font-black uppercase leading-[1.2] text-ez-muted">Пароль</span>
          <input
            class="mt-2 h-[50px] w-full rounded-[14px] border border-ez-field-line bg-ez-field px-[15px] text-[15px] font-extrabold text-ez-ink outline-none transition placeholder:text-ez-muted/70 focus:border-ez-green focus:ring-4 focus:ring-ez-green/20"
            autocomplete="current-password"
            placeholder="••••••••"
            type="password"
            :value="props.password"
            @input="emit('update:password', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <button
          class="inline-flex min-h-[50px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8ef25a] to-ez-green-dark px-[18px] text-[15px] font-black text-[#082900] shadow-[0_14px_30px_-12px_rgba(82,207,28,0.72)] transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
          :disabled="props.isLoading"
          type="submit"
        >
          {{ props.authMode === "register" ? "Создать аккаунт" : "Войти" }}
        </button>
      </form>

      <button
        class="mt-3.5 inline-flex min-h-[50px] w-full items-center justify-center rounded-[14px] border border-ez-line bg-ez-card px-[18px] text-[15px] font-black text-ez-ink transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
        :disabled="props.telegramLoginLoading"
        type="button"
        @click="emit('telegram-login')"
      >
        {{ props.telegramLoginLoading ? "Ждем подтверждение..." : "Войти через Telegram" }}
      </button>
      <a
        v-if="props.telegramLoginUrl"
        class="mt-[18px] block text-center text-[13px] font-extrabold text-ez-blue no-underline hover:underline"
        :href="props.telegramLoginUrl"
        target="_blank"
        rel="noreferrer"
      >
        Открыть Telegram-бота
      </a>
      <p class="mt-[18px] text-center text-[13px] font-extrabold text-ez-muted">Подтвердите вход кнопкой в Telegram-боте</p>
      <p v-if="props.errorMessage" class="mt-3.5 rounded-[18px] border border-[#e5484d]/35 bg-[#e5484d]/10 px-4 py-3.5 text-[13px] font-extrabold text-[#ff9aa2]">{{ props.errorMessage }}</p>
      <p v-if="props.statusMessage" class="mt-3.5 rounded-[18px] border border-ez-green/35 bg-ez-green-soft px-4 py-3.5 text-[13px] font-extrabold text-ez-green-dark">{{ props.statusMessage }}</p>
    </div>
  </section>
</template>
