import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TablePaginationBarProps {
  id: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function TablePaginationBar({
  id,
  page,
  totalPages,
  onPageChange,
  className,
}: TablePaginationBarProps) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <nav
      className={cn("flex items-center justify-center gap-2 py-4", className)}
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        id={`${id}-prev`}
        aria-controls={`${id}-table`}
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Previous
      </Button>
      <span
        className="min-w-[120px] text-center text-sm text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        id={`${id}-next`}
        aria-controls={`${id}-table`}
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </nav>
  );
}
