/** Shared dashboard theme ids — used by auth + dashboard-themes routes */

export const THEME_IDS = [
  "indigo-clinical",
  "slate-executive",
  "emerald-ops",
  "amber-forge",
  "rose-revenue",
  "cyan-ledger",
  "violet-people",
  "coral-supply",
  "teal-floor",
  "sky-client",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
