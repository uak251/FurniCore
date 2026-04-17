import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { applyAuthSession, getTrustedDeviceToken, removeTrustedDeviceToken, setTrustedDeviceToken } from "@/lib/auth";
import { Loader2, MailWarning, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiOriginPrefix, resolveApiUrl } from "@/lib/api-base";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { AuthBackdrop } from "@/components/branding/AuthBackdrop";
import { DsButton } from "@/components/design-system/DsButton";
import { DsInput } from "@/components/design-system/DsInput";
import { DsCard } from "@/components/design-system/DsCard";
import { Chrome, Facebook } from "lucide-react";

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

const API = apiOriginPrefix();

/** Full URL to begin OAuth (must match API callback registration in dev vs prod). */
function oauthStartUrl(provider) {
  if (typeof window === "undefined")
    return `/api/auth/oauth/${provider}/start`;
  if (import.meta.env.DEV)
    return `${window.location.origin}/api/auth/oauth/${provider}/start`;
  const base = (API || window.location.origin || "").replace(/\/+$/, "");
  return `${base}/api/auth/oauth/${provider}/start`;
}

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
  identifier: z.string().min(1, "Email or username is required"),
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
  const [backupCode, setBackupCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [otpInfo, setOtpInfo] = useState("");
  const [oauthProviders, setOauthProviders] = useState({ google: false, facebook: false });

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
    defaultValues: { identifier: "", password: "" },
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

  useEffect(() => {
    let cancelled = false;
    fetch(resolveApiUrl("/api/auth/oauth/providers"))
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j && typeof j === "object") {
          setOauthProviders({ google: Boolean(j.google), facebook: Boolean(j.facebook) });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("oauth") === "error") {
      const raw = sp.get("message") || "sign_in_failed";
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        /* ignore */
      }
      toast({ variant: "destructive", title: "OAuth sign-in", description: decoded });
      window.history.replaceState({}, "", "/login");
    }
  }, [toast]);

  const clearAuthError = () => {
    if (
      form.formState.errors.password?.message === "Incorrect email or password" ||
      form.formState.errors.password?.message === "Invalid credentials"
    ) {
      form.clearErrors(["identifier", "password"]);
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
    setOtpInfo("");
  };

  const verifyTwoFactor = async () => {
    if (useBackupCode) {
      if (backupCode.trim().length < 8) {
        setOtpError("Invalid backup code");
        return;
      }
    } else {
      if (!/^\d{6}$/.test(otpCode)) {
        setOtpError("Invalid OTP");
        return;
      }
    }
    setOtpLoading(true);
    setOtpError("");
    setOtpInfo("");
    try {
      const endpoint = twoFactorMode === "setup" ? "/api/auth/2fa/verify-setup" : "/api/auth/2fa/verify";
      const body =
        twoFactorMode === "setup"
          ? { setupToken, otp: otpCode }
          : useBackupCode
            ? { challengeToken, backupCode: backupCode.trim() }
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
        else if (/backup/i.test(msg)) setOtpError("Invalid backup code");
        else setOtpError("Invalid OTP");
        return;
      }
      if (json?.trustedDeviceToken) {
        setTrustedDeviceToken(json.trustedDeviceToken);
      } else if (!rememberDevice) {
        removeTrustedDeviceToken();
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
    setOtpInfo("");
    try {
      const rememberedDeviceToken = getTrustedDeviceToken();
      const response = await login.mutateAsync({
        data: {
          email: values.identifier,
          password: values.password,
          rememberDevice,
          rememberedDeviceToken: rememberedDeviceToken || undefined,
          deviceName: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "Browser device",
        },
      });
      if (response?.requiresTwoFactorSetup && response?.setupToken) {
        await startTwoFactorSetup(response.setupToken);
        return;
      }
      if (response?.requiresTwoFactor && response?.challengeToken) {
        setTwoFactorMode("verify");
        setChallengeToken(response.challengeToken);
        setOtpCode("");
        setBackupCode("");
        setUseBackupCode(false);
        setOtpError("");
        if (response?.mode === "email-otp" || /otp sent/i.test(String(response?.message || ""))) {
          setOtpInfo("OTP sent to your email");
        }
        return;
      }
      if (response?.trustedDeviceAccepted) {
        setOtpError("");
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
            : values.identifier,
        );
        return;
      }

      if (status === 401) {
        form.setError("identifier", { type: "server", message: "Invalid credentials" });
        form.setError("password", { type: "server", message: "Invalid credentials" });
        return;
      }

      if (status !== undefined && status >= 500) {
        const bodyMsg =
          errData && typeof errData === "object" && typeof errData.message === "string"
            ? errData.message.trim()
            : "";
        const combined = `${String(serverError || "")} ${bodyMsg}`.toLowerCase();
        const looksLikeConfig = /auth_config|misconfig/i.test(combined);
        const looksLikeSchema = /failed query|column .* does not exist|relation .* does not exist/i.test(combined);
        const looksLikeDb =
          status === 503
          || /auth_db|unavailable|database|connection|econnrefused|terminat/i.test(combined);
        const genericServerMsg = !bodyMsg || /^something went wrong$/i.test(bodyMsg);
        let msg500 = genericServerMsg
          ? "Sign-in failed due to a server error. Confirm the API is running and try again."
          : bodyMsg.slice(0, 280);
        if (looksLikeConfig) {
          msg500 = "Server authentication is misconfigured (database URL or secrets). Check the API .env and restart.";
        }
        else if (looksLikeSchema) {
          msg500 = "Database schema error during sign-in. Run migrations for the API database, then retry.";
        }
        else if (looksLikeDb) {
          msg500 = "Authentication service is temporarily unavailable. Please try again in a moment.";
        }
        form.setError("password", { type: "server", message: msg500 });
        return;
      }
      if (status === 429) {
        form.setError("password", { type: "server", message: "Too many attempts. Please wait and try again." });
        return;
      }

      form.setError("password", { type: "server", message: "Invalid credentials" });
    }
  };

  return (
    <AuthBackdrop>
      <div className="w-full max-w-[460px] px-1 sm:px-0">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo imageClassName="h-14 w-14 shadow-lg" />
          <h1 className="mt-4 text-white">Welcome to FurniCore</h1>
          <p className="mt-2 text-sm text-slate-200">Secure sign-in to your workspace</p>
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

        <DsCard className="border-white/20 bg-white/92 backdrop-blur-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="ds-auth-heading text-center">Sign in</CardTitle>
            <CardDescription>
              {twoFactorMode ? "Complete two-factor verification to continue" : "Enter your credentials to access the system"}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
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
                  <div className="space-y-3">
                  {otpInfo ? <p className="text-sm text-muted-foreground">{otpInfo}</p> : null}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="totp-code">{useBackupCode ? "Backup code" : "6-digit OTP"}</Label>
                    {twoFactorMode === "verify" ? (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          setUseBackupCode((v) => !v);
                          setOtpError("");
                        }}
                      >
                        {useBackupCode ? "Use authenticator code" : "Use backup code"}
                      </button>
                    ) : null}
                  </div>
                  {useBackupCode && twoFactorMode === "verify" ? (
                    <Input
                      id="backup-code"
                      placeholder="ABCDE-12345"
                      value={backupCode}
                      onChange={(e) => {
                        setBackupCode(e.target.value.toUpperCase());
                        setOtpError("");
                      }}
                      className={otpError ? "border-destructive focus-visible:ring-destructive/20" : ""}
                      aria-invalid={Boolean(otpError)}
                    />
                  ) : (
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
                  )}
                  {otpError ? <p className="text-sm text-destructive">{otpError}</p> : null}
                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="remember-device"
                      checked={rememberDevice}
                      onCheckedChange={(checked) => setRememberDevice(Boolean(checked))}
                    />
                    <label htmlFor="remember-device" className="pt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Remember this device for up to 30 days. Do not use on shared computers.
                    </label>
                  </div>
                </div>
                <Button type="button" className="touch-target w-full" onClick={verifyTwoFactor} disabled={otpLoading}>
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
                <div className="ds-stack-md pb-1">
                  <DsButton type="button" intent="primary" onClick={() => setLocation("/signup")} className="!bg-[hsl(var(--ds-brand-alt))]">
                    Continue with shop
                  </DsButton>
                  <div className="grid grid-cols-2 gap-2">
                    <DsButton
                      type="button"
                      intent="social"
                      variant="outline"
                      disabled={!oauthProviders.google}
                      title={
                        oauthProviders.google
                          ? "Continue with your Google account"
                          : "Google sign-in is not configured on this server (GOOGLE_OAUTH_CLIENT_ID / SECRET)."
                      }
                      onClick={() => {
                        if (!oauthProviders.google) {
                          toast({ title: "Google sign-in unavailable", description: "OAuth is not configured for this deployment." });
                          return;
                        }
                        window.location.href = oauthStartUrl("google");
                      }}
                    >
                      <Chrome className="mr-2 h-4 w-4" aria-hidden />
                      Google
                    </DsButton>
                    <DsButton
                      type="button"
                      intent="social"
                      variant="outline"
                      disabled={!oauthProviders.facebook}
                      title={
                        oauthProviders.facebook
                          ? "Continue with Facebook (Meta) login"
                          : "Facebook sign-in is not configured (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)."
                      }
                      onClick={() => {
                        if (!oauthProviders.facebook) {
                          toast({ title: "Facebook sign-in unavailable", description: "OAuth is not configured for this deployment." });
                          return;
                        }
                        window.location.href = oauthStartUrl("facebook");
                      }}
                    >
                      <Facebook className="mr-2 h-4 w-4" aria-hidden />
                      Facebook
                    </DsButton>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="identifier"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="login-email">Email</FormLabel>
                      <FormControl>
                        <DsInput
                          id="login-email"
                          type="text"
                          placeholder="Email"
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
                          autoComplete="username"
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
                        <DsInput
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
                            className="touch-target absolute right-0 top-0 h-10 w-10 text-muted-foreground"
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

                <DsButton type="submit" intent="primary" className="mt-6" disabled={login.isPending}>
                  {login.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Authenticating...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </DsButton>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <Link href="/verify-otp" className="text-primary hover:underline">Verify email code</Link>
                  <Link href="/verify-email" className="text-primary hover:underline">Verify via email link</Link>
                  <Link href="/reset-password" className="text-primary hover:underline">Forgot password?</Link>
                </div>
                <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  By continuing, you agree to FurniCore terms and can finish verification in sign-in or from email links.
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="remember-device-login"
                    checked={rememberDevice}
                    onCheckedChange={(checked) => setRememberDevice(Boolean(checked))}
                  />
                  <label htmlFor="remember-device-login" className="pt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Remember this device (skip OTP on future sign-ins for up to 30 days)
                  </label>
                </div>
                </form>
              </Form>
            )}
          </CardContent>
        </DsCard>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Customer?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create a customer account →
          </Link>
        </p>
      </div>
    </AuthBackdrop>
  );
}
