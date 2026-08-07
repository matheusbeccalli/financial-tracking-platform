import { useState } from "react";

import { useFeed, usePatchTx } from "../../api/hooks";
import type { Tx } from "../../api/types";
import { formatBRL } from "../../lib/money";
import CategorySelect from "../CategorySelect";

export default function LlmFeed() {
  const { data: feed } = useFeed();
  const patchTx = usePatchTx();
  const [busy, setBusy] = useState(false);
  if (!feed || feed.length === 0) return null;

  const confirmOne = (t: Tx) =>
    t.category_id !== null &&
    patchTx.mutate({ id: t.id, patch: { category_id: t.category_id } });

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
    <div className="card warn">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>🤖 Classificadas pelo LLM recentemente</h3>
        <button onClick={confirmAll} disabled={busy}>
          {busy ? "Confirmando…" : "✓ Confirmar todas"}
        </button>
      </div>
      <table>
        <tbody>
          {feed.map((t) => (
            <tr key={t.id}>
              <td className="muted">{t.date}</td>
              <td>{t.description}</td>
              <td className="num">{formatBRL(t.amount_cents)}</td>
              <td>
                <CategorySelect
                  value={t.category_id}
                  onChange={(id) =>
                    id !== null && patchTx.mutate({ id: t.id, patch: { category_id: id } })
                  }
                />
              </td>
              <td>
                <button
                  title="Confirmar esta classificação (cria regra e sai do feed)"
                  disabled={busy}
                  onClick={() => confirmOne(t)}
                >
                  ✓
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Confirmar ou corrigir cria uma regra — a próxima ocorrência dessa descrição nem passa
        pelo LLM.
      </p>
    </div>
  );
}
