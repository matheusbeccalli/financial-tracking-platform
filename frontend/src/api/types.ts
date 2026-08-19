export interface Account {
  id: number;
  name: string;
  institution: string;
  kind: "corrente" | "cartao";
}

export type CategoryKind = "entrada" | "saida" | "investimento";

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  color: string;
  archived: boolean;
}

export interface Tx {
  id: number;
  account_id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  source: "regra" | "llm" | "manual" | null;
  installment: string | null;
  ignored: boolean;
}

export interface RealOrc {
  real: number;
  orcado: number;
}

export interface CatLine {
  id: number;
  nome: string;
  kind: CategoryKind;
  real: number;
  orcado: number;
}

export interface Dias {
  decorridos: number;
  no_mes: number;
}

export interface Summary {
  month: string;
  entradas: RealOrc;
  saidas: RealOrc;
  investimentos: RealOrc;
  saldo: RealOrc;
  /** Pontos percentuais: % do orçado consumido − % do mês decorrido. Negativo = folga. */
  ritmo: number | null;
  dias: Dias;
  categorias: CatLine[];
}

export interface BridgeStep {
  categoria: string;
  delta: number;
}

export interface Bridge {
  period: string;
  ref: string;
  months: string[];
  start: number;
  steps: BridgeStep[];
  end: number;
}

export interface BudgetLine {
  category_id: number;
  category_name: string;
  kind: CategoryKind;
  amount_cents: number;
}

export interface ImportBatch {
  id: number;
  filename: string;
  source: string;
  imported_at: string;
  new_count: number;
  dup_count: number;
}

export interface ClassifiedCounts {
  regra: number;
  llm: number;
  pendente: number;
}

export interface ClassificationProgress {
  status: "running" | "done" | "error" | "interrupted";
  total: number;
  done: number;
  counts: ClassifiedCounts;
}

export interface ImportResult {
  batch_id: number;
  filename: string;
  new_count: number;
  dup_count: number;
  classification: ClassificationProgress;
}

export interface Rule {
  id: number;
  matcher: string;
  category_id: number;
}

export interface IgnoreRule {
  id: number;
  matcher: string;
}

export interface AppSettings {
  llm_model: string;
  api_key_set: boolean;
}

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  name: string | null;
  number: string | null;
}

export interface PluggyItemAccounts {
  item_status: string | null;
  connector: string | null;
  accounts: PluggyAccount[];
}

export interface PluggyLink {
  id: number;
  item_id: string;
  pluggy_account_id: string;
  pluggy_type: "BANK" | "CREDIT";
  account_id: number;
  sync_from: string;
  last_synced_at: string | null;
}

export interface PluggyStatus {
  credential_set: boolean;
  links: PluggyLink[];
  /** account_id local (como string) → data ISO da última transação da conta */
  last_tx_dates: Record<string, string>;
}

/** Elemento da resposta de POST /pluggy/sync: sucesso tem cara de ImportResult. */
export interface SyncResult {
  link_id: number;
  account: string;
  batch_id?: number;
  filename?: string;
  new_count?: number;
  dup_count?: number;
  skipped_currency?: number;
  classification?: ClassificationProgress;
  error?: string;
}

export type InstallmentStatus = "ok" | "risco" | "estouro";

export interface InstallmentCatRow {
  id: number | null;
  nome: string;
  parcelas: number[];
  orcado: (number | null)[];
  status: InstallmentStatus[];
}

export interface InstallmentSeries {
  tx_id: number;
  descricao: string;
  conta: string;
  categoria_id: number | null;
  categoria_nome: string | null;
  numero: number;
  total: number;
  valor: number;
  termina_em: string;
  restante: number;
}

export interface InstallmentsProjection {
  month: string;
  months: string[];
  categorias: InstallmentCatRow[];
  totais: number[];
  series: InstallmentSeries[];
}
