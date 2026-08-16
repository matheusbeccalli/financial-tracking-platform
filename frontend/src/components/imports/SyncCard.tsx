import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { usePluggyStatus } from "../../api/hooks";
import type { ImportResult, SyncResult } from "../../api/types";
import ResultCard from "./ResultCard";

/**
 * Botão Sincronizar do Open Finance. O resultado por conta tem a mesma cara do
 * import por arquivo, então reusa o ResultCard (com o polling de classificação).
 */
export default function SyncCard() {
  const { data: status } = usePluggyStatus();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<SyncResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status) return null;
  const ready = status.credential_set && status.links.length > 0;

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<SyncResult[]>("/pluggy/sync", { method: "POST" });
      setResults((prev) => [...prev, ...r]);
      queryClient.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const ok = results.filter((r) => r.batch_id !== undefined);
  const failed = results.filter((r) => r.error);

  return (
    <section className="card">
      <div className="imp-head">
        <h2>Open Finance</h2>
        <span className="note">
          {status.links.length > 0
            ? `${status.links.length} ${status.links.length === 1 ? "conta vinculada" : "contas vinculadas"}`
            : "nenhuma conta vinculada"}
        </span>
      </div>
      <div className="imp-run">
        <button type="button" className="primary" disabled={!ready || busy} onClick={run}>
          {busy ? "Sincronizando…" : "Sincronizar"}
        </button>
        {!ready && (
          <span className="note">
            {status.credential_set ? (
              <>
                vincule suas contas em <Link to="/config">Configurações</Link>
              </>
            ) : (
              <>
                configure PLUGGY_CLIENT_ID/SECRET em backend/.env e vincule as contas em{" "}
                <Link to="/config">Configurações</Link>
              </>
            )}
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {failed.map((r, i) => (
        <p key={`${r.link_id}-${i}`} className="error">
          {r.account}: {r.error}
        </p>
      ))}
      {ok.map((r) => (
        <ResultCard
          key={r.batch_id}
          r={r as ImportResult}
          onClose={() => setResults(results.filter((x) => x !== r))}
        />
      ))}
    </section>
  );
}
