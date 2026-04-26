import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import speakeasy from "speakeasy";

const ALGO = "aes-256-gcm";

function keyMaterial() {
  const raw = String(process.env.TOTP_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").trim();
  return createHash("sha256").update(raw || "furnicore-totp-fallback").digest();
}

export function encryptSecret(secret) {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload) {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = String(payload).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const key = keyMaterial();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return out.toString("utf8");
}

export function generateTotpSecret(label) {
  return speakeasy.generateSecret({
    name: `FurniCore (${label})`,
    issuer: "FurniCore",
    length: 32,
  });
}

export function verifyTotpToken(secretBase32, token) {
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: "base32",
    token: String(token || ""),
    window: 1,
    step: 30,
  });
}

