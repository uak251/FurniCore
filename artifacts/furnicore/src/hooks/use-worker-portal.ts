/**
 * React Query hooks for the Worker Portal.
 * All data is automatically scoped to the authenticated worker — the backend
 * derives the employee/task scope from the JWT, never from URL params.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken() ?? ""}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as unknown as T;
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface WorkerProfile {
  user: { id: number; name: string; email: string; role: string };
  employee: {
    id: number; name: string; department: string; position: string;
    hireDate: string | null; isActive: boolean; baseSalary: number; phone: string | null;
  } | null;
}

export interface WorkerTask {
  id: number;
  title: string;
  description: string | null;
  productId: number | null;
  productName: string | null;
  status: string;
  priority: string;
  progress: number;
  estimatedHours: number | null;
  actualHours: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  totalRecords: number;
  totalHours: number;
  attendanceRate: number | null;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  status: "present" | "absent" | "late" | "half_day";
  hoursWorked: number | null;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceResponse {
  month: number;
  year: number;
  employeeName: string;
  summary: AttendanceSummary;
  penaltyPreview: {
    absentPenalty: number;
    latePenalty: number;
    halfDayPenalty: number;
    total: number;
  };
  records: AttendanceRecord[];
  message?: string;
}

export interface PayrollBreakdown {
  monthlyBase: number;
  workingDays: number;
  dayRate: number;
  attendance: {
    totalRecords: number;
    present: number;
    absent: number;
    late: number;
    halfDay: number;
    absentPenalty: number;
    latePenalty: number;
    halfDayPenalty: number;
    totalAttendancePenalty: number;
  };
  bonusAdjustments: { id: number; reason: string; amount: number }[];
  penaltyAdjustments: { id: number; reason: string; amount: number }[];
  totalBonus: number;
  totalDeductions: number;
  netSalary: number;
}

export interface WorkerPayslip {
  id: number;
  month: number;
  year: number;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  status: string;
  paidAt: string | null;
  breakdown: PayrollBreakdown | null;
}

export interface PayrollResponse {
  employeeName: string;
  annualSalary: number;
  records: WorkerPayslip[];
  message?: string;
}

/* ─── Hooks ──────────────────────────────────────────────────────────────── */

export function useWorkerMe() {
  return useQuery<WorkerProfile>({
    queryKey: ["workerMe"],
    queryFn:  () => apiFetch("/worker-portal/me"),
  });
}

export function useWorkerTasks() {
  return useQuery<WorkerTask[]>({
    queryKey: ["workerTasks"],
    queryFn:  () => apiFetch("/worker-portal/tasks"),
    refetchInterval: 60_000, // poll every minute for new assignments
  });
}

export function useUpdateWorkerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; progress?: number; actualHours?: number }) =>
      apiFetch<WorkerTask>(`/worker-portal/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workerTasks"] }),
  });
}

export function useWorkerAttendance(month: number, year: number) {
  return useQuery<AttendanceResponse>({
    queryKey: ["workerAttendance", month, year],
    queryFn:  () => apiFetch(`/worker-portal/attendance?month=${month}&year=${year}`),
  });
}

export function useWorkerPayroll() {
  return useQuery<PayrollResponse>({
    queryKey: ["workerPayroll"],
    queryFn:  () => apiFetch("/worker-portal/payroll"),
  });
}
