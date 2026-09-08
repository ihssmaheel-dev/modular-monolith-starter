import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "./query-client";

describe("mobile query client", () => {
  it("returns a shared singleton", () => {
    expect(getQueryClient()).toBe(getQueryClient());
    expect(getQueryClient()).toBeInstanceOf(QueryClient);
  });

  it("disables window-focus refetching for native", () => {
    expect(getQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
