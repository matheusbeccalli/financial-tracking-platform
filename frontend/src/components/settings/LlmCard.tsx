import { useState } from "react";

import { usePutSettings, useSettings } from "../../api/hooks";

const KNOWN_MODELS = [
  { id: "claude-haiku-4-5-20251001", nome: "Claude Haiku 4.5", sub: "padrão · custo mínimo" },
  { id: "claude-sonnet-5", nome: "Claude Sonnet 5", sub: "mais qualidade" },
];

export default function LlmCard() {
  const { data: settings } = useSettings();
  const putSettings = usePutSettings();
  const [model, setModel] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  if (!settings) return null;

  const value = model ?? settings.llm_model;
  const dirty = value !== settings.llm_model;
  const isKnown = KNOWN_MODELS.some((m) => m.id === value);
  // Texto digitado sem Enter não pode ser descartado em silêncio pelo Salvar.
  const pendente = custom.trim() !== "";

  return (
    <section className="card">
      <div className="card-head">
        <h2>Classificação por LLM</h2>
        <span className={settings.api_key_set ? "set-key-pill" : "set-key-pill is-missing"}>
          <span className="set-key-dot" />
          {settings.api_key_set
            ? "Chave da API configurada"
            : "sem chave — defina ANTHROPIC_API_KEY em backend/.env e reinicie"}
        </span>
      </div>

      <div className="set-models">
        {KNOWN_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={value === m.id ? "set-model is-active" : "set-model"}
            onClick={() => setModel(m.id)}
          >
            <span className="set-model-name">
              <span className="set-radio" aria-hidden="true" />
              {m.nome}
            </span>
            <span className="set-model-sub">{m.sub}</span>
            <span className="set-model-id mono">{m.id}</span>
          </button>
        ))}
        <div className={isKnown ? "set-model set-model--other" : "set-model set-model--other is-active"}>
          <span className="set-model-name">Outro modelo</span>
          {!isKnown && <span className="set-model-id mono">{value}</span>}
          <input
            className="mono"
            placeholder="id do modelo + Enter"
            value={custom}
            aria-label="Id de modelo custom"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                setModel(custom.trim());
                setCustom("");
              }
            }}
          />
        </div>
      </div>

      <div className="set-save">
        <button
          type="button"
          className="primary"
          disabled={!dirty || pendente || putSettings.isPending}
          onClick={() => putSettings.mutate({ llm_model: value })}
        >
          Salvar modelo
        </button>
        <span className="note">
          {pendente
            ? "pressione Enter no id digitado para usá-lo"
            : dirty
              ? "modelo alterado — salve para valer nas próximas classificações"
              : "nenhuma mudança para salvar"}
        </span>
      </div>
    </section>
  );
}
