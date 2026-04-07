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
import type { EmbedConfig } from "@/hooks/use-powerbi";

// ─── powerbi-client CDN ───────────────────────────────────────────────────────
const SDK_URL = "https://cdn.jsdelivr.net/npm/powerbi-client@2.23.1/dist/powerbi.min.js";

declare global {
  interface Window {
    // Injected by powerbi-client SDK
    powerbi?: {
      embed: (
        container: HTMLElement,
        config: PowerBIEmbedConfig,
      ) => PowerBIReport;
      reset: (container: HTMLElement) => void;
    };
  }
}

interface PowerBIEmbedConfig {
  type: "report";
  id: string;
  embedUrl: string;
  accessToken: string;
  tokenType: 1; // Embed token
  settings: {
    navContentPaneEnabled: boolean;
    filterPaneEnabled: boolean;
  };
}

interface PowerBIReport {
  off: (event: string, handler: () => void) => void;
  on: (event: string, handler: (e: unknown) => void) => void;
}

// ─── SDK loader ───────────────────────────────────────────────────────────────

let sdkPromise: Promise<void> | null = null;

function loadSDK(): Promise<void> {
  if (window.powerbi) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Power BI JavaScript SDK from CDN."));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PowerBIEmbedProps {
  /** Report label for display purposes */
  label: string;
  /** Embed configuration returned by /api/powerbi/embed-token */
  config: EmbedConfig;
  /** Iframe height in px. Defaults to 600. */
  height?: number;
}

export function PowerBIEmbed({ label, config, height = 600 }: PowerBIEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<PowerBIReport | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    loadSDK()
      .then(() => {
        if (cancelled || !containerRef.current || !window.powerbi) return;

        // Reset any prior embed in this container
        window.powerbi.reset(containerRef.current);

        const embedConfig: PowerBIEmbedConfig = {
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

        reportRef.current.on("error", (e: unknown) => {
          console.error("Power BI embed error:", e);
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setSdkError(e.message);
      });

    return () => {
      cancelled = true;
      if (containerRef.current && window.powerbi) {
        window.powerbi.reset(containerRef.current);
      }
    };
  }, [config.token, config.embedUrl, config.reportId]);

  if (sdkError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-medium">Could not load Power BI SDK</p>
        <p className="max-w-sm text-sm">{sdkError}</p>
        <p className="text-xs">
          Ensure the browser can reach{" "}
          <a href={SDK_URL} target="_blank" rel="noreferrer" className="underline">
            cdn.jsdelivr.net
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Token expires:{" "}
          <span className="font-mono text-xs">
            {new Date(config.expiry).toLocaleString()}
          </span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <a
            href={`https://app.powerbi.com/groups/${config.workspaceId}/reports/${config.reportId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Power BI
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      </div>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full rounded-lg border bg-muted/20"
        aria-label={`Power BI report: ${label}`}
        role="region"
      />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function PowerBIEmbedLoading({ height = 600 }: { height?: number }) {
  return (
    <div
      className="flex w-full animate-pulse flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 text-muted-foreground"
      style={{ height }}
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">Loading Power BI report…</p>
    </div>
  );
}

// ─── Unconfigured state ───────────────────────────────────────────────────────

interface PowerBIUnconfiguredProps {
  reportId: string;
  message: string;
}

export function PowerBIUnconfigured({ reportId, message }: PowerBIUnconfiguredProps) {
  const envMap: Record<string, string> = {
    "supplier-ledger": "POWERBI_REPORT_SUPPLIER_LEDGER",
    "expense-income":  "POWERBI_REPORT_EXPENSE_INCOME",
    "payroll-summary": "POWERBI_REPORT_PAYROLL_SUMMARY",
    "profit-margin":   "POWERBI_REPORT_PROFIT_MARGIN",
  };

  const steps = [
    {
      step: "1",
      title: "Register a service principal in Azure AD",
      detail:
        "Go to Azure Portal → App registrations → New registration. " +
        "Grant it Power BI Service → Report.ReadAll (Application permission) and admin-consent it.",
    },
    {
      step: "2",
      title: "Add the service principal to your Power BI workspace",
      detail:
        'In Power BI Service, open the workspace → Settings → Access → add the app as "Member".',
    },
    {
      step: "3",
      title: "Publish your reports to the workspace",
      detail:
        "Build your report in Power BI Desktop connecting to PostgreSQL " +
        "(use DirectQuery or scheduled import). Publish to the workspace.",
    },
    {
      step: "4",
      title: "Set environment variables in .env",
      detail: `Add the following to your root .env file and restart the API server.`,
    },
  ];

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-6 py-8">
        <div className="flex items-start gap-4">
          <Settings className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-semibold">Power BI report not configured</p>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <ol className="space-y-4">
          {steps.map((s) => (
            <li key={s.step} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {s.step}
              </span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="mt-0.5 text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
          <p className="mb-1 font-semibold text-foreground">.env (root)</p>
          <pre className="whitespace-pre-wrap text-muted-foreground">{`POWERBI_TENANT_ID=<your-azure-tenant-id>
POWERBI_CLIENT_ID=<your-app-client-id>
POWERBI_CLIENT_SECRET=<your-app-client-secret>
POWERBI_WORKSPACE_ID=<your-workspace-group-id>
${envMap[reportId] ?? "POWERBI_REPORT_<NAME>"}=<report-id-from-powerbi-url>`}</pre>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal"
              target="_blank"
              rel="noreferrer"
            >
              Embed with service principal
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://app.powerbi.com"
              target="_blank"
              rel="noreferrer"
            >
              Open Power BI Service
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

export function PowerBIEmbedError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-medium">Failed to load report</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
