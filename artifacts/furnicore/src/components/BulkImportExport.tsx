/**
 * BulkImportExport
 *
 * Generic reusable panel for CSV bulk-import and export operations.
 * Drop it inside a Dialog on any module page.
 *
 * Props:
 *  - module          display name ("Inventory", "Employees", …)
 *  - importEndpoint  full relative path like "/api/bulk/inventory/import"
 *  - exportEndpoint  full relative path like "/api/bulk/inventory/export"
 *  - exportFilename  suggested download filename
 *  - templateHeaders CSV headers shown in the downloadable template
 *  - templateSample  one or two sample data rows for the template
 *  - onImported      called after a successful import so the parent can refetch
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, Download, FileText, AlertTriangle, CheckCircle2,
  X, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface RowError {
  row: number;
  column?: string;
  message: string;
}

interface ImportResult {
  imported: number;
  updated?: number;
  skipped?: number;
  errors: RowError[];
}

function normalizeImportResult(raw: unknown): ImportResult {
  if (!raw || typeof raw !== "object") {
    return { imported: 0, errors: [{ row: 0, message: "Unexpected server response." }] };
  }
  const o = raw as Record<string, unknown>;
  const imported = typeof o.imported === "number" ? o.imported : Number(o.imported) || 0;
  const updated = typeof o.updated === "number" ? o.updated : undefined;
  const skipped = typeof o.skipped === "number" ? o.skipped : undefined;
  let errors: RowError[] = [];
  if (Array.isArray(o.errors)) {
    errors = o.errors.map((e: unknown, idx: number) => {
      if (e && typeof e === "object" && "message" in e) {
        const er = e as { row?: number; column?: string; message?: string };
        return {
          row: typeof er.row === "number" ? er.row : idx + 1,
          column: er.column,
          message: String(er.message ?? "Error"),
        };
      }
      return { row: idx + 1, message: String(e) };
    });
  }
  return { imported, updated, skipped, errors };
}

interface ParsedPreview {
  headers: string[];
  rows: string[][];
}

/* ─── CSV helpers ──────────────────────────────────────────────────────────── */

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvPreview(text: string): ParsedPreview {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map((l) => parseRow(l));
  return { headers, rows };
}

function buildCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ───────────────────────────────────────────────────────────── */

interface BulkImportExportProps {
  module: string;
  importEndpoint: string;
  exportEndpoint: string;
  exportFilename: string;
  templateHeaders: string[];
  templateSample: string[][];
  onImported?: () => void;
}

