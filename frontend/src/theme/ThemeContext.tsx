import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { nextMode, parseMode, resolveTheme, type ResolvedTheme, type ThemeMode } from "./theme";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    return parseMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

function storeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage indisponível — tema só não persiste
  }
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const mq = darkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(mode, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const cycle = useCallback(() => {
    setMode((m) => {
      const next = nextMode(m);
      storeMode(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, resolved, cycle }), [mode, resolved, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme requer ThemeProvider");
  return ctx;
}

export interface ThemeColors {
  muted: string;
  baseline: string;
  blue: string;
  blueDark: string;
  red: string;
  ink2: string;
}

export function useThemeColors(): ThemeColors {
  const { resolved } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const v = (name: string) => style.getPropertyValue(name).trim();
    return {
      muted: v("--muted"),
      baseline: v("--baseline"),
      blue: v("--blue"),
      blueDark: v("--blue-dark"),
      red: v("--red"),
      ink2: v("--ink-2"),
    };
    // resolved na dependência: recalcular quando o tema efetivo muda
  }, [resolved]);
}
