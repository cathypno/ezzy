import { ref, type Ref } from "vue";
import type { User } from "~/types/ezcord";

export function useEzcordOnboarding(user: Ref<User | null>) {
  const onboardingOpen = ref(false);
  const onboardingCompleting = ref(false);

  function openOnboarding() {
    onboardingOpen.value = true;
  }

  async function completeOnboarding() {
    if (!user.value || onboardingCompleting.value) {
      onboardingOpen.value = false;
      return;
    }

    markLocalOnboardingCompleted(user.value.id);
    if (user.value.onboardingCompletedAt) {
      onboardingOpen.value = false;
      return;
    }

    onboardingCompleting.value = true;
    try {
      const response = await $fetch<{ user: User }>("/api/ezcord/onboarding/complete", {
        method: "POST",
      });
      user.value = response.user;
    } catch {
      // Local cache keeps onboarding from nagging if this cosmetic write fails.
    } finally {
      onboardingCompleting.value = false;
      onboardingOpen.value = false;
    }
  }

  function maybeOpenInitialOnboarding() {
    if (!user.value) return;
    if (user.value.onboardingCompletedAt) return;
    if (hasLocalOnboardingCompleted(user.value.id)) return;
    onboardingOpen.value = true;
  }

  return {
    completeOnboarding,
    maybeOpenInitialOnboarding,
    onboardingCompleting,
    onboardingOpen,
    openOnboarding,
  };
}

function hasLocalOnboardingCompleted(userId: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(onboardingCacheKey(userId)) === "1";
}

function markLocalOnboardingCompleted(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(onboardingCacheKey(userId), "1");
}

function onboardingCacheKey(userId: string) {
  return `ezcord:onboarding:${userId}`;
}
