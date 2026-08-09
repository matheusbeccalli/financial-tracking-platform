import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { parseMode, resolveTheme, type ResolvedTheme, type ThemeMode } from "./theme";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
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

  useEffect(() => {
    storeMode(mode);
  }, [mode]);

  const resolved = resolveTheme(mode, systemDark);

  // Escrita idempotente durante o render: useThemeColors lê getComputedStyle
  // no render dos consumidores deste mesmo passe — um efeito só rodaria
  // depois que a árvore inteira renderizasse, deixando os gráficos um tema
  // atrasado.
  if (document.documentElement.dataset.theme !== resolved) {
    document.documentElement.dataset.theme = resolved;
  }

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved]);
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
    };
    // resolved na dependência: recalcular quando o tema efetivo muda
  }, [resolved]);
}
