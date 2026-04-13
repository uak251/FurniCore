import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { applyAuthSession } from "@/lib/auth";
import { Hammer, Loader2, MailWarning, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiOriginPrefix } from "@/lib/api-base";
/* ─── Helpers ────────────────────────────────────────────────────────────── */
function decodeJwtPayload(token) {
    try {
        const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(base64));
    }
    catch {
        return {};
    }
}
const API = apiOriginPrefix();
/** Best-effort message from ApiError / network failures (Zod issues, JSON bodies, etc.). */
function pickLoginErrorDetail(error) {
    if (error == null)
        return "";
    const data = error.data;
    if (typeof data === "string" && data.trim())
        return data.trim();
    if (data && typeof data === "object") {
        if (typeof data.message === "string" && data.message.trim())
            return data.message.trim();
        const e = data.error;
        if (typeof e === "string" && e.trim())
            return e.trim();
        if (Array.isArray(e))
            return e.map((x) => (x && typeof x === "object" && "message" in x ? String(x.message) : String(x))).join("; ");
    }
    if (typeof error.message === "string" && error.message.trim())
        return error.message.trim();
    return "";
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
/* ─── Unverified-email banner ────────────────────────────────────────────── */
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
        }
        catch (err) {
            const msg = err?.data?.message ?? "Could not resend. Please try again.";
            toast({ variant: "destructive", title: "Failed to resend", description: msg });
        }
        finally {
            setResending(false);
        }
    };
    return (_jsxs(Alert, { className: "border-amber-300 bg-amber-50 text-amber-900 mb-4", children: [_jsx(MailWarning, { className: "h-4 w-4 text-amber-600" }), _jsx(AlertTitle, { className: "font-semibold", children: "Email not verified" }), _jsxs(AlertDescription, { className: "mt-1 space-y-2", children: [_jsxs("p", { className: "text-sm", children: ["Your account (", _jsx("span", { className: "font-medium", children: email }), ") is not verified. Enter the 6-digit code from your email, or request a new code."] }), _jsx(Link, { href: `/verify-otp?email=${encodeURIComponent(email)}`, className: "text-sm font-medium text-amber-900 underline underline-offset-2", children: "Open code entry page" }), sent ? (_jsx("p", { className: "text-sm font-medium text-green-700", children: "\u2713 A new code has been sent." })) : (_jsx(Button, { size: "sm", variant: "outline", className: "mt-1 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800", disabled: resending, onClick: handleResend, children: resending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-1.5 h-3.5 w-3.5 animate-spin" }), " Sending\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-1.5 h-3.5 w-3.5" }), " Resend code"] })) }))] })] }));
}
/* ─── Validation ─────────────────────────────────────────────────────────── */
const loginSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required"),
});
/* ═══════════════════════════════════════════════════════════════════════════
   Login page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Login() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const login = useLogin();
    const [unverifiedEmail, setUnverifiedEmail] = useState(null);
    const [showPw, setShowPw] = useState(false);
    const [apiReachable, setApiReachable] = useState(null);
    useEffect(() => {
        let cancelled = false;
        fetch(`${API}/api/healthz`)
            .then((r) => {
            if (!cancelled)
                setApiReachable(r.ok);
        })
            .catch(() => {
            if (!cancelled)
                setApiReachable(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const form = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "", password: "" },
    });
    const submitLogin = async (values, allowServerRetry) => {
        setUnverifiedEmail(null);
        try {
            const response = await login.mutateAsync({ data: values });
            applyAuthSession(response);
            const jwtPayload = decodeJwtPayload(response.accessToken);
            const role = typeof response.user?.role === "string"
                ? response.user.role
                : (typeof jwtPayload.role === "string" ? jwtPayload.role : "employee");
            toast({ title: "Welcome back", description: "Successfully logged in to FurniCore." });
            if (role === "supplier")
                setLocation("/supplier-portal");
            else if (role === "worker")
                setLocation("/worker-portal");
            else if (role === "customer")
                setLocation("/customer-portal");
            else
                setLocation("/");
        }
        catch (error) {
            const status = typeof error?.status === "number" ? error.status : undefined;
            const errData = error?.data;
            const serverError = errData && typeof errData === "object" && "error" in errData ? errData.error : "";
            const detail = pickLoginErrorDetail(error);
            if (allowServerRetry && status !== undefined && status >= 500) {
                await new Promise((r) => setTimeout(r, 400));
                return submitLogin(values, false);
            }
            if (serverError === "EMAIL_NOT_VERIFIED") {
                setUnverifiedEmail(errData && typeof errData === "object" && "email" in errData && typeof errData.email === "string"
                    ? errData.email
                    : values.email);
                return;
            }
            const isServerOrDb = status !== undefined && status >= 500;
            if (isServerOrDb) {
                toast({
                    variant: "destructive",
                    title: "Server error",
                    description: detail || "The server could not complete sign-in. Refreshing the page.",
                });
                window.setTimeout(() => window.location.reload(), 1200);
                return;
            }
            const dev401Hint = import.meta.env.DEV && status === 401
                ? " Run `pnpm --filter @workspace/scripts seed-admin` if this is a fresh database."
                : "";
            toast({
                variant: "destructive",
                title: "Login Failed",
                description: (detail || "Please check your credentials and try again.") + dev401Hint,
            });
        }
    };
    const onSubmit = async (values) => submitLogin(values, true);
    return (_jsx("div", { className: "min-h-screen bg-background flex flex-col justify-center items-center p-4", children: _jsxs("div", { className: "w-full max-w-[400px]", children: [_jsxs("div", { className: "flex flex-col items-center mb-8", children: [_jsx("div", { className: "w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-md", children: _jsx(Hammer, { className: "h-6 w-6 text-primary-foreground" }) }), _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "FurniCore" }), _jsx("p", { className: "text-muted-foreground mt-2", children: "Furniture manufacturing ERP" })] }), apiReachable === false && (_jsxs(Alert, { variant: "destructive", className: "mb-4", children: [_jsx(AlertTitle, { children: "Cannot reach API" }), _jsx(AlertDescription, { className: "text-sm", children: "Start the API server and ensure Vite proxies to it (see repo `.env` VITE_API_URL). Sign-in will fail until the API is up." })] })), _jsxs(Card, { className: "border-border/40 shadow-xl", children: [_jsxs(CardHeader, { className: "space-y-1 text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: "Sign In" }), _jsx(CardDescription, { children: "Enter your credentials to access the system" })] }), _jsxs(CardContent, { children: [unverifiedEmail && _jsx(UnverifiedEmailBanner, { email: unverifiedEmail }), _jsx(Form, { ...form, children: _jsxs("form", { onSubmit: form.handleSubmit(onSubmit), className: "space-y-4", children: [_jsx(FormField, { control: form.control, name: "email", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Email Address" }), _jsx(FormControl, { children: _jsx(Input, { placeholder: "admin@furnicore.com", ...field }) }), _jsx(FormMessage, {})] })) }), _jsx(FormField, { control: form.control, name: "password", render: ({ field }) => (_jsxs(FormItem, { children: [_jsx(FormLabel, { children: "Password" }), _jsx(FormControl, { children: _jsxs("div", { className: "relative", children: [_jsx(Input, { type: showPw ? "text" : "password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", className: "pr-10", ...field }), _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "absolute right-0 top-0 h-9 w-9 text-muted-foreground", onClick: () => setShowPw((s) => !s), "aria-label": showPw ? "Hide password" : "Show password", children: showPw ? _jsx(EyeOff, { className: "h-4 w-4" }) : _jsx(Eye, { className: "h-4 w-4" }) })] }) }), _jsx(FormMessage, {})] })) }), _jsx(Button, { type: "submit", className: "w-full mt-6", disabled: login.isPending, children: login.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), " Authenticating\u2026"] })) : ("Sign In") })] }) })] })] }), _jsxs("p", { className: "text-center text-sm text-muted-foreground mt-6", children: ["Customer?", " ", _jsx(Link, { href: "/signup", className: "text-primary font-medium hover:underline", children: "Create a customer account \u2192" })] })] }) }));
}
