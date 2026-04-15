import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, KeyRound, Mail } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiOriginPrefix } from "@/lib/api-base";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { AuthBackdrop } from "@/components/branding/AuthBackdrop";

const API = apiOriginPrefix();

const emailSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = useMemo(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    return (params.get("token") ?? "").trim();
  }, []);
  const hasToken = token.length >= 20;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestSent, setRequestSent] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [inlineStatus, setInlineStatus] = useState("");

  const submitForgot = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setInlineStatus("");

    const parsed = emailSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.issues[0]?.message ?? "Invalid email format" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFieldErrors({ email: json?.message || "Failed to request password reset." });
        return;
      }
      setRequestSent(true);
      setInlineStatus("If that account exists, a reset link has been generated.");
    } catch (error) {
      setFieldErrors({ email: error instanceof Error ? error.message : "Failed to request password reset." });
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setInlineStatus("");

    const parsed = passwordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const nextErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] || "password";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Could not reset password.");
      }
      setPasswordReset(true);
      setInlineStatus(json?.message || "Please sign in with your new password.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reset password.";
      setFieldErrors({ password: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackdrop>
      <div className="w-full max-w-[460px] px-1 sm:px-0">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo imageClassName="h-14 w-14 shadow-lg" />
          <h1 className="mt-4 text-white">Password recovery</h1>
          <p className="mt-2 text-sm text-slate-200">Reset access securely in a few steps</p>
        </div>

        <Card className="saas-surface-strong border-white/20 bg-white/92 shadow-2xl backdrop-blur-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              {hasToken ? <KeyRound className="h-6 w-6 text-primary" /> : <Mail className="h-6 w-6 text-primary" />}
            </div>
            <CardTitle className="saas-title text-center">{hasToken ? "Set a new password" : "Forgot your password?"}</CardTitle>
            <CardDescription>
              {hasToken
                ? "Enter your new password to complete reset."
                : "Enter your account email and we'll generate a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
            {hasToken ? (
              passwordReset ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">Your password has been reset successfully.</p>
                  <Button className="touch-target w-full" onClick={() => navigate("/login")}>
                    Go to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={submitReset} className="space-y-4">
                  {inlineStatus ? (
                    <Alert className="border-green-200 bg-green-50 text-green-800">
                      <AlertDescription>{inlineStatus}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldErrors((s) => ({ ...s, password: "" }));
                      }}
                      aria-invalid={Boolean(fieldErrors.password)}
                      className={fieldErrors.password ? "border-destructive focus-visible:ring-destructive/20" : ""}
                      autoComplete="new-password"
                    />
                    {fieldErrors.password ? <p className="text-sm text-destructive">{fieldErrors.password}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirm-new-password">Confirm new password</Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors((s) => ({ ...s, confirmPassword: "" }));
                      }}
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      className={fieldErrors.confirmPassword ? "border-destructive focus-visible:ring-destructive/20" : ""}
                      autoComplete="new-password"
                    />
                    {fieldErrors.confirmPassword ? <p className="text-sm text-destructive">{fieldErrors.confirmPassword}</p> : null}
                  </div>
                  <Button type="submit" className="touch-target w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                </form>
              )
            ) : (
              <form onSubmit={submitForgot} className="space-y-4">
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
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((s) => ({ ...s, email: "" }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    className={fieldErrors.email ? "border-destructive focus-visible:ring-destructive/20" : ""}
                    autoComplete="email"
                  />
                  {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
                </div>
                <Button type="submit" className="touch-target w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
                {requestSent ? (
                  <p className="text-sm text-center text-muted-foreground">
                    Request received. Check your email or server logs for the reset token link.
                  </p>
                ) : null}
              </form>
            )}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthBackdrop>
  );
}
