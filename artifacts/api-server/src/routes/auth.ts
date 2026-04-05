import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, RefreshTokenBody, RegisterBody } from "@workspace/api-zod";
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../lib/auth";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password } = parsed.data;

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ name, email, passwordHash, role: "employee" })
    .returning();

  const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email });
  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
  await logActivity({ userId: user.id, action: "REGISTER", module: "auth", description: `${user.name} registered` });

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email });
  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
  await logActivity({ userId: user.id, action: "LOGIN", module: "auth", description: `${user.name} logged in` });
  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt },
  });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    if (!user || user.refreshToken !== parsed.data.refreshToken) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }
    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email });
    await db.update(usersTable).set({ refreshToken: newRefreshToken }).where(eq(usersTable.id, user.id));
    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

router.post("/auth/logout", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user) {
    await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, req.user.id));
  }
  res.json({ message: "Logged out" });
});

router.get("/auth/me", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt });
});

export default router;
