/**
 * React Query hooks for the Supplier Portal.
 * All hooks target /supplier-portal/* endpoints that are locked to
 * the "supplier" role; the backend further scopes every query to the
 * supplier whose email matches the logged-in user.
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

export interface SupplierProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: string;
  rating: number | null;
}

export interface SupplierQuote {
  id: number;
  supplierId: number;
  supplierName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  notes: string | null;
  validUntil: string | null;
  lockedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface DeliveryUpdate {
  id: number;
  quoteId: number;
  quoteDescription: string;
  quoteStatus: string;
  status: string;
  note: string | null;
  estimatedDelivery: string | null;
  updatedBy: number | null;
  createdAt: string;
}

export interface LedgerData {
  supplier: { id: number; name: string };
  summary: {
    totalQuotes: number;
    totalValue: number;
    paidValue: number;
    pendingValue: number;
    approvedValue: number;
  };
  ledger: {
    id: number;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
    notes: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSupplierMe() {
  return useQuery<SupplierProfile>({
    queryKey: ["supplierMe"],
    queryFn: () => apiFetch("/supplier-portal/me"),
  });
}

export function useSupplierQuotes() {
  return useQuery<SupplierQuote[]>({
    queryKey: ["supplierQuotes"],
    queryFn: () => apiFetch("/supplier-portal/quotes"),
  });
}

export function useSubmitQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      description: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
      validUntil?: string;
    }) =>
      apiFetch<SupplierQuote>("/supplier-portal/quotes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierQuotes"] }),
  });
}

export function useSupplierDeliveries() {
  return useQuery<DeliveryUpdate[]>({
    queryKey: ["supplierDeliveries"],
    queryFn: () => apiFetch("/supplier-portal/deliveries"),
  });
}

export function useAddDeliveryUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      quoteId: number;
      status: string;
      note?: string;
      estimatedDelivery?: string;
    }) =>
      apiFetch<DeliveryUpdate>("/supplier-portal/deliveries", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierDeliveries"] }),
  });
}

export function usePatchDeliveryUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      status?: string;
      note?: string;
      estimatedDelivery?: string | null;
    }) =>
      apiFetch<DeliveryUpdate>(`/supplier-portal/deliveries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierDeliveries"] }),
  });
}

export function useSupplierLedger() {
  return useQuery<LedgerData>({
    queryKey: ["supplierLedger"],
    queryFn: () => apiFetch("/supplier-portal/ledger"),
  });
}
