import { config as dotenvConfig } from "dotenv";
import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
/**
 * Load monorepo root `.env` when this app lives under FurniCore, else app-root `.env` only.
 * Local `frontend/furnicore/.env` (or repo-root `.env` when standalone) overrides.
 */
const furnicoreDir = import.meta.dirname;
const monorepoRoot = path.resolve(furnicoreDir, "..", "..");
const isMonorepoChild = fs.existsSync(path.join(monorepoRoot, "pnpm-workspace.yaml"));
if (isMonorepoChild) {
    dotenvConfig({ path: path.join(monorepoRoot, ".env") });
}
dotenvConfig({ path: path.join(furnicoreDir, ".env"), override: true });
/**
 * Express API origin for Vite `server.proxy` (paths `/api`, `/uploads`, `/socket.io`).
 * - If `VITE_API_URL` is set (e.g. `http://localhost:3000/api`), the origin is used.
 * - If unset or blank, default to `VITE_DEV_API_ORIGIN` or `http://127.0.0.1:3000` (api-server default PORT).
 *   Use `VITE_DEV_API_ORIGIN` when the API runs on a different host/port than this default.
 * - Avoid `VITE_API_URL=""` in .env: empty string is not replaced by `??` and breaks the proxy.
 */
const viteApiEnv = (process.env.VITE_API_URL ?? "").trim();
const apiUrlRaw = viteApiEnv || (process.env.VITE_DEV_API_ORIGIN ?? "").trim() || "http://127.0.0.1:3000";
const apiUrl = apiUrlRaw.replace(/\/+$/, "").replace(/\/api$/i, "");
const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
}
const basePath = process.env.BASE_PATH ?? "/";
const attachedAssetsRoot = isMonorepoChild
    ? path.resolve(furnicoreDir, "..", "..", "attached_assets")
    : path.resolve(furnicoreDir, "public", "attached_assets");
export default defineConfig({
    base: basePath,
    plugins: [
        react(),
        tailwindcss(),
        runtimeErrorOverlay(),
        ...(process.env.NODE_ENV !== "production" &&
            process.env.REPL_ID !== undefined
            ? [
                await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer({
                    root: path.resolve(import.meta.dirname, ".."),
                })),
                await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
            ]
            : []),
    ],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            "@assets": attachedAssetsRoot,
        },
        dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
        outDir: path.resolve(import.meta.dirname, "dist/public"),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules")) {
                        if (id.includes("react") || id.includes("wouter")) {
                            return "vendor-react";
                        }
                        if (id.includes("@tanstack/react-query")) {
                            return "vendor-query";
                        }
                        if (id.includes("recharts")) {
                            return "vendor-charts";
                        }
                    }
                },
            },
        },
    },
    server: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
        proxy: {
            "/api": {
                target: apiUrl,
                changeOrigin: true,
            },
            // Express serves uploaded images at /uploads/* — same origin as API
            "/uploads": {
                target: apiUrl,
                changeOrigin: true,
            },
            // Socket.io (low-stock alerts) when the client uses same-origin in dev
            "/socket.io": {
                target: apiUrl,
                changeOrigin: true,
                ws: true,
            },
        },
        fs: {
            strict: true,
            deny: ["**/.*"],
        },
    },
    preview: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
        proxy: {
            "/api": { target: apiUrl, changeOrigin: true },
            "/uploads": { target: apiUrl, changeOrigin: true },
            "/socket.io": { target: apiUrl, changeOrigin: true, ws: true },
        },
    },
});
