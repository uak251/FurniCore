import { memo } from "react";
import { cn } from "@/lib/utils";

export const ModulePageHeader = memo(function ModulePageHeader({
  title,
  description,
  actions = null,
  className = "",
}) {
  return (
    <div className={cn("rounded-xl border bg-card/70 p-4 shadow-sm sm:p-6", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
});

