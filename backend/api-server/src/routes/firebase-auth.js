import { Router } from "express";
import { signFirebaseSession } from "../lib/firebaseSessionJwt.js";
import { requireFirebaseRole, verifyFirebaseSessionJwt, verifyFirebaseToken } from "../middlewares/firebaseAuth.js";

const router = Router();

function normalizeRole(rawRole) {
    const role = String(rawRole || "").trim().toLowerCase();
    const allowed = new Set(["admin", "manager", "employee", "customer", "supplier"]);
    if (allowed.has(role))
        return role;
    return "customer";
}

/**
 * JWT session handling:
 * Exchange Firebase ID token for backend session JWT used by protected API routes.
 */
router.post("/auth/firebase/session", verifyFirebaseToken, (req, res) => {
    const firebaseUser = req.firebaseUser;
    const role = normalizeRole(firebaseUser?.role ?? firebaseUser?.claims?.role ?? req.body?.role);
    const sessionToken = signFirebaseSession({
        uid: firebaseUser.uid,
        email: firebaseUser.email || null,
        phoneNumber: firebaseUser.phone_number || null,
        role,
    });
    res.status(200).json({
        message: "Firebase token verified. Session created.",
        sessionToken,
        user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email || null,
            phoneNumber: firebaseUser.phone_number || null,
            role,
        },
    });
});

/**
 * Protected route example (requires backend session JWT).
 */
router.get("/firebase/protected", verifyFirebaseSessionJwt, (req, res) => {
    res.status(200).json({
        message: "You can access protected data.",
        session: req.firebaseSession,
    });
});

/**
 * Role-based access example: only admin.
 */
router.get("/firebase/admin-only", verifyFirebaseSessionJwt, requireFirebaseRole("admin"), (req, res) => {
    res.status(200).json({
        message: "Admin resource granted.",
        session: req.firebaseSession,
    });
});

export default router;

