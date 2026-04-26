import { nativeAnalyticsHandlers } from "../lib/native-analytics";

const MODULE_ALIASES = Object.freeze({
  sales: "customer",
});

const SUPPORTED_MODULES = Object.freeze([
  "notifications",
  "inventory",
  "procurement",
  "production",
  "supplier",
  "customer",
  "sales",
  "accounting",
  "hr",
]);

function normalizeModuleKey(rawModule) {
  const input = String(rawModule || "").trim().toLowerCase();
  if (!input) return "";
  return MODULE_ALIASES[input] || input;
}

export function listSupportedAnalyticsModules() {
  return [...SUPPORTED_MODULES];
}

export async function fetchNativeAnalyticsForModule(moduleKey, context = {}) {
  const normalized = normalizeModuleKey(moduleKey);
  const handler = nativeAnalyticsHandlers[normalized];
  if (!handler) {
    return {
      ok: false,
      status: 404,
      error: "ANALYTICS_MODULE_NOT_FOUND",
      module: String(moduleKey || ""),
      normalizedModule: normalized,
      supportedModules: listSupportedAnalyticsModules(),
    };
  }

  const payload = await handler(context);
  return {
    ok: true,
    module: String(moduleKey || ""),
    normalizedModule: normalized,
    payload,
  };
}
