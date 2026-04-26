const rawApi = process.env.RAILWAY_API_URL?.trim() || "";
const email = process.env.RAILWAY_ADMIN_EMAIL?.trim() || "";
const password = process.env.RAILWAY_ADMIN_PASSWORD?.trim() || "";

if (!rawApi || !email || !password) {
  console.error(
    "[railway-login-smoke] Missing required env vars: RAILWAY_API_URL, RAILWAY_ADMIN_EMAIL, RAILWAY_ADMIN_PASSWORD",
  );
  process.exit(1);
}

const apiBase = rawApi.replace(/\/+$/, "").endsWith("/api")
  ? rawApi.replace(/\/+$/, "")
  : `${rawApi.replace(/\/+$/, "")}/api`;

const endpoint = `${apiBase}/auth/login`;

async function run() {
  console.log(`[railway-login-smoke] POST ${endpoint}`);

  const response = await fetch(endpoint, {
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

  if (response.status >= 500) {
    console.error("[railway-login-smoke] FAIL: backend returned 5xx", {
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  if (!response.ok) {
    console.error("[railway-login-smoke] FAIL: non-success login status", {
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  if (typeof payload?.accessToken !== "string" || payload.accessToken.length < 20) {
    console.error("[railway-login-smoke] FAIL: missing JWT accessToken", { payload });
    process.exit(1);
  }

  console.log("[railway-login-smoke] PASS: login returned JWT.");
}

run().catch((err) => {
  console.error("[railway-login-smoke] FAIL: unexpected error", err?.message || String(err));
  process.exit(1);
});
