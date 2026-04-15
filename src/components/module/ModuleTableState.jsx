import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const ModuleTableState = memo(function ModuleTableState({
  isLoading,
  isEmpty,
  loadingRows = 4,
  emptyMessage = "No records found.",
  children,
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return children;
});

