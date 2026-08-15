import { useMemo, useState } from "react";

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

const LIMITE_REGRAS = 60;

export default function RulesCard() {
  const { data: rules } = useRules();
  const { data: ignoreRules } = useIgnoreRules();
  const { data: categories } = useCategories();
  const patchRule = usePatchRule();
  const deleteRule = useDeleteRule();
  const deleteIgnoreRule = useDeleteIgnoreRule();
  const [q, setQ] = useState("");
  const [todas, setTodas] = useState(false);

  const carregando = rules === undefined;
  const total = (rules ?? []).length;
  const buscando = q.trim() !== "";
  const list = useMemo(
    () => filterRules(rules ?? [], categories ?? [], q),
    [rules, categories, q]
  );
  const ignoradas = ignoreRules ?? [];
  // O protótipo assumia ~12 regras; o banco real tem centenas. A lista é sempre
  // limitada (cada linha monta um CategoryChip com todas as categorias); a busca
  // varre todas, e "mostrar todas" abre o resto.
  const visiveis = todas ? list : list.slice(0, LIMITE_REGRAS);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Regras de classificação</h2>
          <div className="sub">
            {carregando
              ? "carregando…"
              : `${total} ${total === 1 ? "regra" : "regras"} · cada correção de categoria em Transações cria uma nova`}
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

      {carregando ? (
        <p className="muted set-rules-empty">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="muted set-rules-empty">
          {buscando
            ? "Nenhuma regra encontrada."
            : "Nenhuma regra ainda — corrigir uma categoria em Transações cria a primeira."}
        </p>
      ) : (
        <div className="set-rules-grid">
          {visiveis.map((r) => (
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

      {list.length > LIMITE_REGRAS && (
        <button
          type="button"
          className="set-rules-more"
          onClick={() => setTodas((t) => !t)}
        >
          {todas
            ? "mostrar menos"
            : `mostrar todas as ${list.length} ${buscando ? "encontradas" : "regras"}`}
        </button>
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
