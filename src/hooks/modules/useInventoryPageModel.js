import { useMemo, useState } from "react";
import { useListInventory } from "@workspace/api-client-react";

export function useInventoryPageModel() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const inventoryQ = useListInventory();
  const inventory = Array.isArray(inventoryQ.data) ? inventoryQ.data : [];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!q) return true;
      return (
        String(item.name ?? "").toLowerCase().includes(q) ||
        String(item.unit ?? "").toLowerCase().includes(q)
      );
    });
  }, [inventory, query, typeFilter]);

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    rows,
    isLoading: inventoryQ.isLoading,
    isError: inventoryQ.isError,
    error: inventoryQ.error,
    refetch: inventoryQ.refetch,
  };
}

