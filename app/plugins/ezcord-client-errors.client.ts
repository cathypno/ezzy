type EzcordClientErrorPayload = {
  kind: string;
  message: string;
  stack?: string;
  source?: string;
  url: string;
  userAgent: string;
  viewport: string;
};

const MAX_REPORTS = 5;

export default defineNuxtPlugin((nuxtApp) => {
  let reportCount = 0;
  let lastSignature = "";
  let lastReportedAt = 0;

  function report(payload: EzcordClientErrorPayload) {
    if (!window.location.pathname.startsWith("/ezcord")) return;
    if (reportCount >= MAX_REPORTS) return;

    const signature = `${payload.kind}:${payload.message}:${payload.source || ""}`;
    const now = Date.now();
    if (signature === lastSignature && now - lastReportedAt < 10_000) return;

    reportCount += 1;
    lastSignature = signature;
    lastReportedAt = now;

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/ezcord/client-error", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }

    void fetch("/api/ezcord/client-error", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }

  function basePayload(kind: string, error: unknown, source = ""): EzcordClientErrorPayload {
    const reason = normalizeError(error);
    return {
      kind,
      message: reason.message,
      stack: reason.stack,
      source,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
    };
  }

  const previousVueErrorHandler = nuxtApp.vueApp.config.errorHandler;
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    report(basePayload("vue", error, info));
    previousVueErrorHandler?.(error, instance, info);
  };

  window.addEventListener("error", (event) => {
    report(basePayload("window", event.error || event.message, `${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`));
  });

  window.addEventListener("unhandledrejection", (event) => {
    report(basePayload("promise", event.reason));
  });
});

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: trimValue(error.message || error.name || "Unknown error", 500),
      stack: trimValue(error.stack || "", 1600),
    };
  }

  if (typeof error === "string") {
    return {
      message: trimValue(error, 500),
      stack: "",
    };
  }

  return {
    message: trimValue(safeJson(error), 500),
    stack: "",
  };
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "Unserializable error";
  }
}

function trimValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
