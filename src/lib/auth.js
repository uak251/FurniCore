import { setAuthTokenGetter } from "@workspace/api-client-react";
import { apiOriginPrefix } from "./api-base.js";

const TOKEN_KEY = "furnicore_access_token";
const REFRESH_KEY = "furnicore_refresh_token";
const TRUSTED_DEVICE_KEY = "furnicore_trusted_device_token";

let inFlightRefresh = null;

export function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}
export function setAuthToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}
export function removeAuthToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(token) {
    if (token)
        localStorage.setItem(REFRESH_KEY, token);
    else
        localStorage.removeItem(REFRESH_KEY);
}
export function removeRefreshToken() {
    localStorage.removeItem(REFRESH_KEY);
}
export function getTrustedDeviceToken() {
    return localStorage.getItem(TRUSTED_DEVICE_KEY);
}
export function setTrustedDeviceToken(token) {
    if (token)
        localStorage.setItem(TRUSTED_DEVICE_KEY, token);
    else
        localStorage.removeItem(TRUSTED_DEVICE_KEY);
}
export function removeTrustedDeviceToken() {
    localStorage.removeItem(TRUSTED_DEVICE_KEY);
}

/** Clears access + refresh tokens (e.g. logout). */
export function clearAuthStorage() {
    removeAuthToken();
    removeRefreshToken();
    removeTrustedDeviceToken();
}

/** After login, register (auto-verify), or refresh. */
export function applyAuthSession(tokens) {
    if (tokens.accessToken)
        setAuthToken(tokens.accessToken);
    if (tokens.refreshToken)
        setRefreshToken(tokens.refreshToken);
}

function decodeExp(token) {
    try {
        const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(part));
        return typeof payload.exp === "number" ? payload.exp : null;
    }
    catch {
        return null;
    }
}

function shouldProactivelyRefresh(token) {
    const exp = decodeExp(token);
    if (!exp)
        return true;
    const msLeft = exp * 1000 - Date.now();
    return msLeft < 90_000;
}

async function doRefresh() {
    const rt = getRefreshToken();
    if (!rt)
        return null;
    const API = apiOriginPrefix();
    const res = await fetch(`${API}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
        clearAuthStorage();
        return null;
    }
    const data = await res.json();
    applyAuthSession(data);
    return data.accessToken ?? null;
}

async function refreshIfNeeded() {
    let token = getAuthToken();
    if (!token)
        return null;
    if (!shouldProactivelyRefresh(token))
        return token;
    if (!inFlightRefresh) {
        inFlightRefresh = doRefresh().finally(() => {
            inFlightRefresh = null;
        });
    }
    return inFlightRefresh;
}

setAuthTokenGetter(() => refreshIfNeeded());
