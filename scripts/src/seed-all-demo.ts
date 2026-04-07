/**
 * Master demo seed — runs ALL seed scripts in dependency order.
 *
 * Run this once to fully populate a fresh FurniCore database with demo data.
 * Each individual script is still idempotent, so re-running is safe.
 *
 * Execution order (hard dependency chain):
 *   1. seed-admin            — bootstrap admin@furnicore.com
 *   2. seed-demo-users       — 9 portal role accounts (admin, manager, accountant …)
 *   3. seed-demo-catalog     — inventory raw materials + finished products
 *   4. seed-demo-suppliers   — 9 suppliers + quotes (incl. diego.alvarez portal user)
 *   5. seed-demo-hr-payroll  — employees + Jan–Apr 2026 payroll (needs users)
 *   6. seed-demo-manufacturing — manufacturing tasks + production orders + QC remarks
 *   7. seed-demo-accounting  — posted journal entries + cash transactions
 *                              ⚠ Requires chart of accounts to exist.
 *                              POST /accounts/seed as admin BEFORE running this script,
 *                              or pass --skip-accounting to skip this step.
 *   8. seed-demo-customers   — customer accounts, orders, invoices, payments
 *   9. seed-demo-activity    — activity logs + notifications
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-all-demo
 *   pnpm --filter @workspace/scripts seed-all-demo -- --skip-accounting
 *
 * DATABASE_URL: ../.env
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, "..");
const envFile   = join(root, "../.env");

const SKIP_ACCOUNTING = process.argv.includes("--skip-accounting");

const ALL_SCRIPTS = [
  { name: "seed-admin",             file: "seed-admin.ts",             required: true  },
  { name: "seed-demo-users",        file: "seed-demo-users.ts",        required: true  },
  { name: "seed-demo-catalog",      file: "seed-demo-catalog.ts",      required: true  },
  { name: "seed-demo-suppliers",    file: "seed-demo-suppliers.ts",    required: true  },
  { name: "seed-demo-hr-payroll",   file: "seed-demo-hr-payroll.ts",   required: true  },
  { name: "seed-demo-manufacturing",file: "seed-demo-manufacturing.ts",required: true  },
  { name: "seed-demo-accounting",   file: "seed-demo-accounting.ts",   required: !SKIP_ACCOUNTING },
  { name: "seed-demo-customers",    file: "seed-demo-customers.ts",    required: true  },
  { name: "seed-demo-activity",     file: "seed-demo-activity.ts",     required: true  },
];

const scripts = ALL_SCRIPTS.filter((s) => s.required);

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";

const pad = (s: string, n: number) => s.padEnd(n);

console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${CYAN}║   FurniCore — Master Demo Seed            ║${RESET}`);
console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n`);
console.log(`  Scripts to run : ${scripts.length}`);
if (SKIP_ACCOUNTING) {
  console.log(`  ${YELLOW}--skip-accounting flag set — skipping seed-demo-accounting${RESET}`);
  console.log(`  ${YELLOW}Remember: POST /accounts/seed then run seed-demo-accounting separately.${RESET}`);
}
console.log();

const results: { name: string; status: "ok" | "skipped" | "error"; ms: number }[] = [];

for (const script of scripts) {
  const label = pad(script.name, 30);
  process.stdout.write(`  ${label} … `);
  const t0 = Date.now();
  try {
    execFileSync(
      process.execPath,                           // node binary
      ["--import", "tsx/esm", `--env-file=${envFile}`, join(__dirname, script.file)],
      { stdio: "inherit", cwd: root },
    );
    const ms = Date.now() - t0;
    console.log(`${GREEN}✓ done${RESET} (${ms}ms)`);
    results.push({ name: script.name, status: "ok", ms });
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(`${RED}✗ FAILED${RESET} (${ms}ms)`);
    results.push({ name: script.name, status: "error", ms });
    console.error(`\n  ${RED}Error in ${script.name}:${RESET}`, (err as Error).message ?? err);
    console.error(`\n  ${YELLOW}Aborting — fix the error above and re-run.${RESET}\n`);
    process.exit(1);
  }
}

const totalMs = results.reduce((s, r) => s + r.ms, 0);
const ok      = results.filter((r) => r.status === "ok").length;

console.log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${GREEN}║   All ${ok}/${scripts.length} scripts completed successfully  ║${RESET}`);
console.log(`${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}`);
console.log(`\n  Total time: ${(totalMs / 1000).toFixed(1)}s\n`);

console.log(`  ${BOLD}Demo accounts (password: Demo@123456)${RESET}`);
console.log("  ┌──────────────────────────────────────────────────────┬──────────────────────┐");
console.log("  │ Email                                                │ Role                 │");
console.log("  ├──────────────────────────────────────────────────────┼──────────────────────┤");
const users = [
  ["admin@furnicore.com",               "admin (bootstrap)"],
  ["victoria.chen@furnicore.demo",       "admin"],
  ["marcus.webb@furnicore.demo",         "manager"],
  ["nina.okonkwo@furnicore.demo",        "inventory_manager"],
  ["amira.hassan@furnicore.demo",        "accountant"],
  ["priya.nair@furnicore.demo",          "sales_manager"],
  ["jordan.ellis@furnicore.demo",        "manager (inactive)"],
  ["sam.rivera@furnicore.demo",          "worker"],
  ["diego.alvarez@furnicore.demo",       "supplier"],
  ["chloe.park@furnicore.demo",          "customer"],
  ["alice.chen@furnicore.demo",          "customer"],
  ["bob.martinez@furnicore.demo",        "customer"],
  ["carol.smith@furnicore.demo",         "customer"],
  ["david.johnson@furnicore.demo",       "customer"],
  ["emma.wilson@furnicore.demo",         "customer"],
];
for (const [email, role] of users) {
  console.log(`  │ ${email.padEnd(52)} │ ${role.padEnd(20)} │`);
}
console.log("  └──────────────────────────────────────────────────────┴──────────────────────┘");
console.log(`\n  ${YELLOW}⚠ admin@furnicore.com password is Admin@123456 — change after first login.${RESET}\n`);
