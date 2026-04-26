import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

const FULL_ACCESS = ["admin"];
const CONTRACT_FILENAME = "analytics-rbac.v1.json";
/** Master-admin overrides merged into `allowedRolesForAnalyticsModule` (JSON object in app_settings). */
const MODULE_RULES_OVERRIDE_KEY = "ANALYTICS_RBAC_MODULE_RULES";

/** Walk up from this module (or bundled entry) to find contracts/analytics-rbac.v1.json — covers dev, dist/contracts, and monorepo layouts. */
function contractPathsNearModuleFile() {
  const start = path.dirname(fileURLToPath(import.meta.url));
  const out = [];
  let dir = start;
  for (let i = 0; i < 12; i++) {
    out.push(path.join(dir, "contracts", CONTRACT_FILENAME));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function allContractCandidates() {
  const cwd = process.cwd();
  return [
    path.join(cwd, "contracts", CONTRACT_FILENAME),
    path.join(cwd, "..", "contracts", CONTRACT_FILENAME),
    path.join(cwd, "..", "..", "contracts", CONTRACT_FILENAME),
    ...contractPathsNearModuleFile(),
  ];
}

let contractCache = null;
let contractPathInUse = null;
let contractLoadError = null;
let contractMissingLogged = false;
/** @type {Record<string, string[]>} */
let moduleRulesOverride = {};

function loadContractIfNeeded() {
  if (contractCache) return contractCache;

  const tried = [];
  for (const candidate of allContractCandidates()) {
    tried.push(candidate);
    if (!fs.existsSync(candidate)) continue;
    try {
      contractCache = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      contractPathInUse = candidate;
      contractLoadError = null;
      return contractCache;
    } catch (err) {
      contractLoadError = err instanceof Error ? err : new Error(String(err));
      console.error("[analytics-access] Failed to parse RBAC contract", {
        path: candidate,
        error: contractLoadError.message,
      });
      return null;
    }
  }

  if (!contractMissingLogged) {
    contractMissingLogged = true;
    contractLoadError = new Error(`RBAC contract not found (searched ${tried.length} paths)`);
    console.warn("[analytics-access] RBAC contract missing", { searchedPaths: tried });
  }
  return null;
}

export function isAnalyticsRbacAvailable() {
  return Boolean(loadContractIfNeeded());
}

export function analyticsRbacStatus() {
  loadContractIfNeeded();
  return {
    available: Boolean(contractCache),
    path: contractPathInUse,
    error: contractLoadError?.message ?? null,
  };
}

export function getAnalyticsRbacContract() {
  return loadContractIfNeeded();
}

export function getAnalyticsRbacModuleRulesOverride() {
  return { ...moduleRulesOverride };
}

/**
 * Load overrides from DB (call on boot and after admin edits).
 */
export async function refreshAnalyticsRbacOverridesFromDb() {
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, MODULE_RULES_OVERRIDE_KEY));
    const raw = row?.value?.trim();
    if (!raw) {
      moduleRulesOverride = {};
      return;
    }
    const parsed = JSON.parse(raw);
    moduleRulesOverride = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
  }
  catch (err) {
    moduleRulesOverride = {};
    console.warn("[analytics-access] Failed to load RBAC module overrides", err instanceof Error ? err.message : err);
  }
}

function baseAllowedRolesForModule(contract, moduleKey) {
  if (!contract) return [...FULL_ACCESS];
  const base = contract.modules?.[moduleKey]?.allowedRoles;
  if (!Array.isArray(base)) return [...FULL_ACCESS];
  return [...base];
}

export function allowedRolesForAnalyticsModule(moduleKey) {
  const contract = loadContractIfNeeded();
  const base = contract ? baseAllowedRolesForModule(contract, moduleKey) : [...FULL_ACCESS];
  const ov = moduleRulesOverride[moduleKey];
  if (Array.isArray(ov)) return [...ov];
  return base;
}

function setsEqualRoles(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((r) => sb.has(r));
}

/**
 * Toggle a role in the effective allow-list for an analytics module; persists to app_settings.
 */
export async function applyAnalyticsModuleRoleToggle(moduleKey, role, allow) {
  const contract = loadContractIfNeeded();
  if (!contract?.modules?.[moduleKey]) {
    const err = new Error("UNKNOWN_MODULE");
    err.code = "UNKNOWN_MODULE";
    throw err;
  }
  const base = baseAllowedRolesForModule(contract, moduleKey);
  const current = new Set(allowedRolesForAnalyticsModule(moduleKey));
  if (allow) current.add(role);
  else current.delete(role);
  const next = Array.from(current);
  const sameAsBase = setsEqualRoles(next, base);
  const newOverrides = { ...moduleRulesOverride };
  if (sameAsBase) delete newOverrides[moduleKey];
  else newOverrides[moduleKey] = next;

  const value = JSON.stringify(newOverrides);
  await db
    .insert(appSettingsTable)
    .values({ key: MODULE_RULES_OVERRIDE_KEY, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value },
    });
  moduleRulesOverride = newOverrides;
  return { moduleKey, allowedRoles: allowedRolesForAnalyticsModule(moduleKey) };
}

export function canAccessAnalyticsModule(role, moduleKey) {
  const contract = loadContractIfNeeded();
  if (!contract) return false;
  if (!role || !moduleKey) return false;
  if (FULL_ACCESS.includes(role)) return true;
  return allowedRolesForAnalyticsModule(moduleKey).includes(role);
}
