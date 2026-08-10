import { useState } from "react";
import { Link } from "react-router-dom";

import { useCategories, useFeed, usePatchTx } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import { dayMonth } from "../../lib/months";

const PREVIEW = 3;

export default function LlmStrip() {
  const { data: feed } = useFeed();
  const { data: categories } = useCategories();
  const patchTx = usePatchTx();
  const [busy, setBusy] = useState(false);
  if (!feed || feed.length === 0) return null;

  const nomes = new Map((categories ?? []).map((c) => [c.id, c.name]));

  async function confirmAll() {
    setBusy(true);
    try {
      for (const t of feed ?? []) {
        if (t.category_id !== null) {
          await patchTx.mutateAsync({ id: t.id, patch: { category_id: t.category_id } });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="llm-strip">
      <div className="llm-strip-head">
        <div className="llm-strip-title">Classificadas pelo LLM</div>
        <div className="sub">confirme e vira regra</div>
      </div>
      <div className="llm-strip-cards">
        {feed.slice(0, PREVIEW).map((t) => (
          <div key={t.id} className="llm-card">
            <div className="llm-card-main">
              <div className="llm-card-desc">{t.description}</div>
              <div className="llm-card-meta mono">
                {dayMonth(t.date)} ·{" "}
                {formatBRL(Math.abs(t.amount_cents)).replace("R$", "").trim()}
              </div>
            </div>
            <span className="chip tone-accent llm-card-chip">
              {t.category_id === null ? "sem categoria" : (nomes.get(t.category_id) ?? "—")}
            </span>
          </div>
        ))}
      </div>
      <div className="llm-strip-actions">
        <button className="ghost" onClick={confirmAll} disabled={busy}>
          {busy ? "Confirmando…" : "Confirmar todas"}
        </button>
        <Link to="/transacoes">revisar {feed.length} →</Link>
      </div>
    </section>
  );
}
