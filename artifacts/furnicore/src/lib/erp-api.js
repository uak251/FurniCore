/**
 * Authenticated fetch for ERP routes not yet in the OpenAPI client (COGM, workflows, etc.).
 */
import { apiOriginPrefix } from "@/lib/api-base";
import { getAuthToken } from "@/lib/auth";

const API_BASE = apiOriginPrefix();

export async function erpApi(path, init) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
            ...(init?.headers ?? {}),
        },
    });
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!res.ok) {
        const err = typeof data === "object" && data !== null && "error" in data ? data.error : `HTTP ${res.status}`;
        throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
    return data;
}
