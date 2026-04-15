import { useMemo, useState } from "react";
import { useListEmployees } from "@workspace/api-client-react";
import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/currency";

export default function HRPage() {
  const { data: employees = [], isLoading } = useListEmployees();
    const { format } = useCurrency();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((emp) => {
      if (status !== "all") {
        const isActive = Boolean(emp.isActive);
        if (status === "active" && !isActive) return false;
        if (status === "inactive" && isActive) return false;
      }
      if (!q) return true;
      return (
        String(emp.name ?? "").toLowerCase().includes(q) ||
        String(emp.email ?? "").toLowerCase().includes(q) ||
        String(emp.department ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, query, status]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card/70 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">HR Portal</h1>
            <p className="text-muted-foreground">Employee records with quick filters and role-safe analytics access.</p>
          </div>
          <ModuleInsightsDrawer moduleName="hr" title="HR Analytics" reportId="hr-dashboard" filters={{ status }} />
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Employees</CardTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, or department..."
              aria-label="Search employees"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No employees found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Base Salary</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.department || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.position || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{format(Number(emp.baseSalary ?? 0))}</TableCell>
                      <TableCell>
                        <Badge
                          variant={emp.isActive ? "default" : "outline"}
                          className={emp.isActive ? "bg-green-100 text-green-800" : ""}
                        >
                          {emp.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
