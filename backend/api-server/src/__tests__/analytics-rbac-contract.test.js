import { describe, it, expect } from "vitest";
import { nativeAnalyticsHandlers } from "../lib/native-analytics";
import {
  getAnalyticsRbacContract,
  canAccessAnalyticsModule,
  allowedRolesForAnalyticsModule,
} from "../middlewares/analytics-access";

describe("analytics RBAC contract drift checks", () => {
  it("contract is versioned and has module map", () => {
    const contract = getAnalyticsRbacContract();
    expect(typeof contract.version).toBe("string");
    expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(contract.modules).toBeTruthy();
  });

  it("every analytics handler has a contract module entry", () => {
    const contract = getAnalyticsRbacContract();
    const handlerKeys = Object.keys(nativeAnalyticsHandlers).sort();
    const contractKeys = new Set(Object.keys(contract.modules));
    for (const key of handlerKeys) {
      expect(contractKeys.has(key)).toBe(true);
    }
  });

  it("requested ERP modules exist in contract mapping", () => {
    const contract = getAnalyticsRbacContract();
    const expected = [
      "inventory",
      "procurement",
      "production",
      "hr",
      "payroll",
      "accounting",
      "customer",
      "notifications",
      "admin",
    ];
    for (const key of expected) {
      expect(contract.modules[key]).toBeTruthy();
      expect(Array.isArray(contract.modules[key].allowedRoles)).toBe(true);
      expect(contract.modules[key].allowedRoles.length).toBeGreaterThan(0);
    }
  });

  it("admin has full access to every module", () => {
    const contract = getAnalyticsRbacContract();
    for (const moduleKey of Object.keys(contract.modules)) {
      expect(canAccessAnalyticsModule("admin", moduleKey)).toBe(true);
    }
  });

  it("customer is limited to customer-profile and notifications only", () => {
    expect(canAccessAnalyticsModule("customer", "customer-profile")).toBe(true);
    expect(canAccessAnalyticsModule("customer", "notifications")).toBe(true);
    expect(canAccessAnalyticsModule("customer", "finance")).toBe(false);
    expect(canAccessAnalyticsModule("customer", "inventory")).toBe(false);
    expect(canAccessAnalyticsModule("customer", "settings")).toBe(false);
  });

  it("module role lists are non-empty arrays", () => {
    const contract = getAnalyticsRbacContract();
    for (const moduleKey of Object.keys(contract.modules)) {
      const roles = allowedRolesForAnalyticsModule(moduleKey);
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
    }
  });
});
