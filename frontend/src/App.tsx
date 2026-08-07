import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import Toasts from "./components/Toasts";
import { showToast } from "./lib/toast";
import Budget from "./pages/Budget";
import Dashboard from "./pages/Dashboard";
import Imports from "./pages/Imports";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onError: (error) => showToast(error.message || "Erro inesperado"),
  }),
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transacoes" element={<Transactions />} />
            <Route path="/orcamento" element={<Budget />} />
            <Route path="/importar" element={<Imports />} />
            <Route path="/config" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toasts />
    </QueryClientProvider>
  );
}
