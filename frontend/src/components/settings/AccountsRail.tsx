import { useState } from "react";

import { useAccounts, useCreateAccount, usePatchAccount } from "../../api/hooks";
import { accountsSummary, groupAccounts } from "../../lib/settings";
import InlineText from "../InlineText";
import Segmented from "../Segmented";

const ACC_KINDS = [
  { value: "corrente" as const, label: "corrente" },
  { value: "cartao" as const, label: "cartão" },
];

export default function AccountsRail() {
  const { data: accounts } = useAccounts();
  const createAccount = useCreateAccount();
  const patchAccount = usePatchAccount();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<"corrente" | "cartao">("corrente");

  const list = accounts ?? [];
  const grupos = groupAccounts(list);

  const add = () => {
    if (!name.trim() || !institution.trim()) return;
    createAccount.mutate({
      name: name.trim(),
      institution: institution.trim().toLowerCase(),
      kind,
    });
    setName("");
    setInstitution("");
  };

  return (
    <div className="card set-accounts">
      <h2>Contas</h2>
      <div className="sub">{accountsSummary(list)}</div>

      <div className="set-inst-list">
        {grupos.map((g) => (
          <div key={g.institution}>
            <div className="label set-inst-label">{g.institution}</div>
            {g.accounts.map((a) => (
              <div key={a.id} className="set-account-row">
                <InlineText
                  value={a.name}
                  ariaLabel={`Nome da conta ${a.name}`}
                  onSave={(novo) => patchAccount.mutate({ id: a.id, name: novo })}
                />
                <span className="set-kind-tag">{a.kind === "cartao" ? "cartão" : a.kind}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="set-new-account">
        <div className="label">Nova conta</div>
        <input placeholder="Nome…" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Instituição…"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
        <div className="set-new-account-row">
          <Segmented value={kind} options={ACC_KINDS} onChange={setKind} ariaLabel="Tipo da conta" />
          <button type="button" disabled={!name.trim() || !institution.trim()} onClick={add}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
