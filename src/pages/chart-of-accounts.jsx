import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useRef } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, BookOpen, Pencil, ToggleLeft, ToggleRight, Search, Download, Upload, FileDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { ChartOfAccountsHeaderActions } from "@/components/module/ChartOfAccountsHeaderActions";
const API_BASE = apiOriginPrefix();
function apiUrl(path) {
    if (path.startsWith("http://") || path.startsWith("https://"))
        return path;
    return `${API_BASE}${path}`;
}
/* ── api helpers ─────────────────────────────────────────────────────────── */
async function apiFetch(path, init) {
    const r = await fetch(apiUrl(path), {
        credentials: "include",
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
            ...init?.headers,
        },
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message ?? `HTTP ${r.status}`);
    }
    return r.json();
}
function useAccounts() {
    return useQuery({ queryKey: ["accounts"], queryFn: () => apiFetch("/api/accounts") });
}
/* ── colour maps ─────────────────────────────────────────────────────────── */
const TYPE_COLORS = {
    asset: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    liability: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    equity: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    income: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    expense: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};
const SUBTYPES = {
    asset: ["current_asset", "fixed_asset", "other_asset"],
    liability: ["current_liability", "long_term_liability", "other_liability"],
    equity: ["equity"],
    income: ["operating", "non_operating"],
    expense: ["cogs", "operating", "non_operating"],
};
export default function ChartOfAccountsPage() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canWrite = me?.role === "admin" || me?.role === "accountant";
    const isAdmin = me?.role === "admin";
    const { data: accounts = [], isLoading } = useAccounts();
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [showDialog, setShowDialog] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState({ code: "", name: "", type: "asset", subtype: "current_asset", normalBalance: "debit", description: "" });
    const [showImport, setShowImport] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importing, setImporting] = useState(false);
    const fileRef = useRef(null);
    const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });
    const seedMutation = useMutation({
        mutationFn: () => apiFetch("/api/accounts/seed", { method: "POST" }),
        onSuccess: (data) => {
            if (data.seeded) {
                toast({ title: "Standard accounts seeded", description: `${data.count} accounts created.` });
                invalidate();
            }
            else
                toast({ title: "Already seeded", description: data.message });
        },
        onError: (e) => toast({ variant: "destructive", title: "Seed failed", description: e.message }),
    });
    const createMutation = useMutation({
        mutationFn: (body) => apiFetch("/api/accounts", { method: "POST", body: JSON.stringify(body) }),
        onSuccess: () => { toast({ title: "Account created" }); invalidate(); setShowDialog(false); },
        onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, body }) => apiFetch(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        onSuccess: () => { toast({ title: "Account updated" }); invalidate(); setShowDialog(false); setEditItem(null); },
        onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }) => apiFetch(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
        onSuccess: () => { toast({ title: "Account updated" }); invalidate(); },
        onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
    const openCreate = () => {
        setEditItem(null);
        setForm({ code: "", name: "", type: "asset", subtype: "current_asset", normalBalance: "debit", description: "" });
        setShowDialog(true);
    };
    const handleExport = async () => {
        try {
            const resp = await fetch(apiUrl("/api/accounts/export.csv"), {
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
            });
            if (!resp.ok)
                throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "chart-of-accounts.csv";
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Export failed", description: e.message });
        }
    };
    const handleSampleDownload = async () => {
        try {
            const resp = await fetch(apiUrl("/api/accounts/sample.csv"), {
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
            });
            if (!resp.ok)
                throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "chart-of-accounts-sample.csv";
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Download failed", description: e.message });
        }
    };
    const handleImportFile = async (file) => {
        setImporting(true);
        try {
            const csv = await file.text();
            const resp = await fetch(apiUrl("/api/accounts/import"), {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
                body: JSON.stringify({ csv }),
            });
            const data = await resp.json();
            if (!resp.ok)
                throw new Error(data.message ?? `HTTP ${resp.status}`);
            const errList = Array.isArray(data.errors) ? data.errors : [];
            setImportResult({ ...data, errors: errList });
            invalidate();
            toast({
                title: "Import complete",
                description: `Created: ${data.created}, Updated: ${data.updated}${errList.length ? `, Errors: ${errList.length}` : ""}`,
            });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Import failed", description: e.message });
        }
        finally {
            setImporting(false);
            if (fileRef.current)
                fileRef.current.value = "";
        }
    };
    const openEdit = (a) => {
        setEditItem(a);
        setForm({ code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? "", normalBalance: a.normalBalance, description: a.description ?? "" });
        setShowDialog(true);
    };
    const handleTypeChange = (t) => {
        const defaultSub = SUBTYPES[t]?.[0] ?? "";
        const defaultNB = ["asset", "expense"].includes(t) ? "debit" : "credit";
        setForm((f) => ({ ...f, type: t, subtype: defaultSub, normalBalance: defaultNB }));
    };
    const handleSubmit = () => {
        if (!form.code || !form.name) {
            toast({ variant: "destructive", title: "Code and name are required" });
            return;
        }
        if (editItem) {
            updateMutation.mutate({ id: editItem.id, body: { name: form.name, subtype: form.subtype, description: form.description } });
        }
        else {
            createMutation.mutate(form);
        }
    };
    const filtered = useMemo(() => accounts.filter((a) => {
        const q = search.toLowerCase();
        const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
        const matchType = typeFilter === "all" || a.type === typeFilter;
        return matchSearch && matchType;
    }), [accounts, search, typeFilter]);
    const grouped = useMemo(() => {
        const g = {};
        for (const a of filtered) {
            (g[a.type] ??= []).push(a);
        }
        return g;
    }, [filtered]);
    const typeOrder = ["asset", "liability", "equity", "income", "expense"];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Chart of Accounts" }), _jsx("p", { className: "text-muted-foreground", children: "Manage the master list of ledger accounts used in double-entry bookkeeping." })] }), _jsx(ChartOfAccountsHeaderActions, { canWrite, isAdmin, seedPending: seedMutation.isPending, onSampleDownload: handleSampleDownload, onExport: handleExport, onImport: () => { setImportResult(null); setShowImport(true); }, onSeed: () => seedMutation.mutate(), onNewAccount: openCreate })] }), _jsxs("div", { className: "flex flex-col gap-3 sm:flex-row", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }), _jsx(Input, { placeholder: "Search by code or name\u2026", className: "pl-9", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsxs(Select, { value: typeFilter, onValueChange: setTypeFilter, children: [_jsx(SelectTrigger, { className: "w-40", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All types" }), typeOrder.map((t) => _jsx(SelectItem, { value: t, className: "capitalize", children: t }, t))] })] })] }), !isLoading && (_jsx("div", { className: "flex flex-wrap gap-2", children: typeOrder.map((t) => {
                    const count = accounts.filter((a) => a.type === t && a.isActive).length;
                    return count > 0 ? (_jsxs(Badge, { className: `${TYPE_COLORS[t]} capitalize cursor-pointer`, onClick: () => setTypeFilter(t === typeFilter ? "all" : t), children: [t, ": ", count] }, t)) : null;
                }) })), isLoading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3, 4, 5].map(i => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : (_jsxs("div", { className: "space-y-4", children: [typeOrder.filter((t) => grouped[t]?.length).map((t) => (_jsxs(Card, { children: [_jsx(CardHeader, { className: "py-3 px-4", children: _jsxs(CardTitle, { className: "text-sm font-semibold capitalize flex items-center gap-2", children: [_jsx("span", { className: `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t]}`, children: t }), _jsxs("span", { className: "text-muted-foreground font-normal", children: ["(", grouped[t].length, " accounts)"] })] }) }), _jsx(CardContent, { className: "p-0", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { className: "text-xs", children: [_jsx(TableHead, { className: "w-24", children: "Code" }), _jsx(TableHead, { children: "Name" }), _jsx(TableHead, { className: "hidden md:table-cell", children: "Subtype" }), _jsx(TableHead, { className: "hidden sm:table-cell", children: "Normal Balance" }), _jsx(TableHead, { className: "hidden lg:table-cell", children: "Description" }), _jsx(TableHead, { className: "w-24", children: "Status" }), canWrite && _jsx(TableHead, { className: "w-24 text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: grouped[t].map((a) => (_jsxs(TableRow, { className: a.isActive ? "" : "opacity-50", children: [_jsx(TableCell, { className: "font-mono text-sm font-semibold", children: a.code }), _jsx(TableCell, { className: "font-medium", children: a.name }), _jsx(TableCell, { className: "hidden md:table-cell text-xs text-muted-foreground capitalize", children: a.subtype?.replace(/_/g, " ") ?? "—" }), _jsx(TableCell, { className: "hidden sm:table-cell", children: _jsx(Badge, { variant: a.normalBalance === "debit" ? "secondary" : "outline", className: "text-xs capitalize", children: a.normalBalance }) }), _jsx(TableCell, { className: "hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate", children: a.description ?? "—" }), _jsx(TableCell, { children: _jsx(Badge, { variant: a.isActive ? "default" : "outline", className: "text-xs", children: a.isActive ? "Active" : "Inactive" }) }), canWrite && (_jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => openEdit(a), children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), isAdmin && (_jsx(Button, { size: "icon", variant: "ghost", onClick: () => toggleMutation.mutate({ id: a.id, isActive: !a.isActive }), children: a.isActive ? _jsx(ToggleRight, { className: "h-4 w-4 text-green-600" }) : _jsx(ToggleLeft, { className: "h-4 w-4 text-muted-foreground" }) }))] }) }))] }, a.id))) })] }) })] }, t))), !Object.keys(grouped).length && (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center gap-3", children: [_jsx(BookOpen, { className: "h-10 w-10 text-muted-foreground/40" }), _jsxs("p", { className: "text-muted-foreground", children: ["No accounts found. ", isAdmin ? 'Click "Seed standard accounts" to get started.' : "Contact your admin to set up the chart of accounts."] })] }))] })), _jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", className: "hidden", onChange: (e) => { const f = e.target.files?.[0]; if (f)
                    handleImportFile(f); } }), _jsx(Dialog, { open: showImport, onOpenChange: setShowImport, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Import Chart of Accounts from CSV" }) }), _jsxs("div", { className: "space-y-4 py-2", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Upload a CSV file to bulk create or update accounts. Existing accounts (matched by ", _jsx("span", { className: "font-mono text-xs", children: "code" }), ") will be updated; new codes will be created."] }), _jsxs("div", { className: "rounded-md border bg-muted/40 p-3 text-xs font-mono text-muted-foreground space-y-1", children: [_jsx("p", { className: "font-semibold text-foreground", children: "Required columns:" }), _jsx("p", { children: "code, name, type, normal_balance" }), _jsx("p", { className: "font-semibold text-foreground mt-1", children: "Optional columns:" }), _jsx("p", { children: "subtype, description" }), _jsx("p", { className: "font-semibold text-foreground mt-1", children: "Valid types:" }), _jsx("p", { children: "asset \u00B7 liability \u00B7 equity \u00B7 income \u00B7 expense" }), _jsx("p", { className: "font-semibold text-foreground mt-1", children: "Valid normal_balance:" }), _jsx("p", { children: "debit \u00B7 credit" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: handleSampleDownload, className: "flex-1", children: [_jsx(FileDown, { className: "mr-1.5 h-4 w-4" }), "Download sample CSV"] }), _jsxs(Button, { size: "sm", className: "flex-1", disabled: importing, onClick: () => fileRef.current?.click(), children: [_jsx(Upload, { className: "mr-1.5 h-4 w-4" }), importing ? "Importing…" : "Choose CSV file"] })] }), importResult && (_jsxs("div", { className: "rounded-md border p-3 space-y-1 text-sm", children: [_jsxs("p", { className: "font-medium", children: ["Import results (", importResult.total, " rows processed)"] }), _jsxs("p", { className: "text-green-600", children: ["\u2713 Created: ", importResult.created] }), _jsxs("p", { className: "text-blue-600", children: ["\u21BB Updated: ", importResult.updated] }), (importResult.errors ?? []).length > 0 && (_jsxs("div", { children: [_jsxs("p", { className: "text-destructive", children: ["\u2717 Errors: ", (importResult.errors ?? []).length] }), _jsx("ul", { className: "mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5", children: (importResult.errors ?? []).map((e, i) => _jsx("li", { children: e }, i)) })] }))] }))] }), _jsx(DialogFooter, { children: _jsx(Button, { variant: "outline", onClick: () => { setShowImport(false); setImportResult(null); }, children: "Close" }) })] }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit Account" : "New Account" }) }), _jsxs("div", { className: "space-y-4 py-2", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { htmlFor: "acc-code", children: "Account Code *" }), _jsx(Input, { id: "acc-code", placeholder: "e.g. 1001", value: form.code, onChange: (e) => setForm((f) => ({ ...f, code: e.target.value })), disabled: !!editItem })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Type *" }), _jsxs(Select, { value: form.type, onValueChange: handleTypeChange, disabled: !!editItem, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: typeOrder.map((t) => _jsx(SelectItem, { value: t, className: "capitalize", children: t }, t)) })] })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { htmlFor: "acc-name", children: "Account Name *" }), _jsx(Input, { id: "acc-name", placeholder: "e.g. Office Supplies", value: form.name, onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Subtype" }), _jsxs(Select, { value: form.subtype, onValueChange: (v) => setForm((f) => ({ ...f, subtype: v })), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select\u2026" }) }), _jsx(SelectContent, { children: (SUBTYPES[form.type] ?? []).map((s) => _jsx(SelectItem, { value: s, className: "capitalize", children: s.replace(/_/g, " ") }, s)) })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Normal Balance *" }), _jsxs(Select, { value: form.normalBalance, onValueChange: (v) => setForm((f) => ({ ...f, normalBalance: v })), disabled: !!editItem, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "debit", children: "Debit" }), _jsx(SelectItem, { value: "credit", children: "Credit" })] })] })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { htmlFor: "acc-desc", children: "Description" }), _jsx(Input, { id: "acc-desc", placeholder: "Optional description", value: form.description, onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })) })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { onClick: handleSubmit, disabled: createMutation.isPending || updateMutation.isPending, children: editItem ? "Save changes" : "Create account" })] })] }) })] }));
}
