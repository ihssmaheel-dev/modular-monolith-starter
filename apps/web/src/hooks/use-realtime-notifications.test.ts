import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth.store";
import { renderHookWithProviders } from "@/test/utils";
import { useRealtimeNotifications } from "./use-realtime-notifications";

const SSE_EVENT = "notification.created";
const SSE_URL = "http://localhost:3000/api/v1/realtime/events";

type Handler = (event: { data: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  options: Record<string, unknown>;
  close = vi.fn();
  listeners = new Map<string, Handler[]>();

  constructor(url: string, options: Record<string, unknown>) {
    this.url = url;
    this.options = options;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: Handler) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  removeEventListener(type: string, handler: Handler) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((h) => h !== handler),
    );
  }

  emit(type: string, payload: unknown) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
    }
  }
}

const user = { id: "u-1", email: "u@e.test", name: "U", role: "user" } as const;

describe("useRealtimeNotifications", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "a",
      refreshToken: "r",
      user,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().clearAuth();
  });

  it("subscribes with cookie auth when logged in", () => {
    renderHookWithProviders(() => useRealtimeNotifications());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]!.url).toBe(SSE_URL);
    expect(MockEventSource.instances[0]!.options).toEqual({ withCredentials: true });
    expect(MockEventSource.instances[0]!.listeners.has(SSE_EVENT)).toBe(true);
  });

  it("invalidates the notification center on valid events only", () => {
    const { queryClient } = renderHookWithProviders(() => useRealtimeNotifications());
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const source = MockEventSource.instances[0]!;

    source.emit(SSE_EVENT, { id: "n-1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.notifications.all() });

    invalidate.mockClear();
    source.emit(SSE_EVENT, "not-json{{{");
    source.emit(SSE_EVENT, 42);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never closes on its own but cleans up on unmount", () => {
    const { unmount } = renderHookWithProviders(() => useRealtimeNotifications());
    const source = MockEventSource.instances[0]!;

    expect(source.close).not.toHaveBeenCalled();

    unmount();

    expect(source.listeners.get(SSE_EVENT)).toHaveLength(0);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when logged out", () => {
    useAuthStore.getState().clearAuth();

    renderHookWithProviders(() => useRealtimeNotifications());

    expect(MockEventSource.instances).toHaveLength(0);
  });
});
