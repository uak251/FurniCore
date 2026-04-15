const STORAGE_KEY = "furnicore.analytics.preferences.v1";

export const ANALYTICS_MODULE_KEYS = [
  "inventory",
  "accounting",
  "payroll",
  "hr",
  "customer",
  "supplier",
  "production",
];

const MODULE_DEFAULT = {
  enabled: true,
  showKpis: true,
  showCharts: true,
  showActions: true,
};

export const defaultAnalyticsPreferences = ANALYTICS_MODULE_KEYS.reduce((acc, moduleKey) => {
  acc[moduleKey] = { ...MODULE_DEFAULT };
  return acc;
}, {});

function sanitizeModulePrefs(value) {
  return {
    enabled: value?.enabled !== false,
    showKpis: value?.showKpis !== false,
    showCharts: value?.showCharts !== false,
    showActions: value?.showActions !== false,
  };
}

export function mergeAnalyticsPreferences(overrides) {
  const merged = { ...defaultAnalyticsPreferences };
  for (const moduleKey of ANALYTICS_MODULE_KEYS) {
    merged[moduleKey] = sanitizeModulePrefs({
      ...defaultAnalyticsPreferences[moduleKey],
      ...(overrides?.[moduleKey] ?? {}),
    });
  }
  return merged;
}

export function loadAnalyticsPreferences() {
  if (typeof window === "undefined") return defaultAnalyticsPreferences;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAnalyticsPreferences;
    const parsed = JSON.parse(raw);
    return mergeAnalyticsPreferences(parsed);
  } catch {
    return defaultAnalyticsPreferences;
  }
}

export function saveAnalyticsPreferences(nextPreferences) {
  const merged = mergeAnalyticsPreferences(nextPreferences);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
}
