const rawBaseUrl = process.env.VITE_API_URL?.trim() || "http://localhost:3000/api";
const email = process.env.LOGIN_TEST_EMAIL?.trim() || "admin@furnicore.com";
const password = process.env.LOGIN_TEST_PASSWORD?.trim() || "Admin@123456";

function normalizeApiBase(url) {
  const clean = url.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

const apiBase = normalizeApiBase(rawBaseUrl);

const moduleCases = [
  {
    key: "inventory",
    headers: ["name", "type", "unit", "quantity", "reorderLevel", "unitCost"],
    row: ["CSV Item", "raw", "pcs", "25", "5", "12.50"],
  },
  {
    key: "procurement",
    headers: ["supplierId", "quantity", "unitPrice", "totalPrice", "status"],
    row: ["1", "5", "99.25", "496.25", "PENDING"],
  },
  {
    key: "production",
    headers: ["title", "status"],
    row: ["CSV Task", "pending"],
  },
  {
    key: "hr",
    headers: ["name", "baseSalary", "hireDate"],
    row: ["CSV Worker", "1200", "2026-01-01"],
  },
  {
    key: "supplier",
    headers: ["name"],
    row: ["CSV Supplier"],
  },
  {
    key: "customer",
    headers: ["status"],
    row: ["pending"],
  },
  {
    key: "accounting",
    headers: ["type", "description", "amount", "transactionDate"],
    row: ["income", "CSV Income", "88.55", "2026-04-01T00:00:00.000Z"],
  },
  {
    key: "notifications",
    headers: ["title", "message"],
    row: ["CSV Notice", "notification from integration test"],
  },
];

function makeCsv(headers, row) {
  return `${headers.join(",")}\n${row.join(",")}\n`;
}

async function login() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.accessToken !== "string") {
    throw new Error(`Login failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.accessToken;
}

async function importCsv(moduleKey, csvContent, token) {
  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), `${moduleKey}.csv`);

  const response = await fetch(`${apiBase}/${moduleKey}/import-csv`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Import failed (${moduleKey}) status=${response.status} payload=${JSON.stringify(payload)}`);
  }
  if (!payload?.ok || typeof payload?.imported !== "number" || payload.imported < 1) {
    throw new Error(`Import validation failed (${moduleKey}) payload=${JSON.stringify(payload)}`);
  }
}

function parseCsvHeader(text) {
  const firstLine = String(text ?? "").split(/\r?\n/)[0] ?? "";
  return firstLine.split(",").map((s) => s.trim()).filter(Boolean);
}

async function exportCsv(moduleKey, expectedHeaders, token) {
  const response = await fetch(`${apiBase}/${moduleKey}/export-csv`, {
    headers: { authorization: `Bearer ${token}` },
  });

  const csvText = await response.text();
  if (!response.ok) {
    throw new Error(`Export failed (${moduleKey}) status=${response.status} body=${csvText.slice(0, 300)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/csv")) {
    throw new Error(`Export content-type invalid (${moduleKey}): ${contentType}`);
  }

  const headers = parseCsvHeader(csvText);
  for (const required of expectedHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing export header "${required}" for module ${moduleKey}`);
    }
  }
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(`Export has no data rows for module ${moduleKey}`);
  }
}

async function downloadTemplate(moduleKey, expectedHeaders, token) {
  const response = await fetch(`${apiBase}/${moduleKey}/csv-template`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const csvText = await response.text();
  if (!response.ok) {
    throw new Error(`Template failed (${moduleKey}) status=${response.status} body=${csvText.slice(0, 300)}`);
  }
  const headers = parseCsvHeader(csvText);
  for (const required of expectedHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing template header "${required}" for module ${moduleKey}`);
    }
  }
}

async function verifyAnalytics(moduleKey, token) {
  const response = await fetch(`${apiBase}/analytics/native/${moduleKey}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Analytics failed (${moduleKey}) status=${response.status} payload=${JSON.stringify(payload)}`);
  }
  if (payload?.module !== moduleKey || !Array.isArray(payload?.charts)) {
    throw new Error(`Analytics schema invalid for ${moduleKey}: ${JSON.stringify(payload)}`);
  }
}

async function verifySurface(token) {
  const health = await fetch(`${apiBase}/healthz`);
  const healthPayload = await health.json().catch(() => ({}));
  if (!health.ok || healthPayload?.status !== "ok") {
    throw new Error(`Health check failed status=${health.status} payload=${JSON.stringify(healthPayload)}`);
  }

  const summary = await fetch(`${apiBase}/dashboard/summary`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const summaryPayload = await summary.json().catch(() => ({}));
  if (!summary.ok || typeof summaryPayload?.totalProducts !== "number") {
    throw new Error(`Dashboard summary failed status=${summary.status} payload=${JSON.stringify(summaryPayload)}`);
  }
}

async function run() {
  console.log(`[analytics-csv-integration] api=${apiBase}`);
  const token = await login();
  await verifySurface(token);

  for (const testCase of moduleCases) {
    const { key, headers, row } = testCase;
    const csv = makeCsv(headers, row);
    console.log(`[analytics-csv-integration] analytics ${key}`);
    await verifyAnalytics(key, token);
    console.log(`[analytics-csv-integration] import ${key}`);
    await importCsv(key, csv, token);
    console.log(`[analytics-csv-integration] export ${key}`);
    await exportCsv(key, headers, token);
    console.log(`[analytics-csv-integration] template ${key}`);
    await downloadTemplate(key, headers, token);
  }

  console.log("[analytics-csv-integration] PASS: all module CRUD-lite + analytics + CSV checks succeeded.");
}

run().catch((err) => {
  console.error("[analytics-csv-integration] FAIL:", err?.message || String(err));
  process.exit(1);
});
