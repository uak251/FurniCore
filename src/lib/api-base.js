import { getFrontendApiUrl } from "@/config/env";

/**
 * API origin helpers for `fetch`, uploads, and Socket.io.
 *
 * `apiOriginPrefix` (used for `/uploads/...` images): uses `VITE_API_URL` when set
 * so `<img src>` can be absolute `https://.../uploads/...`. If unset in development,
 * returns `""` so assets stay same-origin and use the Vite proxy.
 */
export function stripTrailingApiPath(origin) {
    let base = origin.replace(/\/+$/, "");
    if (base.endsWith("/api"))
        base = base.slice(0, -4);
    return base;
}
/**
 * Prefix for static assets under `/uploads/...` (see `resolvePublicAssetUrl`).
 *
 * In **production**, uses `VITE_API_URL` (trailing `/api` stripped) so `<img src>`
 * can be absolute `https://api.example.com/uploads/...` when the SPA and API
 * differ.
 *
 * In **development**, always returns `""` so images stay same-origin as the Vite
 * dev server and use `server.proxy` for `/uploads`. Prefixing with `http://`
 * from `VITE_API_URL` here would break thumbnails when the page is served over
 * **HTTPS** (mixed-content blocking).
 */
export function apiOriginPrefix() {
    const raw = getFrontendApiUrl();
    if (!raw) {
        if (import.meta.env.DEV)
            return "";
        return "";
    }
    return stripTrailingApiPath(raw);
}
/** Origin passed to `socket.io-client` `io(origin, { path: "/socket.io" })`. */
export function socketIoOrigin() {
    const raw = getFrontendApiUrl();
    if (raw)
        return stripTrailingApiPath(raw);
    if (typeof window !== "undefined")
        return window.location.origin;
    return "http://localhost:3000";
}
