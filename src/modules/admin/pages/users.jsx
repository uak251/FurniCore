import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCircle, Pencil, UserX, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
/** Extract a human-readable message from any API error shape. */
function apiErrorMessage(e) {
    if (!e || typeof e !== "object")
        return "An unexpected error occurred.";
    // ApiError from customFetch: parsed body is in .data (not .response.data)
    const data = e.data;
    if (data && typeof data === "object") {
        if (data.message && typeof data.message === "string")
            return data.message;
        if (data.error && typeof data.error === "string" && !data.error.startsWith("<!"))
            return data.error;
    }
    // Axios-style fallback
    const resp = e.response?.data;
    if (resp?.message)
        return String(resp.message);
    if (resp?.error && typeof resp.error === "string" && !resp.error.startsWith("<!"))
        return resp.error;
    // Plain Error.message
    const msg = String(e.message ?? "");
    if (msg.includes("<!DOCTYPE"))
        return "Server error — please restart the API server.";
    // Strip the "HTTP 400 Bad Request: " prefix that ApiError adds
    const colonIdx = msg.indexOf(": ");
    if (colonIdx !== -1 && msg.startsWith("HTTP "))
        return msg.slice(colonIdx + 2);
    return msg || "An unexpected error occurred.";
}
const ROLE_COLORS = {
    admin: "destructive",
    manager: "default",
    sales_manager: "default",
    accountant: "default",
    employee: "secondary",
    worker: "secondary",
    supplier: "outline",
    customer: "outline",
};
const ROLE_LABELS = {
    admin: "Admin",
    manager: "Manager",
    sales_manager: "Sales Manager",
    accountant: "Accountant",
    employee: "Employee",
    worker: "Worker",
    supplier: "Supplier",
    customer: "Customer",
};
const TABLE_ID = "users";
export default function UsersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showInactive, setShowInactive] = useState(false);
    const [showDialog, setShowDialog] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const { data: me } = useGetCurrentUser();
    const { data: users, isLoading } = useListUsers();
    const createUser = useCreateUser();
    const updateUser = useUpdateUser();
    const deleteUser = useDeleteUser();
    const { register, handleSubmit, control, reset, setValue } = useForm({
        defaultValues: { role: "employee" },
    });
    useEffect(() => {
        setPage(1);
    }, [search, roleFilter, sortKey, sortDir, pageSize, showInactive]);
    const rows = users ?? [];
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                // Hide inactive users unless toggle is on
                if (!showInactive && !row.isActive)
                    return false;
                const qn = q.toLowerCase();
                const textMatch = !qn ||
                    row.name.toLowerCase().includes(qn) ||
                    row.email.toLowerCase().includes(qn);
                if (!textMatch)
                    return false;
                if (roleFilter === "all")
                    return true;
                return String(row.role).toLowerCase() === roleFilter;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                if (key === "email")
                    return String(row.email ?? "");
                if (key === "role")
                    return String(row.role ?? "");
                if (key === "createdAt")
                    return new Date(row.createdAt).getTime();
                return String(row.name ?? "");
            },
        });
    }, [rows, search, roleFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => {
        if (safePage !== page)
            setPage(safePage);
    }, [safePage, page]);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listUsers"] });
    const exportCsv = () => {
        const headers = ["name", "email", "role", "createdAt"];
        const data = sorted.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role,
            createdAt: new Date(u.createdAt).toISOString(),
        }));
        exportRowsToCsv(`furnicore-users-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const openCreate = () => {
        setEditItem(null);
        reset({ name: "", email: "", password: "", role: "manager" });
        setShowDialog(true);
    };
    const openEdit = (u) => {
        setEditItem(u);
        setValue("name", u.name);
        setValue("email", u.email);
        setValue("password", "");
        setValue("role", u.role);
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        try {
            const payload = { name: data.name, email: data.email, role: data.role };
            if (data.password)
                payload.password = data.password;
            if (editItem) {
                await updateUser.mutateAsync({ id: editItem.id, data: payload });
                toast({ title: "User updated" });
            }
            else {
                if (!data.password) {
                    toast({ variant: "destructive", title: "Password required for new users" });
                    return;
                }
                await createUser.mutateAsync({ data: payload });
                toast({ title: "User created" });
            }
            invalidate();
            setShowDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const handleDeactivate = async (id, name) => {
        if (!confirm(`Deactivate "${name}"?\n\nThey will no longer be able to log in. All their data and history will be preserved. You can reactivate them at any time.`))
            return;
        try {
            await deleteUser.mutateAsync({ id });
            toast({ title: "User deactivated", description: `${name} has been deactivated.` });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const handleReactivate = async (id, name) => {
        try {
            await updateUser.mutateAsync({ id, data: { isActive: true } });
            toast({ title: "User reactivated", description: `${name} can log in again.` });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Master Admin Portal" }), _jsx("p", { className: "text-muted-foreground", children: "Create, manage, and assign roles for all system users" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Button, { variant: showInactive ? "secondary" : "outline", size: "sm", onClick: () => setShowInactive(!showInactive), children: [showInactive ? _jsx(UserX, { className: "mr-2 h-4 w-4" }) : _jsx(UserCheck, { className: "mr-2 h-4 w-4" }), showInactive ? "Hide inactive" : "Show inactive"] }), _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Add user"] })] })] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "users", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by name or email\u2026", filterLabel: "Role", filterValue: roleFilter, onFilterChange: setRoleFilter, filterOptions: [
                    { value: "all", label: "All roles" },
                    { value: "admin", label: "Admin" },
                    { value: "manager", label: "Manager" },
                    { value: "sales_manager", label: "Sales Manager" },
                    { value: "accountant", label: "Accountant" },
                    { value: "employee", label: "Employee" },
                    { value: "worker", label: "Worker" },
                    { value: "supplier", label: "Supplier" },
                    { value: "customer", label: "Customer" },
                ], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "name", label: "Name" },
                    { value: "email", label: "Email" },
                    { value: "role", label: "Role" },
                    { value: "createdAt", label: "Joined" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0 ? "No matching users" : `Showing ${from}–${to} of ${total} matching users` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map((i) => (_jsx(Skeleton, { className: "h-14 w-full" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(UserCircle, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No users match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "Name" }), _jsx(TableHead, { scope: "col", children: "Email" }), _jsx(TableHead, { scope: "col", children: "Role" }), _jsx(TableHead, { scope: "col", children: "Joined" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((u) => (_jsxs(TableRow, { className: !u.isActive ? "opacity-50" : undefined, children: [_jsx(TableCell, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary", "aria-hidden": true, children: u.name.charAt(0).toUpperCase() }), _jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "font-medium", children: u.name }), !u.isActive && (_jsx("span", { className: "text-xs text-destructive font-medium", children: "Inactive" }))] })] }) }), _jsx(TableCell, { className: "text-muted-foreground", children: u.email }), _jsx(TableCell, { children: _jsx(Badge, { variant: ROLE_COLORS[u.role], className: "capitalize", children: ROLE_LABELS[u.role] ?? u.role }) }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(u.createdAt).toLocaleDateString() }), _jsx(TableCell, { className: "text-right", children: _jsx("div", { className: "flex justify-end gap-1", children: u.isActive ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "icon", variant: "ghost", "aria-label": `Edit ${u.name}`, onClick: () => openEdit(u), children: _jsx(Pencil, { className: "h-4 w-4" }) }), me?.id !== u.id && (_jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive hover:text-destructive", "aria-label": `Deactivate ${u.name}`, onClick: () => handleDeactivate(u.id, u.name), children: _jsx(UserX, { className: "h-4 w-4" }) }))] })) : (_jsxs(Button, { size: "sm", variant: "outline", className: "text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700", "aria-label": `Reactivate ${u.name}`, onClick: () => handleReactivate(u.id, u.name), children: [_jsx(UserCheck, { className: "mr-1 h-4 w-4" }), "Reactivate"] })) }) })] }, u.id))) })] }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit user" : "Add user" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "user-name", children: "Full name" }), _jsx(Input, { id: "user-name", ...register("name", { required: true }), placeholder: "John Smith" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "user-email", children: "Email" }), _jsx(Input, { id: "user-email", type: "email", ...register("email", { required: true }), placeholder: "john@furnicore.com" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "user-pass", children: editItem ? "New password (leave blank to keep current)" : "Password" }), _jsx(Input, { id: "user-pass", type: "password", ...register("password"), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Role" }), _jsx(Controller, { name: "role", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "admin", children: "Admin" }), _jsx(SelectItem, { value: "manager", children: "Manager" }), _jsx(SelectItem, { value: "sales_manager", children: "Sales Manager" }), _jsx(SelectItem, { value: "accountant", children: "Accountant" }), _jsx(SelectItem, { value: "employee", children: "Employee" }), _jsx(SelectItem, { value: "worker", children: "Worker" }), _jsx(SelectItem, { value: "supplier", children: "Supplier" }), _jsx(SelectItem, { value: "customer", children: "Customer" })] })] })) })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createUser.isPending || updateUser.isPending, children: "Save" })] })] })] }) })] }));
}
