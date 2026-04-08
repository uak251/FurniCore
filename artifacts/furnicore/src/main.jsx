import { jsx as _jsx } from "react/jsx-runtime";
import { setBaseUrl } from "@workspace/api-client-react";
import "@/lib/auth";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { stripTrailingApiPath } from "@/lib/api-base";
/**
 * In development, keep relative `/api/...` URLs so they go through the Vite proxy
 * (single target in vite.config). Setting a base URL here would bypass the proxy and
 * hit whatever is on `VITE_API_URL` directly — a common source of 404s when the
 * port did not match the running API.
 */
const rawApi = import.meta.env.VITE_API_URL?.trim();
if (import.meta.env.PROD && rawApi) {
    setBaseUrl(stripTrailingApiPath(rawApi));
}
else {
    setBaseUrl(null);
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
