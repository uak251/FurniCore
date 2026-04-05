import { useState } from "react";
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
import { Plus, UserCircle, Search, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

const ROLE_COLORS: Record<string, string> = {
  admin: "destructive",
  manager: "default",
  employee: "secondary",
  supplier: "outline",
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const { register, handleSubmit, control, reset, setValue } = useForm<UserForm>({
    defaultValues: { role: "employee" }
  });

  const filtered = (users ?? []).filter((u: any) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listUsers"] });

  const openCreate = () => {
    setEditItem(null);
    reset({ name: "", email: "", password: "", role: "employee" });
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
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user? This action cannot be undone.")) return;
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "User deleted" });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage system users and roles</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <UserCircle className="h-10 w-10 mb-3" />
              <p>No users found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u: any) => (
                  <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                    <td className="px-6 py-4">
                      <Badge variant={ROLE_COLORS[u.role] as any} className="capitalize">{u.role}</Badge>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(u.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Full Name</Label>
                <Input {...register("name", { required: true })} placeholder="John Smith" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Email</Label>
                <Input type="email" {...register("email", { required: true })} placeholder="john@furnicore.com" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{editItem ? "New Password (leave blank to keep current)" : "Password"}</Label>
                <Input type="password" {...register("password")} placeholder="••••••••" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Role</Label>
                <Controller name="role" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
