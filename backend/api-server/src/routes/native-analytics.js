import { Router } from "express";
import { z } from "zod";
import { eq, inArray, and, desc } from "drizzle-orm";
import { db, activityLogsTable, usersTable, customerOrdersTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { nativeAnalyticsHandlers } from "../lib/native-analytics";
import { logger } from "../lib/logger";
import { logActivity, createNotification } from "../lib/activityLogger";
import {
  canAccessAnalyticsModule,
  allowedRolesForAnalyticsModule,
  getAnalyticsRbacContract,
  isAnalyticsRbacAvailable,
  analyticsRbacStatus,
  getAnalyticsRbacModuleRulesOverride,
  applyAnalyticsModuleRoleToggle,
} from "../middlewares/analytics-access";

const router = Router();
const adminOnly = requireRole("admin");
const analyticsActionSchema = z.object({
  module: z.string().min(1),
  action: z.string().min(1),
});
const nativeDashboardQuerySchema = z.object({
  role: z.string().min(1).optional(),
  audit: z.string().optional(),
});
const ACTION_DEFS = {
  inventory: {
    "contact-supplier": { redirectTo: "/suppliers", roles: ["admin", "manager", "inventory_manager", "accountant"] },
    "reorder-now": { redirectTo: "/procurement", roles: ["admin", "manager", "inventory_manager", "accountant"] },
  },
  procurement: {
    "create-demand": { redirectTo: "/procurement", roles: ["admin", "manager", "inventory_manager", "accountant"] },
    "approve-quote": { redirectTo: "/price-approvals", roles: ["admin", "manager", "accountant", "sales_manager"] },
    "compare-rates": { redirectTo: "/quotes/rate-comparison", roles: ["admin", "manager", "inventory_manager", "accountant"] },
  },
  finance: {
    "generate-report": { redirectTo: "/accounting", roles: ["admin", "manager", "accountant"] },
    "approve-transaction": { redirectTo: "/accounting", roles: ["admin", "manager", "accountant"] },
  },
  accounting: {
    "generate-report": { redirectTo: "/accounting", roles: ["admin", "manager", "accountant"] },
    "approve-transaction": { redirectTo: "/accounting", roles: ["admin", "manager", "accountant"] },
  },
  production: {
    "assign-worker": { redirectTo: "/manufacturing", roles: ["admin", "manager", "inventory_manager"] },
    "log-qc-check": { redirectTo: "/cogm-reports", roles: ["admin", "manager", "inventory_manager", "employee", "accountant"] },
  },
  hr: {
    "adjust-payroll": { redirectTo: "/payroll", roles: ["admin", "manager", "accountant"] },
    "allocate-bonus-penalty": { redirectTo: "/payroll", roles: ["admin", "manager", "accountant"] },
  },
  payroll: {
    "adjust-payroll": { redirectTo: "/payroll", roles: ["admin", "manager", "accountant"] },
    "allocate-bonus-penalty": { redirectTo: "/payroll", roles: ["admin", "manager", "accountant"] },
  },
  supplier: {
    "create-demand": { redirectTo: "/procurement", roles: ["admin", "manager", "inventory_manager", "accountant"] },
    "compare-rates": { redirectTo: "/quotes", roles: ["admin", "manager", "inventory_manager", "accountant"] },
    "lock-price": { redirectTo: "/price-approvals", roles: ["admin", "manager", "accountant"] },
  },
  customer: {
    "track-product": { redirectTo: "/customer-portal?tab=orders", roles: ["admin", "manager", "customer", "sales_manager"] },
    "view-satisfaction-survey": { redirectTo: "/customer-portal?tab=orders&status=delivered", roles: ["admin", "manager", "sales_manager", "customer"] },
  },
  "customer-profile": {
    "track-product": { redirectTo: "/customer-portal?tab=orders", roles: ["admin", "manager", "customer", "sales_manager"] },
    "view-satisfaction-survey": { redirectTo: "/customer-portal?tab=orders&status=delivered", roles: ["admin", "manager", "sales_manager", "customer"] },
  },
  notifications: {
    "resolve-alert": { redirectTo: "/notifications", roles: ["admin", "manager"] },
    "view-audit-log": { redirectTo: "/activity", roles: ["admin", "manager"] },
  },
  admin: {
    "resolve-alert": { redirectTo: "/notifications", roles: ["admin"] },
    "view-audit-log": { redirectTo: "/activity", roles: ["admin"] },
  },
};

async function resolveCustomerActionResult(action, user, defaultRedirect) {
  if (action === "track-product" && user?.role === "customer") {
    const [latest] = await db
      .select()
      .from(customerOrdersTable)
      .where(and(eq(customerOrdersTable.customerId, user.id), inArray(customerOrdersTable.status, ["draft", "confirmed", "in_production", "quality_check", "shipped"])))
      .orderBy(desc(customerOrdersTable.createdAt))
      .limit(1);
    if (!latest) {
      return {
        redirectTo: "/customer-portal?tab=orders&status=active",
        message: "No active order found. Showing your orders list.",
      };
    }
    return {
      redirectTo: `/customer-portal?tab=orders&status=active&focusOrderId=${latest.id}`,
      message: `Tracking opened for ${latest.orderNumber}.`,
    };
  }
  if (action === "view-satisfaction-survey" && user?.role === "customer") {
    const [latestDelivered] = await db
      .select()
      .from(customerOrdersTable)
      .where(and(eq(customerOrdersTable.customerId, user.id), eq(customerOrdersTable.status, "delivered")))
      .orderBy(desc(customerOrdersTable.updatedAt))
      .limit(1);
    if (!latestDelivered) {
      return {
        redirectTo: "/customer-portal?tab=orders",
        message: "Survey opens after your first delivered order.",
      };
    }
    return {
      redirectTo: `/customer-portal?tab=orders&status=delivered&focusOrderId=${latestDelivered.id}`,
      message: `Survey context opened for ${latestDelivered.orderNumber}.`,
    };
  }
  return { redirectTo: defaultRedirect, message: "Quick action logged successfully." };
}

async function lastActionByModuleForRole(role) {
  const logs = await db
    .select({
      userId: activityLogsTable.userId,
      newData: activityLogsTable.newData,
      createdAt: activityLogsTable.createdAt,
    })
    .from(activityLogsTable)
    .where(eq(activityLogsTable.action, "ANALYTICS_ACTION"))
    .orderBy(activityLogsTable.createdAt);

  if (!logs.length) return {};

  const userIds = Array.from(new Set(logs.map((log) => log.userId).filter(Boolean)));
  if (!userIds.length) return {};

  const actors = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  const roleByUserId = new Map(actors.map((actor) => [actor.id, actor.role]));
  const timestamps = {};

  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const log = logs[i];
    const actorRole = roleByUserId.get(log.userId);
    if (actorRole !== role) continue;
    const moduleKey = log?.newData?.module;
    if (!moduleKey || timestamps[moduleKey]) continue;
    timestamps[moduleKey] = log?.newData?.executedAt || log?.createdAt?.toISOString?.() || null;
  }

  return timestamps;
}

