import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiServerRoot = path.resolve(__dirname, "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx <= 0) return null;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

for (const candidate of [
  path.join(apiServerRoot, ".env"),
  path.join(apiServerRoot, "..", ".env"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "..", ".env"),
  path.join(process.cwd(), "..", "..", ".env"),
]) {
  loadEnvFile(candidate, false);
}

function env(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasMinLen(value, minLen) {
  return typeof value === "string" && value.trim().length >= minLen;
}

const AUTH_SECRET_MIN_LEN = 16;
const jwtSecretInitial = env("JWT_SECRET");
const sessionSecretInitial = env("SESSION_SECRET");
if (!hasMinLen(jwtSecretInitial, AUTH_SECRET_MIN_LEN) && hasMinLen(sessionSecretInitial, AUTH_SECRET_MIN_LEN)) {
  process.env.JWT_SECRET = sessionSecretInitial;
}
if (!hasMinLen(sessionSecretInitial, AUTH_SECRET_MIN_LEN) && hasMinLen(jwtSecretInitial, AUTH_SECRET_MIN_LEN)) {
  process.env.SESSION_SECRET = jwtSecretInitial;
}
if (!env("SESSION_SECRET") && env("JWT_SECRET")) {
  process.env.SESSION_SECRET = env("JWT_SECRET");
}
if (!env("JWT_SECRET") && env("SESSION_SECRET")) {
  process.env.JWT_SECRET = env("SESSION_SECRET");
}

function parseBool(value) {
  return String(value ?? "").toLowerCase() === "true";
}

function parsePort(value, fallback = 3000) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid PORT value: "${value}"`);
  }
  return n;
}

function requireMinLen(name, minLen) {
  const value = env(name);
  if (!value || value.length < minLen) {
    throw new Error(`${name} must be at least ${minLen} characters`);
  }
  return value;
}

const nodeEnv = (() => {
  const value = env("NODE_ENV") || "development";
  if (!["development", "test", "production"].includes(value)) {
    throw new Error(`Invalid NODE_ENV value: "${value}"`);
  }
  return value;
})();

const raw = {
  NODE_ENV: nodeEnv,
  PORT: parsePort(env("PORT"), 3000),
  APP_URL: env("APP_URL"),
  FRONTEND_URL: env("FRONTEND_URL"),
  CORS_ORIGIN: env("CORS_ORIGIN"),

  DATABASE_URL: env("DATABASE_URL"),
  DATABASE_SSL_REJECT_UNAUTHORIZED: parseBool(env("DATABASE_SSL_REJECT_UNAUTHORIZED")),

  JWT_SECRET: requireMinLen("JWT_SECRET", 16),
  SESSION_SECRET: requireMinLen("SESSION_SECRET", 16),

  EMAIL_ENABLED: parseBool(env("EMAIL_ENABLED")),
  SMTP_USER: env("SMTP_USER"),
  SMTP_PASS: env("SMTP_PASS"),
  SMTP_HOST: env("SMTP_HOST"),
  SMTP_PORT: env("SMTP_PORT"),
  SMTP_FROM: env("SMTP_FROM"),
  EMAIL_VERIFY_SECRET: env("EMAIL_VERIFY_SECRET"),

  POWERBI_TENANT_ID: env("POWERBI_TENANT_ID"),
  POWERBI_CLIENT_ID: env("POWERBI_CLIENT_ID"),
  POWERBI_CLIENT_SECRET: env("POWERBI_CLIENT_SECRET"),
  POWERBI_WORKSPACE_ID: env("POWERBI_WORKSPACE_ID"),
  POWERBI_REPORT_SUPPLIER_LEDGER: env("POWERBI_REPORT_SUPPLIER_LEDGER"),
  POWERBI_REPORT_EXPENSE_INCOME: env("POWERBI_REPORT_EXPENSE_INCOME"),
  POWERBI_REPORT_PAYROLL_SUMMARY: env("POWERBI_REPORT_PAYROLL_SUMMARY"),
  POWERBI_REPORT_PROFIT_MARGIN: env("POWERBI_REPORT_PROFIT_MARGIN"),
};

if (!raw.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (raw.EMAIL_ENABLED) {
  const missing = ["SMTP_USER", "SMTP_PASS", "EMAIL_VERIFY_SECRET"].filter((key) => !env(key));
  if (missing.length) {
    throw new Error(`Missing required email env vars when EMAIL_ENABLED=true: ${missing.join(", ")}`);
  }
}

const isProd = raw.NODE_ENV === "production";
if (!isProd) {
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = String(env("DATABASE_SSL_REJECT_UNAUTHORIZED") === "true");
}

export const envConfig = Object.freeze({
  nodeEnv: raw.NODE_ENV,
  isProd,
  isDev: raw.NODE_ENV === "development",
  isTest: raw.NODE_ENV === "test",
  port: raw.PORT,

  appUrl: raw.APP_URL || "",
  frontendUrl: raw.FRONTEND_URL || raw.APP_URL || "",
  corsOrigin: raw.CORS_ORIGIN || raw.FRONTEND_URL || raw.APP_URL || "",

  db: {
    url: raw.DATABASE_URL,
    host: "",
    port: "5432",
    name: "",
    user: "",
    pass: "",
    sslRejectUnauthorized: raw.DATABASE_SSL_REJECT_UNAUTHORIZED,
    publicUrl: "",
    hostAddr: "",
  },

  auth: {
    jwtSecret: raw.JWT_SECRET,
    sessionSecret: raw.SESSION_SECRET,
  },

  email: {
    enabled: raw.EMAIL_ENABLED,
    user: raw.SMTP_USER || "",
    pass: raw.SMTP_PASS || "",
    host: raw.SMTP_HOST || "smtp.gmail.com",
    port: Number(raw.SMTP_PORT || 587),
    from: raw.SMTP_FROM || "",
    verifySecret: raw.EMAIL_VERIFY_SECRET || "",
  },

  powerbi: {
    tenantId: raw.POWERBI_TENANT_ID || "",
    clientId: raw.POWERBI_CLIENT_ID || "",
    clientSecret: raw.POWERBI_CLIENT_SECRET || "",
    workspaceId: raw.POWERBI_WORKSPACE_ID || "",
    reports: {
      supplierLedger: raw.POWERBI_REPORT_SUPPLIER_LEDGER || "",
      expenseIncome: raw.POWERBI_REPORT_EXPENSE_INCOME || "",
      payrollSummary: raw.POWERBI_REPORT_PAYROLL_SUMMARY || "",
      profitMargin: raw.POWERBI_REPORT_PROFIT_MARGIN || "",
    },
  },
});

export function validateRequiredEnv() {
  return envConfig;
}
