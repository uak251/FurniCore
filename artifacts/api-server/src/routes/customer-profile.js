/**
 * Extended profile (country, city, currency, timezone) — 1:1 with users.
 *
 * GET    /customer-profile
 * PATCH  /customer-profile
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, userProfilesTable } from "@workspace/db";
import { authenticate } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { resolveLocalityCurrency } from "../lib/localeCurrency";

const router = Router();

const PatchCustomerProfileBody = z
  .object({
    fullName: z.string().min(2).max(255).optional(),
    country: z.union([z.string().max(120), z.literal("")]).optional(),
    cityRegion: z.union([z.string().max(120), z.literal("")]).optional(),
    preferredCurrency: z.union([z.string().length(3), z.null()]).optional(),
    timezone: z.union([z.string().max(80), z.literal("")]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" });

function serialize(user, profile, req) {
  const acceptLanguage = req?.headers?.["accept-language"];
  const country = profile?.country ?? null;
  const localityCurrency = resolveLocalityCurrency(country, acceptLanguage);
  const preferred = profile?.preferredCurrency ?? null;
  const effectiveDisplayCurrency = preferred ?? localityCurrency;
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    fullName: profile?.fullName ?? user.name,
    phone: user.phone ?? null,
    country,
    cityRegion: profile?.cityRegion ?? null,
    /** Explicit ISO 4217 override, or null to use regional default only. */
    preferredCurrency: preferred,
    /** Inferred from country (when mappable) and otherwise Accept-Language. */
    localityCurrency,
    /** What to use for display: override ?? locality. */
    effectiveDisplayCurrency,
    timezone: profile?.timezone ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
    dashboardTheme: user.dashboardTheme ?? null,
    updatedAt: profile?.updatedAt?.toISOString?.() ?? null,
  };
}

router.get("/customer-profile", authenticate, async (req, res, next) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, req.user.id))
      .limit(1);
    res.json(serialize(user, profile ?? null, req));
  } catch (err) {
    next(err);
  }
});

router.patch("/customer-profile", authenticate, async (req, res, next) => {
  const parsed = PatchCustomerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
    return;
  }
  const b = parsed.data;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (b.fullName !== undefined) {
      await db.update(usersTable).set({ name: b.fullName.trim() }).where(eq(usersTable.id, req.user.id));
    }
    const [existingProf] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, req.user.id))
      .limit(1);
    const merged = {
      fullName: b.fullName !== undefined ? b.fullName.trim() : existingProf?.fullName ?? null,
      country:
        b.country !== undefined ? (b.country === "" ? null : b.country.trim()) : (existingProf?.country ?? null),
      cityRegion:
        b.cityRegion !== undefined ? (b.cityRegion === "" ? null : b.cityRegion.trim()) : (existingProf?.cityRegion ?? null),
      preferredCurrency:
        b.preferredCurrency !== undefined
          ? b.preferredCurrency === null
            ? null
            : b.preferredCurrency.toUpperCase()
          : (existingProf?.preferredCurrency ?? null),
      timezone:
        b.timezone !== undefined ? (b.timezone === "" ? null : b.timezone.trim()) : (existingProf?.timezone ?? null),
    };
    if (existingProf) {
      await db
        .update(userProfilesTable)
        .set({
          fullName: merged.fullName,
          country: merged.country,
          cityRegion: merged.cityRegion,
          preferredCurrency: merged.preferredCurrency,
          timezone: merged.timezone,
        })
        .where(eq(userProfilesTable.userId, req.user.id));
    } else {
      await db.insert(userProfilesTable).values({
        userId: req.user.id,
        fullName: merged.fullName,
        country: merged.country,
        cityRegion: merged.cityRegion,
        preferredCurrency: merged.preferredCurrency,
        timezone: merged.timezone,
      });
    }
    const [u2] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const [p2] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, req.user.id)).limit(1);
    await logActivity({
      userId: req.user.id,
      action: "UPDATE",
      module: "customer_profile",
      description: "Updated customer profile",
    });
    res.json(serialize(u2, p2 ?? null, req));
  } catch (err) {
    next(err);
  }
});

export default router;
