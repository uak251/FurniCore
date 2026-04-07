/**
 * Seed demo activity logs and notifications for FurniCore.
 *
 * Covers:
 *   - CRUD actions  (inventory, products, suppliers, users, accounts, hr)
 *   - Approvals     (quotes: LOCK/APPROVE/PAY, payroll: GENERATE/APPROVE)
 *   - Low-stock     (inventory UPDATE logs + warning notifications)
 *   - Supplier updates (supplier edits, new quotes, delivery lifecycle)
 *   - Accounting / journal / accruals / payroll audit trail
 *   - Customer notifications (order progress, payments, invoices)
 *
 * Idempotency:
 *   Activity logs   — deleted WHERE description LIKE '[demo-seed:activity]%', then re-inserted.
 *   Notifications   — deleted WHERE message    LIKE '[demo-seed:notify]%',   then re-inserted.
 *
 * Prerequisite: seed-demo-users (and optionally seed-demo-customers) should run first.
 *   If a userEmail is not found in the DB the log/notification is still inserted with userId = null
 *   (activity logs) or skipped with a warning (notifications, which require userId NOT NULL).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-activity
 *
 * Data: scripts/data/demo-activity-notifications.json
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { like, inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  activityLogsTable,
  notificationsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Types matching demo-activity-notifications.json ─────────────────────── */

interface ActivityLogRow {
  userEmail: string | null;
  action: string;
  module: string;
  description: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

interface NotificationRow {
  userEmail: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
}

interface DemoActivityFile {
  activityLogs: ActivityLogRow[];
  notifications: NotificationRow[];
}

/* ── Load data ─────────────────────────────────────────────────────────────── */

const data: DemoActivityFile = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-activity-notifications.json"), "utf-8"),
) as DemoActivityFile;

console.log("\nFurniCore — Seed demo activity logs & notifications");
console.log(`  Activity logs:  ${data.activityLogs.length}`);
console.log(`  Notifications:  ${data.notifications.length}\n`);

/* ── Resolve user emails → IDs ─────────────────────────────────────────────── */

const allEmails = [
  ...new Set([
    ...data.activityLogs.map((l) => l.userEmail).filter(Boolean) as string[],
    ...data.notifications.map((n) => n.userEmail),
  ]),
];

const userRows = allEmails.length
  ? await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, allEmails))
  : [];

const emailToId = new Map(userRows.map((r) => [r.email, r.id]));

const missing = allEmails.filter((e) => !emailToId.has(e));
if (missing.length > 0) {
  console.log(
    `  [warn] ${missing.length} email(s) not found in users table — activity logs will use userId=null, notifications will be skipped:\n` +
    missing.map((e) => `         ${e}`).join("\n") + "\n",
  );
}

/* ── 1. Delete and re-insert activity logs ─────────────────────────────────── */

const deletedLogs = await db
  .delete(activityLogsTable)
  .where(like(activityLogsTable.description, "[demo-seed:activity]%"))
  .returning({ id: activityLogsTable.id });

console.log(`  [activity] removed ${deletedLogs.length} old demo log(s)`);

let logCreated = 0;
for (const log of data.activityLogs) {
  await db.insert(activityLogsTable).values({
    userId: log.userEmail ? (emailToId.get(log.userEmail) ?? null) : null,
    action: log.action,
    module: log.module,
    description: log.description,
    oldData: log.oldData ?? null,
    newData: log.newData ?? null,
    createdAt: new Date(log.createdAt),
  });
  logCreated++;
}
console.log(`  [activity] inserted ${logCreated} demo log(s)\n`);

/* ── 2. Delete and re-insert notifications ─────────────────────────────────── */

const deletedNotifs = await db
  .delete(notificationsTable)
  .where(like(notificationsTable.message, "[demo-seed:notify]%"))
  .returning({ id: notificationsTable.id });

console.log(`  [notify] removed ${deletedNotifs.length} old demo notification(s)`);

let notifCreated = 0;
let notifSkipped = 0;
for (const notif of data.notifications) {
  const userId = emailToId.get(notif.userEmail);
  if (!userId) {
    console.log(`  [notify] SKIP (user not found) — ${notif.userEmail}: ${notif.title}`);
    notifSkipped++;
    continue;
  }

  await db.insert(notificationsTable).values({
    userId,
    title:   notif.title,
    message: notif.message,
    type:    notif.type,
    isRead:  notif.isRead,
    link:    notif.link ?? null,
  });
  notifCreated++;
}

console.log(`  [notify] inserted ${notifCreated} demo notification(s)${notifSkipped > 0 ? `, ${notifSkipped} skipped` : ""}\n`);

/* ── Summary ───────────────────────────────────────────────────────────────── */

const readCount   = data.notifications.filter((n) => n.isRead).length;
const unreadCount = data.notifications.filter((n) => !n.isRead).length;
const byType = data.notifications.reduce<Record<string, number>>((acc, n) => {
  acc[n.type] = (acc[n.type] ?? 0) + 1;
  return acc;
}, {});

const byModule = data.activityLogs.reduce<Record<string, number>>((acc, l) => {
  acc[l.module] = (acc[l.module] ?? 0) + 1;
  return acc;
}, {});

console.log("  Activity log breakdown by module:");
for (const [mod, count] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${mod.padEnd(18)} ${count}`);
}

console.log("\n  Notification breakdown by type:");
for (const [type, count] of Object.entries(byType)) {
  console.log(`    ${type.padEnd(12)} ${count}  (read: ${data.notifications.filter((n) => n.type === type && n.isRead).length}, unread: ${data.notifications.filter((n) => n.type === type && !n.isRead).length})`);
}

console.log(`\n  Total notifications: ${notifCreated}  (read: ${readCount}, unread: ${unreadCount})`);
console.log("  Done.\n");

await pool.end();
