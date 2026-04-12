import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PowerBIEmbed — embeds a Power BI report using the official powerbi-client
 * JavaScript SDK loaded from CDN. Falls back to a configuration guide when
 * the report is not yet set up in .env.
 *
 * Embedding strategy: "App-owns-data" (service principal)
 *   1. Backend calls Azure AD for an AAD token (client credentials).
 *   2. Backend calls Power BI REST API GenerateToken to get an embed token.
 *   3. Frontend receives { token, embedUrl, reportId } and passes them to the
 *      powerbi-client SDK, which renders the report in an iframe it manages.
 *
 * The SDK is loaded once per page via a <script> tag appended to <head>.
 * Subsequent mounts reuse the already-loaded global `window.powerbi`.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// ─── powerbi-client CDN ───────────────────────────────────────────────────────
const SDK_URL = "https://cdn.jsdelivr.net/npm/powerbi-client@2.23.1/dist/powerbi.min.js";
// ─── SDK loader ───────────────────────────────────────────────────────────────
let sdkPromise = null;
function loadSDK() {
    if (window.powerbi)
        return Promise.resolve();
    if (sdkPromise)
        return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SDK_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Power BI JavaScript SDK from CDN."));
        document.head.appendChild(script);
    });
    return sdkPromise;
}
export function PowerBIEmbed({ label, config, height = 600 }) {
    const containerRef = useRef(null);
    const reportRef = useRef(null);
    const [sdkError, setSdkError] = useState(null);
    useEffect(() => {
        if (!containerRef.current)
            return;
        let cancelled = false;
        loadSDK()
            .then(() => {
            if (cancelled || !containerRef.current || !window.powerbi)
                return;
            // Reset any prior embed in this container
            window.powerbi.reset(containerRef.current);
            const embedConfig = {
                type: "report",
                id: config.reportId,
                embedUrl: config.embedUrl,
                accessToken: config.token,
                tokenType: 1,
                settings: {
                    navContentPaneEnabled: true,
                    filterPaneEnabled: true,
                },
            };
            reportRef.current = window.powerbi.embed(containerRef.current, embedConfig);
            reportRef.current.on("error", (e) => {
                console.error("Power BI embed error:", e);
            });
        })
            .catch((e) => {
            if (!cancelled)
                setSdkError(e.message);
        });
        return () => {
            cancelled = true;
            if (containerRef.current && window.powerbi) {
                window.powerbi.reset(containerRef.current);
            }
        };
    }, [config.token, config.embedUrl, config.reportId]);
    if (sdkError) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-3 py-12 text-center text-muted-foreground", children: [_jsx(AlertCircle, { className: "h-8 w-8 text-destructive" }), _jsx("p", { className: "font-medium", children: "Could not load Power BI SDK" }), _jsx("p", { className: "max-w-sm text-sm", children: sdkError }), _jsxs("p", { className: "text-xs", children: ["Ensure the browser can reach", " ", _jsx("a", { href: SDK_URL, target: "_blank", rel: "noreferrer", className: "underline", children: "cdn.jsdelivr.net" }), "."] })] }));
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Token expires:", " ", _jsx("span", { className: "font-mono text-xs", children: new Date(config.expiry).toLocaleString() })] }), _jsx(Button, { variant: "ghost", size: "sm", asChild: true, className: "gap-1.5 text-xs text-muted-foreground", children: _jsxs("a", { href: `https://app.powerbi.com/groups/${config.workspaceId}/reports/${config.reportId}`, target: "_blank", rel: "noreferrer", children: ["Open in Power BI", _jsx(ExternalLink, { className: "h-3 w-3" })] }) })] }), _jsx("div", { ref: containerRef, style: { height }, className: "w-full rounded-lg border bg-muted/20", "aria-label": `Power BI report: ${label}`, role: "region" })] }));
}
// ─── Loading skeleton ─────────────────────────────────────────────────────────
export function PowerBIEmbedLoading({ height = 600 }) {
    return (_jsxs("div", { className: "flex w-full animate-pulse flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 text-muted-foreground", style: { height }, children: [_jsx(Loader2, { className: "h-6 w-6 animate-spin" }), _jsx("p", { className: "text-sm", children: "Loading Power BI report\u2026" })] }));
}
export function PowerBIUnconfigured({ reportId, message }) {
    const envMap = {
        "supplier-ledger": "POWERBI_REPORT_SUPPLIER_LEDGER",
        "expense-income": "POWERBI_REPORT_EXPENSE_INCOME",
        "payroll-summary": "POWERBI_REPORT_PAYROLL_SUMMARY",
        "profit-margin": "POWERBI_REPORT_PROFIT_MARGIN",
    };
    const steps = [
        {
            step: "1",
            title: "Register a service principal in Azure AD",
            detail: "Go to Azure Portal → App registrations → New registration. " +
                "Grant it Power BI Service → Report.ReadAll (Application permission) and admin-consent it.",
        },
        {
            step: "2",
            title: "Add the service principal to your Power BI workspace",
            detail: 'In Power BI Service, open the workspace → Settings → Access → add the app as "Member".',
        },
        {
            step: "3",
            title: "Publish your reports to the workspace",
            detail: "Build your report in Power BI Desktop connecting to PostgreSQL " +
                "(use DirectQuery or scheduled import). Publish to the workspace.",
        },
        {
            step: "4",
            title: "Set environment variables in .env",
            detail: `Add the following to your root .env file and restart the API server.`,
        },
    ];
    return (_jsx(Card, { className: "border-dashed", children: _jsxs(CardContent, { className: "space-y-6 py-8", children: [_jsxs("div", { className: "flex items-start gap-4", children: [_jsx(Settings, { className: "mt-0.5 h-6 w-6 shrink-0 text-muted-foreground", "aria-hidden": true }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: "Power BI report not configured" }), _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: message })] })] }), _jsx("ol", { className: "space-y-4", children: steps.map((s) => (_jsxs("li", { className: "flex gap-3 text-sm", children: [_jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary", children: s.step }), _jsxs("div", { children: [_jsx("p", { className: "font-medium", children: s.title }), _jsx("p", { className: "mt-0.5 text-muted-foreground", children: s.detail })] })] }, s.step))) }), _jsxs("div", { className: "rounded-md bg-muted p-4 font-mono text-xs leading-relaxed", children: [_jsx("p", { className: "mb-1 font-semibold text-foreground", children: ".env (root)" }), _jsx("pre", { className: "whitespace-pre-wrap text-muted-foreground", children: `POWERBI_TENANT_ID=<your-azure-tenant-id>
POWERBI_CLIENT_ID=<your-app-client-id>
POWERBI_CLIENT_SECRET=<your-app-client-secret>
POWERBI_WORKSPACE_ID=<your-workspace-group-id>
${envMap[reportId] ?? "POWERBI_REPORT_<NAME>"}=<report-id-from-powerbi-url>` })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { variant: "outline", size: "sm", asChild: true, children: _jsxs("a", { href: "https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal", target: "_blank", rel: "noreferrer", children: ["Embed with service principal", _jsx(ExternalLink, { className: "ml-1.5 h-3 w-3" })] }) }), _jsx(Button, { variant: "outline", size: "sm", asChild: true, children: _jsxs("a", { href: "https://app.powerbi.com", target: "_blank", rel: "noreferrer", children: ["Open Power BI Service", _jsx(ExternalLink, { className: "ml-1.5 h-3 w-3" })] }) })] })] }) }));
}
// ─── Error state ──────────────────────────────────────────────────────────────
export function PowerBIEmbedError({ message, onRetry, }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 py-12 text-center", children: [_jsx(AlertCircle, { className: "h-8 w-8 text-destructive", "aria-hidden": true }), _jsx("p", { className: "font-medium", children: "Failed to load report" }), _jsx("p", { className: "max-w-sm text-sm text-muted-foreground", children: message }), _jsx(Button, { variant: "outline", size: "sm", onClick: onRetry, children: "Try again" })] }));
}
