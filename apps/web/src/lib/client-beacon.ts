import { getWebEnv } from "./env";
import { getApiClient } from "./api";
import type { ClientErrorBeacon } from "@repo/contracts";

const reportedErrors = new Set<string>();

export function reportClientError(beacon: ClientErrorBeacon): void {
  if (typeof window === "undefined") return;

  const key = `${beacon.message}:${beacon.url}:${beacon.errorRef ?? ""}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);

  const payload: ClientErrorBeacon = {
    ...beacon,
    userAgent: beacon.userAgent ?? navigator.userAgent,
    url: beacon.url || window.location.pathname,
  };

  try {
    if (navigator.sendBeacon) {
      const env = getWebEnv();
      const endpoint = `${env.VITE_API_URL}/telemetry/client-error`;
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const sent = navigator.sendBeacon(endpoint, blob);
      if (sent) return;
    }

    void getApiClient()
      .telemetry.reportClientError(payload)
      .catch(() => {});
  } catch {}
}

export function initGlobalErrorListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    reportClientError({
      message: event.message || "Uncaught window error",
      stack: event.error instanceof Error ? event.error.stack : undefined,
      url: window.location.pathname,
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : undefined;

    reportClientError({
      message,
      stack,
      url: window.location.pathname,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
