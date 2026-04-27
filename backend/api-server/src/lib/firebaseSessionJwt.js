import jwt from "jsonwebtoken";

const FIREBASE_SESSION_SECRET = String(process.env.FIREBASE_SESSION_SECRET || process.env.SESSION_SECRET || "").trim();
const FIREBASE_SESSION_TTL = String(process.env.FIREBASE_SESSION_TTL || "12h").trim();

function mustHaveSessionSecret() {
    if (!FIREBASE_SESSION_SECRET || FIREBASE_SESSION_SECRET.length < 16) {
        throw new Error("FIREBASE_SESSION_SECRET (or SESSION_SECRET) must be at least 16 characters");
    }
}

export function signFirebaseSession(payload) {
    mustHaveSessionSecret();
    return jwt.sign(payload, FIREBASE_SESSION_SECRET, { expiresIn: FIREBASE_SESSION_TTL });
}

export function verifyFirebaseSession(token) {
    mustHaveSessionSecret();
    return jwt.verify(token, FIREBASE_SESSION_SECRET);
}

