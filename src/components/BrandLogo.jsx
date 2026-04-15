import { cn } from "@/lib/utils";

export function BrandLogo({ className, compact = false, alt = "FurniCore logo" }) {
  return (
    <img
      src="/brand/logo-blue.png"
      alt={alt}
      className={cn(
        "object-contain",
        compact ? "h-8 w-8 rounded-md" : "h-11 w-11 rounded-lg",
        className,
      )}
      loading="eager"
      decoding="async"
    />
  );
}

