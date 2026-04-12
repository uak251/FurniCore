import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hammer, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { applyAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiOriginPrefix } from "@/lib/api-base";
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
/* ─── Direct API helpers (avoids generated-client type conflicts) ─────────── */
const API = apiOriginPrefix();
async function registerUser(data) {
    const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    // Guard: if the server returned HTML (no error handler) parse it gracefully.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw {
            status: res.status,
            data: { error: "SERVER_ERROR", message: "Server error — please try again or check the server logs." },
        };
    }
    const json = await res.json();
    if (!res.ok)
        throw { status: res.status, data: json };
    return json;
}
async function resendVerification(email) {
    const res = await fetch(`${API}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok)
        throw { status: res.status, data: json };
    return json;
}
/* ═══════════════════════════════════════════════════════════════════════════
   Verification-pending state
   ═══════════════════════════════════════════════════════════════════════════ */
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
        }
        catch (err) {
            const msg = err?.data?.message ?? "Could not resend the email. Try again shortly.";
            toast({ variant: "destructive", title: "Could not resend", description: msg });
        }
        finally {
            setResending(false);
        }
    };
    return (_jsx(Card, { className: "border-border/40 shadow-xl", children: _jsxs(CardContent, { className: "flex flex-col items-center gap-5 py-10 text-center", children: [_jsx("div", { className: "rounded-full bg-primary/10 p-4", children: _jsx(MailCheck, { className: "h-10 w-10 text-primary" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold", children: "Check your inbox" }), _jsxs("p", { className: "mt-2 text-sm text-muted-foreground leading-relaxed", children: ["We've sent a 6-digit code to", " ", _jsx("span", { className: "font-medium text-foreground", children: email }), ".", _jsx("br", {}), "Enter it on the verification page to activate your account."] })] }), _jsx(Link, { href: `/verify-otp?email=${encodeURIComponent(email)}`, className: "text-sm font-medium text-primary underline", children: "Enter verification code" }), resent && (_jsx(Alert, { className: "text-left border-green-200 bg-green-50 text-green-800", children: _jsx(AlertDescription, { children: "\u2713 A new code has been sent." }) })), _jsxs("div", { className: "flex flex-col gap-2 w-full", children: [_jsx(Button, { variant: "outline", className: "w-full", disabled: resending, onClick: handleResend, children: resending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), " Resending\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-2 h-4 w-4" }), " Resend code"] })) }), _jsx(Button, { variant: "ghost", className: "w-full", asChild: true, children: _jsx(Link, { href: "/login", children: "Back to Sign In" }) })] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Codes expire after ", _jsx("strong", { children: "5 minutes" }), "."] })] }) }));
}
/* ═══════════════════════════════════════════════════════════════════════════
   Main Signup page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Signup() {
    const { toast } = useToast();
    const [, navigate] = useLocation();
    const [verifyEmail, setVerifyEmail] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const form = useForm({
        resolver: zodResolver(signupSchema),
        defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    });
    const onSubmit = async (values) => {
        setSubmitting(true);
        try {
            const response = await registerUser({
                name: values.name,
                email: values.email,
                password: values.password,
            });
            if (!response.requiresVerification && response.accessToken) {
                // Dev mode: account is auto-verified — log the user in immediately.
                applyAuthSession(response);
                navigate("/");
                return;
            }
            // Email verification required.
            setVerifyEmail(response.email);
        }
        catch (err) {
            const serverError = err?.data?.error ?? "";
            const serverMsg = err?.data?.message ?? "";
            if (serverError === "EMAIL_ALREADY_REGISTERED_UNVERIFIED") {
                setVerifyEmail(values.email);
                toast({
                    title: "Account not yet verified",
                    description: "Use the button below to resend the verification code.",
                });
                return;
            }
            if (serverError === "EMAIL_IS_STAFF_ACCOUNT") {
                toast({
                    variant: "destructive",
                    title: "Email belongs to a staff account",
                    description: "This email is already registered as a staff member. " +
                        "Please sign in directly or use a different email address.",
                });
                return;
            }
            if (serverError === "EMAIL_ALREADY_REGISTERED") {
                toast({
                    variant: "destructive",
                    title: "Email already registered",
                    description: "A customer account with this email already exists. Try signing in instead.",
                });
                return;
            }
            toast({
                variant: "destructive",
                title: "Registration failed",
                description: serverMsg || "Something went wrong. Please try again.",
            });
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-background flex flex-col justify-center items-center p-4", children: _jsxs("div", { className: "w-full max-w-[420px]", children: [_jsxs("div", { className: "flex flex-col items-center mb-8", children: [_jsx("div", { className: "w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-md", children: _jsx(Hammer, { className: "h-6 w-6 text-primary-foreground" }) }), _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "FurniCore" }), _jsx("p", { className: "text-muted-foreground mt-2", children: "Customer Portal" })] }), verifyEmail ? (_jsx(VerifyEmailPrompt, { email: verifyEmail })) : (_jsxs(Card, { className: "border-border/40 shadow-xl", children: [_jsxs(CardHeader, { className: "space-y-1 text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: "Create Customer Account" }), _jsx(CardDescription, { children: "Register to browse products and track your orders" })] }), _jsxs(CardContent, { children: [_jsx(Form, { ...form, children: _jsxs("form", { onSubmit: form.handleSubmit(onSubmit), className: "space-y-4", children: [_jsx(FormField, { control: form.control, name: "name", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Full Name" }), _jsx(FormControl, { children: _jsx(Input, { placeholder: "Jane Smith", ...field }) }), _jsx(FormMessage, {})] })) }), _jsx(FormField, { control: form.control, name: "email", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Email Address" }), _jsx(FormControl, { children: _jsx(Input, { type: "email", placeholder: "jane@furnicore.com", ...field }) }), _jsx(FormMessage, {})] })) }), _jsx(FormField, { control: form.control, name: "password", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Password" }), _jsx(FormControl, { children: _jsx(Input, { type: "password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", ...field }) }), _jsx(FormMessage, {})] })) }), _jsx(FormField, { control: form.control, name: "confirmPassword", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Confirm Password" }), _jsx(FormControl, { children: _jsx(Input, { type: "password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", ...field }) }), _jsx(FormMessage, {})] })) }), _jsx(Button, { type: "submit", className: "w-full mt-6", disabled: submitting, children: submitting ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), " Creating account\u2026"] })) : ("Create Customer Account") })] }) }), _jsxs("p", { className: "text-center text-sm text-muted-foreground mt-6", children: ["Already have a customer account?", " ", _jsx(Link, { href: "/login", className: "text-primary font-medium hover:underline", children: "Sign in" })] }), _jsxs("p", { className: "text-center text-xs text-muted-foreground mt-2", children: ["Staff & partners:", " ", _jsx(Link, { href: "/login", className: "text-primary hover:underline", children: "Sign in here" }), " ", "\u2014 accounts are managed by your administrator."] })] })] }))] }) }));
}
