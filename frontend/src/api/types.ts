export interface Account {
  id: number;
  name: string;
  institution: string;
  kind: "corrente" | "cartao";
}

export interface Category {
  id: number;
  name: string;
  kind: "entrada" | "saida";
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
  kind: "entrada" | "saida";
  real: number;
  orcado: number;
}

export interface Summary {
  month: string;
  entradas: RealOrc;
  saidas: RealOrc;
  saldo: RealOrc;
  ritmo: number | null;
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
  kind: "entrada" | "saida";
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

export interface ImportResult {
  batch_id: number;
  filename: string;
  new_count: number;
  dup_count: number;
  classified: ClassifiedCounts;
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
