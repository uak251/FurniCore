import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiOriginPrefix } from "@/lib/api-base";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const API = apiOriginPrefix();

export default function VerifyOtpPage() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialEmail = params.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [inlineStatus, setInlineStatus] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setInlineStatus("");
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setFieldErrors((s) => ({ ...s, email: "Invalid email format" }));
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setFieldErrors((s) => ({ ...s, code: "Invalid OTP" }));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = String(json.message || json.error || "Verification failed");
        setFieldErrors((s) => ({ ...s, code: /expired/i.test(msg) ? "OTP expired" : "Invalid OTP" }));
        return;
      }
      navigate("/login");
    } catch {
      setFieldErrors((s) => ({ ...s, code: "Verification failed. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setInlineStatus("");
    setFieldErrors((s) => ({ ...s, email: "", code: "" }));
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setFieldErrors((s) => ({ ...s, email: "Invalid email format" }));
      return;
    }
    setResending(true);
    try {
      const res = await fetch(`${API}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFieldErrors((s) => ({ ...s, code: json?.message || "Could not resend code." }));
        return;
      }
      setInlineStatus("A new 6-digit verification code has been sent to your email.");
    } catch {
      setFieldErrors((s) => ({ ...s, code: "Could not resend code. Please try again." }));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[400px]">
        <Card className="border-border/40 shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Enter verification code</CardTitle>
            <CardDescription>We sent a 6-digit code to your email. It expires in 5 minutes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {inlineStatus ? (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <AlertDescription>{inlineStatus}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((s) => ({ ...s, email: "" }));
                  }}
                  placeholder="Enter your email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={fieldErrors.email ? "border-destructive focus-visible:ring-destructive/20" : ""}
                  required
                  autoComplete="email"
                />
                {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="code">6-digit code</Label>
                <div className="flex justify-center py-1">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(val) => {
                      setCode(val.replace(/\D/g, "").slice(0, 6));
                      setFieldErrors((s) => ({ ...s, code: "" }));
                    }}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Input
                  id="code"
                  className="sr-only"
                  readOnly
                  value={code}
                />
                {fieldErrors.code ? <p className="text-sm text-destructive">{fieldErrors.code}</p> : null}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify & continue"
                )}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={resending || loading} onClick={resendCode}>
                {resending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend code
                  </>
                )}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
