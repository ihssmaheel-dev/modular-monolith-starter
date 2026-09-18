import type { ClientErrorBeacon } from "@repo/contracts";
import type { FetchFn } from "../types";

export function createTelemetryClient(fetchFn: FetchFn) {
  return {
    reportClientError: (body: ClientErrorBeacon, init?: RequestInit) =>
      fetchFn<void>("/telemetry/client-error", {
        method: "POST",
        body: JSON.stringify(body),
        ...init,
      }),
  };
}
