/**
 * API origin for raw `fetch` / URLs.
 *
 * In **development**, always returns `""` so calls use same-origin paths like `/api/...`
 * and hit the Vite dev proxy (see `vite.config.ts` → `server.proxy`). That avoids 404s
 * when `VITE_API_URL` pointed at the wrong port while the proxy target was correct.
 *
 * In **production**, returns `VITE_API_URL` with trailing `/api` stripped when present.
 */
export function stripTrailingApiPath(origin) {
    let base = origin.replace(/\/+$/, "");
    if (base.endsWith("/api"))
        base = base.slice(0, -4);
    return base;
}
/** Prefix before `/api/...` for manual fetch (empty string = relative to the page origin). */
export function apiOriginPrefix() {
    if (import.meta.env.DEV)
        return "";
    const raw = import.meta.env.VITE_API_URL?.trim();
    if (!raw)
        return "";
    return stripTrailingApiPath(raw);
}
/** Origin passed to `socket.io-client` `io(origin, { path: "/socket.io" })`. */
export function socketIoOrigin() {
    const raw = import.meta.env.VITE_API_URL?.trim();
    if (raw)
        return stripTrailingApiPath(raw);
    if (typeof window !== "undefined")
        return window.location.origin;
    return "http://localhost:3000";
}
