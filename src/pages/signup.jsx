import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hammer, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { applyAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiOriginPrefix } from "@/lib/api-base";

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
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
      toast({ title: "Code resent", description: "Check your inbox for the new 6-digit code." });
    } catch (err) {
      const msg = err?.data?.message ?? "Could not resend the email. Try again shortly.";
      toast({ variant: "destructive", title: "Could not resend", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <Card className="border-border/40 shadow-xl">
      <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Check your inbox</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We've sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
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
        <div className="flex w-full flex-col gap-2">
          <Button variant="outline" className="w-full" disabled={resending} onClick={handleResend}>
            {resending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resending...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Resend code
              </>
            )}
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link href="/login">Back to Sign In</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Signup() {
  const [, navigate] = useLocation();
  const [verifyEmail, setVerifyEmail] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-md">
            <Hammer className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FurniCore</h1>
          <p className="mt-2 text-muted-foreground">Customer Portal</p>
        </div>

        {verifyEmail ? (
          <VerifyEmailPrompt email={verifyEmail} />
        ) : (
          <Card className="border-border/40 shadow-xl">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl">Create Customer Account</CardTitle>
              <CardDescription>Register to browse products and track your orders</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
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
                          <Input
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
                          <Input
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
                          <Input
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
                  <Button type="submit" className="mt-6 w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                      </>
                    ) : (
                      "Create Customer Account"
                    )}
                  </Button>
                </form>
              </Form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have a customer account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
