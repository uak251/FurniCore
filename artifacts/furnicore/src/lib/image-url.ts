/**
 * Resolve stored paths like `/uploads/product/uuid.jpg` for <img src>.
 * When VITE_API_URL points at the API host (e.g. dev cross-origin), prefix it
 * so assets load from the Express static handler instead of the Vite dev server.
 */
const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export function resolvePublicAssetUrl(url: string | null | undefined): string {
  if (url == null || url === "") return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (API_ORIGIN && url.startsWith("/")) return `${API_ORIGIN}${url}`;
  return url;
}
