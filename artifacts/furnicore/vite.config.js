import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
/**
 * Load repo root `.env` then `artifacts/furnicore/.env` (local overrides).
 * Ensures `VITE_API_URL` applies when set only at the monorepo root so the dev
 * proxy and `import.meta.env.VITE_API_URL` match the running API (avoids 404s
 * from proxying to the wrong host).
 */
const furnicoreDir = import.meta.dirname;
const repoRootEnv = path.resolve(furnicoreDir, "..", "..");
dotenvConfig({ path: path.join(repoRootEnv, ".env") });
dotenvConfig({ path: path.join(furnicoreDir, ".env"), override: true });
const apiUrl = process.env.VITE_API_URL ?? "http://localhost:3000";
const rawPort = process.env.PORT;
if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
}
const basePath = process.env.BASE_PATH;
if (!basePath) {
    throw new Error("BASE_PATH environment variable is required but was not provided.");
}
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
            "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
        },
        dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
        outDir: path.resolve(import.meta.dirname, "dist/public"),
        emptyOutDir: true,
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
