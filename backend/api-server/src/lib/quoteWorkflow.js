/**
 * Record approved supplier unit rate for reporting & analytics.
 */
import { eq } from "drizzle-orm";
import { db, supplierOfficialRatesTable, appSettingsTable } from "@workspace/db";

export async function recordOfficialSupplierRate(quote) {
    if (!quote.inventoryItemId)
        return null;
    const [row] = await db
        .insert(supplierOfficialRatesTable)
        .values({
            supplierId: quote.supplierId,
            inventoryItemId: quote.inventoryItemId,
            unitPrice: String(Number(quote.unitPrice).toFixed(2)),
            sourceQuoteId: quote.id,
            effectiveFrom: new Date(),
        })
        .returning();
    return row;
}

export async function getFinanceThreshold() {
    const [s] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "FINANCE_QUOTE_APPROVAL_THRESHOLD"));
    const n = s?.value != null ? Number(s.value) : 50000;
    return Number.isFinite(n) ? n : 50000;
}
