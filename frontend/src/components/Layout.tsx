import { NavLink, Outlet } from "react-router-dom";

const LINKS = [
  ["/", "📊", "Dashboard"],
  ["/transacoes", "💳", "Transações"],
  ["/orcamento", "🎯", "Orçamento"],
  ["/importar", "📥", "Importar"],
  ["/config", "⚙️", "Configurações"],
] as const;

export default function Layout() {
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
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
