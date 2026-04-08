import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function TablePaginationBar({ id, page, totalPages, onPageChange, className, }) {
    const canPrev = page > 1;
    const canNext = page < totalPages;
    return (_jsxs("nav", { className: cn("flex items-center justify-center gap-2 py-4", className), "aria-label": "Pagination", children: [_jsxs(Button, { type: "button", variant: "outline", size: "sm", id: `${id}-prev`, "aria-controls": `${id}-table`, disabled: !canPrev, onClick: () => onPageChange(page - 1), children: [_jsx(ChevronLeft, { className: "h-4 w-4", "aria-hidden": true }), "Previous"] }), _jsxs("span", { className: "min-w-[120px] text-center text-sm text-muted-foreground tabular-nums", "aria-live": "polite", children: ["Page ", page, " of ", totalPages] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", id: `${id}-next`, "aria-controls": `${id}-table`, disabled: !canNext, onClick: () => onPageChange(page + 1), children: ["Next", _jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true })] })] }));
}