router.get("/analytics/rbac-contract", authenticate, adminOnly, (_req, res) => {
  if (!isAnalyticsRbacAvailable()) {
    res.status(503).json({
      error: "RBAC_CONTRACT_UNAVAILABLE",
      details: analyticsRbacStatus().error,
    });
    return;
  }
  const contract = getAnalyticsRbacContract();
  const moduleKeys = Object.keys(contract.modules ?? {});
  const effectiveAllowedRolesByModule = Object.fromEntries(
    moduleKeys.map((mk) => [mk, allowedRolesForAnalyticsModule(mk)]),
  );
  res.json({
    version: contract.version,
    roles: contract.roles,
    modules: contract.modules,
    moduleRulesOverride: getAnalyticsRbacModuleRulesOverride(),
    effectiveAllowedRolesByModule,
  });
});

const patchModuleAccessSchema = z.object({
  moduleKey: z.string().min(1),
  role: z.string().min(1),
  allow: z.boolean(),
});

router.patch("/analytics/admin/module-access", authenticate, adminOnly, async (req, res) => {
  if (!isAnalyticsRbacAvailable()) {
    res.status(503).json({
      error: "RBAC_CONTRACT_UNAVAILABLE",
      details: analyticsRbacStatus().error,
    });
    return;
  }
  const parsed = patchModuleAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    return;
  }
  try {
    const { moduleKey, role, allow } = parsed.data;
    const mod = moduleKey.toLowerCase();
    const result = await applyAnalyticsModuleRoleToggle(mod, role, allow);
    await logActivity({
      userId: req.user?.id,
      action: "UPDATE",
      module: "settings",
      description: `Analytics RBAC module access: ${mod} role ${role} → ${allow ? "allow" : "deny"}`,
      newData: { moduleKey: mod, role, allow, allowedRoles: result.allowedRoles },
    });
    res.json({ ok: true, ...result, moduleRulesOverride: getAnalyticsRbacModuleRulesOverride() });
  }
  catch (err) {
    if (err?.code === "UNKNOWN_MODULE") {
      res.status(400).json({ error: "UNKNOWN_MODULE", message: err.message });
      return;
    }
    logger.error({ err: err?.message }, "analytics_module_access_patch_failed");
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

router.get("/analytics/native/:module", authenticate, async (req, res) => {
  if (!isAnalyticsRbacAvailable()) {
    res.status(503).json({
      error: "RBAC_CONTRACT_UNAVAILABLE",
      details: analyticsRbacStatus().error,
    });
    return;
  }

  const parsed = z.object({ module: z.string().min(1) }).safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid module" });
    return;
  }

  const mod = parsed.data.module;
  const handler = nativeAnalyticsHandlers[mod];
  if (!handler) {
    res.status(404).json({
      error: "Route not found",
      message: "Unknown analytics module.",
      supported: Object.keys(nativeAnalyticsHandlers),
    });
    return;
  }
  if (!canAccessAnalyticsModule(req.user?.role, mod)) {
    res.status(403).json({
      error: "INSUFFICIENT_PERMISSIONS",
      module: mod,
      allowedRoles: allowedRolesForAnalyticsModule(mod),
    });
    return;
  }

  try {
    const payload = await handler({ user: req.user });
    res.json({ ...payload, updatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err: err?.message, module: mod }, "native_analytics_controller_failed");
    res.status(500).json({ error: "ANALYTICS_ERROR" });
  }
});

router.get("/analytics/native-dashboard", authenticate, async (req, res) => {
  if (!isAnalyticsRbacAvailable()) {
    res.status(503).json({
      error: "RBAC_CONTRACT_UNAVAILABLE",
      details: analyticsRbacStatus().error,
    });
    return;
  }

  const parsedQuery = nativeDashboardQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    res.status(400).json({ error: "INVALID_QUERY" });
    return;
  }

  const requestedRole = parsedQuery.data.role;
  if (requestedRole && req.user?.role !== "admin") {
    res.status(403).json({ error: "INSUFFICIENT_PERMISSIONS" });
    return;
  }

  const effectiveRole = requestedRole || req.user?.role;
  const modules = Object.keys(nativeAnalyticsHandlers).filter((moduleKey) =>
    canAccessAnalyticsModule(effectiveRole, moduleKey),
  );
  const syntheticUser = requestedRole ? { ...req.user, role: requestedRole } : req.user;
  const moduleLastAction = await lastActionByModuleForRole(effectiveRole);

  const dashboard = [];
  for (const moduleKey of modules) {
    try {
      const definition = await nativeAnalyticsHandlers[moduleKey]({ user: syntheticUser });
      dashboard.push({
        role: effectiveRole,
        dashboard: moduleKey,
        access: true,
        lastActionTimestamp: moduleLastAction[moduleKey] ?? null,
        definition,
      });
    } catch (err) {
      logger.error({ err: err?.message, module: moduleKey }, "native_analytics_dashboard_module_failed");
      dashboard.push({
        role: effectiveRole,
        dashboard: moduleKey,
        access: true,
        lastActionTimestamp: moduleLastAction[moduleKey] ?? null,
        definition: { error: "ANALYTICS_ERROR", module: moduleKey },
      });
    }
  }

  if (parsedQuery.data.audit === "matrix") {
    await logActivity({
      userId: req.user?.id,
      action: "ANALYTICS_MATRIX_VIEWED",
      module: "notifications",
      description: `Analytics matrix viewed by ${req.user?.role} for role ${effectiveRole}`,
      newData: { requestedRole: effectiveRole, viewedAt: new Date().toISOString() },
    });
  }

  res.json({
    role: effectiveRole,
    modules,
    dashboard,
    access: dashboard.map((row) => ({
      role: row.role,
      dashboard: row.dashboard,
      access: row.access,
      lastActionTimestamp: row.lastActionTimestamp,
    })),
    updatedAt: new Date().toISOString(),
  });
});

