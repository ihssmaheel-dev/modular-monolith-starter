import * as React from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES: Theme[] = ["dark", "light", "system"];

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var key="theme";var value=localStorage.getItem(key);var valid=value==="dark"||value==="light"||value==="system";var theme=valid?value:"system";var dark=theme==="dark"||(theme==="system"&&window.matchMedia("${COLOR_SCHEME_QUERY}").matches);document.documentElement.classList.toggle("dark",dark);document.documentElement.classList.toggle("light",!dark);document.documentElement.style.colorScheme=dark?"dark":"light";}catch(_){}})();`;

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

export function isTheme(value: string | null): value is Theme {
  if (value === null) return false;
  return THEME_VALUES.includes(value as Theme);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) return storedTheme;
    return defaultTheme;
  });

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      if (typeof window !== "undefined") localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey],
  );

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement;
      const resolvedTheme = nextTheme === "system" ? getSystemTheme() : nextTheme;
      const restoreTransitions = disableTransitionOnChange ? disableTransitionsTemporarily() : null;
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      if (restoreTransitions) restoreTransitions();
    },
    [disableTransitionOnChange],
  );

  React.useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return undefined;
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
    const handleChange = () => applyTheme("system");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, applyTheme]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      }
      if (event.key.toLowerCase() !== "d") return;
      setThemeState((currentTheme) => {
        const nextTheme =
          currentTheme === "dark"
            ? "light"
            : currentTheme === "light"
              ? "dark"
              : getSystemTheme() === "dark"
                ? "light"
                : "dark";
        if (typeof window !== "undefined") localStorage.setItem(storageKey, nextTheme);
        return nextTheme;
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [storageKey]);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
