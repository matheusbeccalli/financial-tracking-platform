import { useState } from "react";

import { api } from "../../api/client";
import {
  useAccounts,
  useCreatePluggyLink,
  useDeletePluggyLink,
  usePluggyStatus,
} from "../../api/hooks";
import type { PluggyItemAccounts } from "../../api/types";
import { whenLabel } from "../../lib/imports";
import { syncFromSuggestion, todayISO } from "../../lib/pluggy";

/** Status de item que exigem ação do usuário no portal da Pluggy. */
const PROBLEM_STATUSES = ["LOGIN_ERROR", "WAITING_USER_INPUT", "OUTDATED"];

export default function PluggyCard() {
  const { data: status } = usePluggyStatus();
  const { data: accounts } = useAccounts();
  const createLink = useCreatePluggyLink();
  const deleteLink = useDeletePluggyLink();
  const [itemId, setItemId] = useState("");
  const [lookupItemId, setLookupItemId] = useState("");
  const [item, setItem] = useState<PluggyItemAccounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // escolhas por conta Pluggy ainda não vinculada: conta local + data de corte
  const [choices, setChoices] = useState<
    Record<string, { accountId: string; syncFrom: string }>
  >({});

  if (!status) return null;
  const locals = accounts ?? [];
  const linked = new Set(status.links.map((l) => l.pluggy_account_id));
  const unlinked = item ? item.accounts.filter((a) => !linked.has(a.id)) : [];

  async function lookup() {
    const id = itemId.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<PluggyItemAccounts>(`/pluggy/items/${id}/accounts`);
      setItem(data);
      setLookupItemId(id);
      setChoices({});
    } catch (e) {
      setItem(null);
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Open Finance (Pluggy)</h2>
        <span className={status.credential_set ? "set-key-pill" : "set-key-pill is-missing"}>
          <span className="set-key-dot" />
          {status.credential_set
            ? "Credencial Pluggy configurada"
            : "sem credencial — defina PLUGGY_CLIENT_ID/SECRET em backend/.env e reinicie"}
        </span>
      </div>

      <p className="note">
        Conecte seus bancos em meu.pluggy.ai, vincule a conexão à sua aplicação no
        dashboard.pluggy.ai e cole aqui o Item ID para vincular as contas.
      </p>

      {status.credential_set && (
        <div className="plg-form">
          <input
            className="mono"
            placeholder="Item ID do dashboard da Pluggy"
            value={itemId}
            aria-label="Item ID da Pluggy"
            onChange={(e) => setItemId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <button type="button" disabled={busy || !itemId.trim()} onClick={lookup}>
            {busy ? "Buscando…" : "Buscar contas"}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {item && item.item_status && PROBLEM_STATUSES.includes(item.item_status) && (
        <p className="error">
          Conexão com status {item.item_status} — reconecte a conta no meu.pluggy.ai.
        </p>
      )}

      {item && unlinked.length === 0 && (
        <p className="note">Todas as contas deste item já estão vinculadas.</p>
      )}

      {unlinked.map((a) => {
        const c = choices[a.id];
        return (
          <div key={a.id} className="plg-row">
            <div>
              <div>{a.name ?? a.subtype ?? a.id}</div>
              <div className="note mono">
                {a.type}
                {a.number ? ` · ${a.number}` : ""}
              </div>
            </div>
            <select
              aria-label={`Conta local para ${a.name ?? a.id}`}
              value={c?.accountId ?? ""}
              onChange={(e) =>
                setChoices({
                  ...choices,
                  [a.id]: {
                    accountId: e.target.value,
                    syncFrom: syncFromSuggestion(
                      status.last_tx_dates[e.target.value],
                      todayISO()
                    ),
                  },
                })
              }
            >
              <option value="">vincular a…</option>
              {locals.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}
                </option>
              ))}
            </select>
            <label className="note">
              a partir de{" "}
              <input
                type="date"
                aria-label={`Sincronizar a partir de (${a.name ?? a.id})`}
                value={c?.syncFrom ?? ""}
                disabled={!c}
                onChange={(e) =>
                  c && setChoices({ ...choices, [a.id]: { ...c, syncFrom: e.target.value } })
                }
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={!c || !c.accountId || !c.syncFrom || createLink.isPending}
              onClick={() =>
                c &&
                createLink.mutate({
                  item_id: lookupItemId,
                  pluggy_account_id: a.id,
                  pluggy_type: a.type,
                  account_id: Number(c.accountId),
                  sync_from: c.syncFrom,
                })
              }
            >
              Vincular
            </button>
          </div>
        );
      })}

      {status.links.length > 0 && (
        <>
          <div className="label plg-links-label">Contas vinculadas</div>
          {status.links.map((l) => {
            const local = locals.find((x) => x.id === l.account_id);
            return (
              <div key={l.id} className="plg-row">
                <div>
                  <div>{local?.name ?? `conta ${l.account_id}`}</div>
                  <div className="note mono">
                    {l.pluggy_type} · desde {l.sync_from}
                  </div>
                </div>
                <span className="note">
                  {l.last_synced_at
                    ? `última sync ${whenLabel(l.last_synced_at)}`
                    : "nunca sincronizada"}
                </span>
                <button
                  type="button"
                  disabled={deleteLink.isPending}
                  onClick={() =>
                    window.confirm(
                      `Remover o vínculo de ${local?.name ?? l.pluggy_account_id}? As transações já importadas ficam.`
                    ) && deleteLink.mutate(l.id)
                  }
                >
                  Remover
                </button>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
