import { jsx as _jsx } from "react/jsx-runtime";
import { setBaseUrl } from "@workspace/api-client-react";
import "@/lib/auth";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { stripTrailingApiPath } from "@/lib/api-base";
/**
 * If VITE_API_URL is configured, always use it as API base (dev + prod).
 * This avoids local /api proxy 404s when backend is remote (e.g. Railway).
 */
const rawApi = import.meta.env.VITE_API_URL?.trim();
if (rawApi) {
    setBaseUrl(stripTrailingApiPath(rawApi));
}
else {
    setBaseUrl(null);
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
