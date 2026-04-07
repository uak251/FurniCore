import { useState } from "react";
import { Palette, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useGetDashboardThemeCatalog,
  getGetDashboardThemeCatalogQueryKey,
  type DashboardThemeInfo,
} from "@workspace/api-client-react";
import { useDashboardThemeOptional } from "@/context/DashboardThemeProvider";
import { cn } from "@/lib/utils";

/** Header control: pick dashboard theme + optional “use portal default”. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const themeCtx = useDashboardThemeOptional();
  const { data: catalog, isLoading: catLoading } = useGetDashboardThemeCatalog({
    query: { queryKey: getGetDashboardThemeCatalogQueryKey(), enabled: !!themeCtx },
  });
  const [open, setOpen] = useState(false);

  if (!themeCtx) return null;

  const { userOverride, setTheme, isSaving } = themeCtx;
  const themes = catalog?.themes ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("shrink-0 border-dashed", className)}
          aria-label="Dashboard theme"
          title="Dashboard theme"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="end">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold">Dashboard theme</p>
          <p className="text-[11px] text-muted-foreground">
            Preview applies instantly. Your choice is saved to your profile.
          </p>
        </div>
        <ScrollArea className="h-[min(60vh,320px)]">
          <div className="grid grid-cols-1 gap-1 p-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={async () => {
                await setTheme(null);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                userOverride == null && "border-primary/50 bg-primary/5",
              )}
            >
              <span>Use portal default</span>
              {userOverride == null && <Check className="h-4 w-4 text-primary" />}
            </button>
            {catLoading && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {themes.map((t: DashboardThemeInfo) => (
              <button
                key={t.id}
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  if (!t.id) return;
                  await setTheme(t.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                  userOverride === t.id && "border-primary/50 bg-primary/5",
                )}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  <span className="truncate">{t.label}</span>
                  {userOverride === t.id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
        {isSaving && (
          <div className="flex items-center justify-center gap-2 border-t py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
