import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { Account, ImportResult } from "../../api/types";
import { fileBadge, formatKB, IMPORT_ACCEPT, IMPORT_EXT_RE, IMPORT_EXTS } from "../../lib/imports";
import Chip from "../Chip";
import ResultCard from "./ResultCard";

export default function UploadCard({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list || busy) return;
    const ok = Array.from(list).filter((f) => IMPORT_EXT_RE.test(f.name));
    if (ok.length) setStaged((prev) => [...prev, ...ok]);
  };

  async function run() {
    if (!staged.length || accountId === null || busy) return;
    setBusy(true);
    setError(null);
    const done: ImportResult[] = [];
    const enviados = new Set<File>();
    for (const file of staged) {
      const form = new FormData();
      form.append("account_id", String(accountId));
      form.append("file", file);
      try {
        done.push(await api<ImportResult>("/imports", { method: "POST", body: form }));
        enviados.add(file);
      } catch (e) {
        setError(
          `${file.name}: ${(e as Error).message} — arquivos seguintes não foram enviados`
        );
        break;
      }
    }
    // Cards anteriores continuam (podem estar classificando); os novos entram no fim.
    setResults((prev) => [...prev, ...done]);
    // Quem entrou sai da fila por identidade; quem falhou (e os seguintes) fica
    // para o retry.
    setStaged((prev) => prev.filter((f) => !enviados.has(f)));
    setBusy(false);
    if (done.length) queryClient.invalidateQueries();
  }

  const conta = accounts.find((a) => a.id === accountId);

  return (
    <div className="card imp-upload">
      <div className="imp-head">
        <h2>Novo upload</h2>
        <div className="imp-exts mono">
          {IMPORT_EXTS.map((e) => (
            <span key={e}>.{e.toUpperCase()}</span>
          ))}
        </div>
      </div>

      <div className="label imp-step">1. Para qual conta</div>
      <div className="imp-chips">
        {accounts.length === 0 && (
          <p className="note">Crie uma conta em Configurações antes de importar.</p>
        )}
        {accounts.map((a) => (
          <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
            {a.name}{" "}
            <span className="imp-chip-kind">{a.kind === "cartao" ? "cartão" : a.kind}</span>
          </Chip>
        ))}
      </div>

      <div className="label imp-step">2. Os arquivos</div>
      <div
        className={`imp-drop${drag ? " is-drag" : ""}${staged.length ? " has-files" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Escolher arquivos de extrato"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <span className="imp-drop-icon" aria-hidden="true">
          ↓
        </span>
        <div className="imp-drop-title">Arraste os extratos aqui</div>
        <div className="imp-drop-sub">ou clique para escolher — vários de uma vez</div>
        <input
          ref={fileRef}
          type="file"
          accept={IMPORT_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <div className="imp-staged">
          {staged.map((f, i) => (
            <div key={`${f.name}-${i}`} className="imp-file">
              <span className="imp-badge mono">{fileBadge(f.name)}</span>
              <span className="imp-file-name">{f.name}</span>
              <span className="imp-file-size mono">{formatKB(f.size)}</span>
              <button
                type="button"
                className="imp-file-x"
                aria-label={`Remover ${f.name}`}
                disabled={busy}
                onClick={() => setStaged(staged.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="imp-run">
            <button
              type="button"
              className="primary"
              disabled={busy || accountId === null}
              onClick={run}
            >
              {busy
                ? "Importando…"
                : `Importar ${staged.length} ${staged.length === 1 ? "arquivo" : "arquivos"}`}
            </button>
            <span className="note">
              {conta ? `em ${conta.name} · ` : "escolha a conta · "}
              enviados na ordem, um a um
            </span>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {results.map((r) => (
        <ResultCard
          key={r.batch_id}
          r={r}
          onClose={() => setResults(results.filter((x) => x.batch_id !== r.batch_id))}
        />
      ))}

      <p className="note imp-foot">
        Pode reimportar períodos sobrepostos sem medo — duplicadas são descartadas pelo hash
        do lançamento. Se um arquivo falhar, os seguintes não são enviados.
      </p>
    </div>
  );
}
