import { useState, useMemo, useEffect } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@workspace/api-client-react";
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
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

/** Extract a human-readable message from any API error shape. */
function apiErrorMessage(e: unknown): string {
  if (!e || typeof e !== "object") return "An unexpected error occurred.";
  // Axios-style: e.response.data.message
  const resp = (e as any).response?.data;
  if (resp?.message) return String(resp.message);
  if (resp?.error && typeof resp.error === "string" && !resp.error.startsWith("<!"))
    return resp.error;
  // Plain Error object
  const msg = (e as any).message ?? "";
  // Strip HTML if the server returned an error page
  if (typeof msg === "string" && msg.includes("<!DOCTYPE")) return "Server error — please restart the API server.";
  return msg || "An unexpected error occurred.";
}

const ROLE_COLORS: Record<string, string> = {
  admin:         "destructive",
  manager:       "default",
  sales_manager: "default",
  accounts:      "default",
  employee:      "secondary",
  worker:        "secondary",
  supplier:      "outline",
  customer:      "outline",
};

const ROLE_LABELS: Record<string, string> = {
  admin:         "Admin",
  manager:       "Manager",
  sales_manager: "Sales Manager",
  accounts:      "Accounts",
  employee:      "Employee",
  worker:        "Worker",
  supplier:      "Supplier",
  customer:      "Customer",
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

const TABLE_ID = "users";

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const { register, handleSubmit, control, reset, setValue } = useForm<UserForm>({
    defaultValues: { role: "employee" },
  });

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, sortKey, sortDir, pageSize]);

  const rows = users ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        // Hide inactive users unless toggle is on
        if (!showInactive && !row.isActive) return false;
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          row.name.toLowerCase().includes(qn) ||
          row.email.toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (roleFilter === "all") return true;
        return String(row.role).toLowerCase() === roleFilter;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        if (key === "email") return String(row.email ?? "");
        if (key === "role") return String(row.role ?? "");
        if (key === "createdAt") return new Date(row.createdAt).getTime();
        return String(row.name ?? "");
      },
    });
  }, [rows, search, roleFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listUsers"] });

  const exportCsv = () => {
    const headers = ["name", "email", "role", "createdAt"];
    const data = sorted.map((u: any) => ({
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

  const openEdit = (u: any) => {
    setEditItem(u);
    setValue("name", u.name);
    setValue("email", u.email);
    setValue("password", "");
    setValue("role", u.role);
    setShowDialog(true);
  };

  const onSubmit = async (data: UserForm) => {
    try {
      const payload: any = { name: data.name, email: data.email, role: data.role };
      if (data.password) payload.password = data.password;
      if (editItem) {
        await updateUser.mutateAsync({ id: editItem.id, data: payload });
        toast({ title: "User updated" });
      } else {
        if (!data.password) {
          toast({ variant: "destructive", title: "Password required for new users" });
          return;
        }
        await createUser.mutateAsync({ data: payload });
        toast({ title: "User created" });
      }
      invalidate();
      setShowDialog(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
    }
  };

  const handleDeactivate = async (id: number, name: string) => {
    if (!confirm(`Deactivate "${name}"?\n\nThey will no longer be able to log in. All their data and history will be preserved. You can reactivate them at any time.`)) return;
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "User deactivated", description: `${name} has been deactivated.` });
      invalidate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
    }
  };

  const handleReactivate = async (id: number, name: string) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive: true } as any });
      toast({ title: "User reactivated", description: `${name} can log in again.` });
      invalidate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
    }
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master Admin Portal</h1>
          <p className="text-muted-foreground">Create, manage, and assign roles for all system users</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Add user
          </Button>
        </div>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="users"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email…"
        filterLabel="Role"
        filterValue={roleFilter}
        onFilterChange={setRoleFilter}
        filterOptions={[
          { value: "all",           label: "All roles" },
          { value: "admin",         label: "Admin" },
          { value: "manager",       label: "Manager" },
          { value: "sales_manager", label: "Sales Manager" },
          { value: "accounts",      label: "Accounts" },
          { value: "employee",      label: "Employee" },
          { value: "worker",        label: "Worker" },
          { value: "supplier",      label: "Supplier" },
          { value: "customer",      label: "Customer" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "email", label: "Email" },
          { value: "role", label: "Role" },
          { value: "createdAt", label: "Joined" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0 ? "No matching users" : `Showing ${from}–${to} of ${total} matching users`
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <UserCircle className="mb-3 h-10 w-10" aria-hidden />
              <p>No users match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Email</TableHead>
                      <TableHead scope="col">Role</TableHead>
                      <TableHead scope="col">Joined</TableHead>
                      <TableHead scope="col" className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((u: any) => (
                      <TableRow key={u.id} className={!u.isActive ? "opacity-50" : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary"
                              aria-hidden
                            >
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{u.name}</span>
                              {!u.isActive && (
                                <span className="text-xs text-destructive font-medium">Inactive</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={ROLE_COLORS[u.role] as any} className="capitalize">
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {u.isActive ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Edit ${u.name}`}
                                  onClick={() => openEdit(u)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  aria-label={`Deactivate ${u.name}`}
                                  onClick={() => handleDeactivate(u.id, u.name)}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
                                aria-label={`Reactivate ${u.name}`}
                                onClick={() => handleReactivate(u.id, u.name)}
                              >
                                <UserCheck className="mr-1 h-4 w-4" />
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationBar
                id={TABLE_ID}
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit user" : "Add user"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="user-name">Full name</Label>
                <Input id="user-name" {...register("name", { required: true })} placeholder="John Smith" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  {...register("email", { required: true })}
                  placeholder="john@furnicore.com"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="user-pass">
                  {editItem ? "New password (leave blank to keep current)" : "Password"}
                </Label>
                <Input id="user-pass" type="password" {...register("password")} placeholder="••••••••" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Role</Label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="sales_manager">Sales Manager</SelectItem>
                        <SelectItem value="accounts">Accounts</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="worker">Worker</SelectItem>
                        <SelectItem value="supplier">Supplier</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
