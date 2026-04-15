import { cn } from "@/lib/utils";

export function BrandLogo({ className = "", imageClassName = "", showWordmark = false, wordmarkClassName = "" }) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <img
        src="/brand/furnicore-logo.png"
        alt="FurniCore logo"
        className={cn("h-11 w-11 rounded-md object-contain", imageClassName)}
      />
      {showWordmark ? (
        <span className={cn("text-xl font-semibold tracking-tight text-foreground", wordmarkClassName)}>
          FurniCore
        </span>
      ) : null}
    </div>
  );
}

