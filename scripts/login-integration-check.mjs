const rawBaseUrl = process.env.VITE_API_URL?.trim() || "http://localhost:3000/api";
const email = process.env.LOGIN_TEST_EMAIL?.trim() || "admin@furnicore.com";
const password = process.env.LOGIN_TEST_PASSWORD?.trim() || "Admin@123456";

function normalizeApiBase(url) {
  const clean = url.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

const apiBase = normalizeApiBase(rawBaseUrl);
const endpoint = `${apiBase}/auth/login`;

async function run() {
  console.log(`[login-integration] testing ${endpoint}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // keep payload empty for non-JSON failures
  }

  if (!response.ok) {
    console.error("[login-integration] login failed", {
      status: response.status,
      payload,
    });
    process.exit(1);
  }

  if (typeof payload?.accessToken !== "string" || payload.accessToken.length < 20) {
    console.error("[login-integration] missing access token", { payload });
    process.exit(1);
  }

  console.log("[login-integration] success: JWT token received.");
}

run().catch((err) => {
  console.error("[login-integration] unexpected error", err?.message || String(err));
  process.exit(1);
});
