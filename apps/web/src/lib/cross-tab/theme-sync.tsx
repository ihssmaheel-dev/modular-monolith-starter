import { useEffect, useRef } from "react";
import { isTheme, useTheme, type Theme } from "@/components/theme-provider";
import { createBroadcastChannel, type BroadcastHandle } from "./channel";

export const THEME_SYNC_CHANNEL = "app:theme";

export type ThemeSyncEvent = { type: "theme-changed"; theme: Theme };

let publishChannel: BroadcastHandle<ThemeSyncEvent> | null = null;

function channel(): BroadcastHandle<ThemeSyncEvent> {
  if (!publishChannel) publishChannel = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);
  return publishChannel;
}

export function publishTheme(theme: Theme): void {
  channel().post({ type: "theme-changed", theme });
}

/**
 * Mirrors theme changes across tabs. Render once inside ThemeProvider.
 *
 * Loop safety comes from React itself: applying an already-current value
 * bails out of setState, so the publish effect below never refires and the
 * exchange converges instead of ping-ponging. The mount broadcast is skipped
 * so opening a tab never stomps its siblings.
 */
export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    publishTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handle = createBroadcastChannel<ThemeSyncEvent>(THEME_SYNC_CHANNEL);
    const unsubscribe = handle.subscribe((message) => {
      if (message.type === "theme-changed" && isTheme(message.theme)) {
        setTheme(message.theme);
      }
    });
    return () => {
      unsubscribe();
      handle.close();
    };
  }, [setTheme]);

  return null;
}
