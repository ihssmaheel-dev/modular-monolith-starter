import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import "@/lib/i18n";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Minimal hook renderer (react-test-renderer, no DOM/RN runtime).
 * For TanStack Query hooks with a fresh QueryClient per test.
 */
export function renderHookWithProviders<Result>(callback: () => Result) {
  const queryClient = createTestQueryClient();
  let current!: Result;
  let renderer!: TestRenderer.ReactTestRenderer;
  const Probe = () => {
    current = callback();
    return null;
  };
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return {
    queryClient,
    result: {
      get current(): Result {
        return current;
      },
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}