router.get("/analytics/insights", authenticate, async (req, res) => {
  const role = req.user?.role || "employee";
  const accessible = Object.entries(nativeAnalyticsHandlers).filter(([moduleKey]) =>
    canAccessAnalyticsModule(role, moduleKey),
  );
  const insights = [];
  for (const [moduleKey, handler] of accessible) {
    try {
      const payload = await handler({ user: req.user });
      for (const kpi of payload?.kpis || []) {
        const label = String(kpi?.label || "").toLowerCase();
        const value = Number(kpi?.value || 0);
        if (label.includes("low stock") && value > 0) {
          insights.push(`Inventory low for ${value} items`);
        } else if (label.includes("approval queue") && value > 0) {
          insights.push(`Pending approvals in procurement: ${value}`);
        } else if (label.includes("customer orders") && value > 0) {
          insights.push(`Sales pipeline active with ${value} customer orders`);
        }
      }
    } catch (err) {
      logger.warn({ moduleKey, err: err?.message }, "insights_generation_module_failed");
    }
  }
  const unique = Array.from(new Set(insights)).slice(0, 10);
  if (unique.length === 0) {
    unique.push("Operations stable. No critical KPI anomalies detected.");
  }
  res.json({
    success: true,
    data: { insights: unique },
    message: "Insights generated",
    insights: unique,
  });
});

