import { describe, expect, it, beforeEach } from "vitest";
import { useThemeStore } from "./theme.store";

describe("mobile theme store", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "system" });
  });

  it("defaults to following the system", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("persists an explicit choice on setTheme", () => {
    useThemeStore.getState().setTheme("dark");

    expect(useThemeStore.getState().theme).toBe("dark");
  });
});
