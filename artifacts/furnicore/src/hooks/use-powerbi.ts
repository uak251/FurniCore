/**
 * usePowerBI — fetches Power BI embed tokens and report metadata from the
 * FurniCore API server. Tokens are cached in memory for the lifetime of the
 * component so repeated tab switches don't re-request them.
 */

import { useState, useCallback, useRef } from "react";
import { getAuthToken } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export interface Report {
  id: string;
  label: string;
  configured: boolean;
}

export interface EmbedConfig {
  token: string;
  expiry: string;
  embedUrl: string;
  reportId: string;
  workspaceId: string;
}

export type EmbedState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; config: EmbedConfig }
  | { status: "unconfigured"; message: string }
  | { status: "error"; message: string };

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function usePowerBI() {
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // Per-reportId embed state, keyed by report id
  const [embedStates, setEmbedStates] = useState<Record<string, EmbedState>>({});

  // Deduplicate in-flight token requests
  const inFlight = useRef(new Set<string>());

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetch(`${API_BASE}/api/powerbi/reports`, {
        headers: authHeaders(),
      });
      if (res.status === 403) {
        setReportsError("You do not have permission to view Power BI reports.");
        return;
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = (await res.json()) as { reports: Report[] };
      setReports(json.reports);
    } catch (e: any) {
      setReportsError(e.message ?? "Failed to load reports");
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const fetchEmbedToken = useCallback(async (reportId: string) => {
    // Don't re-fetch if we already have a ready/unconfigured state, or are loading
    const current = embedStates[reportId];
    if (current && current.status !== "idle" && current.status !== "error") return;
    if (inFlight.current.has(reportId)) return;

    inFlight.current.add(reportId);
    setEmbedStates((prev) => ({ ...prev, [reportId]: { status: "loading" } }));

    try {
      const res = await fetch(`${API_BASE}/api/powerbi/embed-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
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
      if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`);

      setEmbedStates((prev) => ({
        ...prev,
        [reportId]: { status: "ready", config: json as EmbedConfig },
      }));
    } catch (e: any) {
      setEmbedStates((prev) => ({
        ...prev,
        [reportId]: { status: "error", message: e.message ?? "Unknown error" },
      }));
    } finally {
      inFlight.current.delete(reportId);
    }
  }, [embedStates]);

  const getEmbedState = useCallback(
    (reportId: string): EmbedState => embedStates[reportId] ?? { status: "idle" },
    [embedStates],
  );

  return {
    reports,
    reportsLoading,
    reportsError,
    fetchReports,
    fetchEmbedToken,
    getEmbedState,
  };
}
