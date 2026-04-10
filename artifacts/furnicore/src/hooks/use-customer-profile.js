import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";

const API = apiOriginPrefix();

async function fetchCustomerProfile() {
  const res = await fetch(`${API}/api/customer-profile`, {
    headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error);
  return json;
}

async function patchCustomerProfile(body) {
  const res = await fetch(`${API}/api/customer-profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken() ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error);
  return json;
}

export const customerProfileQueryKey = ["customerProfile"];

export function useCustomerProfile(enabled) {
  return useQuery({
    queryKey: customerProfileQueryKey,
    queryFn: fetchCustomerProfile,
    enabled: Boolean(enabled),
  });
}

export function usePatchCustomerProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchCustomerProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: customerProfileQueryKey }),
  });
}
