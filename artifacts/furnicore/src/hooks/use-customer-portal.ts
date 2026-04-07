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

export interface CatalogProduct {
  id: number; name: string; description: string | null;
  sku: string; category: string; sellingPrice: number; stockQuantity: number;
}

export interface CartItem { product: CatalogProduct; quantity: number; }

export interface CustomerOrderItem {
  id: number; productName: string; productSku: string | null;
  quantity: number; unitPrice: number; discountPercent: number; lineTotal: number;
}

export interface CustomerOrderUpdate {
  id: number; message: string; status: string | null; imageUrl: string | null; createdAt: string;
}

export interface CustomerOrder {
  id: number; orderNumber: string; customerName: string; customerEmail: string;
  status: string; notes: string | null; shippingAddress: string | null;
  subtotal: number; discountCode: string | null; discountAmount: number;
  taxRate: number; taxAmount: number; totalAmount: number;
  estimatedDelivery: string | null;
  createdAt: string; updatedAt: string;
  items: CustomerOrderItem[]; updates: CustomerOrderUpdate[];
}

export interface CustomerInvoice {
  id: number; invoiceNumber: string; orderId: number | null;
  customerName: string; status: string;
  subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number;
  dueDate: string | null; paidAt: string | null;
  paymentMethod: string | null; paymentReference: string | null;
  createdAt: string;
}

export interface DiscountValidation {
  valid: boolean; reason?: string; code?: string;
  type?: string; value?: number; discountAmount?: number; description?: string | null;
}

/* ─── Hooks ──────────────────────────────────────────────────────────────── */

export function useCustomerProfile() {
  return useQuery({ queryKey: ["customerProfile"], queryFn: () => apiFetch<{ id: number; name: string; email: string }>("/customer-portal/profile") });
}

export function useProductCatalog() {
  return useQuery<CatalogProduct[]>({ queryKey: ["catalog"], queryFn: () => apiFetch("/customer-portal/catalog") });
}

export function useValidateDiscount(code: string, orderAmount: number) {
  return useQuery<DiscountValidation>({
    queryKey: ["discountValidation", code, orderAmount],
    queryFn: () => apiFetch(`/customer-portal/validate-discount?code=${encodeURIComponent(code)}&orderAmount=${orderAmount}`),
    enabled: code.length >= 2,
  });
}

export function useCustomerOrders() {
  return useQuery<CustomerOrder[]>({ queryKey: ["customerOrders"], queryFn: () => apiFetch("/customer-portal/orders") });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      shippingAddress: string; notes?: string; discountCode?: string; taxRate?: number;
      items: { productId: number; quantity: number }[];
    }) => apiFetch<CustomerOrder>("/customer-portal/orders", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customerOrders"] }); qc.invalidateQueries({ queryKey: ["customerInvoices"] }); },
  });
}

export function useCustomerInvoices() {
  return useQuery<CustomerInvoice[]>({ queryKey: ["customerInvoices"], queryFn: () => apiFetch("/customer-portal/invoices") });
}

export function usePayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; paymentMethod: string; paymentReference?: string }) =>
      apiFetch(`/customer-portal/invoices/${id}/pay`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customerInvoices"] }); qc.invalidateQueries({ queryKey: ["customerOrders"] }); },
  });
}
