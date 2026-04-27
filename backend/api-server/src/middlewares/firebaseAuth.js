import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";
import { verifyFirebaseSession } from "../lib/firebaseSessionJwt.js";

function readBearer(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer "))
        return "";
    return header.slice(7).trim();
}

export async function verifyFirebaseToken(req, res, next) {
    const token = readBearer(req);
    if (!token) {
        res.status(401).json({ error: "FIREBASE_TOKEN_MISSING", message: "Missing Firebase bearer token." });
        return;
    }
    try {
        const decoded = await getFirebaseAdminAuth().verifyIdToken(token, true);
        req.firebaseUser = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({
            error: "FIREBASE_TOKEN_INVALID",
            message: "Invalid Firebase ID token.",
            details: String(err?.message || err),
        });
    }
}

export function verifyFirebaseSessionJwt(req, res, next) {
    const token = readBearer(req);
    if (!token) {
        res.status(401).json({ error: "SESSION_TOKEN_MISSING", message: "Missing session bearer token." });
        return;
    }
    try {
        const payload = verifyFirebaseSession(token);
        req.firebaseSession = payload;
        next();
    }
    catch {
        res.status(401).json({ error: "SESSION_TOKEN_INVALID", message: "Invalid or expired session token." });
    }
}

export function requireFirebaseRole(...roles) {
    return (req, res, next) => {
        const role = String(req.firebaseSession?.role || "");
        if (!roles.includes(role)) {
            res.status(403).json({
                error: "FORBIDDEN",
                message: `Requires one of roles: ${roles.join(", ")}`,
            });
            return;
        }
        next();
    };
}

