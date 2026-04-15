import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { preloadRoute } from "@/lib/route-preload";

function groupBy(items) {
  return items.reduce((acc, item) => {
    const key = item.group || "Navigation";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function GlobalCommandPalette({
  items = [],
  triggerLabel = "Search",
  className = "",
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupBy(items), [items]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Open quick search"
      >
        <Search className="mr-1.5 h-4 w-4" aria-hidden />
        {triggerLabel}
        <CommandShortcut>Ctrl+K</CommandShortcut>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search modules, pages, and actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(grouped).map(([groupName, groupItems]) => (
            <CommandGroup key={groupName} heading={groupName}>
              {groupItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.href} ${item.keywords ?? ""}`}
                  onMouseEnter={() => preloadRoute(item.href)}
                  onSelect={() => {
                    setOpen(false);
                    setLocation(item.href);
                  }}
                >
                  <span>{item.label}</span>
                  <CommandShortcut>{item.shortcut ?? ""}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
