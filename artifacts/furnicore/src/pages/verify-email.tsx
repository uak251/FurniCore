/**
 * /verify-email?token=<JWT>
 *
 * This page is reached when the user clicks the link in the verification email.
 * It calls GET /api/auth/verify-email?token=… and renders one of three states:
 *   • verifying  — spinner while the request is in flight
 *   • success    — green confirmation with a "Go to login" button
 *   • error      — red error card with a "Resend" option
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Hammer, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/* ─── API helpers ─────────────────────────────────────────────────────────── */

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await fetch(`${API}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json;
}

async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API}/api/auth/resend-verification`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json;
}

/* ─── Sub-states ─────────────────────────────────────────────────────────── */

function Verifying() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-lg font-medium">Verifying your email…</p>
      <p className="text-sm text-muted-foreground">This should only take a moment.</p>
    </div>
  );
}

function VerifySuccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      <div className="rounded-full bg-green-100 p-4">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Email verified!</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs">
          {message}
        </p>
      </div>
      <Button asChild className="mt-2">
        <Link href="/login">Continue to Sign In</Link>
      </Button>
    </div>
  );
}

function VerifyError({
  message,
  onResent,
}: {
  message: string;
  onResent: () => void;
}) {
  const { toast } = useToast();
  const [email,     setEmail]     = useState("");
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email.includes("@")) {
      toast({ variant: "destructive", title: "Enter your email first" });
      return;
    }
    setResending(true);
    try {
      await resendVerification(email);
      toast({ title: "New link sent", description: "Check your inbox." });
      onResent();
    } catch (err: any) {
      const msg = err?.data?.message ?? "Could not resend. Please try again shortly.";
      toast({ variant: "destructive", title: "Failed to resend", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <XCircle className="h-12 w-12 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Verification failed</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs">
          {message}
        </p>
      </div>

      {/* Resend form */}
      <div className="w-full space-y-2 mt-2">
        <p className="text-sm text-muted-foreground">
          Enter your email to get a new verification link:
        </p>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          className="w-full"
          variant="outline"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" /> Resend verification email</>
          )}
        </Button>
      </div>

      <Button variant="ghost" asChild>
        <Link href="/login">Back to Sign In</Link>
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main VerifyEmail page
   ═══════════════════════════════════════════════════════════════════════════ */

type State =
  | { status: "verifying" }
  | { status: "success"; message: string }
  | { status: "error";   message: string }
  | { status: "resent" };

export default function VerifyEmailPage() {
  const [location]        = useLocation();
  const [state, setState] = useState<State>({ status: "verifying" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");

    if (!token) {
      setState({ status: "error", message: "No verification token found in the URL. Please use the link from your email." });
      return;
    }

    verifyEmail(token)
      .then((res) => setState({ status: "success", message: res.message }))
      .catch((err) => {
        const msg =
          err?.data?.message ??
          "This verification link is invalid or has expired. Please request a new one.";
        setState({ status: "error", message: msg });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-md">
            <Hammer className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FurniCore</h1>
          <p className="text-muted-foreground mt-2">Precision ERP for Manufacturing</p>
        </div>

        <Card className="border-border/40 shadow-xl">
          <CardContent className="px-8">
            {state.status === "verifying" && <Verifying />}
            {state.status === "success"   && <VerifySuccess message={state.message} />}
            {state.status === "error"     && (
              <VerifyError
                message={state.message}
                onResent={() => setState({ status: "resent" })}
              />
            )}
            {state.status === "resent" && (
              <VerifySuccess message="A new verification link has been sent to your inbox. Click the link in that email to activate your account." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
