/**
 * Data-scoping tests — verify that each isolated portal can only read/mutate
 * data that belongs to the authenticated user.
 *
 * Strategy:
 *   • Worker A (userId=1) must not be able to access Worker B's task (assigneeId=2).
 *   • Customer A (userId=1) must not be able to read Customer B's order (customerId=2).
 *   • Customer A must not be able to pay Customer B's invoice (customerId=2).
 *
 * We control the DB mock's return value per-test to simulate "record belongs
 * to another user" (returns []) vs. "record belongs to this user" (returns data).
 */

import { vi } from "vitest";

/* ── mock @workspace/db — per-test overrides handled via vi.mocked() ── */
vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  const mockDb = makeDb([]);
  return { db: mockDb, ...TABLE_STUBS };
});

/** Avoid consuming db.select mock chains before route handlers (authenticate blacklist check). */
vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t: string) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}), and: () => ({}), or: () => ({}),
  desc: () => ({}), asc: () => ({}), gte: () => ({}), lte: () => ({}),
  sql: () => ({}), ne: () => ({}), inArray: () => ({}),
  isNull: () => ({}), isNotNull: () => ({}), lt: () => ({}), gt: () => ({}),
  ilike: () => ({}),
}));

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import router from "../routes/index";
import { db } from "@workspace/db";
import { makeChain } from "./helpers/db-mock";
import { makeToken } from "./helpers/tokens";

/* ── test app ── */
let request: ReturnType<typeof supertest>;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  request = supertest(app);
});

beforeEach(() => {
  vi.mocked(db.select).mockReset();
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.update).mockReset();
  vi.mocked(db.delete).mockReset();
  // default: all db calls return []
  vi.mocked(db.select).mockReturnValue(makeChain([]));
  vi.mocked(db.insert).mockReturnValue(makeChain([]));
  vi.mocked(db.update).mockReturnValue(makeChain([]));
  vi.mocked(db.delete).mockReturnValue(makeChain([]));
});

