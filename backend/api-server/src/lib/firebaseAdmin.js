import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { logger } from "./logger.js";

function normalizePrivateKey(raw) {
    return String(raw || "").replace(/\\n/g, "\n").trim();
}

function readServiceAccountFromEnv() {
    const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
    if (rawJson) {
        try {
            return JSON.parse(rawJson);
        }
        catch (err) {
            logger.error({ errMessage: String(err?.message || err) }, "firebase_service_account_json_invalid");
            return null;
        }
    }
    const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
    }
    return null;
}

export function getFirebaseAdminApp() {
    if (getApps().length > 0)
        return getApps()[0];
    const serviceAccount = readServiceAccountFromEnv();
    if (serviceAccount) {
        return initializeApp({
            credential: cert(serviceAccount),
        });
    }
    logger.warn("firebase_admin_using_application_default_credentials");
    return initializeApp({
        credential: applicationDefault(),
    });
}

export function getFirebaseAdminAuth() {
    return getAuth(getFirebaseAdminApp());
}

