import { envConfig } from "../../config/env.js";

export function validateEnvMiddleware(_req, _res, next) {
  // Config is validated at startup; this middleware ensures a single import path
  // and provides a stable place for future per-request feature-flag checks.
  if (!envConfig?.db?.url || !envConfig?.auth?.jwtSecret) {
    const err = new Error("Server configuration is invalid.");
    err.status = 500;
    next(err);
    return;
  }
  next();
}
