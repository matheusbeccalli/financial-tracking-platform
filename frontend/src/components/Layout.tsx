import { NavLink, Outlet, useLocation } from "react-router-dom";

import type { ThemeMode } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import Segmented from "./Segmented";

const LINKS = [
  ["/", "Dashboard"],
  ["/transacoes", "Transações"],
  ["/orcamento", "Orçamento"],
  ["/tendencias", "Tendências"],
  ["/importar", "Importar"],
  ["/config", "Configurações"],
] as const;

// O handoff desenha dois estados (escuro | claro); o app tem três modos e o
// automático é o padrão — mantido como primeiro item do mesmo controle.
const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: "system", label: "auto" },
  { value: "light", label: "claro" },
  { value: "dark", label: "escuro" },
];

export default function Layout() {
  const { mode, setMode } = useTheme();
  const { pathname } = useLocation();
  const wide = pathname === "/tendencias"; // matriz de meses precisa da tela toda
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-name">Finanças</div>
        </div>
        <nav className="nav">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <span className="nav-dot" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Tema</span>
          <Segmented
            value={mode}
            options={THEME_OPTIONS}
            onChange={setMode}
            ariaLabel="Tema"
          />
        </div>
      </aside>
      <main className={wide ? "main main--wide" : "main"}>
        <Outlet />
      </main>
    </div>
  );
}