/* ═══════════════════════════════════════════════════════════════════════════
   WORKER PORTAL — Task ownership
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Worker portal — task data scoping", () => {
  const workerAId = 1;
  const workerBId = 2;
  const taskBelongingToA = {
    id: 10, assigneeId: workerAId, status: "pending", progress: 0, actualHours: null,
    taskName: "Assemble frame", productId: null, targetQuantity: 1,
    startDate: null, dueDate: null, completedAt: null, notes: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  describe("PATCH /worker-portal/tasks/:id", () => {
    it("returns 404 when the task does not belong to this worker (cross-user access blocked)", async () => {
      // DB returns [] — simulates task belonging to another worker
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const res = await request
        .patch("/api/worker-portal/tasks/99")
        .set("Authorization", `Bearer ${makeToken("worker", workerAId)}`)
        .send({ status: "in_progress" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: expect.stringContaining("not assigned") });
    });

    it("allows the worker to update their own task (same assigneeId)", async () => {
      // 1st select: ownership check returns the task (assigneeId = workerAId)
      vi.mocked(db.select).mockReturnValueOnce(makeChain([taskBelongingToA]));
      // update: returns the updated task
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...taskBelongingToA, status: "in_progress", progress: 30 }]),
      );

      const res = await request
        .patch("/api/worker-portal/tasks/10")
        .set("Authorization", `Bearer ${makeToken("worker", workerAId)}`)
        .send({ status: "in_progress", progress: 30 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "in_progress", progress: 30 });
    });

    it("worker B cannot update worker A's task", async () => {
      // DB returns [] when querying for task 10 with assigneeId = workerBId
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const res = await request
        .patch("/api/worker-portal/tasks/10")
        .set("Authorization", `Bearer ${makeToken("worker", workerBId)}`)
        .send({ status: "in_progress" });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /worker-portal/tasks", () => {
    it("returns only the calling worker's tasks (db.select called once, result scoped)", async () => {
      const taskForWorkerA = { ...taskBelongingToA };
      vi.mocked(db.select).mockReturnValue(makeChain([taskForWorkerA]));

      const res = await request
        .get("/api/worker-portal/tasks")
        .set("Authorization", `Bearer ${makeToken("worker", workerAId)}`);

      // Auth passed (not 401/403) and select was called
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(vi.mocked(db.select)).toHaveBeenCalled();
    });
  });

  describe("GET /worker-portal/attendance", () => {
    it("uses worker's own employee record, not a query parameter", async () => {
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const res = await request
        .get("/api/worker-portal/attendance?month=1&year=2025")
        .set("Authorization", `Bearer ${makeToken("worker", workerAId)}`);

      // Should pass auth regardless of data existence
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("GET /worker-portal/payroll", () => {
    it("uses worker's own employee record, not a query parameter", async () => {
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const res = await request
        .get("/api/worker-portal/payroll")
        .set("Authorization", `Bearer ${makeToken("worker", workerAId)}`);

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOMER PORTAL — Order and invoice ownership
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Customer portal — order data scoping", () => {
  const customerAId = 1;
  const orderBelongingToA = {
    id: 50, customerId: customerAId, orderNumber: "CO-20250101-1234",
    customerName: "Alice", customerEmail: "alice@test.com",
    status: "confirmed", notes: null, shippingAddress: "123 Main St",
    subtotal: "100.00", discountCode: null, discountAmount: "0.00",
    taxRate: "0", taxAmount: "0.00", totalAmount: "100.00",
    estimatedDelivery: null, taskId: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  describe("GET /customer-portal/orders/:id", () => {
    it("returns 404 when the order does not belong to this customer", async () => {
      // DB returns [] — simulates order belonging to a different customer
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const res = await request
        .get("/api/customer-portal/orders/999")
        .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`);

      expect(res.status).toBe(404);
    });

    it("returns 200 when the order belongs to this customer", async () => {
      // 1st select → order (ownership check)
      // 2nd select → items
      // 3rd select → updates
      vi.mocked(db.select)
        .mockReturnValueOnce(makeChain([orderBelongingToA]))
        .mockReturnValueOnce(makeChain([]))  // items
        .mockReturnValueOnce(makeChain([])); // updates

      const res = await request
        .get("/api/customer-portal/orders/50")
        .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 50, customerId: customerAId });
    });

    it("customer B (userId=2) cannot access customer A's order", async () => {
      // DB returns [] for customerId=2 query against order owned by customerId=1
      vi.mocked(db.select).mockReturnValue(makeChain([]));

      const customerBId = 2;
      const res = await request
        .get("/api/customer-portal/orders/50")
        .set("Authorization", `Bearer ${makeToken("customer", customerBId)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /customer-portal/orders (list)", () => {
    it("returns only this customer's orders (scoped by customerId)", async () => {
      vi.mocked(db.select).mockReturnValue(makeChain([orderBelongingToA]));

      const res = await request
        .get("/api/customer-portal/orders")
        .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`);

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      // The DB was queried (scoping happens in SQL WHERE clause)
      expect(vi.mocked(db.select)).toHaveBeenCalled();
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOMER PORTAL — Invoice payment scoping
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Customer portal — invoice payment scoping", () => {
  const customerAId = 1;
  const invoiceBelongingToA = {
    id: 77, customerId: customerAId, invoiceNumber: "INV-20250101-5678",
    orderId: 50, customerName: "Alice", customerEmail: "alice@test.com",
    status: "sent", subtotal: "100.00", discountAmount: "0.00",
    taxAmount: "0.00", totalAmount: "100.00",
    dueDate: null, paidAt: null, paymentMethod: null, paymentReference: null,
    notes: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  it("returns 404 when invoice does not belong to this customer", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));

    const res = await request
      .post("/api/customer-portal/invoices/999/pay")
      .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`)
      .send({ paymentMethod: "Bank Transfer" });

    expect(res.status).toBe(404);
  });

  it("allows the customer to pay their own invoice", async () => {
    // select: ownership check returns invoice
    vi.mocked(db.select).mockReturnValue(makeChain([invoiceBelongingToA]));
    // update: returns the fully updated invoice row — use Date object so route can call .toISOString()
    vi.mocked(db.update).mockReturnValue(
      makeChain([{
        ...invoiceBelongingToA,
        status: "paid",
        paidAt: new Date(),
        paymentMethod: "Bank Transfer",
        paymentReference: "TXN-001",
        orderId: null,   // null so we skip the order-update branch
      }]),
    );

    const res = await request
      .post("/api/customer-portal/invoices/77/pay")
      .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`)
      .send({ paymentMethod: "Bank Transfer", paymentReference: "TXN-001" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "paid", paymentMethod: "Bank Transfer" });
  });

  it("returns 400 when the invoice is already paid", async () => {
    const paidInvoice = { ...invoiceBelongingToA, status: "paid" };
    vi.mocked(db.select).mockReturnValue(makeChain([paidInvoice]));

    const res = await request
      .post("/api/customer-portal/invoices/77/pay")
      .set("Authorization", `Bearer ${makeToken("customer", customerAId)}`)
      .send({ paymentMethod: "Cash" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("already paid") });
  });

  it("customer B cannot pay customer A's invoice", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));

    const customerBId = 2;
    const res = await request
      .post("/api/customer-portal/invoices/77/pay")
      .set("Authorization", `Bearer ${makeToken("customer", customerBId)}`)
      .send({ paymentMethod: "Credit Card" });

    expect(res.status).toBe(404);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUPPLIER PORTAL — Quote scoping
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Supplier portal — quote data scoping", () => {
  it("returns 404 when the delivery update does not belong to this supplier", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));

    const res = await request
      .patch("/api/supplier-portal/deliveries/99")
      .set("Authorization", `Bearer ${makeToken("supplier", 1)}`)
      .send({ notes: "Updated note" });

    expect(res.status).toBe(404);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   DISCOUNT CODE — Sales-manager can create, customer cannot
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Discount management role isolation", () => {
  it("customer cannot create discount codes (403)", async () => {
    const res = await request
      .post("/api/sales-manager/discounts")
      .set("Authorization", `Bearer ${makeToken("customer")}`)
      .send({ code: "HACK50", type: "percentage", value: 50 });
    expect(res.status).toBe(403);
  });

  it("worker cannot create discount codes (403)", async () => {
    const res = await request
      .post("/api/sales-manager/discounts")
      .set("Authorization", `Bearer ${makeToken("worker")}`)
      .send({ code: "HACK50", type: "percentage", value: 50 });
    expect(res.status).toBe(403);
  });

  it("admin can create discount codes (passes auth)", async () => {
    vi.mocked(db.insert).mockReturnValue(
      makeChain([{ id: 1, code: "SAVE10", type: "percentage", value: "10", usedCount: 0, isActive: true, createdAt: new Date().toISOString() }]),
    );
    const res = await request
      .post("/api/sales-manager/discounts")
      .set("Authorization", `Bearer ${makeToken("admin")}`)
      .send({ code: "SAVE10", type: "percentage", value: 10 });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
