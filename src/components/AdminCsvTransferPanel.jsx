import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { toast } from "@/hooks/use-toast";

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

  async function exportCsv(moduleKey) {
    const token = getAuthToken();
    if (!token) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Please sign in again." });
      return;
    }
    try {
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
      toast({ title: "Export complete", description: `${moduleKey} CSV downloaded.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err?.message || "Unknown error" });
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
      const res = await fetch(`${API}/api/${moduleKey}/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || payload?.error || `Import failed (${res.status})`);
      toast({ title: "Import complete", description: `${moduleKey}: ${payload.imported ?? 0} rows imported.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: err?.message || "Unknown error" });
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
          <div key={moduleKey} className="flex items-center justify-between rounded-md border p-3">
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
              >
                Import CSV
              </Button>
              <Button size="sm" onClick={() => exportCsv(moduleKey)}>
                Export CSV
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
