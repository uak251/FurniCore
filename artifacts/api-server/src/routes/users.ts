import { Router, type IRouter } from "express";
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

router.post("/users", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db.insert(usersTable).values({ ...parsed.data, passwordHash }).returning();
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "users", description: `Created user ${user.name}`, newData: sanitizeUser(user) });
  res.status(201).json(sanitizeUser(user));
});

router.get("/users/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(sanitizeUser(user));
});

router.patch("/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [old] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "UPDATE", module: "users", description: `Updated user ${user.name}`, oldData: sanitizeUser(old), newData: sanitizeUser(user) });
  res.json(sanitizeUser(user));
});

router.delete("/users/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "DELETE", module: "users", description: `Deleted user ${user.name}` });
  res.sendStatus(204);
});

export default router;
