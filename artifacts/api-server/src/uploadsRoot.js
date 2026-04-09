/**
 * Single source of truth for `api-server/uploads/`.
 *
 * Multer and `express.static` must share this path. When the app is bundled into
 * `dist/index.mjs`, `import.meta.url` resolves to that file (`dirname` = `dist`);
 * one `..` reaches the api-server root. (The old `middlewares/upload.js` path used
 * two `..` from `dist`, which pointed at `artifacts/uploads/` — files were saved
 * next to `api-server/` while `/uploads` was served from `api-server/uploads/`.)
 */
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = join(here, "..", "uploads");
