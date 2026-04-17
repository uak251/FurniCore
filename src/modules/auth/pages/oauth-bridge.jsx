import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { applyAuthSession } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { Loader2 } from "lucide-react";

export default function OauthBridge() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("Completing sign-in…");
  const API = apiOriginPrefix();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      setStatus("Missing login code.");
      const t = setTimeout(() => setLocation("/login?oauth=error&message=missing_code"), 1800);
      return () => clearTimeout(t);
    }
    // In Vite dev, same-origin `/api` hits the proxy — avoids CORS when VITE_API_URL points at :3000.
    const url = import.meta.env.DEV
        ? "/api/auth/oauth/exchange"
        : `${(API || "").replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin : "")}/api/auth/oauth/exchange`;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || json?.error || "Sign-in exchange failed");
        if (cancelled) return;
        applyAuthSession(json);
        const role = json.user?.role;
        if (role === "customer") setLocation("/customer-portal");
        else if (role === "supplier") setLocation("/supplier-portal");
        else if (role === "worker") setLocation("/worker-portal");
        else setLocation("/");
      }
      catch (e) {
        if (cancelled) return;
        setStatus(e?.message || "Could not complete sign-in.");
        setTimeout(() => setLocation("/login?oauth=error"), 2200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API, setLocation]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-background p-8">
      <Loader2 className="h-10 w-10 animate-spin text-emerald-700" aria-hidden />
      <p className="max-w-sm text-center text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
