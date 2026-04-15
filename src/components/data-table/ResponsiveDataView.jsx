import { Fragment } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Shared responsive data view:
 * - Desktop/tablet: standard table (tablet can scroll horizontally)
 * - Mobile: card list via renderCardView
 */
export function ResponsiveDataView({
  columns = [],
  data = [],
  getRowKey,
  renderDesktopRow,
  renderCardView,
  emptyState = null,
  tableContainerClassName = "",
  cardsContainerClassName = "",
  tableId,
}) {
  const isMobile = useIsMobile();

  if (!data.length) {
    return emptyState;
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-3", cardsContainerClassName)}>
        {data.map((row, index) => {
          const key = getRowKey ? getRowKey(row, index) : index;
          return <Fragment key={key}>{renderCardView(row, index)}</Fragment>;
        })}
      </div>
    );
  }

  return (
    <div id={tableId} className={cn("overflow-x-auto", tableContainerClassName)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{data.map(renderDesktopRow)}</TableBody>
      </Table>
    </div>
  );
}

