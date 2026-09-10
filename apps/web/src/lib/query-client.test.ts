import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "./query-client";

describe("web query client", () => {
  it("returns a shared singleton in the browser", () => {
    expect(getQueryClient()).toBe(getQueryClient());
    expect(getQueryClient()).toBeInstanceOf(QueryClient);
  });

  it("garbage-collects inactive queries after 30 minutes", () => {
    expect(getQueryClient().getDefaultOptions().queries?.gcTime).toBe(30 * 60 * 1000);
  });

  it("keeps queries fresh for a minute without refetching on focus", () => {
    const options = getQueryClient().getDefaultOptions().queries;

    expect(options?.staleTime).toBe(60 * 1000);
    expect(options?.refetchOnWindowFocus).toBe(false);
  });
});
