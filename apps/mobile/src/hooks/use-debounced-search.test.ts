import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookWithProviders } from "@/test/render-hook";
import { SEARCH_DEBOUNCE_MS, useDebouncedSearch } from "./use-debounced-search";

describe("useDebouncedSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the latest value back until the wait elapses", () => {
    const { result } = renderHookWithProviders(() => useDebouncedSearch("", 300));

    act(() => {
      result.current.setQuery("a");
    });
    act(() => {
      result.current.setQuery("ab");
    });
    act(() => {
      result.current.setQuery("abc");
    });
    expect(result.current.debouncedQuery).toBe("");

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.debouncedQuery).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedQuery).toBe("abc");
  });

  it("exposes the raw query immediately for the input", () => {
    const { result } = renderHookWithProviders(() => useDebouncedSearch());

    act(() => {
      result.current.setQuery("hello");
    });
    expect(result.current.query).toBe("hello");
    expect(result.current.debouncedQuery).toBe("");
  });

  it("uses the default 300ms wait", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });
});
