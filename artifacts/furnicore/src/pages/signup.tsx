import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hammer, Loader2, MailCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* ─── Validation ─────────────────────────────────────────────────────────── */

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
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

type SignupFormValues = z.infer<typeof signupSchema>;

/* ─── Direct API helpers (avoids generated-client type conflicts) ─────────── */

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function registerUser(data: { name: string; email: string; password: string }) {
  const res = await fetch(`${API}/api/auth/register`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json as { message: string; email: string; requiresVerification: boolean };
}

async function resendVerification(email: string) {
  const res = await fetch(`${API}/api/auth/resend-verification`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return json as { message: string };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Verification-pending state
   ═══════════════════════════════════════════════════════════════════════════ */

function VerifyEmailPrompt({ email }: { email: string }) {
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
      toast({ title: "Email resent", description: "Check your inbox for the new link." });
    } catch (err: any) {
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
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            We've sent a verification link to{" "}
            <span className="font-medium text-foreground">{email}</span>.<br />
            Click the link in that email to activate your account.
          </p>
        </div>

        {resent && (
          <Alert className="text-left border-green-200 bg-green-50 text-green-800">
            <AlertDescription>
              ✓ A fresh verification link has been sent.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 w-full">
          <Button
            variant="outline"
            className="w-full"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resending…</>
            ) : (
              <><RefreshCw className="mr-2 h-4 w-4" /> Resend verification email</>
            )}
          </Button>

          <Button variant="ghost" className="w-full" asChild>
            <Link href="/login">Back to Sign In</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Can&apos;t find it? Check your spam / junk folder.
          Verification links expire after <strong>15 minutes</strong>.
        </p>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Signup page
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Signup() {
  const { toast } = useToast();
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setSubmitting(true);
    try {
      const response = await registerUser({
        name:     values.name,
        email:    values.email,
        password: values.password,
      });

      if (response.requiresVerification) {
        setVerifyEmail(response.email);
      }
    } catch (err: any) {
      const serverError = err?.data?.error ?? "";
      const serverMsg   = err?.data?.message ?? "";

      if (serverError === "EMAIL_ALREADY_REGISTERED_UNVERIFIED") {
        // Show the verify prompt so they can resend
        setVerifyEmail(values.email);
        toast({
          title:       "Account exists but isn't verified",
          description: "Use the button below to resend the verification link.",
        });
        return;
      }

      toast({
        variant:     "destructive",
        title:       "Registration failed",
        description: serverMsg || err?.data?.error || "Something went wrong. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

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

        {/* Verify-email state OR registration form */}
        {verifyEmail ? (
          <VerifyEmailPrompt email={verifyEmail} />
        ) : (
          <Card className="border-border/40 shadow-xl">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl">Create Account</CardTitle>
              <CardDescription>Fill in your details to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane@furnicore.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full mt-6" disabled={submitting}>
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </form>
              </Form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Already have an account?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
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
