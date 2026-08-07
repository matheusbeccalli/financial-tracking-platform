import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, jsonBody } from "./client";
import type {
  Account,
  AppSettings,
  Bridge,
  BudgetLine,
  ClassificationProgress,
  ClassifiedCounts,
  Category,
  IgnoreRule,
  ImportBatch,
  Rule,
  Summary,
  Tx,
} from "./types";

export const useAccounts = () =>
  useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts") });

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });

export const useSummary = (month: string) =>
  useQuery({
    queryKey: ["summary", month],
    queryFn: () => api<Summary>(`/dashboard/summary?month=${month}`),
  });

export const useSummaries = (months: string[]) =>
  useQueries({
    queries: months.map((m) => ({
      queryKey: ["summary", m],
      queryFn: () => api<Summary>(`/dashboard/summary?month=${m}`),
    })),
  });

export const useBridge = (period: string, ref: string) =>
  useQuery({
    queryKey: ["bridge", period, ref],
    queryFn: () => api<Bridge>(`/dashboard/bridge?period=${period}&ref=${ref}`),
  });

export const useFeed = () =>
  useQuery({ queryKey: ["feed"], queryFn: () => api<Tx[]>("/dashboard/feed") });

export interface TxFilters {
  month?: string;
  account_id?: number;
  category_id?: number;
  q?: string;
  include_ignored?: boolean;
}

export const useTransactions = (filters: TxFilters) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== "") params.set(k, String(v));
      });
      return api<Tx[]>(`/transactions?${params}`);
    },
  });

export const useBudgets = (month: string) =>
  useQuery({
    queryKey: ["budgets", month],
    queryFn: () => api<BudgetLine[]>(`/budgets?month=${month}`),
  });

export const useImports = () =>
  useQuery({ queryKey: ["imports"], queryFn: () => api<ImportBatch[]>("/imports") });

export const useClassification = (
  batchId: number,
  initial: ClassificationProgress
) =>
  useQuery({
    queryKey: ["classification", batchId],
    queryFn: () =>
      api<ClassificationProgress>(`/imports/${batchId}/classification`),
    initialData: initial,
    refetchInterval: (query) =>
      !query.state.error && query.state.data?.status === "running" ? 1500 : false,
  });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api<AppSettings>("/settings") });

export const useRules = () =>
  useQuery({ queryKey: ["rules"], queryFn: () => api<Rule[]>("/rules") });

export const useIgnoreRules = () =>
  useQuery({
    queryKey: ["ignore-rules"],
    queryFn: () => api<IgnoreRule[]>("/ignore-rules"),
  });

function useInvalidatingMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const usePatchTx = () =>
  useInvalidatingMutation(
    ({ id, patch }: { id: number; patch: { category_id?: number; ignored?: boolean } }) =>
      api(`/transactions/${id}`, jsonBody("PATCH", patch))
  );

export const useCopyBudget = () =>
  useInvalidatingMutation((payload: { from_month: string; to_month: string }) =>
    api("/budgets/copy", jsonBody("POST", payload))
  );

export const usePutBudget = () =>
  useInvalidatingMutation(
    (payload: { category_id: number; amount_cents: number; valid_from: string }) =>
      api("/budgets", jsonBody("PUT", payload))
  );

export const useDeleteImport = () =>
  useInvalidatingMutation((id: number) => api(`/imports/${id}`, { method: "DELETE" }));

export const useClassifyPending = () =>
  useInvalidatingMutation(() =>
    api<ClassifiedCounts>("/classify/pending", { method: "POST" })
  );

export const usePutSettings = () =>
  useInvalidatingMutation((payload: { llm_model: string }) =>
    api("/settings", jsonBody("PUT", payload))
  );

export const useCreateCategory = () =>
  useInvalidatingMutation((payload: { name: string; kind: string; color?: string }) =>
    api("/categories", jsonBody("POST", payload))
  );

export const usePatchCategory = () =>
  useInvalidatingMutation(
    ({ id, patch }: { id: number; patch: { name?: string; color?: string; archived?: boolean } }) =>
      api(`/categories/${id}`, jsonBody("PATCH", patch))
  );

export const useCreateAccount = () =>
  useInvalidatingMutation((payload: { name: string; institution: string; kind: string }) =>
    api("/accounts", jsonBody("POST", payload))
  );

export const usePatchAccount = () =>
  useInvalidatingMutation(({ id, name }: { id: number; name: string }) =>
    api(`/accounts/${id}`, jsonBody("PATCH", { name }))
  );

export const usePatchRule = () =>
  useInvalidatingMutation(({ id, category_id }: { id: number; category_id: number }) =>
    api(`/rules/${id}`, jsonBody("PATCH", { category_id }))
  );

export const useDeleteRule = () =>
  useInvalidatingMutation((id: number) => api(`/rules/${id}`, { method: "DELETE" }));

export const useDeleteIgnoreRule = () =>
  useInvalidatingMutation((id: number) =>
    api(`/ignore-rules/${id}`, { method: "DELETE" })
  );
