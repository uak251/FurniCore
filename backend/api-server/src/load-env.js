try {
  const mod = await import("../config/env.js");
  mod.validateRequiredEnv?.();
} catch (err) {
  // Keep process alive in degraded mode; healthcheck must still be reachable.
  console.error("[env] validation failed, continuing in degraded mode:", err?.message || err);
}
