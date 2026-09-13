import { getWebEnv } from "./env";
import { getApiClient } from "./api";
import type { ClientErrorBeacon } from "@repo/contracts";

export const MAX_REPORTED_ERRORS = 500;
const reportedErrors = new Set<string>();

export function getReportedErrorsCount(): number {
  return reportedErrors.size;
}

export function clearReportedErrors(): void {
  reportedErrors.clear();
}

export function reportClientError(beacon: ClientErrorBeacon): void {
  if (typeof window === "undefined") return;

  const key = `${beacon.message}:${beacon.url}:${beacon.errorRef ?? ""}`;
  if (reportedErrors.has(key)) return;

  if (reportedErrors.size >= MAX_REPORTED_ERRORS) {
    const oldestKey = reportedErrors.values().next().value;
    if (oldestKey) reportedErrors.delete(oldestKey);
  }
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
  } catch {
    // Suppress telemetry transport failures to ensure user flow is unaffected
  }
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
