import { useFeed, usePatchTx } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import CategorySelect from "../CategorySelect";

export default function LlmFeed() {
  const { data: feed } = useFeed();
  const patchTx = usePatchTx();
  if (!feed || feed.length === 0) return null;
  return (
    <div className="card" style={{ borderColor: "#e8b8a8", background: "#fffaf7" }}>
      <h3>🤖 Classificadas pelo LLM recentemente</h3>
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
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Corrigir aqui cria uma regra — a próxima ocorrência dessa descrição nem passa pelo LLM.
      </p>
    </div>
  );
}
