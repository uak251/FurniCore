import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";

import { apiOriginPrefix } from "@/lib/api-base";

const API = apiOriginPrefix();

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

export interface OrderItem {
  id: number; orderId: number; productId: number | null;
  productName: string; productSku: string | null;
  quantity: number; unitPrice: number; discountPercent: number; lineTotal: number;
}

export interface OrderUpdate {
  id: number; message: string; status: string | null;
  imageUrl: string | null; visibleToCustomer: boolean; createdAt: string;
}

export interface CustomerOrder {
  id: number; orderNumber: string;
  customerId: number | null; customerName: string; customerEmail: string;
  status: string; notes: string | null; shippingAddress: string | null;
  subtotal: number; discountCode: string | null; discountAmount: number;
  taxRate: number; taxAmount: number; totalAmount: number;
  estimatedDelivery: string | null; taskId: number | null;
  createdAt: string; updatedAt: string;
  items: OrderItem[]; updates: OrderUpdate[];
}

export interface Invoice {
  id: number; invoiceNumber: string;
  orderId: number | null; customerId: number | null;
  customerName: string; customerEmail: string;
  status: string; subtotal: number; discountAmount: number;
  taxAmount: number; totalAmount: number;
  dueDate: string | null; paidAt: string | null;
  paymentMethod: string | null; paymentReference: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
}

export interface Discount {
  id: number; code: string; description: string | null;
  type: "percentage" | "fixed"; value: number;
  minOrderAmount: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; isActive: boolean; createdAt: string;
}

export interface SalesOverview {
  totalRevenue: number; mtdRevenue: number; mtdOrders: number;
  totalOrders: number; outstandingAR: number; overdueCount: number;
  ordersByStatus: Record<string, number>;
  recentOrders: CustomerOrder[];
}

export interface Receivable extends Invoice { ageDays: number; bucket: string; }
export interface ReceivablesReport {
  totalOutstanding: number;
  buckets: { current: number; days30: number; days60: number; days90: number; over90: number };
  invoices: Receivable[];
}

/* ─── Overview ───────────────────────────────────────────────────────────── */
export function useSalesOverview() {
  return useQuery<SalesOverview>({ queryKey: ["salesOverview"], queryFn: () => apiFetch("/sales-manager/overview") });
}

/* ─── Orders ─────────────────────────────────────────────────────────────── */
export function useSalesOrders() {
  return useQuery<CustomerOrder[]>({ queryKey: ["salesOrders"], queryFn: () => apiFetch("/sales-manager/orders") });
}
export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch<CustomerOrder>("/sales-manager/orders", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesOrders"] }); qc.invalidateQueries({ queryKey: ["salesOverview"] }); },
  });
}
export function useUpdateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      apiFetch<CustomerOrder>(`/sales-manager/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salesOrders"] }),
  });
}
export function useAddOrderUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }: { orderId: number } & Record<string, unknown>) =>
      apiFetch(`/sales-manager/orders/${orderId}/updates`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salesOrders"] }),
  });
}

/* ─── Invoices ───────────────────────────────────────────────────────────── */
export function useSalesInvoices() {
  return useQuery<Invoice[]>({ queryKey: ["salesInvoices"], queryFn: () => apiFetch("/sales-manager/invoices") });
}
export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: number; dueDate?: string; notes?: string; taxRate?: number }) =>
      apiFetch<Invoice>("/sales-manager/invoices", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesInvoices"] }); qc.invalidateQueries({ queryKey: ["salesReceivables"] }); },
  });
}
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      apiFetch<Invoice>(`/sales-manager/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesInvoices"] }); qc.invalidateQueries({ queryKey: ["salesReceivables"] }); },
  });
}

/* ─── Discounts ──────────────────────────────────────────────────────────── */
export function useSalesDiscounts() {
  return useQuery<Discount[]>({ queryKey: ["salesDiscounts"], queryFn: () => apiFetch("/sales-manager/discounts") });
}
export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch<Discount>("/sales-manager/discounts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
  });
}
export function useUpdateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      apiFetch<Discount>(`/sales-manager/discounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
  });
}
export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/sales-manager/discounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
  });
}

/* ─── Receivables ────────────────────────────────────────────────────────── */
export function useSalesReceivables() {
  return useQuery<ReceivablesReport>({ queryKey: ["salesReceivables"], queryFn: () => apiFetch("/sales-manager/receivables") });
}
