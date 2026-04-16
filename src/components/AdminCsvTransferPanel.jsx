import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, Download } from "lucide-react";

const MODULES = [
  "inventory",
  "procurement",
  "production",
  "hr",
  "supplier",
  "customer",
  "accounting",
  "notifications",
];

const API = apiOriginPrefix();

export function AdminCsvTransferPanel() {
  const inputRefs = useRef({});
  const [busyByModule, setBusyByModule] = useState({});
  const [statusByModule, setStatusByModule] = useState({});

  function setBusy(moduleKey, busy) {
    setBusyByModule((prev) => ({ ...prev, [moduleKey]: busy }));
  }

  function parseErrorMessage(payload, fallback) {
    if (payload?.message) return payload.message;
    if (payload?.error) return payload.error;
    return fallback;
  }

  async function exportCsv(moduleKey) {
    const token = getAuthToken();
    if (!token) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Please sign in again." });
      return;
    }
    try {
      setBusy(moduleKey, true);
      const res = await fetch(`${API}/api/${moduleKey}/export-csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${moduleKey}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "success", text: "Export downloaded." } }));
      toast({ title: "Export complete", description: `${moduleKey} CSV downloaded.` });
    } catch (err) {
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "error", text: err?.message || "Export failed." } }));
      toast({ variant: "destructive", title: "Export failed", description: err?.message || "Unknown error" });
    } finally {
      setBusy(moduleKey, false);
    }
  }

  async function downloadTemplate(moduleKey) {
    const token = getAuthToken();
    if (!token) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Please sign in again." });
      return;
    }
    try {
      setBusy(moduleKey, true);
      const res = await fetch(`${API}/api/${moduleKey}/csv-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Template download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${moduleKey}-template.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "success", text: "Template downloaded." } }));
      toast({ title: "Template downloaded", description: `${moduleKey} CSV template downloaded.` });
    } catch (err) {
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "error", text: err?.message || "Template failed." } }));
      toast({ variant: "destructive", title: "Template download failed", description: err?.message || "Unknown error" });
    } finally {
      setBusy(moduleKey, false);
    }
  }

  async function importCsv(moduleKey, file) {
    const token = getAuthToken();
    if (!token || !file) {
      toast({ variant: "destructive", title: "Import failed", description: "Missing auth or file." });
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      setBusy(moduleKey, true);
      const res = await fetch(`${API}/api/${moduleKey}/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseErrorMessage(payload, `Import failed (${res.status})`));
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "success", text: `${payload.imported ?? 0} rows imported.` } }));
      toast({ title: "Import complete", description: `${moduleKey}: ${payload.imported ?? 0} rows imported.` });
      if (inputRefs.current[moduleKey]) inputRefs.current[moduleKey].value = "";
    } catch (err) {
      setStatusByModule((prev) => ({ ...prev, [moduleKey]: { type: "error", text: err?.message || "Import failed." } }));
      toast({ variant: "destructive", title: "Import failed", description: err?.message || "Unknown error" });
    } finally {
      setBusy(moduleKey, false);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>CSV Import / Export</CardTitle>
        <CardDescription>Admin-only bulk data transfer for ERP modules.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {MODULES.map((moduleKey) => (
          <div key={moduleKey} className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium capitalize">{moduleKey}</span>
              <div className="flex gap-2">
                <input
                  ref={(el) => {
                    inputRefs.current[moduleKey] = el;
                  }}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => importCsv(moduleKey, e.target.files?.[0])}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => inputRefs.current[moduleKey]?.click()}
                  disabled={busyByModule[moduleKey]}
                >
                  {busyByModule[moduleKey] ? "Uploading..." : "Import CSV"}
                </Button>
                <Button size="sm" onClick={() => exportCsv(moduleKey)} disabled={busyByModule[moduleKey]}>
                  {busyByModule[moduleKey] ? "Working..." : "Export CSV"}
                </Button>
              </div>
            </div>
            {statusByModule[moduleKey]?.text ? (
              <p className={`mt-2 text-xs ${statusByModule[moduleKey]?.type === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {statusByModule[moduleKey].text}
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">Templates</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" aria-hidden />
                Download template
                <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {MODULES.map((moduleKey) => (
                <DropdownMenuItem key={`${moduleKey}-template`} onSelect={() => downloadTemplate(moduleKey)}>
                  <span className="capitalize">{moduleKey}</span>
                  <span className="ml-auto text-xs text-muted-foreground">CSV</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
