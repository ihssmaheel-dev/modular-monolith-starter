import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { createBroadcastChannel } from "./channel";
import { THEME_SYNC_CHANNEL, ThemeSync, publishTheme, type ThemeSyncEvent } from "./theme-sync";

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        go dark
      </button>
    </div>
  );
}

function renderThemed() {
  return render(
    <ThemeProvider defaultTheme="light" storageKey="theme">
      <ThemeSync />
      <Probe />
    </ThemeProvider>,
  );
}

describe("theme sync", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("applies a remote theme change to this tab", async () => {
    renderThemed();
    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    const remote = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);

    remote.post({ type: "theme-changed", theme: "dark" });

    await vi.waitFor(() => expect(screen.getByTestId("theme-value")).toHaveTextContent("dark"));
    expect(localStorage.getItem("theme")).toBe("dark");
    remote.close();
  });

  it("publishes a local theme change to sibling tabs", async () => {
    const user = userEvent.setup();
    renderThemed();
    const remote = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);
    const seen: ThemeSyncEvent[] = [];
    const unsubscribe = remote.subscribe((message) => {
      seen.push(message);
    });

    await user.click(screen.getByRole("button", { name: "go dark" }));

    await vi.waitFor(() => expect(seen).toEqual([{ type: "theme-changed", theme: "dark" }]));
    unsubscribe();
    remote.close();
  });

  it("ignores malformed remote values", async () => {
    renderThemed();
    const remote = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);

    remote.post({ type: "theme-changed", theme: "neon" } as never);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    remote.close();
  });

  it("publishTheme posts through the shared channel", async () => {
    const remote = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);
    const seen: ThemeSyncEvent[] = [];
    const unsubscribe = remote.subscribe((message) => {
      seen.push(message);
    });

    publishTheme("dark");

    await vi.waitFor(() => expect(seen).toEqual([{ type: "theme-changed", theme: "dark" }]));
    unsubscribe();
    remote.close();
  });
});
