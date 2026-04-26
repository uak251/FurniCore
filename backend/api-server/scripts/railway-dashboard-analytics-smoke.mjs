const rawApi = process.env.RAILWAY_API_URL?.trim() || "";
const email = process.env.RAILWAY_ADMIN_EMAIL?.trim() || "";
const password = process.env.RAILWAY_ADMIN_PASSWORD?.trim() || "";

if (!rawApi || !email || !password) {
  console.error(
    "[railway-dashboard-analytics-smoke] Missing required env vars: RAILWAY_API_URL, RAILWAY_ADMIN_EMAIL, RAILWAY_ADMIN_PASSWORD",
  );
  process.exit(1);
}

const apiBase = rawApi.replace(/\/+$/, "").endsWith("/api")
  ? rawApi.replace(/\/+$/, "")
  : `${rawApi.replace(/\/+$/, "")}/api`;

async function loginAndGetToken() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || typeof payload?.accessToken !== "string") {
    console.error("[railway-dashboard-analytics-smoke] Login failed", {
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  return payload.accessToken;
}

async function verifyEndpoint(path, token, validator) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${apiBase}${path}`, { headers });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (response.status >= 500) {
    console.error("[railway-dashboard-analytics-smoke] Endpoint returned 5xx", {
      path,
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  if (!response.ok || response.status === 401 || response.status === 404) {
    console.error("[railway-dashboard-analytics-smoke] Endpoint returned non-success", {
      path,
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  const valid = validator(payload);
  if (!valid) {
    console.error("[railway-dashboard-analytics-smoke] Endpoint payload validation failed", {
      path,
      payload,
    });
    process.exit(1);
  }
}

async function run() {
  const token = await loginAndGetToken();

  await verifyEndpoint("/healthz/db", null, (payload) => {
    return payload && (payload.status === "ok" || payload.status === "degraded");
  });

  await verifyEndpoint("/dashboard-themes/catalog", token, (payload) => {
    return payload && Array.isArray(payload.themes);
  });

  const analyticsModules = [
    "inventory",
    "procurement",
    "production",
    "hr",
    "supplier",
    "customer",
    "accounting",
    "notifications",
  ];

  for (const moduleKey of analyticsModules) {
    await verifyEndpoint(`/analytics/native/${moduleKey}`, token, (payload) => {
      return payload && payload.module === moduleKey && Array.isArray(payload.charts);
    });
  }

  await verifyEndpoint("/dashboard/summary", token, (payload) => {
    return payload && typeof payload.totalProducts === "number" && "monthlyRevenue" in payload;
  });

  console.log("[railway-dashboard-analytics-smoke] PASS: analytics modules + dashboard endpoints healthy.");
}

run().catch((err) => {
  console.error("[railway-dashboard-analytics-smoke] FAIL: unexpected error", err?.message || String(err));
  process.exit(1);
});
