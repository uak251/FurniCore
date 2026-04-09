/**
 * Multer upload middleware for record images.
 *
 * Default: files on disk under the api-server uploads/ folder per entityType,
 * served by Express at /uploads/... — URLs persisted in PostgreSQL (`record_images`, Drizzle).
 * Optional cloud storage (e.g. AWS S3) can be added by swapping storage engine and storing
 * public URLs in `record_images.url` instead of /uploads paths.
 *
 * Constraints:
 *   - Max file size : 8 MB
 *   - Allowed types : image/jpeg, image/png, image/webp, image/gif
 *   - Max files per request : 10
 */
import multer from "multer";
import { mkdirSync } from "fs";
import { join, extname } from "path";
import { v4 as uuidv4 } from "uuid";
import { UPLOADS_ROOT } from "../uploadsRoot.js";
export { UPLOADS_ROOT };
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const storage = multer.diskStorage({
    destination(req, _file, cb) {
        const rawEntity = req.params["entityType"];
        const entity = (Array.isArray(rawEntity) ? rawEntity[0] : rawEntity ?? "misc").replace(/[^a-zA-Z0-9_-]/g, "");
        const dir = join(UPLOADS_ROOT, entity);
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename(_req, file, cb) {
        const ext = extname(file.originalname).toLowerCase() || ".jpg";
        cb(null, `${uuidv4()}${ext}`);
    },
});
function fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif.`));
    }
}
export const uploadSingle = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE_BYTES } }).single("image");
export const uploadMulti = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE_BYTES, files: 10 } }).array("images", 10);
