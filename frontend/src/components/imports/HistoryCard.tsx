import { useDeleteImport, useImports } from "../../api/hooks";
import { batchBadge, batchTotals, dupSplit, whenLabel } from "../../lib/imports";

export default function HistoryCard() {
  const { data: batches } = useImports();
  const deleteImport = useDeleteImport();
  const list = batches ?? [];
  const t = batchTotals(list);

  return (
    <section className="card">
      <div className="imp-hist-head">
        <h2>Histórico de importações</h2>
        {list.length > 0 && (
          <span className="mono imp-hist-totals">
            {t.novas} novas · {t.dup} duplicadas descartadas
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <p className="muted">Nenhuma importação ainda.</p>
      ) : (
        <>
          <div className="imp-hist-row imp-hist-head-row">
            <div>Arquivo</div>
            <div>Quando</div>
            <div>Resultado</div>
            <div />
          </div>
          {list.map((b) => {
            const s = dupSplit(b.new_count, b.dup_count);
            return (
              <div key={b.id} className="imp-hist-row">
                <div className="imp-hist-file">
                  <span className="imp-badge mono">{batchBadge(b)}</span>
                  <span className="imp-file-name">{b.filename}</span>
                </div>
                <div className="mono imp-hist-when">{whenLabel(b.imported_at)}</div>
                <div>
                  <div className="mono imp-hist-counts">
                    <span className={b.new_count > 0 ? "tone-accent" : "tone-muted"}>
                      {b.new_count}
                    </span>
                    <span className="tone-muted">
                      {" "}
                      novas{b.dup_count > 0 ? ` · ${b.dup_count} dup.` : ""}
                    </span>
                  </div>
                  <div className="imp-hist-bar" aria-hidden="true">
                    <span className="is-new" style={{ width: `${s.novasPct}%` }} />
                    <span className="is-dup" style={{ width: `${s.dupPct}%` }} />
                  </div>
                </div>
                <div className="imp-hist-undo">
                  <button
                    type="button"
                    disabled={deleteImport.isPending}
                    onClick={() =>
                      window.confirm(
                        `Desfazer a importação de ${b.filename}? As ${b.new_count} transações dela serão removidas.`
                      ) && deleteImport.mutate(b.id)
                    }
                  >
                    Desfazer
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <p className="note imp-hist-foot">
        Desfazer pede confirmação e remove as transações daquele arquivo.
      </p>
    </section>
  );
}
