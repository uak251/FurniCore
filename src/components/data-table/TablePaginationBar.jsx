import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function TablePaginationBar({ id, page, totalPages, onPageChange, className, }) {
    const canPrev = page > 1;
    const canNext = page < totalPages;
    return (_jsxs("nav", { className: cn("flex flex-wrap items-center justify-center gap-2 py-3 sm:gap-3 sm:py-4", className), "aria-label": "Pagination", children: [_jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "min-w-[2.5rem] px-2 sm:min-w-0 sm:px-3", id: `${id}-prev`, "aria-controls": `${id}-table`, disabled: !canPrev, onClick: () => onPageChange(page - 1), children: [_jsx(ChevronLeft, { className: "h-4 w-4 sm:mr-1", "aria-hidden": true }), _jsx("span", { className: "hidden sm:inline", children: "Previous" })] }), _jsxs("span", { className: "min-w-0 flex-1 basis-full text-center text-xs text-muted-foreground tabular-nums sm:min-w-[7rem] sm:flex-none sm:basis-auto sm:text-sm", "aria-live": "polite", children: [_jsx("span", { className: "sm:hidden", children: [page, " / ", totalPages] }), _jsxs("span", { className: "hidden sm:inline", children: ["Page ", page, " of ", totalPages] })] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "min-w-[2.5rem] px-2 sm:min-w-0 sm:px-3", id: `${id}-next`, "aria-controls": `${id}-table`, disabled: !canNext, onClick: () => onPageChange(page + 1), children: [_jsx("span", { className: "hidden sm:inline", children: "Next" }), _jsx(ChevronRight, { className: "h-4 w-4 sm:ml-1", "aria-hidden": true })] })] }));
}
