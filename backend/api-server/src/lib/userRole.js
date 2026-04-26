/**
 * Canonical ERP role string for JWT + `req.user` (must match RBAC + DB `users.role`).
 */
import { getAnalyticsRbacContract } from "../middlewares/analytics-access.js";

export function resolveRoleForToken(rawRole) {
    const role = String(rawRole ?? "").trim();
    if (!role)
        return "employee";
    const contract = getAnalyticsRbacContract();
    if (contract?.roles && role in contract.roles)
        return role;
    const fallbackAllowed = [
        "admin",
        "manager",
        "accountant",
        "sales_manager",
        "inventory_manager",
        "worker",
        "employee",
        "customer",
        "supplier",
    ];
    return fallbackAllowed.includes(role) ? role : "employee";
}
