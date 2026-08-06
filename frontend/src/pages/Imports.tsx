import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import { useAccounts, useClassifyPending, useDeleteImport, useImports } from "../api/hooks";
import type { ClassifiedCounts, ImportResult } from "../api/types";

export default function Imports() {
  const { data: accounts } = useAccounts();
  const { data: batches } = useImports();
  const deleteImport = useDeleteImport();
  const classifyPending = useClassifyPending();
  const queryClient = useQueryClient();

  const [accountId, setAccountId] = useState<number | "">("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files?.length || accountId === "") return;
    setBusy(true);
    setUploadError(null);
    const done: ImportResult[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("account_id", String(accountId));
      form.append("file", file);
      try {
        done.push(await api<ImportResult>("/imports", { method: "POST", body: form }));
      } catch (e) {
        setUploadError(`${file.name}: ${(e as Error).message}`);
        break;
      }
    }
    setResults(done);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    queryClient.invalidateQueries();
  }

  const counts = classifyPending.data as ClassifiedCounts | undefined;

  return (
    <>
      <h2>Importar extratos</h2>
      <div className="card">
        <h3>Novo upload (OFX ou CSV)</h3>
        <div className="row">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Escolha a conta…</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" accept=".ofx,.csv" multiple />
          <button className="primary" disabled={busy || accountId === ""} onClick={handleUpload}>
            {busy ? "Importando…" : "Importar"}
          </button>
        </div>
        {uploadError && <p className="error">{uploadError}</p>}
        {results.map((r) => (
          <p key={r.batch_id} className="muted">
            <b>{r.filename}</b>: {r.new_count} novas, {r.dup_count} duplicadas · classificadas:{" "}
            {r.classified.regra} por regra, {r.classified.llm} pelo LLM, {r.classified.pendente}{" "}
            pendentes
          </p>
        ))}
        <p className="muted">
          Pode reimportar períodos sobrepostos sem medo — duplicadas são descartadas pelo hash.
        </p>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Pendentes de classificação</h3>
          <button onClick={() => classifyPending.mutate(undefined)} disabled={classifyPending.isPending}>
            {classifyPending.isPending ? "Classificando…" : "Reclassificar pendentes"}
          </button>
        </div>
        {counts && (
          <p className="muted">
            Resultado: {counts.regra} por regra, {counts.llm} pelo LLM, {counts.pendente}{" "}
            continuam pendentes.
          </p>
        )}
      </div>
      <div className="card">
        <h3>Histórico de importações</h3>
        {(batches ?? []).length === 0 && <p className="muted">Nenhuma importação ainda.</p>}
        {(batches ?? []).length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Quando</th>
                <th className="num">Novas</th>
                <th className="num">Duplicadas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((b) => (
                <tr key={b.id}>
                  <td>{b.filename}</td>
                  <td className="muted">{b.imported_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="num">{b.new_count}</td>
                  <td className="num">{b.dup_count}</td>
                  <td>
                    <button
                      onClick={() =>
                        window.confirm(
                          `Desfazer a importação de ${b.filename}? As ${b.new_count} transações dela serão removidas.`
                        ) && deleteImport.mutate(b.id)
                      }
                    >
                      Desfazer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
