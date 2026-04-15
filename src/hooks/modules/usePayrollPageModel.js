import { useMemo, useState } from "react";
import { useApprovePayroll, useGeneratePayroll, useListPayroll } from "@workspace/api-client-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function usePayrollPageModel() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [genMonth, setGenMonth] = useState(String(new Date().getMonth() + 1));
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));

  const { data: payroll = [], isLoading } = useListPayroll();
  const generatePayroll = useGeneratePayroll();
  const approvePayroll = useApprovePayroll();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payroll.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (monthFilter !== "all" && Number(row.month) !== Number(monthFilter)) return false;
      if (yearFilter !== "all" && Number(row.year) !== Number(yearFilter)) return false;
      if (!q) return true;
      return (
        String(row.employeeName ?? "").toLowerCase().includes(q) ||
        String(row.employeeId ?? "").includes(q)
      );
    });
  }, [payroll, search, statusFilter, monthFilter, yearFilter]);

  const pendingTotal = useMemo(
    () =>
      rows
        .filter((row) => row.status !== "approved")
        .reduce((sum, row) => sum + Number(row.netSalary ?? 0), 0),
    [rows],
  );

  const years = useMemo(
    () => [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1],
    [],
  );

  return {
    MONTHS,
    years,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    monthFilter,
    setMonthFilter,
    yearFilter,
    setYearFilter,
    showGenerateDialog,
    setShowGenerateDialog,
    genMonth,
    setGenMonth,
    genYear,
    setGenYear,
    rows,
    pendingTotal,
    isLoading,
    generatePayroll,
    approvePayroll,
  };
}

