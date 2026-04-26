/**
 * Persist + broadcast notifications when a customer places an order via the portal.
 * Recipients (by role string in DB): owner/Master Admin → admin; sales → sales_manager;
 * production manager → manager; accountant → accountant.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createNotification } from "./activityLogger";
import { emitNewCustomerOrder } from "./socket";
const CUSTOMER_CHECKOUT_NOTIFY_ROLES = ["admin", "manager", "sales_manager", "accountant"];
/** Notify sales stakeholders that a customer requested a payment plan (advance + installments). */
export async function notifySalesStakeholdersOfPaymentPlanRequest(order, customerNotes) {
    const total = Number(order.totalAmount);
    const noteLine = customerNotes ? ` Notes: ${customerNotes.slice(0, 200)}` : "";
    try {
        const recipients = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, CUSTOMER_CHECKOUT_NOTIFY_ROLES)));
        const seen = new Set();
        const title = "Payment plan requested";
        const message = `${order.orderNumber} — ${order.customerName} asked for a payment plan (advance + installments).${noteLine}`;
        const link = "/sales?tab=invoices";
        await Promise.all(recipients
            .filter((u) => {
            if (seen.has(u.id))
                return false;
            seen.add(u.id);
            return true;
        })
            .map((u) => createNotification({
            userId: u.id,
            title,
            message,
            type: "info",
            link,
        })));
    }
    catch {
        /* non-fatal */
    }
}

export async function notifySalesStakeholdersOfCustomerOrder(order) {
    const total = Number(order.totalAmount);
    const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        totalAmount: total,
    };
    emitNewCustomerOrder(payload);
    try {
        const recipients = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, CUSTOMER_CHECKOUT_NOTIFY_ROLES)));
        const seen = new Set();
        const title = "New customer order";
        const message = `${order.orderNumber} — ${order.customerName} · ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
        const link = "/sales?tab=orders";
        await Promise.all(recipients
            .filter((u) => {
            if (seen.has(u.id))
                return false;
            seen.add(u.id);
            return true;
        })
            .map((u) => createNotification({
            userId: u.id,
            title,
            message,
            type: "info",
            link,
        })));
    }
    catch {
        // Non-fatal — socket event already fired
    }
}