async function handleAnalyticsAction(req, res) {
  const executedAt = new Date().toISOString();
  if (!isAnalyticsRbacAvailable()) {
    res.status(503).json({
      error: "RBAC_CONTRACT_UNAVAILABLE",
      details: analyticsRbacStatus().error,
      status: "error",
      executedAt,
    });
    return;
  }
  const parsed = analyticsActionSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_ACTION_REQUEST", status: "error", executedAt });
    return;
  }
  const { module: moduleKey, action } = parsed.data;
  if (!canAccessAnalyticsModule(req.user?.role, moduleKey)) {
    res.status(403).json({
      error: "INSUFFICIENT_PERMISSIONS",
      module: moduleKey,
      allowedRoles: allowedRolesForAnalyticsModule(moduleKey),
      status: "error",
      executedAt,
    });
    return;
  }
  const actionDef = ACTION_DEFS[moduleKey]?.[action];
  if (!actionDef) {
    res.status(404).json({ error: "UNKNOWN_ACTION", module: moduleKey, action, status: "error", executedAt });
    return;
  }
  if (actionDef.roles && !actionDef.roles.includes(req.user?.role)) {
    res.status(403).json({ error: "INSUFFICIENT_PERMISSIONS", module: moduleKey, action, status: "error", executedAt });
    return;
  }

  try {
    let redirectTo = actionDef.redirectTo;
    let resultMessage = "Quick action logged successfully.";
    if (moduleKey === "customer" || moduleKey === "customer-profile") {
      const customerResult = await resolveCustomerActionResult(action, req.user, actionDef.redirectTo);
      redirectTo = customerResult.redirectTo;
      resultMessage = customerResult.message;
    }
    await logActivity({
      userId: req.user?.id,
      action: "ANALYTICS_ACTION",
      module: "notifications",
      description: `Analytics quick action '${action}' triggered from ${moduleKey}`,
      newData: { module: moduleKey, action, redirectTo, executedAt },
    });
    await createNotification({
      userId: req.user?.id,
      title: `Action completed: ${action.replace(/-/g, " ")}`,
      message: resultMessage,
      type: "info",
      link: redirectTo,
    });
    res.json({
      ok: true,
      status: "success",
      module: moduleKey,
      action,
      redirectTo,
      executedAt,
      message: resultMessage,
    });
  } catch (err) {
    logger.error({ err: err?.message, module: moduleKey, action }, "native_analytics_action_failed");
    res.status(500).json({ error: "ANALYTICS_ACTION_ERROR", status: "error", executedAt });
  }
}

router.post("/analytics/native/:module/actions/:action", authenticate, handleAnalyticsAction);

router.post("/analytics/:module/actions/:action", authenticate, async (req, res) => {
  req.params.module = String(req.params.module || "").toLowerCase();
  return handleAnalyticsAction(req, res);
});

export default router;
