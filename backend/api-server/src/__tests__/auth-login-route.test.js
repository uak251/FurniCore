import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  user: null,
  throwOnLookup: null,
  updateCalled: false,
};

vi.mock("@workspace/db", () => {
  const usersTable = { email: "email", id: "id", isActive: "isActive" };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          if (dbState.throwOnLookup) throw dbState.throwOnLookup;
          return dbState.user ? [dbState.user] : [];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          dbState.updateCalled = true;
          return [];
        }),
      })),
    })),
  };

  return {
    db,
    usersTable,
    emailOtpChallengesTable: {},
  };
});

vi.mock("../lib/auth", () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(async () => true),
  generateAccessToken: vi.fn(() => "access-token"),
  generateRefreshToken: vi.fn(() => "refresh-token"),
  verifyRefreshToken: vi.fn(),
  verifyEmailVerifyToken: vi.fn(),
}));

vi.mock("../lib/sessionPolicy.js", () => ({
  getAccessExpiresInSeconds: () => 900,
  getSessionDurationPreset: () => "standard",
}));

vi.mock("../middlewares/authenticate", () => ({
  authenticate: (_req, _res, next) => next(),
}));

vi.mock("../lib/tokenBlacklist", () => ({
  revokeAccessToken: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../lib/activityLogger", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("../lib/email", () => ({
  sendOtpEmail: vi.fn(async () => {}),
  emailEnabled: false,
}));

vi.mock("../services/otpService.js", () => ({
  generateOtpDigits: () => "123456",
  saveOtpChallenge: vi.fn(async () => {}),
  verifyOtpChallenge: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../lib/themeCatalog", () => ({
  THEME_IDS: ["default"],
}));

vi.mock("../middlewares/upload.js", () => ({
  uploadProfileAvatar: (_req, _res, next) => next(),
}));

vi.mock("../uploadsRoot.js", () => ({
  UPLOADS_ROOT: "/tmp/uploads",
}));

vi.mock("../middlewares/analytics-access.js", () => ({
  getAnalyticsRbacContract: () => ({
    roles: {
      admin: "Admin",
      manager: "Manager",
      customer: "Customer",
      supplier: "Supplier",
    },
  }),
}));

import authRouter from "../modules/auth/routes/auth.js";
import { comparePassword } from "../lib/auth";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  return app;
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    dbState.user = null;
    dbState.throwOnLookup = null;
    dbState.updateCalled = false;
    vi.clearAllMocks();
  });

  it("returns 401 for invalid credentials", async () => {
    dbState.user = null;

    const app = makeApp();
    const res = await request(app).post("/api/auth/login").send({
      email: "admin@furnicore.com",
      password: "wrong",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("returns token payload for valid credentials", async () => {
    dbState.user = {
      id: 1,
      name: "Admin",
      email: "admin@furnicore.com",
      passwordHash: "hash",
      role: "admin",
      isActive: true,
      isVerified: true,
      refreshToken: null,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
      profileImageUrl: null,
      permissions: null,
      dashboardTheme: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockedComparePassword = comparePassword;
    mockedComparePassword.mockResolvedValueOnce(true);

    const app = makeApp();
    const res = await request(app).post("/api/auth/login").send({
      email: "admin@furnicore.com",
      password: "Admin@123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("access-token");
    expect(res.body.refreshToken).toBe("refresh-token");
    expect(dbState.updateCalled).toBe(true);
  });

  it("returns 503 when DB is unavailable", async () => {
    dbState.throwOnLookup = new Error("connect ECONNREFUSED 127.0.0.1:5432");

    const app = makeApp();
    const res = await request(app).post("/api/auth/login").send({
      email: "admin@furnicore.com",
      password: "Admin@123456",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("AUTH_DB_UNAVAILABLE");
  });
});
