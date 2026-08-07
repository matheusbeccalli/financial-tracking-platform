import { useState } from "react";

import {
  useAccounts,
  useCategories,
  useCreateAccount,
  useCreateCategory,
  useDeleteIgnoreRule,
  useDeleteRule,
  useIgnoreRules,
  usePatchAccount,
  usePatchCategory,
  usePatchRule,
  useRules,
  useSettings,
  usePutSettings,
} from "../api/hooks";
import CategorySelect from "../components/CategorySelect";

const KNOWN_MODELS = [
  ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 — padrão, custo mínimo"],
  ["claude-sonnet-5", "Claude Sonnet 5 — mais qualidade"],
] as const;

export default function Settings() {
  return (
    <>
      <h2>Configurações</h2>
      <LlmSection />
      <CategoriesSection />
      <AccountsSection />
      <RulesSection />
      <IgnoreRulesSection />
    </>
  );
}

function LlmSection() {
  const { data: settings } = useSettings();
  const putSettings = usePutSettings();
  const [model, setModel] = useState<string | null>(null);
  if (!settings) return null;
  const value = model ?? settings.llm_model;
  return (
    <div className="card">
      <h3>Classificação por LLM</h3>
      <div className="row">
        <select value={value} onChange={(e) => setModel(e.target.value)}>
          {KNOWN_MODELS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          {!KNOWN_MODELS.some(([id]) => id === value) && (
            <option value={value}>{value}</option>
          )}
        </select>
        <input
          placeholder="ou id de modelo custom…"
          onKeyDown={(e) =>
            e.key === "Enter" && setModel((e.target as HTMLInputElement).value)
          }
        />
        <button
          className="primary"
          disabled={value === settings.llm_model || putSettings.isPending}
          onClick={() => putSettings.mutate({ llm_model: value })}
        >
          Salvar modelo
        </button>
      </div>
      <p className="muted">
        Chave da API Anthropic:{" "}
        {settings.api_key_set ? (
          <b style={{ color: "var(--good)" }}>configurada ✓</b>
        ) : (
          <b style={{ color: "var(--critical)" }}>
            não configurada — defina ANTHROPIC_API_KEY em backend/.env e reinicie o app
          </b>
        )}
      </p>
    </div>
  );
}

function CategoriesSection() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const patchCategory = usePatchCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"entrada" | "saida">("saida");
  const [showArchived, setShowArchived] = useState(false);
  const list = (categories ?? []).filter((c) => showArchived || !c.archived);
  return (
    <div className="card">
      <h3>Categorias</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          placeholder="Nova categoria…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as "entrada" | "saida")}>
          <option value="saida">saída</option>
          <option value="entrada">entrada</option>
        </select>
        <button
          disabled={!name.trim()}
          onClick={() => {
            createCategory.mutate({ name: name.trim(), kind });
            setName("");
          }}
        >
          Adicionar
        </button>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          mostrar arquivadas
        </label>
      </div>
      {createCategory.error && (
        <p className="error">{(createCategory.error as Error).message}</p>
      )}
      <table>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} style={c.archived ? { opacity: 0.5 } : undefined}>
              <td>
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) =>
                    patchCategory.mutate({ id: c.id, patch: { color: e.target.value } })
                  }
                  style={{ width: 36, padding: 2 }}
                />
              </td>
              <td>
                <InlineText
                  value={c.name}
                  onSave={(name) => patchCategory.mutate({ id: c.id, patch: { name } })}
                />
              </td>
              <td>
                <span className="badge">{c.kind}</span>
              </td>
              <td>
                <button
                  onClick={() =>
                    patchCategory.mutate({ id: c.id, patch: { archived: !c.archived } })
                  }
                >
                  {c.archived ? "Restaurar" : "Arquivar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountsSection() {
  const { data: accounts } = useAccounts();
  const createAccount = useCreateAccount();
  const patchAccount = usePatchAccount();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<"corrente" | "cartao">("corrente");
  return (
    <div className="card">
      <h3>Contas</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Nome…" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Instituição…"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "corrente" | "cartao")}
        >
          <option value="corrente">conta corrente</option>
          <option value="cartao">cartão</option>
        </select>
        <button
          disabled={!name.trim() || !institution.trim()}
          onClick={() => {
            createAccount.mutate({
              name: name.trim(),
              institution: institution.trim().toLowerCase(),
              kind,
            });
            setName("");
            setInstitution("");
          }}
        >
          Adicionar
        </button>
      </div>
      <table>
        <tbody>
          {(accounts ?? []).map((a) => (
            <tr key={a.id}>
              <td>
                <InlineText
                  value={a.name}
                  onSave={(newName) => patchAccount.mutate({ id: a.id, name: newName })}
                />
              </td>
              <td className="muted">{a.institution}</td>
              <td>
                <span className="badge">{a.kind}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesSection() {
  const { data: rules } = useRules();
  const patchRule = usePatchRule();
  const deleteRule = useDeleteRule();
  return (
    <div className="card">
      <h3>Regras de classificação</h3>
      {(rules ?? []).length === 0 && (
        <p className="muted">
          Nenhuma regra ainda — corrigir uma categoria em Transações cria a primeira.
        </p>
      )}
      {(rules ?? []).length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Descrição normalizada</th>
              <th>Categoria</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(rules ?? []).map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: "monospace", fontSize: 13 }}>{r.matcher}</td>
                <td>
                  <CategorySelect
                    value={r.category_id}
                    onChange={(id) =>
                      id !== null && patchRule.mutate({ id: r.id, category_id: id })
                    }
                  />
                </td>
                <td>
                  <button
                    onClick={() =>
                      window.confirm(`Apagar a regra "${r.matcher}"?`) &&
                      deleteRule.mutate(r.id)
                    }
                  >
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function IgnoreRulesSection() {
  const { data: rules } = useIgnoreRules();
  const deleteRule = useDeleteIgnoreRule();
  return (
    <div className="card">
      <h3>Regras de ignorar</h3>
      <p className="muted">
        Transações com estas descrições entram marcadas como ignoradas (não contam no
        fluxo). Criadas ao usar o 🚫 em Transações; apagar vale para importações futuras.
      </p>
      {(rules ?? []).length === 0 && <p className="muted">Nenhuma regra de ignorar.</p>}
      {(rules ?? []).length > 0 && (
        <table>
          <tbody>
            {(rules ?? []).map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: "monospace", fontSize: 13 }}>{r.matcher}</td>
                <td style={{ width: 90 }}>
                  <button
                    onClick={() =>
                      window.confirm(`Apagar a regra de ignorar "${r.matcher}"?`) &&
                      deleteRule.mutate(r.id)
                    }
                  >
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InlineText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() && text !== value && onSave(text.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{ border: "1px solid transparent", background: "transparent" }}
      onFocus={(e) => (e.target.style.border = "1px solid var(--baseline)")}
    />
  );
}
