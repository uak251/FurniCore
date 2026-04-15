import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DsCard({ className = "", ...props }) {
  return <Card className={cn("ds-card", className)} {...props} />;
}

