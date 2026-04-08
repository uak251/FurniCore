/**
 * usePowerBI — manages Power BI embed tokens, report metadata, token refresh,
 * and native data fallback for the FurniCore accounting analytics hub.
 *
 * State is local to whichever component mounts this hook; use it once at the
 * top level (PowerBIReportsHub) and pass values down via props.
 */
import { useState, useCallback, useRef } from "react";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
const API_BASE = apiOriginPrefix();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function authHeaders() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
async function apiFetch(path, options) {
    return fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options?.headers ?? {}) },
    });
}
// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePowerBI() {
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [reportsError, setReportsError] = useState(null);
    const [embedStates, setEmbedStates] = useState({});
    const [nativeDataStates, setNativeDataStates] = useState({});
    // Deduplicate in-flight requests
    const inFlightEmbed = useRef(new Set());
    const inFlightData = useRef(new Set());
    /* ── fetchReports ─────────────────────────────────────────────── */
    const fetchReports = useCallback(async () => {
        if (reportsLoading)
            return;
        setReportsLoading(true);
        setReportsError(null);
        try {
            const res = await apiFetch("/api/powerbi/reports");
            if (res.status === 403) {
                setReportsError("You do not have permission to view Power BI reports.");
                return;
            }
            if (!res.ok)
                throw new Error(`Server error ${res.status}`);
            const json = (await res.json());
            setReports(json.reports);
        }
        catch (e) {
            setReportsError(e.message ?? "Failed to load reports");
        }
        finally {
            setReportsLoading(false);
        }
    }, [reportsLoading]);
    /* ── fetchEmbedToken (guarded — skips if ready/loading) ───────── */
    const fetchEmbedToken = useCallback(async (reportId) => {
        const current = embedStates[reportId];
        if (current && current.status !== "idle" && current.status !== "error")
            return;
        if (inFlightEmbed.current.has(reportId))
            return;
        await _doFetchToken(reportId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedStates]);
    /* ── forceRefreshToken (always re-fetches) ────────────────────── */
    const forceRefreshToken = useCallback(async (reportId) => {
        if (inFlightEmbed.current.has(reportId))
            return;
        await _doFetchToken(reportId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    /* ── shared token fetch impl ──────────────────────────────────── */
    async function _doFetchToken(reportId) {
        inFlightEmbed.current.add(reportId);
        setEmbedStates((prev) => ({ ...prev, [reportId]: { status: "loading" } }));
        try {
            const res = await apiFetch("/api/powerbi/embed-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId }),
            });
            const json = await res.json();
            if (res.status === 503 && json.configured === false) {
                setEmbedStates((prev) => ({
                    ...prev,
                    [reportId]: { status: "unconfigured", message: json.error ?? "Report not configured" },
                }));
                return;
            }
            if (!res.ok)
                throw new Error(json.error ?? `Server error ${res.status}`);
            setEmbedStates((prev) => ({
                ...prev,
                [reportId]: { status: "ready", config: json },
            }));
        }
        catch (e) {
            setEmbedStates((prev) => ({
                ...prev,
                [reportId]: { status: "error", message: e.message ?? "Unknown error" },
            }));
        }
        finally {
            inFlightEmbed.current.delete(reportId);
        }
    }
    /* ── fetchNativeData ──────────────────────────────────────────── */
    const fetchNativeData = useCallback(async (reportId) => {
        const current = nativeDataStates[reportId];
        if (current && (current.status === "loading" || current.status === "ready"))
            return;
        if (inFlightData.current.has(reportId))
            return;
        inFlightData.current.add(reportId);
        setNativeDataStates((prev) => ({ ...prev, [reportId]: { status: "loading" } }));
        try {
            const res = await apiFetch(`/api/powerbi/data/${reportId}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error ?? `Server error ${res.status}`);
            }
            const payload = await res.json();
            setNativeDataStates((prev) => ({ ...prev, [reportId]: { status: "ready", payload } }));
        }
        catch (e) {
            setNativeDataStates((prev) => ({
                ...prev,
                [reportId]: { status: "error", message: e.message ?? "Failed to load data" },
            }));
        }
        finally {
            inFlightData.current.delete(reportId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativeDataStates]);
    /* ── selectors ────────────────────────────────────────────────── */
    const getEmbedState = useCallback((reportId) => embedStates[reportId] ?? { status: "idle" }, [embedStates]);
    const getNativeData = useCallback((reportId) => nativeDataStates[reportId] ?? { status: "idle" }, [nativeDataStates]);
    return {
        reports,
        reportsLoading,
        reportsError,
        fetchReports,
        fetchEmbedToken,
        forceRefreshToken,
        getEmbedState,
        fetchNativeData,
        getNativeData,
    };
}
