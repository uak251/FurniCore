import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  useGetDashboardThemeDefaults,
  usePatchCurrentUserTheme,
  getGetCurrentUserQueryKey,
  getGetDashboardThemeDefaultsQueryKey,
} from "@workspace/api-client-react";
import { getAuthToken } from "@/lib/auth";

export type DashboardThemeContextValue = {
  /** Resolved theme id applied to the document */
  effectiveThemeId: string;
  /** User override from DB, or null = portal default */
  userOverride: string | null | undefined;
  setTheme: (themeId: string | null) => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

const FALLBACK_THEME = "indigo-clinical";

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const authed = typeof window !== "undefined" && !!getAuthToken();

  const { data: userData, isLoading: userLoading } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), enabled: authed, retry: false },
  });
  /** Ignore cached profile when logged out so theme does not stick from prior session */
  const user = authed ? userData : undefined;
  const { data: defaultsRes, isLoading: defLoading } = useGetDashboardThemeDefaults({
    query: { queryKey: getGetDashboardThemeDefaultsQueryKey(), enabled: authed, retry: false },
  });

  const patch = usePatchCurrentUserTheme();

  const effectiveThemeId = useMemo(() => {
    if (!authed || !user) return FALLBACK_THEME;
    if (user.dashboardTheme) return user.dashboardTheme;
    const role = user.role ?? "employee";
    const d = defaultsRes?.defaults?.[role];
    if (typeof d === "string" && d.length > 0) return d;
    return FALLBACK_THEME;
  }, [authed, user, defaultsRes]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-dashboard-theme", effectiveThemeId);
    return () => {
      document.documentElement.removeAttribute("data-dashboard-theme");
    };
  }, [effectiveThemeId]);

  const setTheme = useCallback(
    async (themeId: string | null) => {
      await patch.mutateAsync({ data: { themeId } });
      await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    },
    [patch, qc],
  );

  const value = useMemo<DashboardThemeContextValue>(
    () => ({
      effectiveThemeId,
      userOverride: authed ? user?.dashboardTheme : undefined,
      setTheme,
      isLoading: authed && (userLoading || defLoading),
      isSaving: patch.isPending,
    }),
    [effectiveThemeId, user?.dashboardTheme, setTheme, authed, userLoading, defLoading, patch.isPending],
  );

  return (
    <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme(): DashboardThemeContextValue {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error("useDashboardTheme must be used within DashboardThemeProvider");
  }
  return ctx;
}

/** Safe hook when provider might not wrap (e.g. tests) — returns null if missing */
export function useDashboardThemeOptional(): DashboardThemeContextValue | null {
  return useContext(DashboardThemeContext);
}
