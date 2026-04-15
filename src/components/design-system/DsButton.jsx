import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const intentClass = {
  primary: "ds-btn-primary",
  secondary: "ds-btn-secondary",
  social: "ds-btn-social",
};

export function DsButton({ intent = "primary", className = "", ...props }) {
  return <Button className={cn(intentClass[intent] ?? intentClass.primary, className)} {...props} />;
}

