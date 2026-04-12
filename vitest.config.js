import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/__tests__/setup.js"],
        css: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "json-summary"],
            include: ["src/components/**", "src/pages/login.jsx"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
        },
    },
});
