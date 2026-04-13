const FULL_ACCESS = ["admin"];

const MODULE_ROLE_MAP = {
  inventory: [...FULL_ACCESS, "inventory_manager", "manager"],
  finance: [...FULL_ACCESS, "accountant", "manager"],
  hr: [...FULL_ACCESS, "manager"],
  "customer-profile": [...FULL_ACCESS, "manager", "sales_manager", "customer"],
  supplier: [...FULL_ACCESS, "inventory_manager", "accountant", "manager"],
  production: [...FULL_ACCESS, "manager", "inventory_manager", "employee"],
  notifications: [...FULL_ACCESS, "manager", "accountant", "inventory_manager", "sales_manager", "employee", "supplier", "worker", "customer"],
  settings: [...FULL_ACCESS, "manager"],
};

export function canAccessAnalyticsModule(role, moduleKey) {
  if (!role || !moduleKey) return false;
  if (FULL_ACCESS.includes(role)) return true;
  return (MODULE_ROLE_MAP[moduleKey] ?? FULL_ACCESS).includes(role);
}

export function allowedRolesForAnalyticsModule(moduleKey) {
  return MODULE_ROLE_MAP[moduleKey] ?? FULL_ACCESS;
}
