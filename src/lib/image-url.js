/**
 * Resolve stored paths like `/uploads/product/uuid.jpg` for <img src>.
 * In production, prefixes with `VITE_API_URL` when the API serves files on another origin.
 * In development, keeps relative `/uploads/...` so the Vite proxy loads files (avoids mixed-content).
 */
import { apiOriginPrefix } from "./api-base";
export function resolvePublicAssetUrl(url) {
    if (url == null || url === "")
        return "";
    if (url.startsWith("http://") || url.startsWith("https://"))
        return url;
    const origin = apiOriginPrefix();
    if (origin && url.startsWith("/"))
        return `${origin}${url}`;
    return url;
}
