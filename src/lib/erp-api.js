/**
 * Authenticated fetch for ERP routes not yet in the OpenAPI client (COGM, workflows, etc.).
 */
import { apiOriginPrefix } from "@/lib/api-base";
import { getAuthToken } from "@/lib/auth";

const API_BASE = apiOriginPrefix();
const DEFAULT_TIMEOUT_MS = 15000;

export async function erpApi(path, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken() ?? ""}`,
        ...(init?.headers ?? {}),
    };
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers,
            signal: init?.signal ?? controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timeout);
        if (err?.name === "AbortError") {
            throw new Error("NETWORK_TIMEOUT: Request took too long. Please retry.");
        }
        throw new Error("NETWORK_ERROR: Unable to reach server.");
    }
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!res.ok) {
        const obj = typeof data === "object" && data !== null ? data : {};
        const code = typeof obj.error === "string" ? obj.error : `HTTP ${res.status}`;
        const detail = typeof obj.message === "string" ? obj.message.trim() : "";
        const msg = detail && code !== detail ? `${code}: ${detail}` : detail || code;
        throw new Error(msg);
    }
    return data;
}
