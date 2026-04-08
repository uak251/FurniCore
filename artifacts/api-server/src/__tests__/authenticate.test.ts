/**
 * Unit tests for the authenticate and requireRole middlewares.
 *
 * We mock the token blacklist so no DB is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t: string) => `hash:${t.slice(-8)}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
}));

import { authenticate, requireRole, type AuthRequest } from "../middlewares/authenticate";
import { makeToken, tokens } from "./helpers/tokens";

/* ─── mock helpers ──────────────────────────────────────────────────────── */

function mockReq(authHeader?: string): AuthRequest {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    path: "/test",
    method: "GET",
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as AuthRequest;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
  } as unknown as Response & { body: unknown };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json   = vi.fn((data: unknown) => { res.body = data; return res; });
  return res;
}

const next: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  authenticate middleware                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("authenticate middleware", () => {
  it("returns 401 NO_TOKEN when Authorization header is missing", async () => {
    const req = mockReq();
    const res = mockRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "NO_TOKEN" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 NO_TOKEN when header does not start with 'Bearer '", async () => {
    const req = mockReq("Basic abc123");
    const res = mockRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "NO_TOKEN" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 INVALID_TOKEN for a malformed JWT token", async () => {
    const req = mockReq("Bearer this.is.not.a.valid.jwt");
    const res = mockRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_TOKEN" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 INVALID_TOKEN for a JWT signed with the wrong secret", async () => {
    const badToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ4QHguY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.badSignature";
    const req = mockReq(`Bearer ${badToken}`);
    const res = mockRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_TOKEN" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["admin", "manager", "worker", "supplier", "customer"] as const)(
    "accepts a valid %s token and populates req.user",
    async (role) => {
      const token = makeToken(role, 42, `${role}@example.com`);
      const req   = mockReq(`Bearer ${token}`);
      const res   = mockRes();
      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({ id: 42, email: `${role}@example.com`, role });
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  requireRole middleware                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("requireRole middleware", () => {
  it("returns 403 when req.user is absent (authenticate not called first)", () => {
    const req = {} as AuthRequest;
    const res = mockRes();
    requireRole("admin")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is not in the allowed list", () => {
    const req = { user: { id: 1, email: "w@test.com", role: "worker" } } as AuthRequest;
    const res = mockRes();
    requireRole("admin", "manager")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user role matches exactly", () => {
    const req = { user: { id: 1, email: "a@test.com", role: "admin" } } as AuthRequest;
    const res = mockRes();
    requireRole("admin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() when user role is one of multiple allowed roles", () => {
    const req = { user: { id: 1, email: "m@test.com", role: "manager" } } as AuthRequest;
    const res = mockRes();
    requireRole("admin", "manager", "accounts")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("error body contains {error: ...} key", () => {
    const req = { user: { id: 1, email: "c@test.com", role: "customer" } } as AuthRequest;
    const res = mockRes();
    requireRole("supplier")(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("a customer token cannot satisfy worker role requirement", () => {
    const req = { user: { id: 1, email: "c@test.com", role: "customer" } } as AuthRequest;
    const res = mockRes();
    requireRole("worker")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("a supplier token cannot satisfy admin role requirement", () => {
    const req = { user: { id: 1, email: "s@test.com", role: "supplier" } } as AuthRequest;
    const res = mockRes();
    requireRole("admin")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