export function BulkImportExport({
  module,
  importEndpoint,
  exportEndpoint,
  exportFilename,
  templateHeaders,
  templateSample,
  onImported,
}: BulkImportExportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [csvText, setCsvText]   = useState<string | null>(null);
  const [preview, setPreview]   = useState<ParsedPreview | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(true);

  /* row indices that have errors (1-based, matches data rows not header) */
  const errorRows = new Set((result?.errors ?? []).map((e) => e.row));

  /* ── file handling ── */

  const loadFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      setPreview(parseCsvPreview(text));
    };
    reader.readAsText(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const clearFile = () => {
    setCsvText(null);
    setPreview(null);
    setFileName("");
    setResult(null);
  };

  /* ── template download ── */

  const downloadTemplate = () => {
    const content = buildCsv(templateHeaders, templateSample);
    downloadCsv(`${module.toLowerCase()}-template.csv`, content);
  };

  /* ── export current data ── */

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}${exportEndpoint}`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = exportFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  /* ── import ── */

  const runImport = async () => {
    if (!csvText) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}${importEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: csvText,
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = {
          imported: 0,
          errors: [{ row: 0, message: text.slice(0, 200) || "Invalid JSON response from server." }],
        };
      }
      if (!res.ok) {
        const msg =
          parsed &&
          typeof parsed === "object" &&
          "message" in parsed &&
          typeof (parsed as { message?: unknown }).message === "string"
            ? (parsed as { message: string }).message
            : (parsed as { error?: string })?.error ?? text?.slice(0, 200) ?? `HTTP ${res.status}`;
        setResult({ imported: 0, errors: [{ row: 0, message: msg }] });
        return;
      }
      const json = normalizeImportResult(parsed);
      // Clear the preview table so it doesn't render alongside the result panel
      setCsvText(null);
      setPreview(null);
      setFileName("");
      setResult(json);
      if ((json.imported ?? 0) > 0 || (json.updated ?? 0) > 0) {
        onImported?.();
      }
    } catch (err) {
      setResult({ imported: 0, errors: [{ row: 0, message: String(err) }] });
    } finally {
      setImporting(false);
    }
  };

  /* ── render ── */

  const rowCount = (preview?.rows.length ?? 0);
  const headerCount = (preview?.headers.length ?? 0);

  return (
    <div className="space-y-5">
      {/* ── Top action bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <FileText className="mr-1.5 h-4 w-4" aria-hidden />
          Download template
        </Button>
        <Button variant="outline" size="sm" onClick={exportData} disabled={exporting}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
          {exporting ? "Exporting…" : `Export ${module} data`}
        </Button>
      </div>

      {/* ── Drop zone ──────────────────────────────────────────────────── */}
      {!preview ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none",
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/30",
          )}
        >
          <Upload className="h-10 w-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium text-sm">Drag & drop a CSV file here</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              or click to browse · max 5 MB · .csv only
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="sr-only" onChange={onFileChange} />
        </div>
      ) : (
        /* ── Preview table ─────────────────────────────────────────────── */
        <div className="space-y-3">
          {/* file info bar */}
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{fileName}</span>
              <Badge variant="outline" className="shrink-0 text-xs">
                {rowCount} row{rowCount !== 1 ? "s" : ""} · {headerCount} col{headerCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            <button
              onClick={clearFile}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* table preview */}
          <ScrollArea className="h-60 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center text-xs text-muted-foreground">#</TableHead>
                  {preview.headers.map((h) => (
                    <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.slice(0, 200).map((row, i) => {
                  const rowNum = i + 1;
                  const hasError = errorRows.has(rowNum);
                  return (
                    <TableRow
                      key={i}
                      className={cn(
                        hasError && "bg-destructive/10 hover:bg-destructive/15",
                      )}
                    >
                      <TableCell className="text-center text-xs text-muted-foreground font-mono">
                        {hasError && <AlertTriangle className="inline h-3 w-3 text-destructive mr-0.5" />}
                        {rowNum}
                      </TableCell>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="text-sm max-w-[180px] truncate" title={cell}>
                          {cell || <span className="text-muted-foreground/50 italic text-xs">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
          {rowCount > 200 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing first 200 rows of {rowCount} — all will be imported.
            </p>
          )}
        </div>
      )}

      {/* ── Import result ───────────────────────────────────────────────── */}
      {result && (
        <div className={cn(
          "rounded-lg border p-4 space-y-3",
          (result.errors ?? []).length === 0 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20",
        )}>
          <div className="flex items-center gap-2">
            {(result.errors ?? []).length === 0
              ? <CheckCircle2 className="h-5 w-5 text-green-600" />
              : <AlertTriangle className="h-5 w-5 text-amber-600" />}
            <p className="font-semibold text-sm">
              {result.imported} row{result.imported !== 1 ? "s" : ""} imported
              {result.updated ? `, ${result.updated} updated` : ""}
              {result.skipped ? `, ${result.skipped} skipped` : ""}
              {(result.errors ?? []).length > 0 ? `, ${(result.errors ?? []).length} error${(result.errors ?? []).length !== 1 ? "s" : ""}` : ""}
            </p>
          </div>

          {(result.errors ?? []).length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
              >
                {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showErrors ? "Hide" : "Show"} errors
              </button>
              {showErrors && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {(result.errors ?? []).map((e, i) => (
                    <li key={i} className="flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                      <span className="shrink-0 font-mono font-medium">
                        {e.row > 0 ? `Row ${e.row}` : "Global"}
                        {e.column ? ` (${e.column})` : ""}:
                      </span>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Import button ───────────────────────────────────────────────── */}
      {preview && (
        <div className="flex justify-end">
          <Button onClick={runImport} disabled={importing || rowCount === 0}>
            {importing ? (
              <>
                <Progress className="mr-2 h-3 w-16" value={undefined} />
                Importing…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-4 w-4" aria-hidden />
                Import {rowCount} row{rowCount !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
