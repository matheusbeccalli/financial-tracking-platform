import { useState } from "react";

import { useCategories, useCreateCategory, usePatchCategory } from "../../api/hooks";
import type { Category, CategoryKind } from "../../api/types";
import { groupByKind } from "../../lib/settings";
import InlineText from "../InlineText";
import Segmented from "../Segmented";

const KIND_OPTIONS = [
  { value: "saida" as const, label: "saída" },
  { value: "entrada" as const, label: "entrada" },
  { value: "investimento" as const, label: "investimento" },
];

const SECTIONS: { kind: CategoryKind; label: string; nota?: string }[] = [
  { kind: "entrada", label: "Entradas" },
  {
    kind: "investimento",
    label: "Investimento",
    nota: "— não entra em entradas nem em saídas",
  },
  { kind: "saida", label: "Saídas" },
];

type CatPatch = { name?: string; color?: string; archived?: boolean; kind?: CategoryKind };

export default function CategoriesCard() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const patchCategory = usePatchCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("saida");
  const [showArchived, setShowArchived] = useState(false);

  const all = categories ?? [];
  const ativas = all.filter((c) => !c.archived).length;
  const groups = groupByKind(all, showArchived);
  const patch = (id: number, p: CatPatch) => patchCategory.mutate({ id, patch: p });

  const add = () => {
    if (!name.trim()) return;
    createCategory.mutate({ name: name.trim(), kind });
    setName("");
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Categorias</h2>
          <div className="sub">
            {ativas} ativas · clique no nome para renomear, no quadrado para a cor, na
            etiqueta para o tipo
          </div>
        </div>
        <label className="set-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          mostrar arquivadas
        </label>
      </div>

      <div className="set-new-cat">
        <input
          placeholder="Nova categoria…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Segmented
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
          ariaLabel="Tipo da nova categoria"
        />
        <button type="button" disabled={!name.trim()} onClick={add}>
          Adicionar
        </button>
      </div>
      {createCategory.error && (
        <p className="error">{(createCategory.error as Error).message}</p>
      )}

      {SECTIONS.map(({ kind: k, label, nota }) => (
        <div key={k}>
          <div className="set-cat-section">
            <span className={`set-dot set-dot--${k}`} />
            <span className="set-cat-section-label">{label}</span>
            {nota && <span className="set-cat-section-nota">{nota}</span>}
          </div>
          <div className="set-cat-grid">
            {groups[k].map((c) => (
              <CategoryRow key={c.id} c={c} onPatch={patch} />
            ))}
            {groups[k].length === 0 && <p className="muted">Nenhuma categoria.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryRow({
  c,
  onPatch,
}: {
  c: Category;
  onPatch: (id: number, p: CatPatch) => void;
}) {
  return (
    <div className={c.archived ? "set-cat-row is-archived" : "set-cat-row"}>
      {/* O quadrado é um label sobre um input[type=color] escondido: clique abre o picker. */}
      <label className="set-swatch" style={{ background: c.color }}>
        <input
          type="color"
          value={c.color}
          aria-label={`Cor da categoria ${c.name}`}
          onChange={(e) => onPatch(c.id, { color: e.target.value })}
        />
      </label>
      <InlineText
        value={c.name}
        ariaLabel={`Nome da categoria ${c.name}`}
        onSave={(novo) => onPatch(c.id, { name: novo })}
      />
      <KindPill c={c} onPatch={onPatch} />
      <button
        type="button"
        className="set-archive"
        onClick={() => onPatch(c.id, { archived: !c.archived })}
      >
        {c.archived ? "restaurar" : "arquivar"}
      </button>
    </div>
  );
}

function KindPill({
  c,
  onPatch,
}: {
  c: Category;
  onPatch: (id: number, p: CatPatch) => void;
}) {
  return (
    <span className={c.kind === "investimento" ? "set-kind-pill tone-invest" : "set-kind-pill"}>
      <span>{c.kind === "saida" ? "saída" : c.kind} ⌄</span>
      <select
        className="set-kind-select"
        aria-label={`Tipo da categoria ${c.name}`}
        value={c.kind}
        onChange={(e) => {
          const kind = e.target.value as CategoryKind;
          if (kind === c.kind) return;
          if (
            window.confirm(
              `Mudar "${c.name}" de "${c.kind}" para "${kind}"? Os dashboards de todos os meses, inclusive passados, passam a interpretar a categoria pelo novo tipo.`
            )
          )
            onPatch(c.id, { kind });
        }}
      >
        <option value="saida">saída</option>
        <option value="entrada">entrada</option>
        <option value="investimento">investimento</option>
      </select>
    </span>
  );
}
