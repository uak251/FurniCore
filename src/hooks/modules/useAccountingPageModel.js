import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi } from "@/lib/erp-api";

export function useAccountingPageModel() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const txQ = useQuery({
    queryKey: ["accounting-transactions"],
    queryFn: () => erpApi("/api/transactions"),
  });

  const transactions = Array.isArray(txQ.data) ? txQ.data : [];
  const createTransaction = useMutation({
    mutationFn: (payload) => erpApi("/api/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounting-transactions"] }),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (type !== "all" && tx.type !== type) return false;
      if (status !== "all" && tx.status !== status) return false;
      if (!q) return true;
      return (
        String(tx.description ?? "").toLowerCase().includes(q) ||
        String(tx.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [transactions, query, type, status]);

  return {
    query,
    setQuery,
    type,
    setType,
    status,
    setStatus,
    rows,
    createTransaction,
    isLoading: txQ.isLoading,
    isError: txQ.isError,
    error: txQ.error,
    refetch: txQ.refetch,
  };
}

