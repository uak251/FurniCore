"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Single “Actions” control for module headers — keeps RBAC pages visually consistent.
 *
 * @param {{ label?: string; align?: "start" | "end"; triggerClassName?: string; items: Array<{
 *   label: string;
 *   icon?: import("lucide-react").LucideIcon;
 *   onSelect: () => void;
 *   disabled?: boolean;
 *   destructive?: boolean;
 *   separatorBefore?: boolean;
 * }> }} props
 */
export function ModuleActionsMenu({ label = "Actions", align = "end", triggerClassName, items }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("touch-target gap-1.5", triggerClassName)}
          aria-haspopup="menu"
        >
          {label}
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={`${it.label}-${i}`}>
              {it.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={it.disabled}
                className={it.destructive ? "text-destructive focus:text-destructive" : undefined}
                onSelect={(e) => {
                  e.preventDefault();
                  window.setTimeout(() => it.onSelect?.(), 0);
                }}
              >
                {Icon ? <Icon className="shrink-0" aria-hidden /> : null}
                <span>{it.label}</span>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
