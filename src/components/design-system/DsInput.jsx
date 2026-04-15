import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DsInput({ className = "", ...props }) {
  return <Input className={cn("ds-input", className)} {...props} />;
}

