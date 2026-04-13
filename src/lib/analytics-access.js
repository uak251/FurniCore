import contract from "../../../../contracts/analytics-rbac.v1.json";

const FULL_ACCESS = ["admin"];

export function canAccessAnalyticsModule(role, moduleKey) {
  if (!role || !moduleKey) return false;
  if (FULL_ACCESS.includes(role)) return true;
  return (contract.modules?.[moduleKey]?.allowedRoles ?? FULL_ACCESS).includes(role);
}

export function allowedRolesForAnalyticsModule(moduleKey) {
  return contract.modules?.[moduleKey]?.allowedRoles ?? FULL_ACCESS;
}

export function analyticsContractVersion() {
  return contract.version ?? "unknown";
}
