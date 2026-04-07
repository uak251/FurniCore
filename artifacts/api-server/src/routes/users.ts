import { Router, type IRouter, type NextFunction } from "express";
import { eq, like, or, ilike } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DeleteUserParams, ListUsersQueryParams } from "@workspace/api-zod";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";
import { hashPassword } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

function sanitizeUser(user: typeof usersTable.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

router.get("/users", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  let query = db.select().from(usersTable).$dynamic();
  if (params.success && params.data.search) {
    query = query.where(ilike(usersTable.name, `%${params.data.search}%`));
  }
  const users = await query;
  res.json(users.map(sanitizeUser));
});

router.post("/users", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
    return;
  }

  try {
    // Check for duplicate email before attempting the insert
    const [dup] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email));

    if (dup) {
      res.status(409).json({ error: "EMAIL_ALREADY_EXISTS", message: "A user with this email already exists." });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);

    // Be explicit — never spread the full body into the DB insert.
    const [user] = await db
      .insert(usersTable)
      .values({
        name:        parsed.data.name,
        email:       parsed.data.email,
        passwordHash,
        role:        parsed.data.role,
        isActive:    true,
        isVerified:  true,   // Admin-created accounts skip email verification
      })
      .returning();

    await logActivity({
      userId:      req.user?.id,
      action:      "CREATE",
      module:      "users",
      description: `Created user ${user.name} (${user.role})`,
      newData:     sanitizeUser(user),
    });

    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    next(err);
  }
});

router.get("/users/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(sanitizeUser(user));
});

router.patch("/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "INVALID_ID", message: "Invalid user id." }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message }); return; }

  try {
    const [old] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
    if (!old) { res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." }); return; }

    // Only update fields that were actually provided
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (parsed.data.name     !== undefined) updates.name     = parsed.data.name;
    if (parsed.data.email    !== undefined) updates.email    = parsed.data.email;
    if (parsed.data.role     !== undefined) updates.role     = parsed.data.role;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "users", description: `Updated user ${user.name}`, oldData: sanitizeUser(old), newData: sanitizeUser(user) });
    res.json(sanitizeUser(user));
  } catch (err) {
    next(err);
  }
});

/**
 * Soft-delete: sets isActive=false instead of removing the row.
 * Hard-deleting users breaks FK constraints across activity_logs,
 * notifications, hr, sales, production, and many other tables.
 * ERP best-practice is to deactivate users and preserve audit history.
 * Use PATCH /users/:id with { isActive: true } to reactivate.
 */
router.delete("/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "INVALID_ID", message: "Invalid user id." }); return; }

  // Prevent self-deactivation
  if (req.user?.id === params.data.id) {
    res.status(400).json({ error: "SELF_DEACTIVATE", message: "You cannot deactivate your own account." });
    return;
  }

  try {
    const [user] = await db
      .update(usersTable)
      .set({ isActive: false })
      .where(eq(usersTable.id, params.data.id))
      .returning();

    if (!user) { res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." }); return; }

    await logActivity({
      userId:      req.user?.id,
      action:      "DEACTIVATE",
      module:      "users",
      description: `Deactivated user ${user.name} (${user.role})`,
    });

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
