import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { applyAuthSession } from "@/lib/auth";
import { Hammer, Loader2, MailWarning, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiOriginPrefix } from "@/lib/api-base";

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

const API = apiOriginPrefix();

async function resendVerification(email) {
  const res = await fetch(`${API}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json;
}

function UnverifiedEmailBanner({ email }) {
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setSent(true);
      toast({ title: "Code sent", description: "Check your inbox for the 6-digit code." });
    } catch (err) {
      const msg = err?.data?.message ?? "Could not resend. Please try again.";
      toast({ variant: "destructive", title: "Failed to resend", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
      <MailWarning className="h-4 w-4 text-amber-600" />
      <AlertTitle className="font-semibold">Email not verified</AlertTitle>
      <AlertDescription className="mt-1 space-y-2">
        <p className="text-sm">
          Your account (<span className="font-medium">{email}</span>) is not verified. Enter the 6-digit
          code from your email, or request a new code.
        </p>
        <Link href={`/verify-otp?email=${encodeURIComponent(email)}`} className="text-sm font-medium underline underline-offset-2">
          Open code entry page
        </Link>
        {sent ? (
          <p className="text-sm font-medium text-green-700">A new code has been sent.</p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Sending...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Resend code
              </>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [apiReachable, setApiReachable] = useState(null);
  const [dbReachable, setDbReachable] = useState(null);
  const [twoFactorMode, setTwoFactorMode] = useState(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [setupQr, setSetupQr] = useState("");
  const [setupManualKey, setSetupManualKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const shouldCheckDbHealth = (() => {
    try {
      const base = API && API.length > 0 ? API : window.location.origin;
      const host = new URL(base).hostname;
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return false;
    }
  })();

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API}/api/healthz`)
      .then((r) => {
        if (!cancelled) setApiReachable(r.ok);
      })
      .catch(() => {
        if (!cancelled) setApiReachable(false);
      });

    if (!shouldCheckDbHealth) {
      setDbReachable(null);
      return () => {
        cancelled = true;
      };
    }

    fetch(`${API}/api/healthz/db`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setDbReachable(null);
          return;
        }
        if (r.ok) {
          setDbReachable(true);
          return;
        }
        let payload = null;
        try {
          payload = await r.json();
        } catch {
          payload = null;
        }
        setDbReachable(payload?.error === "DB_UNAVAILABLE" ? false : null);
      })
      .catch(() => {
        if (!cancelled) setDbReachable(null);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldCheckDbHealth]);

  const clearAuthError = () => {
    if (form.formState.errors.password?.message === "Incorrect email or password") {
      form.clearErrors(["email", "password"]);
    }
  };

  const completeLogin = (response) => {
    applyAuthSession(response);
    const jwtPayload = decodeJwtPayload(response.accessToken);
    const role =
      typeof response.user?.role === "string"
        ? response.user.role
        : typeof jwtPayload.role === "string"
          ? jwtPayload.role
          : "employee";
    toast({ title: "Welcome back", description: "Successfully logged in to FurniCore." });
    if (role === "supplier") setLocation("/supplier-portal");
    else if (role === "worker") setLocation("/worker-portal");
    else if (role === "customer") setLocation("/customer-portal");
    else setLocation("/");
  };

  const startTwoFactorSetup = async (token) => {
    const res = await fetch(`${API}/api/auth/2fa/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: token }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Unable to start 2FA setup.");
    setTwoFactorMode("setup");
    setSetupToken(token);
    setSetupQr(json?.data?.qrDataUrl || "");
    setSetupManualKey(json?.data?.manualKey || "");
    setOtpCode("");
    setOtpError("");
  };

  const verifyTwoFactor = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError("Invalid OTP");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const endpoint = twoFactorMode === "setup" ? "/api/auth/2fa/verify-setup" : "/api/auth/2fa/verify";
      const body =
        twoFactorMode === "setup"
          ? { setupToken, otp: otpCode }
          : { challengeToken, otp: otpCode };
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = String(json?.message || "");
        if (/expired/i.test(msg)) setOtpError("OTP expired");
        else setOtpError("Invalid OTP");
        return;
      }
      completeLogin(json);
    } finally {
      setOtpLoading(false);
    }
  };

  const onSubmit = async (values) => {
    setUnverifiedEmail(null);
    clearAuthError();
    setTwoFactorMode(null);
    setOtpError("");
    try {
      const response = await login.mutateAsync({ data: values });
      if (response?.requiresTwoFactorSetup && response?.setupToken) {
        await startTwoFactorSetup(response.setupToken);
        return;
      }
      if (response?.requiresTwoFactor && response?.challengeToken) {
        setTwoFactorMode("verify");
        setChallengeToken(response.challengeToken);
        setOtpCode("");
        setOtpError("");
        return;
      }
      completeLogin(response);
    } catch (error) {
      const status = typeof error?.status === "number" ? error.status : undefined;
      const errData = error?.data;
      const serverError = errData && typeof errData === "object" && "error" in errData ? errData.error : "";

      if (serverError === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(
          errData && typeof errData === "object" && typeof errData.email === "string"
            ? errData.email
            : values.email,
        );
        return;
      }

      if (status === 401) {
        form.setError("email", { type: "server", message: "Incorrect email or password" });
        form.setError("password", { type: "server", message: "Incorrect email or password" });
        return;
      }

      if (status !== undefined && status >= 500) {
        form.setError("password", {
          type: "server",
          message: "Authentication service is temporarily unavailable. Please try again.",
        });
        return;
      }
      if (status === 429) {
        form.setError("password", { type: "server", message: "Too many attempts. Please wait and try again." });
        return;
      }

      form.setError("password", { type: "server", message: "Incorrect email or password" });
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-md">
            <Hammer className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FurniCore</h1>
          <p className="mt-2 text-muted-foreground">Furniture manufacturing ERP</p>
        </div>

        {apiReachable === false && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Cannot reach API</AlertTitle>
            <AlertDescription className="text-sm">
              Start the API server and ensure Vite proxies to it (see repo `.env` VITE_API_URL). Sign-in
              will fail until the API is up.
            </AlertDescription>
          </Alert>
        )}

        {apiReachable !== false && dbReachable === false && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Database unavailable</AlertTitle>
            <AlertDescription className="text-sm">
              API is reachable, but database is down. Start Postgres and run migrations/seed before login.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-border/40 shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              {twoFactorMode ? "Complete two-factor verification to continue" : "Enter your credentials to access the system"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unverifiedEmail && <UnverifiedEmailBanner email={unverifiedEmail} />}
            {twoFactorMode ? (
              <div className="space-y-4">
                {twoFactorMode === "setup" && (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-medium">Set up Google Authenticator</p>
                    {setupQr ? (
                      <img src={setupQr} alt="Google Authenticator setup QR code" className="mx-auto h-40 w-40 rounded-md border bg-white p-2" />
                    ) : null}
                    <p className="text-xs text-muted-foreground">Manual key: <span className="font-mono text-foreground">{setupManualKey}</span></p>
                  </div>
                )}
                <div className="space-y-2">
                  <FormLabel htmlFor="totp-code">6-digit OTP</FormLabel>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setOtpError("");
                    }}
                    className={`text-center font-mono text-lg tracking-[0.35em] ${otpError ? "border-destructive focus-visible:ring-destructive/20" : ""}`}
                    aria-invalid={Boolean(otpError)}
                  />
                  {otpError ? <p className="text-sm text-destructive">{otpError}</p> : null}
                </div>
                <Button type="button" className="w-full" onClick={verifyTwoFactor} disabled={otpLoading}>
                  {otpLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    "Verify OTP"
                  )}
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="login-email">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="Enter your email"
                          aria-invalid={fieldState.invalid}
                          aria-describedby={fieldState.error ? "login-email-error" : undefined}
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}
                          onChange={(e) => {
                            field.onChange(e);
                            clearAuthError();
                          }}
                          value={field.value}
                          name={field.name}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          autoComplete="email"
                        />
                      </FormControl>
                      <FormMessage id="login-email-error" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="login-password">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            id="login-password"
                            type={showPw ? "text" : "password"}
                            placeholder="Enter your password"
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.error ? "login-password-error" : undefined}
                            className={`pr-10 ${fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}`}
                            onChange={(e) => {
                              field.onChange(e);
                              clearAuthError();
                            }}
                            value={field.value}
                            name={field.name}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            autoComplete="current-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground"
                            onClick={() => setShowPw((s) => !s)}
                            aria-label={showPw ? "Hide password" : "Show password"}
                          >
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage id="login-password-error" />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="mt-6 w-full" disabled={login.isPending}>
                  {login.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Authenticating...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
                <p className="text-right text-xs">
                  <Link href="/reset-password" className="text-primary hover:underline">Forgot password?</Link>
                </p>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Customer?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create a customer account →
          </Link>
        </p>
      </div>
    </div>
  );
}
