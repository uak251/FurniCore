/**
 * Product operational status (visibility is not tied to stock).
 * @typedef {'AVAILABLE' | 'IN_SHOWROOM' | 'IN_FACTORY' | 'WORK_IN_PROCESS'} ProductStatus
 */

export const PRODUCT_STATUSES = ["AVAILABLE", "IN_SHOWROOM", "IN_FACTORY", "WORK_IN_PROCESS"];

/** @type {Record<string, string>} */
export const PRODUCT_STATUS_LABELS = {
  AVAILABLE: "Available",
  IN_SHOWROOM: "In Showroom",
  IN_FACTORY: "In Factory",
  WORK_IN_PROCESS: "Work in Process",
};

/** Manufacturing stages when productStatus === WORK_IN_PROCESS */
export const MANUFACTURING_STAGES = ["WOOD_STRUCTURE", "POSHISH", "POLISH", "FINISHING", "READY"];

/** @type {Record<string, string>} */
export const MANUFACTURING_STAGE_LABELS = {
  WOOD_STRUCTURE: "Wood structure",
  POSHISH: "Poshish (foam / finishing prep)",
  POLISH: "Polish",
  FINISHING: "Finishing",
  READY: "Ready",
};

/** Canonical order for transition hints (not enforced — logged if out of order). */
export const STAGE_ORDER = {
  WOOD_STRUCTURE: 0,
  POSHISH: 1,
  POLISH: 2,
  FINISHING: 3,
  READY: 4,
};

/** Customer-facing shelf badge copy (maps operational status → e-commerce labels). */
export const ECOMMERCE_SHELF_BADGE = {
    AVAILABLE: "Ready to ship",
    IN_SHOWROOM: "In showroom",
    IN_FACTORY: "In factory",
    WORK_IN_PROCESS: "Pre-order",
};

export function slugifyCategoryName(name) {
  const s = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "category";
}
