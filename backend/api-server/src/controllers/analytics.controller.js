import { logger } from "../lib/logger";
import {
  canAccessAnalyticsModule,
  allowedRolesForAnalyticsModule,
} from "../middlewares/analytics-access";
import {
  fetchNativeAnalyticsForModule,
  listSupportedAnalyticsModules,
} from "../services/analytics.service";

function normalizeRoleScopeModule(moduleKey) {
  // Keep RBAC checks aligned with handler aliases.
  if (moduleKey === "sales") return "customer";
  return moduleKey;
}

export function analyticsTestHandler(_req, res) {
  console.log("[analytics] test route hit");
  res.json({
    success: true,
    data: { status: "ok" },
    message: "analytics working",
  });
}

export async function nativeAnalyticsByModuleHandler(req, res) {
  const requestedModule = String(req.params.module || "").trim().toLowerCase();
  console.log("[analytics] native route hit", { module: requestedModule });

  if (!requestedModule) {
    res.status(400).json({
      success: false,
      data: {},
      message: "Module is required",
    });
    return;
  }

  const roleCheckModule = normalizeRoleScopeModule(requestedModule);
  if (!canAccessAnalyticsModule(req.user?.role, roleCheckModule)) {
    res.status(403).json({
      error: "INSUFFICIENT_PERMISSIONS",
      success: false,
      data: {},
      message: "Insufficient permissions",
      allowedRoles: allowedRolesForAnalyticsModule(roleCheckModule),
    });
    return;
  }

  try {
    const result = await fetchNativeAnalyticsForModule(requestedModule, { user: req.user });
    if (!result.ok) {
      res.status(404).json({
        error: "Route not found",
        success: false,
        data: {},
        message: "Invalid analytics module",
        supported: listSupportedAnalyticsModules(),
        supportedModules: listSupportedAnalyticsModules(),
      });
      return;
    }

    // Include payload at the top-level for backward compatibility with existing UI.
    res.json({
      success: true,
      data: result.payload,
      message: "Analytics fetched",
      ...result.payload,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err: err?.message, module: requestedModule }, "analytics_controller_failed");
    res.status(500).json({ error: "ANALYTICS_ERROR" });
  }
}
