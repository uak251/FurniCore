import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck, RefreshCw, Chrome, Facebook } from "lucide-react";
import { applyAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiOriginPrefix, resolveApiUrl } from "@/lib/api-base";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { AuthBackdrop } from "@/components/branding/AuthBackdrop";
import { DsButton } from "@/components/design-system/DsButton";
import { DsInput } from "@/components/design-system/DsInput";
import { DsCard } from "@/components/design-system/DsCard";
import { useToast } from "@/hooks/use-toast";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const API = apiOriginPrefix();

function oauthStartUrl(provider) {
  if (typeof window === "undefined")
    return `/api/auth/oauth/${provider}/start`;
  if (import.meta.env.DEV)
    return `${window.location.origin}/api/auth/oauth/${provider}/start`;
  const base = (API || window.location.origin || "").replace(/\/+$/, "");
  return `${base}/api/auth/oauth/${provider}/start`;
}

async function registerUser(data) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw {
      status: res.status,
      data: { error: "SERVER_ERROR", message: "Server error — please try again." },
    };
  }
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json;
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

function VerifyEmailPrompt({ email }) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [inlineError, setInlineError] = useState("");

  const handleResend = async () => {
    setInlineError("");
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
    } catch (err) {
      setInlineError(err?.data?.message ?? "Could not resend the email. Try again shortly.");
    } finally {
      setResending(false);
    }
  };

  return (
    <DsCard className="shadow-xl">
      <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Check your inbox</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We&apos;ve sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
            <br />
            Enter it on the verification page to activate your account.
          </p>
        </div>
        <Link href={`/verify-otp?email=${encodeURIComponent(email)}`} className="text-sm font-medium text-primary underline">
          Enter verification code
        </Link>
        {resent ? (
          <Alert className="border-green-200 bg-green-50 text-left text-green-800">
            <AlertDescription>A new code has been sent.</AlertDescription>
          </Alert>
        ) : null}
        {inlineError ? (
          <Alert variant="destructive" className="text-left">
            <AlertDescription>{inlineError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-2">
          <DsButton intent="secondary" variant="outline" className="w-full" disabled={resending} onClick={handleResend}>
            {resending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resending...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Resend code
              </>
            )}
          </DsButton>
          <DsButton intent="secondary" variant="ghost" className="w-full" asChild>
            <Link href="/login">Back to Sign In</Link>
          </DsButton>
        </div>
      </CardContent>
    </DsCard>
  );
}

export default function Signup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [verifyEmail, setVerifyEmail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState({ google: false, facebook: false });

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

  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    form.clearErrors();
    try {
      const response = await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (!response.requiresVerification && response.accessToken) {
        applyAuthSession(response);
        navigate("/");
        return;
      }
      setVerifyEmail(response.email);
    } catch (err) {
      const serverError = err?.data?.error ?? "";
      const serverMsg = err?.data?.message ?? "";
      if (serverError === "EMAIL_ALREADY_REGISTERED_UNVERIFIED") {
        setVerifyEmail(values.email);
        return;
      }
      if (serverError === "EMAIL_IS_STAFF_ACCOUNT") {
        form.setError("email", {
          type: "server",
          message: "Email belongs to a staff account. Please sign in directly.",
        });
        return;
      }
      if (serverError === "EMAIL_ALREADY_REGISTERED") {
        form.setError("email", {
          type: "server",
          message: "A customer account with this email already exists. Try signing in.",
        });
        return;
      }
      form.setError("password", {
        type: "server",
        message: serverMsg || "Registration failed. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthBackdrop>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4">
      <div className="w-full max-w-[460px] px-1 sm:px-0">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo imageClassName="h-14 w-14 shadow-lg" />
          <h1 className="mt-4 text-white">Create your account</h1>
          <p className="mt-2 text-sm text-slate-200">Get started with a modern furniture portal</p>
        </div>

        {verifyEmail ? (
          <VerifyEmailPrompt email={verifyEmail} />
        ) : (
          <DsCard className="saas-surface-strong border-white/20 bg-white/92 backdrop-blur-md">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="ds-auth-heading text-center">Create Customer Account</CardTitle>
              <CardDescription>Register to browse products and track your orders</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <DsButton
                      type="button"
                      intent="social"
                      variant="outline"
                      disabled={!oauthProviders.google}
                      title={
                        oauthProviders.google
                          ? "Create or open your account with Google"
                          : "Google OAuth is not configured on this server."
                      }
                      onClick={() => {
                        if (!oauthProviders.google) {
                          toast({ title: "Google sign-up unavailable", description: "OAuth is not configured for this deployment." });
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
                          ? "Create or open your account with Facebook"
                          : "Facebook OAuth is not configured on this server."
                      }
                      onClick={() => {
                        if (!oauthProviders.facebook) {
                          toast({ title: "Facebook sign-up unavailable", description: "OAuth is not configured for this deployment." });
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
                    <span>or register with email</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <DsInput
                            placeholder="Enter your full name"
                            aria-invalid={fieldState.invalid}
                            className={fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <DsInput
                            type="email"
                            placeholder="Enter your email"
                            aria-invalid={fieldState.invalid}
                            className={fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <DsInput
                            type="password"
                            placeholder="Enter your password"
                            aria-invalid={fieldState.invalid}
                            className={fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <DsInput
                            type="password"
                            placeholder="Confirm your password"
                            aria-invalid={fieldState.invalid}
                            className={fieldState.error ? "border-destructive focus-visible:ring-destructive/20" : ""}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DsButton type="submit" intent="primary" className="mt-6" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                      </>
                    ) : (
                      "Create Customer Account"
                    )}
                  </DsButton>
                </form>
              </Form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have a customer account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </DsCard>
        )}
      </div>
      </div>
    </AuthBackdrop>
  );
}
