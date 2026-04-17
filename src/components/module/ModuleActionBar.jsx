import { cn } from "@/lib/utils";

export function ModuleActionBar({ className = "", children }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 p-2 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
