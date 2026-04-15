import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export function AccessDenied({ backHref = "/", backLabel = "Go to Dashboard" }) {
  return (
    <div className="flex items-start justify-center pt-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive/60" aria-hidden="true" />
          <div>
            <p className="text-xl font-semibold">Access Denied</p>
            <p className="mt-2 text-sm text-muted-foreground">
              You do not have permission to access this page.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

