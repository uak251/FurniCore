import { Search, Download, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ToolbarSelectOption = { value: string; label: string };

export interface TableToolbarProps {
  id: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Shown above search on sm+ screens for screen readers */
  entityLabel?: string;
  filterLabel?: string;
  filterValue?: string;
  onFilterChange?: (v: string) => void;
  filterOptions?: ToolbarSelectOption[];
  sortLabel?: string;
  sortKey: string;
  onSortKeyChange: (v: string) => void;
  sortOptions: ToolbarSelectOption[];
  sortDir: "asc" | "desc";
  onSortDirChange: (v: "asc" | "desc") => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  pageSizeOptions?: number[];
  onExportCsv?: () => void;
  exportDisabled?: boolean;
  resultsText: string;
  className?: string;
}

export function TableToolbar({
  id,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  entityLabel = "table",
  filterLabel = "Filter",
  filterValue = "all",
  onFilterChange,
  filterOptions,
  sortLabel = "Sort by",
  sortKey,
  onSortKeyChange,
  sortOptions,
  sortDir,
  onSortDirChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  onExportCsv,
  exportDisabled,
  resultsText,
  className,
}: TableToolbarProps) {
  const searchId = `${id}-search`;
  const hasFilter = Boolean(filterOptions?.length && onFilterChange);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <Label htmlFor={searchId} className="sr-only">
            Search {entityLabel}
          </Label>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              autoComplete="off"
              className="pl-9"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-describedby={`${id}-results-hint`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          {hasFilter && (
            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">{filterLabel}</Label>
              <Select value={filterValue} onValueChange={onFilterChange}>
                <SelectTrigger aria-label={`${filterLabel} for ${entityLabel}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions!.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <Label className="text-xs text-muted-foreground">{sortLabel}</Label>
            <Select value={sortKey} onValueChange={onSortKeyChange}>
              <SelectTrigger aria-label={`Sort ${entityLabel} by column`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[120px]">
            <Label className="text-xs text-muted-foreground">Order</Label>
            <Select
              value={sortDir}
              onValueChange={(v) => onSortDirChange(v as "asc" | "desc")}
            >
              <SelectTrigger aria-label="Sort order">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[100px]">
            <Label className="text-xs text-muted-foreground">Rows</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {onExportCsv && (
            <Button
              type="button"
              variant="outline"
              size="default"
              className="shrink-0"
              onClick={onExportCsv}
              disabled={exportDisabled}
              aria-label={`Export ${entityLabel} to CSV file`}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <p id={`${id}-results-hint`} className="text-sm text-muted-foreground" role="status">
        {resultsText}
      </p>
    </div>
  );
}
