/**
 * Create an invoice row from a customer order (amounts mirror order tax/discount).
 * Skips insert if an invoice already exists for this order_id.
 */
import { eq } from "drizzle-orm";
import { db, invoicesTable } from "@workspace/db";

function dateSuffix() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function rand4() {
    return String(Math.floor(Math.random() * 9000) + 1000);
}
export function genInvoiceNumber() {
    return `INV-${dateSuffix()}-${rand4()}`;
}

/**
 * @param {object} order — customer_orders row
 * @param {{ dueDays?: number; dueDate?: Date | null; status?: string; notes?: string | null; createdBy?: number | null; taxRate?: number }} [opts]
 */
export async function insertInvoiceForOrderIfAbsent(order, opts = {}) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, order.id)).limit(1);
    if (existing)
        return existing;
    const subtotal = Number(order.subtotal);
    const discountAmount = Number(order.discountAmount);
    const taxRate = opts.taxRate ?? Number(order.taxRate);
    const taxAmount = (subtotal - discountAmount) * taxRate / 100;
    const totalAmount = subtotal - discountAmount + taxAmount;
    let dueDate = opts.dueDate;
    if (dueDate === undefined) {
        const days = opts.dueDays ?? 30;
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + days);
    }
    const [inv] = await db.insert(invoicesTable).values({
        invoiceNumber: genInvoiceNumber(),
        orderId: order.id,
        customerId: order.customerId ?? null,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        subtotal: String(subtotal.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        taxAmount: String(taxAmount.toFixed(2)),
        totalAmount: String(totalAmount.toFixed(2)),
        dueDate,
        notes: opts.notes ?? null,
        status: opts.status ?? "sent",
        createdBy: opts.createdBy ?? null,
    }).returning();
    return inv;
}
