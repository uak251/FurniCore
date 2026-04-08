/**
 * Chainable Drizzle-ORM mock.
 *
 * Usage:
 *   vi.mock('@workspace/db', () => ({
 *     db: makeDb(),
 *     usersTable: {}, ...
 *   }))
 *
 *   // In a test, override one call:
 *   import { db } from '@workspace/db'
 *   vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: 1, name: 'Alice' }]))
 */
import { vi } from "vitest";
/**
 * Returns a Promise-like object whose chain methods (from, where, orderBy, …)
 * all return `this`, so any Drizzle-style query chain resolves to `value`.
 */
export function makeChain(value) {
    const chain = {};
    for (const method of [
        "from", "where", "orderBy", "leftJoin", "innerJoin",
        "limit", "offset", "set", "values", "returning", "$dynamic",
    ]) {
        chain[method] = vi.fn(() => chain);
    }
    // thenable — makes `await chain` resolve to `value`
    chain.then = (onfulfilled, onrejected) => Promise.resolve(value).then(onfulfilled, onrejected);
    chain.catch = (onrejected) => Promise.resolve(value).catch(onrejected);
    return chain;
}
/**
 * Creates the mock `db` object.  Every method returns a fresh chain that
 * resolves to `defaultResult` (default []).
 *
 * Replace individual calls with:
 *   vi.mocked(db.select).mockReturnValueOnce(makeChain([...specific data...]))
 */
export function makeDb(defaultResult = []) {
    return {
        select: vi.fn(() => makeChain(defaultResult)),
        insert: vi.fn(() => makeChain(defaultResult)),
        update: vi.fn(() => makeChain(defaultResult)),
        delete: vi.fn(() => makeChain(defaultResult)),
    };
}
/** All table symbols as empty objects — routes use them only as query arguments */
export const TABLE_STUBS = {
    usersTable: {},
    employeesTable: {},
    productsTable: {},
    inventoryTable: {},
    suppliersTable: {},
    supplierQuotesTable: {},
    deliveryUpdatesTable: {},
    manufacturingTasksTable: {},
    attendanceTable: {},
    payrollTable: {},
    payrollAdjustmentsTable: {},
    transactionsTable: {},
    notificationsTable: {},
    activityLogsTable: {},
    performanceReviewsTable: {},
    customerOrdersTable: {},
    orderItemsTable: {},
    invoicesTable: {},
    discountsTable: {},
    orderUpdatesTable: {},
    qcRemarksTable: {},
    productionTable: {},
    hrTable: {},
    recordImagesTable: {},
    appSettingsTable: {},
    tokenBlacklistTable: {},
};
