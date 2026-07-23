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
        class="mt-3.5 inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-transparent bg-[#229ed9] px-[18px] text-[15px] font-black text-white shadow-[0_12px_26px_-14px_rgba(34,158,217,0.9)] transition hover:-translate-y-px hover:bg-[#1f93c9] disabled:cursor-default disabled:opacity-[.58] disabled:hover:translate-y-0"
        :disabled="props.telegramLoginLoading"
        type="button"
        @click="emit('telegram-login')"
      >
        <svg class="h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M0 0h24v24H0z" fill="none" />
          <g fill="none" fill-rule="evenodd">
            <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.004-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
            <path fill="currentColor" d="M19.777 4.43a1.5 1.5 0 0 1 2.062 1.626l-2.268 13.757c-.22 1.327-1.676 2.088-2.893 1.427c-1.018-.553-2.53-1.405-3.89-2.294c-.68-.445-2.763-1.87-2.507-2.884c.22-.867 3.72-4.125 5.72-6.062c.785-.761.427-1.2-.5-.5c-2.302 1.738-5.998 4.381-7.22 5.125c-1.078.656-1.64.768-2.312.656c-1.226-.204-2.363-.52-3.291-.905c-1.254-.52-1.193-2.244-.001-2.746z" />
          </g>
        </svg>
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
