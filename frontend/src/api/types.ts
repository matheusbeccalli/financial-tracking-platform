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
