import fs from "node:fs";
import path from "node:path";
const candidates = [
  path.join(process.cwd(), "contracts/analytics-rbac.v1.json"),
  path.join(process.cwd(), "../contracts/analytics-rbac.v1.json"),
  path.join(process.cwd(), "../../contracts/analytics-rbac.v1.json"),
];

let foundPath = null;
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    foundPath = candidate;
    break;
  }
}

if (!foundPath) {
  console.error("[rbac-gate] Missing analytics-rbac.v1.json");
  console.error("[rbac-gate] Searched:", candidates.join(" | "));
  process.exit(1);
}

try {
  const raw = fs.readFileSync(foundPath, "utf-8");
  const json = JSON.parse(raw);
  if (!json?.version || !json?.roles || !json?.modules) {
    console.error("[rbac-gate] Invalid RBAC contract shape at", foundPath);
    process.exit(1);
  }
  console.log("[rbac-gate] Contract OK:", foundPath);
} catch (err) {
  console.error("[rbac-gate] Failed to read/parse RBAC contract:", err?.message ?? err);
  process.exit(1);
}
