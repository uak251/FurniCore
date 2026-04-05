import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const ACCESS_SECRET = process.env.SESSION_SECRET || "furnicore_access_secret_2024";
const REFRESH_SECRET = process.env.SESSION_SECRET + "_refresh" || "furnicore_refresh_secret_2024";
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: { id: number; email: string; role: string }): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function generateRefreshToken(payload: { id: number; email: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): { id: number; email: string; role: string } {
  return jwt.verify(token, ACCESS_SECRET) as { id: number; email: string; role: string };
}

export function verifyRefreshToken(token: string): { id: number; email: string } {
  return jwt.verify(token, REFRESH_SECRET) as { id: number; email: string };
}
