import { NavLink, Outlet } from "react-router-dom";

import { useTheme } from "../theme/ThemeContext";

const LINKS = [
  ["/", "📊", "Dashboard"],
  ["/transacoes", "💳", "Transações"],
  ["/orcamento", "🎯", "Orçamento"],
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
  const [icon, label] = MODE_LABELS[mode];
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
          {icon} {label}
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
