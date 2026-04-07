import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/auth";
import { Hammer, Loader2, MailWarning, RefreshCw } from "lucide-react";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

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

/* ─── Unverified-email banner ────────────────────────────────────────────── */

function UnverifiedEmailBanner({ email }: { email: string }) {
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [sent,      setSent]      = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setSent(true);
      toast({ title: "Verification email sent", description: "Check your inbox for the link." });
    } catch (err: any) {
      const msg = err?.data?.message ?? "Could not resend. Please try again.";
      toast({ variant: "destructive", title: "Failed to resend", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 mb-4">
      <MailWarning className="h-4 w-4 text-amber-600" />
      <AlertTitle className="font-semibold">Email not verified</AlertTitle>
      <AlertDescription className="mt-1 space-y-2">
        <p className="text-sm">
          Your account (<span className="font-medium">{email}</span>) has not been verified
          yet. Click the link in your verification email to activate your account.
        </p>
        {sent ? (
          <p className="text-sm font-medium text-green-700">✓ A new link has been sent.</p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Sending…</>
            ) : (
              <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Resend verification email</>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/* ─── Validation ─────────────────────────────────────────────────────────── */

const loginSchema = z.object({
  email:    z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   Login page
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Login() {
  const [, setLocation]            = useLocation();
  const { toast }                  = useToast();
  const login                      = useLogin();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setUnverifiedEmail(null);
    try {
      const response = await login.mutateAsync({ data: values });
      setAuthToken(response.accessToken);

      const payload = decodeJwtPayload(response.accessToken);
      const role    = typeof payload.role === "string" ? payload.role : "employee";

      toast({ title: "Welcome back", description: "Successfully logged in to FurniCore." });

      if (role === "supplier")      setLocation("/supplier-portal");
      else if (role === "worker")   setLocation("/worker-portal");
      else if (role === "customer") setLocation("/customer-portal");
      else                          setLocation("/");
    } catch (error: any) {
      const serverError = error?.data?.error ?? "";
      const serverMsg   = error?.data?.message ?? "";

      if (serverError === "EMAIL_NOT_VERIFIED") {
        // Show the inline banner with the resend button
        setUnverifiedEmail(error?.data?.email ?? values.email);
        return;
      }

      toast({
        variant:     "destructive",
        title:       "Login Failed",
        description: serverMsg || error?.data?.error || "Please check your credentials and try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-md">
            <Hammer className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FurniCore</h1>
          <p className="text-muted-foreground mt-2">Precision ERP for Manufacturing</p>
        </div>

        <Card className="border-border/40 shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the system</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Unverified-email alert */}
            {unverifiedEmail && <UnverifiedEmailBanner email={unverifiedEmail} />}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="admin@furnicore.com" {...field} />
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

                <Button
                  type="submit"
                  className="w-full mt-6"
                  disabled={login.isPending}
                >
                  {login.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Authenticating…</>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
