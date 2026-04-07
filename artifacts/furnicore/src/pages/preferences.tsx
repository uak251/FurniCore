import { Link } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { ArrowLeft, Palette, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  useGetDashboardThemeCatalog,
  getGetDashboardThemeCatalogQueryKey,
  type DashboardThemeInfo,
} from "@workspace/api-client-react";
import { useDashboardTheme } from "@/context/DashboardThemeProvider";
import { cn } from "@/lib/utils";

/**
 * Personal appearance — same data as the header theme picker, full-page for discoverability.
 */
export default function PreferencesPage() {
  const { data: me } = useGetCurrentUser();
  const { effectiveThemeId, userOverride, setTheme, isSaving } = useDashboardTheme();
  const { data: catalog, isLoading } = useGetDashboardThemeCatalog({
    query: { queryKey: getGetDashboardThemeCatalogQueryKey() },
  });
  const themes = catalog?.themes ?? [];

  const backHref =
    me?.role === "supplier"
      ? "/supplier-portal"
      : me?.role === "worker"
        ? "/worker-portal"
        : me?.role === "customer"
          ? "/customer-portal"
          : "/";
  const backLabel =
    me?.role === "supplier" || me?.role === "worker" || me?.role === "customer"
      ? "Back to portal"
      : "Back to dashboard";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Palette className="h-8 w-8 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold tracking-tight">Appearance</h1>
        </div>
        <p className="mt-1 text-muted-foreground max-w-2xl">
          Choose a dashboard shell theme for FurniCore. Your selection is saved to your account and
          follows you across sessions. Clear the override to use your portal&apos;s default theme set
          by an administrator.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dashboard theme</CardTitle>
          <CardDescription>
            Preview updates the UI immediately. {isSaving && "Saving…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setTheme(null)}
            className={cn(
              "flex w-full max-w-xl items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60",
              userOverride == null && "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
            )}
          >
            <span>
              <span className="font-medium">Use portal default</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Use the default theme for your portal role (currently {effectiveThemeId}).
              </span>
            </span>
            {userOverride == null && <Check className="h-5 w-5 shrink-0 text-primary" />}
          </button>

          <Separator />

          {isLoading && (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            {themes.map((t: DashboardThemeInfo) => {
              const active = userOverride === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => (t.id ? setTheme(t.id) : undefined)}
                    className={cn(
                      "flex h-full w-full flex-col gap-1 rounded-xl border p-4 text-left text-sm transition-colors hover:bg-muted/50",
                      active && "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{t.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </span>
                    <span className="text-[11px] leading-snug text-muted-foreground">{t.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
