import { db, productManufacturingEventsTable } from "@workspace/db";
import { PRODUCT_STATUSES, MANUFACTURING_STAGES, STAGE_ORDER } from "./productCatalogConstants.js";

export function isValidProductStatus(s) {
  return PRODUCT_STATUSES.includes(s);
}

export function isValidStage(s) {
  return s == null || MANUFACTURING_STAGES.includes(s);
}

/** @param {number | null | undefined} p */
export function clampProgress(p) {
  if (p == null || p === "") return null;
  const n = Math.round(Number(p));
  if (Number.isNaN(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * When leaving WIP, clear manufacturing fields (caller merges into update payload).
 */
export function wipFieldsForStatus(status) {
  if (status === "WORK_IN_PROCESS") {
    return {};
  }
  return {
    wipStage: null,
    wipProgressPercent: null,
    wipDepartment: null,
  };
}

/**
 * Optional soft warning when stage moves backward vs canonical order.
 */
export function stageTransitionNote(fromStage, toStage) {
  if (!fromStage || !toStage || fromStage === toStage) return null;
  const a = STAGE_ORDER[fromStage];
  const b = STAGE_ORDER[toStage];
  if (a == null || b == null) return null;
  if (b < a) return `Stage moved backward (${fromStage} → ${toStage})`;
  return null;
}

/** @param {Record<string, unknown>} row */
export function serializeManufacturingEvent(row) {
  return {
    id: row.id,
    productId: row.productId,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromStage: row.fromStage,
    toStage: row.toStage,
    fromProgress: row.fromProgress,
    toProgress: row.toProgress,
    department: row.department,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * Persist an audit entry for manager-driven product manufacturing changes.
 */
export async function insertManufacturingEvent(payload) {
  const [row] = await db
    .insert(productManufacturingEventsTable)
    .values({
      productId: payload.productId,
      eventType: payload.eventType,
      fromStatus: payload.fromStatus ?? null,
      toStatus: payload.toStatus ?? null,
      fromStage: payload.fromStage ?? null,
      toStage: payload.toStage ?? null,
      fromProgress: payload.fromProgress ?? null,
      toProgress: payload.toProgress ?? null,
      department: payload.department ?? null,
      note: payload.note ?? null,
      createdBy: payload.createdBy ?? null,
    })
    .returning();
  return row;
}
