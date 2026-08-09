import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useTheme } from "../theme/ThemeContext";

const LINKS = [
  ["/", "📊", "Dashboard"],
  ["/transacoes", "💳", "Transações"],
  ["/orcamento", "🎯", "Orçamento"],
  ["/tendencias", "📈", "Tendências"],
  ["/importar", "📥", "Importar"],
  ["/config", "⚙️", "Configurações"],
] as const;

const MODE_LABELS = {
  system: ["🖥️", "Tema: sistema"],
  light: ["☀️", "Tema: claro"],
  dark: ["🌙", "Tema: escuro"],
} as const;

export default function Layout() {
  const { mode, cycle } = useTheme();
  const { pathname } = useLocation();
  const [modeIcon, modeLabel] = MODE_LABELS[mode];
  const wide = pathname === "/tendencias"; // matriz de 14 colunas precisa da tela toda
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Finanças</h1>
        <nav>
          {LINKS.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {icon} {label}
            </NavLink>
          ))}
        </nav>
        <button className="theme-toggle" onClick={cycle} title="Alternar tema">
          {modeIcon} {modeLabel}
        </button>
      </aside>
      <main className={wide ? "content content-wide" : "content"}>
        <Outlet />
      </main>
    </div>
  );
}
