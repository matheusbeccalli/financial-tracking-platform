import { useState } from "react";

import {
  useCategories,
  useDeleteIgnoreRule,
  useDeleteRule,
  usePatchRule,
  useRules,
  useIgnoreRules,
} from "../../api/hooks";
import { filterRules } from "../../lib/settings";
import CategoryChip from "../CategoryChip";

export default function RulesCard() {
  const { data: rules } = useRules();
  const { data: ignoreRules } = useIgnoreRules();
  const { data: categories } = useCategories();
  const patchRule = usePatchRule();
  const deleteRule = useDeleteRule();
  const deleteIgnoreRule = useDeleteIgnoreRule();
  const [q, setQ] = useState("");

  const total = (rules ?? []).length;
  const list = filterRules(rules ?? [], categories ?? [], q);
  const ignoradas = ignoreRules ?? [];

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Regras de classificação</h2>
          <div className="sub">
            {total} {total === 1 ? "regra" : "regras"} · cada correção de categoria em
            Transações cria uma nova
          </div>
        </div>
        <input
          className="set-rule-search"
          placeholder="Buscar descrição ou categoria…"
          aria-label="Buscar regra"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <p className="muted set-rules-empty">
          {q
            ? "Nenhuma regra encontrada."
            : "Nenhuma regra ainda — corrigir uma categoria em Transações cria a primeira."}
        </p>
      ) : (
        <div className="set-rules-grid">
          {list.map((r) => (
            <div key={r.id} className="set-rule-row">
              <span className="mono set-rule-matcher" title={r.matcher}>
                {r.matcher}
              </span>
              <CategoryChip
                value={r.category_id}
                ariaLabel={`Categoria da regra ${r.matcher}`}
                onChange={(id) => id !== null && patchRule.mutate({ id: r.id, category_id: id })}
              />
              <button
                type="button"
                className="set-rule-x"
                aria-label={`Apagar a regra ${r.matcher}`}
                onClick={() =>
                  window.confirm(`Apagar a regra "${r.matcher}"?`) && deleteRule.mutate(r.id)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="set-ignore">
        <div className="set-ignore-head">
          <h3>Regras de ignorar</h3>
          <span className="sub">
            criadas pelo ⊘ em Transações — a transação entra marcada como ignorada, fora do
            fluxo
          </span>
        </div>
        {ignoradas.length === 0 ? (
          <p className="muted">Nenhuma regra de ignorar.</p>
        ) : (
          <div className="set-rules-grid">
            {ignoradas.map((r) => (
              <div key={r.id} className="set-rule-row">
                <span className="mono set-rule-matcher" title={r.matcher}>
                  {r.matcher}
                </span>
                <span className="set-kind-tag">ignorada</span>
                <button
                  type="button"
                  className="set-rule-x"
                  aria-label={`Apagar a regra de ignorar ${r.matcher}`}
                  onClick={() =>
                    window.confirm(`Apagar a regra de ignorar "${r.matcher}"?`) &&
                    deleteIgnoreRule.mutate(r.id)
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="note set-rules-foot">
        Apagar pede confirmação. A regra deixa de valer para importações futuras —
        lançamentos já classificados por ela continuam como estão.
      </p>
    </section>
  );
}
