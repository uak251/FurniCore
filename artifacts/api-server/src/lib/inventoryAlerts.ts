/**
 * Low-stock alerts: Socket.io broadcast + persisted notifications for
 * Admin, Manager, and Inventory Manager roles (PostgreSQL via Drizzle — not Prisma).
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createNotification } from "./activityLogger";
import { emitLowStockAlert, type LowStockPayload } from "./socket";

const STOCK_ALERT_ROLES = ["admin", "manager", "inventory_manager"] as const;

export async function notifyLowStockStakeholders(item: LowStockPayload): Promise<void> {
  emitLowStockAlert(item);

  try {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
          inArray(usersTable.role, [...STOCK_ALERT_ROLES]),
        ),
      );

    const title = "Low stock alert";
    const message = `${item.name}: ${item.quantity} on hand (reorder at ${item.reorderLevel}).`;
    const link = "/inventory";

    await Promise.all(
      recipients.map((u) =>
        createNotification({
          userId: u.id,
          title,
          message,
          type: "warning",
          link,
        }),
      ),
    );
  } catch {
    // Non-fatal — socket event already fired
  }
}
