/**
 * React Query hooks for the extended HR Portal.
 * Covers: attendance CRUD, attendance summary, performance reviews,
 * payroll adjustments, and payroll regeneration.
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  department: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day";
  hoursWorked: number | null;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceSummaryRow {
  employeeId: number;
  employeeName: string;
  department: string;
  month: number;
  year: number;
  totalRecords: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  absentPenalty: number;
  latePenalty: number;
  halfDayPenalty: number;
  totalPenalty: number;
}

export interface PerformanceReview {
  id: number;
  employeeId: number;
  employeeName: string;
  department: string;
  reviewerId: number | null;
  period: string;
  overallRating: number;
  kpiScore: number | null;
  attendanceScore: number | null;
  punctualityScore: number | null;
  summary: string | null;
  goals: string | null;
  achievements: string | null;
  areasForImprovement: string | null;
  recommendBonus: boolean;
  bonusSuggestion: number;
  createdAt: string;
}

export interface PayrollAdjustment {
  id: number;
  employeeId: number;
  employeeName: string;
  type: "bonus" | "penalty";
  reason: string;
  amount: number;
  month: number;
  year: number;
  appliedToPayrollId: number | null;
  createdAt: string;
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

// ─── Attendance ───────────────────────────────────────────────────────────────

export function useListAttendance(params?: { employeeId?: number; month?: number; year?: number }) {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set("employeeId", String(params.employeeId));
  if (params?.month)      qs.set("month",      String(params.month));
  if (params?.year)       qs.set("year",       String(params.year));
  const query = qs.toString();

  return useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", params],
    queryFn:  () => apiFetch(`/attendance${query ? "?" + query : ""}`),
  });
}

export function useUpdateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; hoursWorked?: number; notes?: string }) =>
      apiFetch<AttendanceRecord>(`/attendance/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

export function useDeleteAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/attendance/${id}`, { method: "DELETE" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

export function useAttendanceSummary(month: number, year: number) {
  return useQuery<{ month: number; year: number; summary: AttendanceSummaryRow[]; penaltyRules: Record<string, string> }>({
    queryKey: ["attendanceSummary", month, year],
    queryFn:  () => apiFetch(`/hr/attendance-summary?month=${month}&year=${year}`),
  });
}

// ─── Performance reviews ──────────────────────────────────────────────────────

export function usePerformanceReviews(employeeId?: number) {
  const qs = employeeId ? `?employeeId=${employeeId}` : "";
  return useQuery<PerformanceReview[]>({
    queryKey: ["performanceReviews", employeeId],
    queryFn:  () => apiFetch(`/performance-reviews${qs}`),
  });
}

export function useCreatePerformanceReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PerformanceReview> & { employeeId: number; period: string; overallRating: number }) =>
      apiFetch<PerformanceReview>("/performance-reviews", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
  });
}

export function useUpdatePerformanceReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<PerformanceReview> & { id: number }) =>
      apiFetch<PerformanceReview>(`/performance-reviews/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
  });
}

export function useDeletePerformanceReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/performance-reviews/${id}`, { method: "DELETE" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
  });
}

// ─── Payroll adjustments ──────────────────────────────────────────────────────

export function usePayrollAdjustments(params?: { employeeId?: number; month?: number; year?: number }) {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set("employeeId", String(params.employeeId));
  if (params?.month)      qs.set("month",      String(params.month));
  if (params?.year)       qs.set("year",       String(params.year));
  const query = qs.toString();

  return useQuery<PayrollAdjustment[]>({
    queryKey: ["payrollAdjustments", params],
    queryFn:  () => apiFetch(`/payroll-adjustments${query ? "?" + query : ""}`),
  });
}

export function useAddPayrollAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeId: number; type: "bonus" | "penalty"; reason: string; amount: number; month: number; year: number }) =>
      apiFetch<PayrollAdjustment>("/payroll-adjustments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payrollAdjustments"] });
      qc.invalidateQueries({ queryKey: ["listPayroll"] });
    },
  });
}

export function useDeletePayrollAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/payroll-adjustments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payrollAdjustments"] });
      qc.invalidateQueries({ queryKey: ["listPayroll"] });
    },
  });
}

export function useRegeneratePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/payroll/${id}/regenerate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listPayroll"] }),
  });
}
