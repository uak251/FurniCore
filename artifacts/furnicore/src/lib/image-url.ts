/**
 * Resolve stored paths like `/uploads/product/uuid.jpg` for <img src>.
 * In production, prefix with the API origin when the app and API differ. In dev,
 * same-origin relative paths hit the Vite proxy for `/uploads`.
 */
import { apiOriginPrefix } from "./api-base";

const API_ORIGIN = apiOriginPrefix();

export function resolvePublicAssetUrl(url: string | null | undefined): string {
  if (url == null || url === "") return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (API_ORIGIN && url.startsWith("/")) return `${API_ORIGIN}${url}`;
  return url;
}
